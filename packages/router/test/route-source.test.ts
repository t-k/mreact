import { describe, expect, test } from "vitest";
import {
  hasGenerateStaticParamsExport,
  hasLoaderExport,
  hasPrerenderExport,
  isStreamRouteSource,
  stripRouteClientOnlyExports,
  stripRouteModuleExports,
} from "../src/route-source.js";

describe("router route source transforms", () => {
  test("strips route runtime exports through one shared helper", () => {
    const source = `export const stream = true;
export const revalidate = 60;
export const prerender = true;
export const auth = "include-claims";

export async function generateStaticParams() {
  return [{ id: "ada" }];
}

export async function loader() {
  return { title: "server" };
}

export const metadata = {
  title: "metadata",
};

export default function Page(props) {
  return <main>{props.data.title}</main>;
}`;

    const stripped = stripRouteModuleExports(source);

    expect(stripped).not.toContain("export const stream");
    expect(stripped).not.toContain("export const revalidate");
    expect(stripped).not.toContain("export const prerender");
    expect(stripped).not.toContain("export const auth");
    expect(stripped).not.toContain("function generateStaticParams");
    expect(stripped).not.toContain("function loader");
    expect(stripped).toContain("export const metadata");
    expect(stripped).toContain("export default function Page");
  });

  test("strips metadata only for client-only route compilation", () => {
    const source = `export const metadata = {
  title: "server-only",
};

export default function Page() {
  return <button onClick={() => undefined}>Save</button>;
}`;

    const stripped = stripRouteClientOnlyExports(source);

    expect(stripped).not.toContain("server-only");
    expect(stripped).toContain("export default function Page");
  });

  test("detects route config exports from the shared source helper", () => {
    expect(isStreamRouteSource("export const stream = true;")).toBe(true);
    expect(hasPrerenderExport("export const prerender = true;")).toBe(true);
    expect(hasGenerateStaticParamsExport("export function generateStaticParams() {}")).toBe(true);
    expect(hasLoaderExport("export const loader = () => ({ ok: true });")).toBe(true);
  });
});
