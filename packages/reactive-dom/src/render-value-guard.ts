/**
 * Reports whether a value carries a DOM node, directly or inside a plain
 * object or array. Such a value is never a valid attribute or property value,
 * so every prop binding removes the prop instead of stringifying the node.
 */
export function isDomRenderValue(value: unknown): boolean {
  const pending = [value];
  const seen = new Set<unknown>();

  while (pending.length > 0) {
    const current = pending.pop();

    if (current instanceof Node) {
      return true;
    }

    if ((typeof current !== "object" && typeof current !== "function") || current === null) {
      continue;
    }

    if (seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      try {
        for (let index = 0; index < current.length; index += 1) {
          pending.push(current[index]);
        }
      } catch {
        return true;
      }
      continue;
    }

    let descriptors: Record<string, PropertyDescriptor>;
    try {
      descriptors = Object.getOwnPropertyDescriptors(current);
    } catch {
      return true;
    }

    for (const descriptor of Object.values(descriptors)) {
      if ("value" in descriptor) {
        pending.push(descriptor.value);
      }
    }
  }

  return false;
}
