const { exitCode } = JSON.parse(process.argv[2]!) as { exitCode: number };
process.on("message", () => {
  process.exitCode = exitCode;
  process.disconnect?.();
});
process.send?.({ type: "ready" });
