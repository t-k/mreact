import { cp, rm } from "node:fs/promises";
import { join } from "node:path";

const currentFixtureNames = ["mreact", "mreact-react-compat", "mreact-react-compat-vdom"];
const obsoleteFixtureNames = ["mreact-compiled"];

export async function syncMreactFixtureDirectories({ checkoutRoot, fixtureRoot }) {
  const checkoutKeyedRoot = join(checkoutRoot, "frameworks", "keyed");

  for (const name of obsoleteFixtureNames) {
    await rm(join(checkoutKeyedRoot, name), { force: true, recursive: true });
  }

  for (const name of currentFixtureNames) {
    const target = join(checkoutKeyedRoot, name);
    await rm(target, { force: true, recursive: true });
    await cp(join(fixtureRoot, name), target, { force: true, recursive: true });
  }
}
