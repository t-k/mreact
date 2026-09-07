/**
 * Shared by the Vite dev server and production client bundler.
 *
 * Client bundles can never attach an inspector: `currentReactiveDevtools()` is hard-coded to
 * `undefined` here, so no caller can observe a resource handle. One frozen handle is therefore
 * enough for every reactive resource. Each `computed`, `effect` and cleanup scope retains its
 * handle for its whole lifetime, so a per-call handle keeps an object and two closures alive per
 * resource; the enabled inspector path in `packages/reactive-core/src/devtools.ts` still returns an
 * independent handle from the registry and is unaffected.
 */
export const reactiveDevtoolsStubSource = `const disabledResourceHandle = Object.freeze({ dispose() {}, update() {} });
export function emitReactiveDevtoolsEvent() {}
export function emitReactiveEffectRunDevtoolsEvent() {}
export function hasReactiveDevtoolsEmitter() { return false; }
export function currentDevtoolsEmitter() { return undefined; }
export function currentReactiveDevtools() { return undefined; }
export function registerReactiveDevtoolsResource() { return disabledResourceHandle; }
export function invalidateReactiveDevtoolsCache() {}
export function prepareReactiveEffectRunDevtoolsEvent() { return undefined; }`;
