import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";

// macOS reports the temp directory through the /var symlink while tools that
// resolve real paths (Vite, realpath-based caches) report /private/var. Tests
// that compare paths from mkdtemp against resolved paths then disagree only on
// macOS. Point TMPDIR at the resolved directory so os.tmpdir() is canonical.
try {
  process.env.TMPDIR = realpathSync(tmpdir());
} catch {
  // Keep the platform default when the temp directory cannot be resolved.
}
