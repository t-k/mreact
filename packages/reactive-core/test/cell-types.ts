import { cell } from "../src/index.js";

const callable = cell<() => number>(() => 1);
callable.setValue(() => 2);
callable.update((previous) => () => previous() + 1);

const optional = cell<number | undefined>(undefined);
optional.setValue(undefined);
optional.update((previous) => (previous ?? 0) + 1);
