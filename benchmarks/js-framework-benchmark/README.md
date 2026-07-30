# js-framework-benchmark integration

This directory contains the Mreact keyed implementations and an Octane 0.1.19 keyed fixture prepared for krausest/js-framework-benchmark. The repository runner copies the local fixtures into an official checkout, runs its normal install and build flow, and measures them with the official webdriver runner.

The fixtures intentionally target the standard keyed table cases: create 1,000 rows, create 10,000 rows, append 1,000 rows, update every 10th row, select a row, remove a row, swap rows, and clear rows. Those DOM-list cases should use the official harness for public cross-framework comparisons once the upstream PR is accepted.

The repository-local primitive reactivity microbenchmarks, such as source writes and computed fan-in, remain separate because they are not js-framework-benchmark cases.

Set `MREACT_JS_FRAMEWORKS=keyed/octane` when only the local Octane fixture should be built and measured.
