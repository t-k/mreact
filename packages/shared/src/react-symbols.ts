/** Runtime marker shared by React-compatible context providers. */
export const REACT_COMPAT_PROVIDER_TYPE = Symbol.for("react.context");

/** Runtime marker shared by React-compatible context consumers. */
export const REACT_COMPAT_CONSUMER_TYPE = Symbol.for("react.consumer");

/** Runtime marker shared by Flight client references. */
export const REACT_CLIENT_REFERENCE_TYPE = Symbol.for("modular.react.client_reference");
