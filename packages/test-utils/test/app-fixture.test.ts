import { describe, expect, it } from "vitest";
import { createAppFixture, readQueryState, responseText } from "../src/index.js";

describe("app router test fixture", () => {
  it("creates route files and renders through the real app router", async () => {
    const fixture = await createAppFixture("test-utils-render");
    await fixture.write(
      "page.tsx",
      `export default function Page() {
  return <main>Fixture render</main>;
}`,
    );

    const response = await fixture.render("/");

    expect(response.status).toBe(200);
    expect(await responseText(response)).toContain("<main>Fixture render</main>");
  });

  it("creates nested route directories", async () => {
    const fixture = await createAppFixture("test-utils-nested");
    await fixture.write(
      "users/$id/page.tsx",
      `export default function Page(props) {
  return <main>User {props.params.id}</main>;
}`,
    );

    const html = await responseText(await fixture.render("/users/ada"));

    expect(html).toContain("<main>User ada</main>");
  });

  it("returns query state from SSR HTML", async () => {
    const fixture = await createAppFixture("test-utils-query-state");
    await fixture.write(
      "page.tsx",
      `export async function loader({ queryClient }) {
  await queryClient.prefetchQuery({
    queryKey: ["profile"],
    queryFn: async () => ({ name: "Ada" }),
  });
}

export default function Page(props) {
  const profile = props.queryClient.getQueryData(["profile"]);
  return <html><head></head><body><main>{profile.name}</main></body></html>;
}`,
    );

    const html = await responseText(await fixture.render("/"));

    expect(readQueryState(html)).toEqual({
      queries: [
        expect.objectContaining({
          data: { name: "Ada" },
          queryKey: ["profile"],
        }),
      ],
    });
  });

  it("returns undefined when query state is absent", () => {
    expect(readQueryState("<main>No state</main>")).toBeUndefined();
  });
});
