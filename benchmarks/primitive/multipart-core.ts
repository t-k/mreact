import { performance } from "node:perf_hooks";
import { parseMultipartStream } from "../../packages/router/src/multipart.js";
import { summarizeSamples } from "../shared/stats.js";
import type { BenchmarkEnvironment, BenchmarkRow } from "../shared/types.js";

const boundary = "mreact-multipart-benchmark-boundary";
const encoder = new TextEncoder();

export interface MultipartBenchmarkScenario {
  body: Uint8Array<ArrayBuffer>;
  chunkBytes: number;
  expectedBytes: number;
  expectedChecksum: number;
  expectedPartDescriptors: readonly string[];
  expectedParts: number;
  name: string;
  primary: boolean;
}

export interface MultipartScenarioResult {
  bytes: number;
  checksum: number;
  partDescriptors: string[];
  parts: number;
}

interface FixturePart {
  contentType?: string;
  filename?: string;
  name: string;
  payload: Uint8Array<ArrayBuffer>;
}

export function createMultipartBenchmarkScenarios(
  options = {
    largeFileBytes: 8 * 1024 * 1024,
    manyPartBytes: 8 * 1024,
    manyPartCount: 100,
  },
): MultipartBenchmarkScenario[] {
  return [
    createSingleFileScenario(options.largeFileBytes, 64 * 1024),
    createManyPartScenario(options.manyPartCount, options.manyPartBytes, 16 * 1024),
    createSmallFormScenario(),
    createPrefixHeavyScenario(options.largeFileBytes, 64 * 1024),
  ];
}

export async function runMultipartScenario(
  scenario: MultipartBenchmarkScenario,
): Promise<MultipartScenarioResult> {
  const request = requestFromScenario(scenario);
  let bytes = 0;
  let checksum = 0;
  const partDescriptors: string[] = [];
  let parts = 0;

  for await (const part of parseMultipartStream(request)) {
    parts += 1;
    partDescriptors.push([part.name, part.filename ?? "", part.contentType ?? ""].join(":"));
    const reader = part.body.getReader();

    try {
      while (true) {
        const chunk = await reader.read();

        if (chunk.done) {
          break;
        }

        bytes += chunk.value.byteLength;
        for (const byte of chunk.value) {
          checksum = (checksum + byte) >>> 0;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  if (
    parts !== scenario.expectedParts ||
    bytes !== scenario.expectedBytes ||
    checksum !== scenario.expectedChecksum ||
    partDescriptors.join("\n") !== scenario.expectedPartDescriptors.join("\n")
  ) {
    throw new Error(
      `${scenario.name} output mismatch: parts=${parts}, bytes=${bytes}, checksum=${checksum}, descriptors=${partDescriptors.join("|")}`,
    );
  }

  return { bytes, checksum, partDescriptors, parts };
}

export async function measureMultipartScenario(options: {
  measuredRuns: number;
  scenario: MultipartBenchmarkScenario;
  warmupRuns: number;
}): Promise<BenchmarkRow> {
  const samples: number[] = [];
  let checksum = 0;

  for (let index = 0; index < options.warmupRuns + options.measuredRuns; index += 1) {
    const startedAt = performance.now();
    const result = await runMultipartScenario(options.scenario);
    const elapsed = performance.now() - startedAt;
    checksum = (checksum + result.checksum + result.bytes + result.parts) >>> 0;

    if (index >= options.warmupRuns) {
      samples.push(elapsed);
    }
  }

  const summary = summarizeSamples(samples);

  return {
    suite: "multipart",
    framework: "mreact",
    version: "local",
    caseName: options.scenario.name,
    status: "completed",
    metric: "duration",
    unit: "ms",
    value: summary.median,
    summary,
    samples,
    notes: [
      `chunkBytes=${options.scenario.chunkBytes}`,
      `primary=${options.scenario.primary}`,
      `checksum=${checksum}`,
    ],
  };
}

export function formatMultipartBenchmarkRows(
  rows: readonly BenchmarkRow[],
  env: BenchmarkEnvironment,
): string {
  const lines = [
    "# Multipart Production Parser Benchmark",
    "",
    "## Environment",
    "",
    `- Date: ${env.date}`,
    `- Git commit: ${env.gitCommit}`,
    `- Node: ${env.nodeVersion}`,
    `- NODE_ENV: ${env.nodeEnv}`,
    `- pnpm: ${env.pnpmVersion}`,
    `- Platform: ${env.platform} ${env.arch}`,
    `- CPU: ${env.cpuModel} (${env.cpuCount})`,
    `- Total memory bytes: ${env.totalMemoryBytes}`,
    "",
    "## Results",
    "",
    "| case | primary | chunk bytes | median ms | p75 ms | p95 ms | p99 ms | raw samples ms |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.caseName} | ${noteValue(row, "primary")} | ${noteValue(row, "chunkBytes")} | ${round(row.summary?.median ?? 0)} | ${round(row.summary?.p75 ?? 0)} | ${round(row.summary?.p95 ?? 0)} | ${round(row.summary?.p99 ?? 0)} | ${(row.samples ?? []).map(round).join(", ")} |`,
    );
  }

  return lines.join("\n");
}

function createSingleFileScenario(
  payloadBytes: number,
  chunkBytes: number,
): MultipartBenchmarkScenario {
  return createScenario({
    chunkBytes,
    name: "large-file",
    parts: [
      {
        name: "file",
        filename: "large.bin",
        contentType: "application/octet-stream",
        payload: createPatternBytes(payloadBytes, 17),
      },
    ],
    primary: true,
  });
}

function createManyPartScenario(
  partCount: number,
  payloadBytes: number,
  chunkBytes: number,
): MultipartBenchmarkScenario {
  const parts = Array.from({ length: partCount }, (_, index) => ({
    name: `field-${index}`,
    payload: createPatternBytes(payloadBytes, index + 1),
  }));

  return createScenario({
    chunkBytes,
    name: "many-parts",
    parts,
    primary: true,
  });
}

function createSmallFormScenario(): MultipartBenchmarkScenario {
  return createScenario({
    chunkBytes: 256,
    name: "small-form",
    parts: [
      {
        name: "__mreact_csrf",
        payload: encoder.encode("token-20260828"),
      },
      {
        name: "title",
        payload: encoder.encode("Quarterly upload"),
      },
      {
        name: "file",
        filename: "note.txt",
        contentType: "text/plain",
        payload: createPatternBytes(12 * 1024, 43),
      },
    ],
    primary: true,
  });
}

function createPrefixHeavyScenario(
  payloadBytes: number,
  chunkBytes: number,
): MultipartBenchmarkScenario {
  const incompleteDelimiter = encoder.encode(`\r\n--${boundary.slice(0, -1)}`);
  const payload = new Uint8Array(payloadBytes);

  for (let offset = 0; offset < payload.length; offset += 1) {
    payload[offset] = incompleteDelimiter[offset % incompleteDelimiter.length]!;
  }

  return createScenario({
    chunkBytes,
    name: "prefix-heavy",
    parts: [
      {
        name: "file",
        filename: "prefix-heavy.bin",
        contentType: "application/octet-stream",
        payload,
      },
    ],
    primary: false,
  });
}

function createScenario(options: {
  chunkBytes: number;
  name: string;
  parts: readonly FixturePart[];
  primary: boolean;
}): MultipartBenchmarkScenario {
  const segments: Uint8Array<ArrayBuffer>[] = [];
  let expectedBytes = 0;
  let expectedChecksum = 0;
  const expectedPartDescriptors: string[] = [];

  for (const part of options.parts) {
    const disposition =
      part.filename === undefined
        ? `Content-Disposition: form-data; name="${part.name}"\r\n`
        : `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n`;
    const contentType =
      part.contentType === undefined ? "" : `Content-Type: ${part.contentType}\r\n`;

    segments.push(
      encoder.encode(`--${boundary}\r\n${disposition}${contentType}\r\n`),
      part.payload,
      encoder.encode("\r\n"),
    );
    expectedBytes += part.payload.byteLength;
    expectedChecksum = checksumBytes(part.payload, expectedChecksum);
    expectedPartDescriptors.push(
      [part.name, part.filename ?? "", part.contentType ?? ""].join(":"),
    );
  }

  segments.push(encoder.encode(`--${boundary}--\r\n`));

  return {
    body: concatSegments(segments),
    chunkBytes: options.chunkBytes,
    expectedBytes,
    expectedChecksum,
    expectedPartDescriptors,
    expectedParts: options.parts.length,
    name: options.name,
    primary: options.primary,
  };
}

function requestFromScenario(scenario: MultipartBenchmarkScenario): Request {
  let offset = 0;

  return new Request("https://app.test/upload", {
    method: "POST",
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= scenario.body.byteLength) {
          controller.close();
          return;
        }

        const end = Math.min(offset + scenario.chunkBytes, scenario.body.byteLength);
        controller.enqueue(scenario.body.subarray(offset, end));
        offset = end;
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function createPatternBytes(length: number, seed: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = ((index * 31 + seed) % 251) + 1;
  }

  return bytes;
}

function concatSegments(segments: readonly Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const length = segments.reduce((total, segment) => total + segment.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;

  for (const segment of segments) {
    result.set(segment, offset);
    offset += segment.byteLength;
  }

  return result;
}

function checksumBytes(bytes: Uint8Array<ArrayBuffer>, initial: number): number {
  let checksum = initial;

  for (const byte of bytes) {
    checksum = (checksum + byte) >>> 0;
  }

  return checksum;
}

function noteValue(row: BenchmarkRow, name: string): string {
  return row.notes?.find((note) => note.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
