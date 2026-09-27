import { describe, expect, test } from "vitest";
import { runCompiledAllocationProfile, runCompiledEndurance } from "./run-endurance.mjs";

const fixture = `<!doctype html><body>
<button id="runlots">Create</button><button id="update">Update</button><button id="swaprows">Swap</button>
<button id="add">Add</button><button id="clear">Clear</button><table><tbody></tbody></table>
<script>
const body = document.querySelector("tbody");
let nextId = 0;
function append(count) {
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < count; index += 1) {
    const row = document.createElement("tr");
    row.innerHTML = '<td><a class="select">Row' + nextId + '</a></td><td><a class="remove">Remove</a></td>';
    row.dataset.id = String(nextId++);
    fragment.append(row);
  }
  body.append(fragment);
}
body.addEventListener("click", (event) => {
  const row = event.target.closest("tr");
  if (event.target.classList.contains("select")) row.classList.add("danger");
  if (event.target.classList.contains("remove")) row.remove();
});
document.querySelector("#runlots").onclick = () => { body.replaceChildren(); append(10000); };
document.querySelector("#update").onclick = () => { for (let index = 0; index < body.rows.length; index += 10) body.rows[index].querySelector(".select").textContent += " !!!"; };
document.querySelector("#swaprows").onclick = () => { const first = body.rows[1]; const second = body.rows[998]; const marker = document.createComment(""); first.replaceWith(marker); second.replaceWith(first); marker.replaceWith(second); };
document.querySelector("#add").onclick = () => append(1000);
document.querySelector("#clear").onclick = () => body.replaceChildren();
</script>`;

describe("compiled JSX endurance harness", () => {
  test("reuses the official keyed fixture build and server", async () => {
    const runner = await readFile(new URL("./run-official.mjs", import.meta.url), "utf8");
    const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));

    expect(runner).toContain("await rebuildSelectedFrameworks();");
    expect(runner).toContain("await runCompiledEndurance(");
    expect(runner).toContain("MREACT_JS_FRAMEWORK_ENDURANCE_CYCLES");
    expect(packageJson.scripts["bench:js-framework:endurance"]).toContain("run-official.mjs");
    expect(runner).toContain("await runCompiledAllocationProfile(");
    expect(runner).toContain("MREACT_JS_FRAMEWORK_ALLOCATION_PROFILE_CYCLES");
    expect(packageJson.scripts["bench:js-framework:allocations"]).toContain("run-official.mjs");
  });

  test("records a complete repeated operation sequence without forcing GC", async () => {
    const result = await runCompiledEndurance({
      url: `data:text/html,${encodeURIComponent(fixture)}`,
      cycles: 2,
      warmupCycles: 0,
    });

    expect(result.methodologyVersion).toBe(1);
    expect(result.gcMode).toBe("natural");
    expect(result.cycles).toHaveLength(2);
    expect(result.operationSummary["create-10k"].count).toBe(2);
    expect(result.operationSummary["create-10k"].maxDomVerifiedMs).toBeGreaterThanOrEqual(
      result.operationSummary["create-10k"].medianDomVerifiedMs,
    );
    expect(result.postClearGc.domNodes).toBeGreaterThan(0);
    expect(result.postNavigationGc.domNodes).toBeGreaterThan(0);
    for (const cycle of result.cycles) {
      expect(cycle.operations.map((operation) => operation.name)).toEqual([
        "create-10k", "update-10th", "select", "swap", "append-1k", "remove", "clear",
      ]);
      expect(cycle.operations.every((operation) => operation.domVerifiedMs >= operation.clickMs)).toBe(true);
      expect(cycle.jsHeapUsedBytes).toBeGreaterThan(0);
      expect(cycle.domNodes).toBeGreaterThan(0);
    }
  });

  test("profiles temporary allocations in a separate Chromium run", async () => {
    const result = await runCompiledAllocationProfile({
      url: `data:text/html,${encodeURIComponent(fixture)}`,
      cycles: 2,
      warmupCycles: 0,
      samplingIntervalBytes: 1024,
    });

    expect(result.track).toBe("compiled-jsx-allocation-profile");
    expect(result.gcMode).toBe("natural");
    expect(result.includeCollectedByMajorGC).toBe(true);
    expect(result.includeCollectedByMinorGC).toBe(true);
    expect(result.operations).toHaveLength(2);
    expect(result.estimatedSampledBytes).toBeGreaterThan(0);
    expect(result.topAllocationSites.length).toBeGreaterThan(0);
    expect(result.profile.head.selfSize).toBeGreaterThanOrEqual(0);
  });
});
import { readFile } from "node:fs/promises";
