# @reckona/mreact-test-utils

`@reckona/mreact-test-utils` provides compact integration-test helpers for the
mreact app router and component-level reactive DOM tests. It wraps temporary app
directories, request helpers, reactive update flushing, and HTML assertions.

## Basic Usage

```ts
import { createAppFixture, responseText } from "@reckona/mreact-test-utils";

const fixture = await createAppFixture({
  files: {
    "page.tsx": "export default function Page() { return <main>Hello</main>; }",
  },
});

const response = await fixture.render("/");
const html = await responseText(response);
```

For component-level tests, mount reactive DOM output directly and use `act()` to flush pending reactive work:

```ts
import { bindText } from "@reckona/mreact-reactive-dom";
import { act, createCellMock, render } from "@reckona/mreact-test-utils";

const count = createCellMock(0);
const view = render(() => {
  const text = document.createTextNode("");
  bindText(text, () => count.get());
  return text;
});

await act(() => {
  count.set(1);
});

view.container.textContent;
// "1"
```

For unit tests that call app-router route handlers directly, use `invokeRouteHandler()` to translate mreact control-flow throws into the same `Response` objects the router boundary would produce:

```ts
import { redirect } from "@reckona/mreact-router";
import { invokeRouteHandler } from "@reckona/mreact-test-utils";

function POST(request: Request): Response {
  if (!request.headers.get("cookie")) redirect("/login");
  return Response.json({ ok: true });
}

const response = await invokeRouteHandler(POST, new Request("https://app.test/api", { method: "POST" }));
response.status;
// 303
```

## Core APIs

- `createAppFixture()` creates a temporary app and `.mreact/` build output.
- `fixture.render()` sends requests through the router using `Request` / `Response`.
- `fixture.write()` adds or updates route files in the fixture app.
- `render()` mounts reactive DOM output into a container and returns `{ container, rerender, unmount }`.
- `act()` runs sync or async mutations and waits for reactive effects to settle.
- `flushReactive()` drains pending reactive effects without wrapping a mutation.
- `createCellMock()` and `createComputedMock()` create real reactive primitives for focused unit tests.
- `invokeRouteHandler()` calls a route handler and converts `redirect()`, `notFound()`, and thrown `Response` control flow into a `Response`.
- `responseText()` reads a response body as a string.

## Use Cases

Use this package for scenario tests that cross router, query, auth, forms, and
server-action boundaries. Because this repository is a public library, test
scenario names should be specific and written in English.
