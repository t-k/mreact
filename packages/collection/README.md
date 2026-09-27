# @reckona/mreact-collection

An opt-in keyed collection for screens that update individual rows frequently. It keeps a reactive cell for each row and separate cells for order and count. Ordinary arrays remain the default choice for smaller lists.

```ts
import { createCollection } from "@reckona/mreact-collection";

const projects = createCollection(
  [{ id: "p1", status: "open" }, { id: "p2", status: "open" }],
  { key: (project) => project.id },
);

const firstProject = projects.row("p1");
projects.patch("p1", { status: "done" });
projects.move("p2", { before: "p1" });
projects.append({ id: "p3", status: "open" });
projects.remove("p3");

const ordinaryArray = projects.toArray();
```

`row(key)` returns the current row's read-only cell or `undefined` if the key is absent. A cell stays stable through patches and moves. Removal sets that cell to `undefined`; reinserting the same key creates a new cell. Watch `order` when row membership matters, because looking up an absent key does not create a subscription. `count` changes only when rows are appended or removed.

Keys use `Map` equality. Duplicate keys, missing keys, and patches that change a row's key throw. `patch` shallowly copies a plain row object, so keep row values immutable and use `patch` to publish changes. `toArray()` reads all rows in order and can be passed to existing list binding APIs. It does not make whole-array reconciliation incremental; filtering or sorting by changed row values still requires application-level work.
