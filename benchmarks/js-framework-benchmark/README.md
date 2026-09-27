# js-framework-benchmark integration

This directory contains the Mreact keyed implementations prepared for krausest/js-framework-benchmark. Copy `frameworks/keyed/mreact` and `frameworks/keyed/mreact-react-compat` into a checkout of `krausest/js-framework-benchmark`, run that repository's normal install/build flow, and benchmark them with the official webdriver runner.

`keyed/mreact` measures the normal public compiler path from ordinary cell-backed JSX. It is the canonical Mreact fixture used for public cross-framework comparisons.

The fixtures intentionally target the standard keyed table cases: create 1,000 rows, create 10,000 rows, append 1,000 rows, update every 10th row, select a row, remove a row, swap rows, and clear rows. Those DOM-list cases should use the official harness for public cross-framework comparisons once the upstream PR is accepted.

The repository-local primitive reactivity microbenchmarks, such as source writes and computed fan-in, remain separate because they are not js-framework-benchmark cases.

Run `pnpm bench:js-framework:endurance` for a separate natural-GC track against the production build of the same `keyed/mreact` fixture. It keeps one Chromium page open for 20 measured cycles after one warmup cycle. Each cycle creates 10,000 rows, updates every tenth row, selects one row, swaps two rows, appends 1,000 rows, removes one row, and clears the list. The report preserves each operation's click-call duration and time to verified DOM state, plus per-cycle Chromium task/script duration and heap/node snapshots. A forced GC runs only after the timed cycles to inspect the empty list and again after navigation away; these terminal snapshots do not affect the timed natural-GC sequence. This track is not a paint, INP, or allocation measurement. The canonical fixture has no filter or arbitrary-sort action. Results are written to a unique `compiled-endurance/<timestamp>/compiled-endurance.json` directory; use `MREACT_JS_FRAMEWORKS=keyed/mreact MREACT_JS_FRAMEWORK_ENDURANCE_CYCLES=<count> pnpm bench:js-framework` to select a different cycle count.

Set `MREACT_JS_FRAMEWORK_CHROME_BINARY` to an absolute browser executable path when the official runner's default Chromium path is unavailable. The configured binary is used by smoke validation, keyedness validation, CSP validation, and the full benchmark run.
