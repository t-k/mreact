import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

/** A directly owned, non-detached child, also covered by the run supervisor's group. */
export function startProbeWorker(module: URL, config: unknown) {
  const child = fork(fileURLToPath(module), [JSON.stringify(config)], {
    execArgv: ["--import", "tsx"],
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let stderr = "";
  let terminal: Error | undefined;
  let waiter: { resolve: (value: unknown) => void; reject: (error: Error) => void } | undefined;
  const queue: unknown[] = [];
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-8_192);
  });
  child.on("message", (message) => {
    if (waiter) {
      const pending = waiter;
      waiter = undefined;
      pending.resolve(message);
    } else queue.push(message);
  });
  const fail = (error: Error) => {
    terminal = error;
    waiter?.reject(error);
    waiter = undefined;
  };
  child.on("error", fail);
  const exited = new Promise<void>((resolve) =>
    child.once("exit", (code, signal) => {
      fail(new Error(`probe worker exited (${code ?? signal}): ${stderr}`));
      resolve();
    }),
  );
  return {
    pid: child.pid!,
    async receive<T>(timeoutMs = 30_000): Promise<T> {
      if (queue.length) return queue.shift() as T;
      if (terminal) throw terminal;
      if (waiter) throw new Error("concurrent worker receive");
      return await new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          waiter = undefined;
          reject(new Error(`probe worker deadline: ${stderr}`));
        }, timeoutMs);
        waiter = {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value as T);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        };
      });
    },
    async send(message: unknown) {
      if (terminal) throw terminal;
      await new Promise<void>((resolve, reject) =>
        child.send(message as object, (error) => (error ? reject(error) : resolve())),
      );
    },
    async close() {
      if (child.exitCode !== null || child.signalCode !== null) {
        await exited;
        return;
      }
      if (child.connected)
        await new Promise<void>((resolve) => child.send({ type: "close" }, () => resolve()));
      let forced = false;
      const timer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          forced = true;
          child.kill("SIGKILL");
        }
      }, 3_000);
      try {
        await exited;
      } finally {
        clearTimeout(timer);
      }
      if (forced) throw new Error(`probe worker ${child.pid} required forced cleanup`);
    },
  };
}
