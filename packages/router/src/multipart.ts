export interface MultipartStreamParseOptions {
  fields?: Readonly<Record<string, MultipartStreamFieldOptions>>;
  maxBytes?: number;
}

export interface MultipartStreamFieldOptions {
  type?: "stream" | "text";
  maxBytes?: number;
}

export interface MultipartStreamPart {
  name: string;
  filename?: string;
  contentType?: string;
  headers: Headers;
  body: ReadableStream<Uint8Array<ArrayBufferLike>>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface PartWriter {
  name: string;
  maxBytes: number | undefined;
  bytes: number;
  writer: WritableStreamDefaultWriter<Uint8Array<ArrayBufferLike>>;
}

const crlf = "\r\n";
const headerSeparator = "\r\n\r\n";
const maxHeaderBytes = 64 * 1024;

export function parseMultipartStream(
  request: Request,
  options: MultipartStreamParseOptions = {},
): AsyncIterable<MultipartStreamPart> {
  return {
    [Symbol.asyncIterator]() {
      const queue = new AsyncQueue<MultipartStreamPart>();
      void parseMultipartRequest(request, options, queue);
      return queue;
    },
  };
}

async function parseMultipartRequest(
  request: Request,
  options: MultipartStreamParseOptions,
  queue: AsyncQueue<MultipartStreamPart>,
): Promise<void> {
  const boundary = parseMultipartBoundary(request.headers.get("content-type"));

  if (boundary === undefined) {
    queue.fail(new Error("Multipart request content-type must include a boundary."));
    return;
  }

  if (request.body === null) {
    queue.fail(new Error("Multipart request body is not readable."));
    return;
  }

  const reader = request.body.getReader();
  const delimiter = encodeAscii(`${crlf}--${boundary}`);
  const firstBoundary = encodeAscii(`--${boundary}`);
  const closeSuffix = encodeAscii("--");
  const lineSuffix = encodeAscii(crlf);
  const keepTailBytes = delimiter.length + 4;
  let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array();
  let totalBytes = 0;
  let started = false;
  let currentPart: PartWriter | undefined;

  queue.setCancel(() => {
    void currentPart?.writer.abort(new Error("Multipart stream iteration was cancelled."));
    void reader.cancel();
  });

  try {
    while (true) {
      const next = await reader.read();

      if (!next.done) {
        totalBytes += next.value.byteLength;
        enforceByteLimit("multipart request", totalBytes, options.maxBytes);
        buffer = concatBytes(buffer, next.value);
      }

      while (true) {
        if (!started) {
          const firstBoundaryIndex = indexOfBytes(buffer, firstBoundary);

          if (firstBoundaryIndex < 0) {
            if (next.done) {
              throw new Error("Multipart request body does not contain the opening boundary.");
            }

            trimBufferToTail(0);
            break;
          }

          buffer = buffer.slice(firstBoundaryIndex + firstBoundary.length);

          if (startsWithBytes(buffer, closeSuffix)) {
            queue.close();
            return;
          }

          if (!startsWithBytes(buffer, lineSuffix)) {
            if (next.done) {
              throw new Error("Malformed multipart opening boundary.");
            }
            break;
          }

          buffer = buffer.slice(lineSuffix.length);
          started = true;
        }

        if (currentPart === undefined) {
          const headerEnd = indexOfAscii(buffer, headerSeparator);

          if (headerEnd < 0) {
            if (next.done) {
              throw new Error("Multipart part ended before headers completed.");
            }

            if (buffer.length > maxHeaderBytes) {
              throw new Error(`Multipart part headers exceeded ${maxHeaderBytes} bytes.`);
            }
            break;
          }

          currentPart = createPartWriter(
            decodeAscii(buffer.slice(0, headerEnd)),
            options,
            queue,
          );
          buffer = buffer.slice(headerEnd + headerSeparator.length);
        }

        const delimiterIndex = indexOfBytes(buffer, delimiter);

        if (delimiterIndex < 0) {
          if (next.done) {
            throw new Error(`Multipart part "${currentPart.name}" ended before the closing boundary.`);
          }

          const writableLength = Math.max(0, buffer.length - keepTailBytes);

          if (writableLength === 0) {
            break;
          }

          await writePartChunk(currentPart, buffer.slice(0, writableLength));
          buffer = buffer.slice(writableLength);
          continue;
        }

        await writePartChunk(currentPart, buffer.slice(0, delimiterIndex));
        await currentPart.writer.close();
        buffer = buffer.slice(delimiterIndex + delimiter.length);
        currentPart = undefined;

        if (startsWithBytes(buffer, closeSuffix)) {
          queue.close();
          return;
        }

        if (startsWithBytes(buffer, lineSuffix)) {
          buffer = buffer.slice(lineSuffix.length);
          continue;
        }

        if (next.done) {
          throw new Error("Malformed multipart boundary delimiter.");
        }

        break;
      }

      if (next.done) {
        break;
      }
    }

    queue.close();
  } catch (error) {
    await currentPart?.writer.abort(error);
    queue.fail(error);
  } finally {
    queue.setCancel(undefined);
    reader.releaseLock();
  }

  function trimBufferToTail(prefixLength: number): void {
    if (buffer.length <= keepTailBytes + prefixLength) {
      return;
    }

    buffer = buffer.slice(buffer.length - keepTailBytes - prefixLength);
  }
}

function createPartWriter(
  rawHeaders: string,
  options: MultipartStreamParseOptions,
  queue: AsyncQueue<MultipartStreamPart>,
): PartWriter {
  const headers = parsePartHeaders(rawHeaders);
  const disposition = parseContentDisposition(headers.get("content-disposition"));

  if (disposition.name === undefined) {
    throw new Error("Multipart part is missing a form-data name.");
  }

  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const part = createPart({
    name: disposition.name,
    filename: disposition.filename,
    headers,
    body: stream.readable,
  });

  queue.push(part);

  return {
    name: disposition.name,
    maxBytes: options.fields?.[disposition.name]?.maxBytes,
    bytes: 0,
    writer: stream.writable.getWriter(),
  };
}

function createPart(options: {
  name: string;
  filename: string | undefined;
  headers: Headers;
  body: ReadableStream<Uint8Array>;
}): MultipartStreamPart {
  const part: MultipartStreamPart = {
    name: options.name,
    headers: options.headers,
    body: options.body,
    text() {
      return new Response(options.body).text();
    },
    arrayBuffer() {
      return new Response(options.body).arrayBuffer();
    },
  };

  if (options.filename !== undefined) {
    part.filename = options.filename;
  }

  const contentType = options.headers.get("content-type");

  if (contentType !== null) {
    part.contentType = contentType;
  }

  return part;
}

async function writePartChunk(
  part: PartWriter,
  chunk: Uint8Array<ArrayBufferLike>,
): Promise<void> {
  if (chunk.byteLength === 0) {
    return;
  }

  part.bytes += chunk.byteLength;
  enforceByteLimit(`multipart field "${part.name}"`, part.bytes, part.maxBytes);
  await part.writer.write(chunk);
}

function enforceByteLimit(label: string, bytes: number, maxBytes: number | undefined): void {
  if (maxBytes !== undefined && bytes > maxBytes) {
    throw new Error(`${label} exceeded ${maxBytes} bytes.`);
  }
}

function parseMultipartBoundary(contentType: string | null): string | undefined {
  if (contentType === null) {
    return undefined;
  }

  const [mediaType, ...parameters] = contentType.split(";").map((part) => part.trim());

  if (mediaType?.toLowerCase() !== "multipart/form-data") {
    return undefined;
  }

  for (const parameter of parameters) {
    const [rawName, ...rawValue] = parameter.split("=");

    if (rawName?.trim().toLowerCase() !== "boundary") {
      continue;
    }

    const value = rawValue.join("=").trim();
    const unquoted = value.startsWith("\"") && value.endsWith("\"")
      ? value.slice(1, -1)
      : value;

    return unquoted === "" ? undefined : unquoted;
  }

  return undefined;
}

function parsePartHeaders(rawHeaders: string): Headers {
  const headers = new Headers();

  for (const line of rawHeaders.split(crlf)) {
    if (line.trim() === "") {
      continue;
    }

    const separator = line.indexOf(":");

    if (separator < 0) {
      throw new Error(`Malformed multipart header: ${line}`);
    }

    headers.append(
      line.slice(0, separator).trim().toLowerCase(),
      line.slice(separator + 1).trim(),
    );
  }

  return headers;
}

function parseContentDisposition(value: string | null): {
  name: string | undefined;
  filename: string | undefined;
} {
  if (value === null) {
    return { name: undefined, filename: undefined };
  }

  const parameters = value.split(";").map((part) => part.trim());
  const disposition = parameters.shift()?.toLowerCase();

  if (disposition !== "form-data") {
    return { name: undefined, filename: undefined };
  }

  let name: string | undefined;
  let filename: string | undefined;

  for (const parameter of parameters) {
    const separator = parameter.indexOf("=");

    if (separator < 0) {
      continue;
    }

    const key = parameter.slice(0, separator).trim().toLowerCase();
    const value = unquoteHeaderParameter(parameter.slice(separator + 1).trim());

    if (key === "name") {
      name = value;
    } else if (key === "filename") {
      filename = value;
    }
  }

  return { name, filename };
}

function unquoteHeaderParameter(value: string): string {
  if (!value.startsWith("\"") || !value.endsWith("\"")) {
    return value;
  }

  return value.slice(1, -1).replaceAll(/\\"/g, "\"").replaceAll(/\\\\/g, "\\");
}

function concatBytes(
  left: Uint8Array<ArrayBufferLike>,
  right: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBufferLike> {
  if (left.length === 0) {
    return right;
  }

  const next = new Uint8Array(left.length + right.length);
  next.set(left);
  next.set(right, left.length);
  return next;
}

function indexOfAscii(bytes: Uint8Array<ArrayBufferLike>, needle: string): number {
  return indexOfBytes(bytes, encodeAscii(needle));
}

function indexOfBytes(
  bytes: Uint8Array<ArrayBufferLike>,
  needle: Uint8Array<ArrayBufferLike>,
): number {
  if (needle.length === 0 || bytes.length < needle.length) {
    return -1;
  }

  const first = needle[0];

  for (let index = 0; index <= bytes.length - needle.length; index += 1) {
    if (bytes[index] !== first) {
      continue;
    }

    let matched = true;

    for (let offset = 1; offset < needle.length; offset += 1) {
      if (bytes[index + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return index;
    }
  }

  return -1;
}

function startsWithBytes(
  bytes: Uint8Array<ArrayBufferLike>,
  prefix: Uint8Array<ArrayBufferLike>,
): boolean {
  if (bytes.length < prefix.length) {
    return false;
  }

  for (let index = 0; index < prefix.length; index += 1) {
    if (bytes[index] !== prefix[index]) {
      return false;
    }
  }

  return true;
}

function encodeAscii(value: string): Uint8Array<ArrayBufferLike> {
  return new TextEncoder().encode(value);
}

function decodeAscii(value: Uint8Array<ArrayBufferLike>): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(value);
}

class AsyncQueue<T> implements AsyncIterator<T> {
  private readonly values: T[] = [];
  private readonly waits: Array<{
    resolve(result: IteratorResult<T>): void;
    reject(error: unknown): void;
  }> = [];
  private done = false;
  private error: unknown;
  private onCancel: (() => void) | undefined;

  setCancel(onCancel: (() => void) | undefined): void {
    this.onCancel = onCancel;
  }

  push(value: T): void {
    const wait = this.waits.shift();

    if (wait !== undefined) {
      wait.resolve({ done: false, value });
      return;
    }

    this.values.push(value);
  }

  close(): void {
    this.done = true;

    for (const wait of this.waits.splice(0)) {
      wait.resolve({ done: true, value: undefined });
    }
  }

  fail(error: unknown): void {
    this.error = error;
    this.done = true;

    for (const wait of this.waits.splice(0)) {
      wait.reject(error);
    }
  }

  next(): Promise<IteratorResult<T>> {
    if (this.values.length > 0) {
      return Promise.resolve({ done: false, value: this.values.shift() as T });
    }

    if (this.error !== undefined) {
      return Promise.reject(this.error);
    }

    if (this.done) {
      return Promise.resolve({ done: true, value: undefined });
    }

    return new Promise((resolve, reject) => {
      this.waits.push({ resolve, reject });
    });
  }

  return(): Promise<IteratorResult<T>> {
    this.done = true;
    this.values.splice(0);
    this.onCancel?.();

    for (const wait of this.waits.splice(0)) {
      wait.resolve({ done: true, value: undefined });
    }

    return Promise.resolve({ done: true, value: undefined });
  }
}
