# @reckona/mreact-scheduler

`@reckona/mreact-scheduler` exposes the scheduler-compatible API used by the
mreact compatibility runtime.

## Basic Usage

```ts
import {
  unstable_NormalPriority,
  unstable_scheduleCallback,
} from "@reckona/mreact-scheduler";

unstable_scheduleCallback(unstable_NormalPriority, () => {
  console.log("scheduled");
});
```

## Notes

This package mirrors the scheduler surface expected by React-compatible tooling.
It currently re-exports the scheduler implementation from
`@reckona/mreact-compat/scheduler`.
