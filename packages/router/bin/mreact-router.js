#!/usr/bin/env node

const builtCliUrl = new URL("../dist/cli.js", import.meta.url);

try {
  await import(builtCliUrl.href);
} catch (error) {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ERR_MODULE_NOT_FOUND" &&
    "url" in error &&
    error.url === builtCliUrl.href
  ) {
    console.error(
      "mreact-router has not been built yet. Run the workspace or package build before invoking the CLI.",
    );
    process.exitCode = 1;
  } else {
    throw error;
  }
}
