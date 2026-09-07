import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { startDevServer } from "../dist/dev-server.js";

for (const placement of ["route", "component"] as const) {
  test(`${placement} conditional disposes nested bindings before clearing nullable state`, async ({
    page,
  }) => {
    // Vite canonicalizes imports; use the same path for allowed source directories.
    const appDir = await realpath(await mkdtemp(join(tmpdir(), "mreact-route-teardown-")));
    await mkdir(join(appDir, "state"));
    await writeFile(
      join(appDir, "state", "panel.ts"),
      `import { cell } from "@reckona/mreact-reactive-core";
export const ticket = cell<number | null>(null);`,
    );
    await writeFile(
      join(appDir, "panel.tsx"),
      `import { computed } from "@reckona/mreact-reactive-core";
import { Link } from "@reckona/mreact-router/link";

export function Shell(props) { return <main>{props.children}</main>; }
export function PanelSlot(props) { return <>{props.open ? props.children : null}</>; }
export function TicketPanel(props) {
  return <aside data-testid="panel" data-number={props.number}>
    <Link href={"/tickets/" + props.number}>Open page</Link>
    {props.children}
  </aside>;
}
export function TicketDetail(props) {
  const vm = computed(() => {
    const number = Number.parseInt(props.number, 10);
    return Number.isNaN(number) ? null : { number };
  });
  function view() {
    const value = vm.get();
    if (value === null) throw new Error("disposed detail was evaluated");
    return value;
  }
  return <span data-testid="detail" data-number={view().number}>Ticket</span>;
}`,
    );
    const panel = `<TicketPanel number={ticket.get() ?? 0}><TicketDetail number={String(ticket.get() ?? "")} /></TicketPanel>`;
    await writeFile(
      join(appDir, "page.tsx"),
      `"use client";
import { ticket } from "./state/panel";
import { Shell, PanelSlot, TicketPanel, TicketDetail } from "./panel";
export default function Page() {
  return <Shell>
    <button data-testid="open" onClick={() => ticket.set(1)}>Open</button>
    <button data-testid="close" onClick={() => ticket.set(null)}>Close</button>
    ${placement === "route" ? `{ticket.get() === null ? null : (${panel})}` : `<PanelSlot open={ticket.get() !== null}>${panel}</PanelSlot>`}
  </Shell>;
}`,
    );
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const server = await startDevServer({ appDir, port: 0 });
    try {
      await page.goto(server.url);
      await page.waitForFunction(() => document.documentElement.dataset.mreactHydrated === "true");
      const open = page.getByTestId("open");
      await expect(page.getByTestId("panel")).toHaveCount(0);
      for (let cycle = 0; cycle < 2; cycle += 1) {
        await open.click();
        await expect(page.getByTestId("panel")).toHaveCount(1);
        await expect(page.getByTestId("detail")).toHaveAttribute("data-number", "1");
        await page.getByTestId("close").click();
        await expect(page.getByTestId("panel")).toHaveCount(0);
        expect(errors).toEqual([]);
      }
    } finally {
      await server.close();
      await rm(appDir, { force: true, recursive: true });
    }
  });
}
