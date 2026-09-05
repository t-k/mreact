/** Shared by the Vite dev server and production client bundler. */
export const reactiveDevtoolsStubSource = `export function emitReactiveDevtoolsEvent() {}
export function emitReactiveEffectRunDevtoolsEvent() {}
export function hasReactiveDevtoolsEmitter() { return false; }
export function currentDevtoolsEmitter() { return undefined; }
export function currentReactiveDevtools() { return undefined; }
export function registerReactiveDevtoolsResource() { return { dispose() {}, update() {} }; }
export function invalidateReactiveDevtoolsCache() {}
export function prepareReactiveEffectRunDevtoolsEvent() { return undefined; }`;
