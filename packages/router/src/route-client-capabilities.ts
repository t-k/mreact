import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";

const nodeBuiltinSpecifiers = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

/**
 * What is known about one client capability across a route's reachable module graph.
 *
 * `known-used` and `known-unused` are facts: some analysable module in the graph does or does not
 * use the capability. `unknown` means the graph could not be resolved - a dynamic import, an opaque
 * package, an unresolvable specifier or a graph larger than the budget - and the caller must keep
 * whatever conservative emission it used before.
 */
export type ClientCapabilityFact = "known-unused" | "known-used" | "unknown";

export interface ClientRouteCapabilityFacts {
  cells: ClientCapabilityFact;
  domRefs: ClientCapabilityFact;
  eventBindings: ClientCapabilityFact;
  reactiveEffect: ClientCapabilityFact;
  requestLocation: ClientCapabilityFact;
}

export interface CollectClientRouteCapabilityFactsOptions {
  code: string;
  filename: string;
  /**
   * Modules whose capabilities are not the route entry's to serve, such as client boundaries that
   * ship and hydrate through their own reference bundle. They are neither followed nor opaque.
   */
  isExcludedModule?: ((file: string) => boolean) | undefined;
  /** Resolves a relative specifier to an absolute source path, or undefined when it cannot. */
  resolveImport: (options: { importer: string; specifier: string }) => Promise<string | undefined>;
  /** Upper bound on modules read, so a large graph degrades to `unknown` instead of stalling. */
  maxModules?: number | undefined;
  readModule?: ((file: string) => Promise<string>) | undefined;
}

const defaultMaxModules = 128;

/**
 * Packages whose own module bodies cannot introduce a route capability.
 *
 * Importing them is not itself a capability: `cell`, `effect` and `bindDomRef` only matter where
 * the importing module calls them, and that call site is visible in the importing module. Every
 * other bare specifier is opaque, so it makes the whole graph `unknown`.
 */
const transparentPackages = new Set([
  "@reckona/mreact",
  "@reckona/mreact-reactive-core",
  "@reckona/mreact-reactive-core/internal",
  "@reckona/mreact-reactive-core/runtime-state",
  "@reckona/mreact-reactive-core/testing",
  "@reckona/mreact-reactive-dom",
  "@reckona/mreact-reactive-dom/compat-normalize",
  "@reckona/mreact-reactive-dom/internal",
  "@reckona/mreact-shared",
  "@reckona/mreact-shared/html-escape",
  "@reckona/mreact/jsx-dev-runtime",
  "@reckona/mreact/jsx-runtime",
]);

const styleExtensions = [".css", ".sass", ".scss", ".less", ".styl"];

const eventAttributePattern = /\bon[A-Z][\w$]*\s*=/u;
const dynamicImportPattern = /\bimport\s*\(/u;
const requestMemberPattern = /\.\s*request\b/u;
const requestReadPattern = /(?:^|[^.\w$])request\s*\.\s*(?:hash|pathname|search|url)\b/u;
// A binding destructure closes with `)`, `:` or `=`; a JSX expression container such as `{request}`
// closes with markup or text, and reading a local of that name is not a route location read.
const requestDestructurePattern = /\{[^{}]*\brequest\b[^{}]*\}\s*[),:=]/u;

/** Collects capability facts by walking the route's reachable static import graph. */
export async function collectClientRouteCapabilityFacts(
  options: CollectClientRouteCapabilityFactsOptions,
): Promise<ClientRouteCapabilityFacts> {
  const readModule = options.readModule ?? ((file: string) => readFile(file, "utf8"));
  const maxModules = options.maxModules ?? defaultMaxModules;
  const visited = new Set<string>([options.filename]);
  const queue: Array<{ code: string; file: string }> = [
    { code: options.code, file: options.filename },
  ];
  const used = {
    cells: false,
    domRefs: false,
    eventBindings: false,
    reactiveEffect: false,
    requestLocation: false,
  };
  let opaque = false;

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }

    const scanned = scanModuleSource(current.code);
    if (scanned === undefined) {
      opaque = true;
      continue;
    }

    const { withoutComments, withoutLiterals } = scanned;

    // Import specifiers are string literals, so they are read from the comment-stripped source,
    // while capability evidence is read from the source with literals blanked out too.
    const imports = parseStaticImports(withoutComments);

    // A module that imports a Node builtin cannot run in the browser, so nothing it contains is a
    // client capability and following it would only drag server-only code into the answer.
    if (imports.sources.some((specifier) => nodeBuiltinSpecifiers.has(specifier))) {
      continue;
    }

    // A "use client" module is its own client boundary: it ships and hydrates through its own
    // reference bundle, so the route entry does not serve its capabilities.
    if (current.file !== options.filename && hasUseClientDirective(withoutComments)) {
      continue;
    }

    if (dynamicImportPattern.test(withoutLiterals)) {
      opaque = true;
    }

    recordModuleCapabilities(used, blankStaticImports(withoutComments, withoutLiterals), imports);

    for (const specifier of imports.sources) {
      if (specifier.startsWith(".")) {
        if (isStyleSpecifier(specifier)) {
          continue;
        }

        const resolved = await options.resolveImport({
          importer: current.file,
          specifier,
        });

        if (resolved === undefined) {
          opaque = true;
          continue;
        }

        if (options.isExcludedModule?.(resolved) === true) {
          continue;
        }

        if (visited.has(resolved)) {
          continue;
        }

        if (visited.size >= maxModules) {
          opaque = true;
          continue;
        }

        visited.add(resolved);

        try {
          queue.push({ code: await readModule(resolved), file: resolved });
        } catch {
          opaque = true;
        }

        continue;
      }

      if (!transparentPackages.has(specifier) && !isStyleSpecifier(specifier)) {
        opaque = true;
      }
    }
  }

  const fact = (capabilityUsed: boolean): ClientCapabilityFact =>
    capabilityUsed ? "known-used" : opaque ? "unknown" : "known-unused";

  return {
    cells: fact(used.cells),
    domRefs: fact(used.domRefs),
    eventBindings: fact(used.eventBindings),
    reactiveEffect: fact(used.reactiveEffect),
    requestLocation: fact(used.requestLocation),
  };
}

interface ModuleImports {
  reactiveCoreLocalNames: Map<string, string>;
  reactiveDomLocalNames: Map<string, string>;
  sources: string[];
}

function recordModuleCapabilities(
  used: {
    cells: boolean;
    domRefs: boolean;
    eventBindings: boolean;
    reactiveEffect: boolean;
    requestLocation: boolean;
  },
  stripped: string,
  imports: ModuleImports,
): void {
  if (referencesLocalName(stripped, imports.reactiveCoreLocalNames.get("cell"))) {
    used.cells = true;
  }

  if (referencesLocalName(stripped, imports.reactiveCoreLocalNames.get("effect"))) {
    used.reactiveEffect = true;
  }

  if (referencesLocalName(stripped, imports.reactiveDomLocalNames.get("bindDomRef"))) {
    used.domRefs = true;
  }

  if (eventAttributePattern.test(stripped)) {
    used.eventBindings = true;
  }

  if (
    requestMemberPattern.test(stripped) ||
    requestReadPattern.test(stripped) ||
    requestDestructurePattern.test(stripped)
  ) {
    used.requestLocation = true;
  }
}

/**
 * True when the imported binding is mentioned anywhere outside its own import statement.
 *
 * Any mention counts, not just a call: a fact is only ever used to switch a capability off, so
 * matching a call shape would have to model type arguments, re-exports and indirection correctly or
 * risk turning a capability off for a module that really uses it.
 */
function referencesLocalName(strippedWithoutImports: string, localName: string | undefined): boolean {
  return (
    localName !== undefined &&
    new RegExp(`(?:^|[^.\\w$])${escapeRegExp(localName)}(?![\\w$])`, "u").test(
      strippedWithoutImports,
    )
  );
}

/**
 * Blanks import and re-export statements so an imported name is not mistaken for a use of it.
 *
 * The statements are located in the view that still has string literals, because the pattern needs
 * the quoted specifier, and blanked out of the view the capability scan reads. Both views come from
 * the same pass over the same source, so their offsets line up.
 */
function blankStaticImports(withoutComments: string, withoutLiterals: string): string {
  const characters = [...withoutLiterals];

  for (const match of withoutComments.matchAll(importStatementPattern)) {
    if (match.index === undefined) {
      continue;
    }

    for (let offset = match.index; offset < match.index + match[0].length; offset += 1) {
      characters[offset] = " ";
    }
  }

  return characters.join("");
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

const useClientDirectivePattern = /^\s*(?:["']use client["']\s*;?)/u;

function hasUseClientDirective(withoutComments: string): boolean {
  return useClientDirectivePattern.test(withoutComments);
}

function isStyleSpecifier(specifier: string): boolean {
  const withoutQuery = specifier.split("?")[0] ?? specifier;

  return styleExtensions.some((extension) => withoutQuery.endsWith(extension));
}

const importStatementPattern =
  /\bimport\s+(?<clause>[^;'"]*?)\s*from\s*["'](?<source>[^"']+)["']|\bimport\s*["'](?<sideEffect>[^"']+)["']|\bexport\s+(?:[^;'"]*?)\s*from\s*["'](?<reexport>[^"']+)["']/gu;

/** Reads static import sources and the local names bound to the runtime helpers we understand. */
function parseStaticImports(stripped: string): ModuleImports {
  const sources: string[] = [];
  const reactiveCoreLocalNames = new Map<string, string>();
  const reactiveDomLocalNames = new Map<string, string>();

  for (const match of stripped.matchAll(importStatementPattern)) {
    const source =
      match.groups?.source ?? match.groups?.sideEffect ?? match.groups?.reexport ?? undefined;

    if (source === undefined) {
      continue;
    }

    sources.push(source);
    const clause = match.groups?.clause;

    if (clause === undefined) {
      continue;
    }

    const target = source.startsWith("@reckona/mreact-reactive-core")
      ? reactiveCoreLocalNames
      : source.startsWith("@reckona/mreact-reactive-dom")
        ? reactiveDomLocalNames
        : undefined;

    if (target === undefined) {
      continue;
    }

    for (const [imported, local] of parseNamedImportBindings(clause)) {
      target.set(imported, local);
    }
  }

  return { reactiveCoreLocalNames, reactiveDomLocalNames, sources };
}

function parseNamedImportBindings(clause: string): Array<[string, string]> {
  const braceStart = clause.indexOf("{");
  const braceEnd = clause.lastIndexOf("}");

  if (braceStart < 0 || braceEnd <= braceStart) {
    return [];
  }

  const bindings: Array<[string, string]> = [];

  for (const entry of clause.slice(braceStart + 1, braceEnd).split(",")) {
    const parts = entry.trim().split(/\s+as\s+/u);
    const imported = parts[0]?.trim();
    const local = (parts[1] ?? parts[0])?.trim();

    if (imported === undefined || imported === "" || local === undefined || local === "") {
      continue;
    }

    bindings.push([imported.replace(/^type\s+/u, ""), local]);
  }

  return bindings;
}

export interface ScannedModuleSource {
  /** Comments blanked out, string literals preserved, so import specifiers stay readable. */
  withoutComments: string;
  /** Comments and string literals blanked out, so prose and data cannot look like a capability. */
  withoutLiterals: string;
}

/**
 * Blanks comments, regular expressions and string literals in a single pass.
 *
 * Returns undefined when the source ends inside an unterminated literal, which the caller treats as
 * an unresolved graph rather than as evidence either way.
 */
export function scanModuleSource(code: string): ScannedModuleSource | undefined {
  const withoutComments: string[] = [];
  const withoutLiterals: string[] = [];
  let index = 0;
  let previousMeaningful = "";

  const blank = (length: number, keepInComments: boolean, start: number): void => {
    const spaces = " ".repeat(length);
    withoutComments.push(keepInComments ? code.slice(start, start + length) : spaces);
    withoutLiterals.push(spaces);
  };

  while (index < code.length) {
    const character = code[index] ?? "";
    const next = code[index + 1] ?? "";

    if (character === "/" && next === "/") {
      const end = code.indexOf("\n", index);
      const stop = end === -1 ? code.length : end;
      blank(stop - index, false, index);
      index = stop;
      continue;
    }

    if (character === "/" && next === "*") {
      const end = code.indexOf("*/", index + 2);
      if (end === -1) {
        return undefined;
      }
      blank(end + 2 - index, false, index);
      index = end + 2;
      continue;
    }

    if (character === "/" && canStartRegularExpression(previousMeaningful)) {
      const end = scanRegularExpression(code, index);
      if (end === undefined) {
        return undefined;
      }
      blank(end - index, false, index);
      index = end;
      previousMeaningful = "/";
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      const end = scanStringLiteral(code, index, character);
      if (end === undefined) {
        return undefined;
      }
      blank(end - index, true, index);
      index = end;
      previousMeaningful = "'";
      continue;
    }

    withoutComments.push(character);
    withoutLiterals.push(character);
    if (character.trim() !== "") {
      previousMeaningful = character;
    }
    index += 1;
  }

  return { withoutComments: withoutComments.join(""), withoutLiterals: withoutLiterals.join("") };
}

// `<` and `>` are deliberately absent: in JSX they precede `/` far more often than a regular
// expression does, and misreading `</div>` as a regular expression swallows the rest of the file.
// A regular expression that is read as division instead is harmless unless it contains a quote, and
// that case ends as an unterminated literal, which the caller already treats as an unresolved graph.
function canStartRegularExpression(previousMeaningful: string): boolean {
  return previousMeaningful === "" || "([{,;:=!&|?+-*%~^".includes(previousMeaningful);
}

function scanRegularExpression(code: string, start: number): number | undefined {
  let index = start + 1;
  let inClass = false;

  while (index < code.length) {
    const character = code[index];

    if (character === "\\") {
      index += 2;
      continue;
    }

    if (character === "\n") {
      return undefined;
    }

    if (character === "[") {
      inClass = true;
    } else if (character === "]") {
      inClass = false;
    } else if (character === "/" && !inClass) {
      index += 1;
      while (index < code.length && /[a-z]/u.test(code[index] ?? "")) {
        index += 1;
      }
      return index;
    }

    index += 1;
  }

  return undefined;
}

function scanStringLiteral(code: string, start: number, quote: string): number | undefined {
  let index = start + 1;
  let depth = 0;

  while (index < code.length) {
    const character = code[index];

    if (character === "\\") {
      index += 2;
      continue;
    }

    if (quote === "`" && character === "$" && code[index + 1] === "{") {
      depth += 1;
      index += 2;
      continue;
    }

    if (quote === "`" && depth > 0 && character === "}") {
      depth -= 1;
      index += 1;
      continue;
    }

    if (character === quote && depth === 0) {
      return index + 1;
    }

    if (quote !== "`" && character === "\n") {
      return undefined;
    }

    index += 1;
  }

  return undefined;
}
