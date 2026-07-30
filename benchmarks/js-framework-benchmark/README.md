# js-framework-benchmark integration

This directory contains the Mreact keyed implementations prepared for krausest/js-framework-benchmark. Copy `frameworks/keyed/mreact` and `frameworks/keyed/mreact-react-compat` into a checkout of `krausest/js-framework-benchmark`, run that repository's normal install/build flow, and benchmark them with the official webdriver runner.

The fixtures intentionally target the standard keyed table cases: create 1,000 rows, create 10,000 rows, append 1,000 rows, update every 10th row, select a row, remove a row, swap rows, and clear rows. Those DOM-list cases should use the official harness for public cross-framework comparisons once the upstream PR is accepted.

The repository-local primitive reactivity microbenchmarks, such as source writes and computed fan-in, remain separate because they are not js-framework-benchmark cases.

Set `MREACT_JS_FRAMEWORK_CHROME_BINARY` to an absolute browser executable path when the official runner's default Chromium path is unavailable. The configured binary is used by smoke validation, keyedness validation, CSP validation, and the full benchmark run.
