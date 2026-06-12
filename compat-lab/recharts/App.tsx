import { fixtureIdFromSearch, runtimeFromValue } from "./app-state.js";
import { rechartsFixtures } from "./fixtures.js";
import type { CompatRuntime } from "./types.js";

declare global {
  var __COMPAT_LAB_RUNTIME__: CompatRuntime | undefined;
}

export function App() {
  const fallbackFixtureId = rechartsFixtures[0]?.id ?? "";
  const fixtureId = fixtureIdFromSearch(window.location.search, fallbackFixtureId);
  const fixture = rechartsFixtures.find((candidate) => candidate.id === fixtureId);
  const runtime = runtimeFromValue(globalThis.__COMPAT_LAB_RUNTIME__);

  if (fixture === undefined) {
    return (
      <main data-compat-lab-root="true" data-fixture-missing={fixtureId}>
        <h1>Missing fixture</h1>
      </main>
    );
  }

  return (
    <main data-compat-lab-root="true" data-fixture-id={fixture.id} data-runtime={runtime}>
      <header className="lab-header">
        <h1>{fixture.title}</h1>
        <p>{fixture.description}</p>
      </header>
      <section className="lab-chart">{fixture.render(runtime)}</section>
    </main>
  );
}
