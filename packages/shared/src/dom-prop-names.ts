/** Returns true for React-style event handler props such as onClick. */
export function isReactEventHandlerPropName(name: string): boolean {
  const third = name.charCodeAt(2);
  return name.charCodeAt(0) === 111 && name.charCodeAt(1) === 110 && third >= 65 && third <= 90;
}

/** Returns true for any event-like prop name with an on prefix, including lowercase DOM handlers. */
export function isEventLikePropName(name: string): boolean {
  return (
    name.length > 1 &&
    (name.charCodeAt(0) | 32) === 111 &&
    (name.charCodeAt(1) | 32) === 110
  );
}
