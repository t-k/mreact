import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { defer, isDeferredLoaderData, unwrapDeferredLoaderData } from "../src/deferred.js";
import { renderAppRequest } from "../src/render.js";

describe("deferred loader data", () => {
  test("marks deferred loader data without awaiting nested promises", () => {
    const stories = Promise.resolve([{ id: 1 }]);
    const data = defer({ stories, user: { id: "ada" } });

    expect(isDeferredLoaderData(data)).toBe(true);
    expect(unwrapDeferredLoaderData(data)).toEqual({
      stories,
      user: { id: "ada" },
    });
  });

  test("does not treat plain objects as deferred data", () => {
    expect(isDeferredLoaderData({ user: { id: "ada" } })).toBe(false);
  });

  test("route with Await renders shell before deferred loader field resolves without stream export", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-deferred-loader-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `import { defer } from "@reckona/mreact-router";
export function loader() {
  return defer({
    title: "Dashboard",
    slow: new Promise(() => {}),
  });
}
export default function Page(props) {
  return <main><h1>{props.data.title}</h1><Await value={props.data.slow} placeholder={<span>Loading slow</span>}>{value => <strong>{value}</strong>}</Await></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://mreact.test/"),
    });
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const first = await reader!.read();
    const firstChunk = new TextDecoder().decode(first.value);

    await reader!.cancel();
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(firstChunk).toContain("Dashboard");
    expect(firstChunk).toContain("Loading slow");
  });

  test("keeps redirect as critical control flow", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-deferred-redirect-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `import { defer, redirect303 } from "@reckona/mreact-router";
export const stream = true;
export function loader() {
  return redirect303("/login");
}
export default function Page() { return <main>never</main>; }`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://mreact.test/"),
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
  });

  test("handles deferred field rejection with Await catch without changing route status", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-deferred-catch-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `import { defer } from "@reckona/mreact-router";
export const stream = true;
export function loader() {
  return defer({ slow: new Promise((_, reject) => setTimeout(() => reject(new Error("slow failed")), 0)) });
}
export default function Page(props) {
  return <main><Await value={props.data.slow} placeholder={<span>Loading</span>} catch={error => <strong>{error.message}</strong>}>{value => <span>{value}</span>}</Await></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://mreact.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("slow failed");
  });

  test("does not treat a deferred field Response as route control flow", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-deferred-response-field-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `import { defer } from "@reckona/mreact-router";
export const stream = true;
export function loader() {
  return defer({ slow: Promise.resolve(new Response("ignored", { status: 418 })) });
}
export default function Page(props) {
  return <main><Await value={props.data.slow} placeholder={<span>Loading</span>}>{value => <span>{String(value instanceof Response)}</span>}</Await></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://mreact.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("true");
  });
});
