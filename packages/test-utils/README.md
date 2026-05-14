# @reckona/mreact-test-utils

`@reckona/mreact-test-utils` provides compact integration-test helpers for the
mreact app router. It wraps temporary app directories, build artifacts, request
helpers, and HTML assertions.

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

## Core APIs

- `createAppFixture()` creates a temporary app and `.mreact/` build output.
- `fixture.render()` sends requests through the router using `Request` / `Response`.
- `fixture.write()` adds or updates route files in the fixture app.
- `responseText()` reads a response body as a string.

## Use Cases

Use this package for scenario tests that cross router, query, auth, forms, and
server-action boundaries. Because this repository is a public library, test
scenario names should be specific and written in English.
