import { uiPrimitiveFixtures } from "./fixtures.js";
import type { CompatRuntime } from "./types.js";

declare global {
  interface Window {
    __COMPAT_LAB_RUNTIME__?: CompatRuntime;
  }
}

export function App() {
  const params = new URLSearchParams(window.location.search);
  const fixtureId = params.get("fixture") ?? uiPrimitiveFixtures[0]?.id;
  const fixture = uiPrimitiveFixtures.find((entry) => entry.id === fixtureId);
  const runtime = window.__COMPAT_LAB_RUNTIME__ ?? "react";

  if (fixture === undefined) {
    return (
      <main data-compat-lab-root="true" data-fixture-missing={fixtureId ?? "unknown"}>
        Missing UI primitive fixture
      </main>
    );
  }

  return (
    <main data-compat-lab-root="true" data-fixture-id={fixture.id} data-runtime={runtime}>
      <header className="ui-header">
        <h1>{fixture.title}</h1>
      </header>
      {fixture.render(runtime)}
    </main>
  );
}
