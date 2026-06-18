import { reactFlowFixtures } from "./fixtures.js";
import type { CompatRuntime } from "./types.js";

declare global {
  interface Window {
    __COMPAT_LAB_RUNTIME__?: CompatRuntime;
  }
}

export function App() {
  const params = new URLSearchParams(window.location.search);
  const fixtureId = params.get("fixture") ?? reactFlowFixtures[0]?.id;
  const fixture = reactFlowFixtures.find((entry) => entry.id === fixtureId);
  const runtime = window.__COMPAT_LAB_RUNTIME__ ?? "react";

  if (fixture === undefined) {
    return (
      <main data-compat-lab-root="true" data-fixture-missing={fixtureId ?? "unknown"}>
        Missing React Flow fixture
      </main>
    );
  }

  return (
    <main data-compat-lab-root="true" data-fixture-id={fixture.id} data-runtime={runtime}>
      <header className="react-flow-lab-header">
        <h1>{fixture.title}</h1>
      </header>
      {fixture.render(runtime)}
    </main>
  );
}
