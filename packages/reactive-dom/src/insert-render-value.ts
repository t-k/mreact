import { insertDynamic } from "./insert-dynamic.js";
import type { Dispose, RenderValue } from "./types.js";

/** Inserts a value that may alternate between text and DOM nodes while reusing its text marker. */
export function insertRenderValue(
  parent: ParentNode,
  marker: Text,
  value: () => RenderValue,
  options?: { debugLabel?: string },
): Dispose {
  const dispose = insertDynamic(
    parent,
    marker,
    () => {
      let nextValue: RenderValue;
      try {
        nextValue = value();
      } catch (error) {
        marker.data = "";
        throw error;
      }

      if (
        nextValue == null ||
        typeof nextValue === "boolean" ||
        typeof nextValue === "string" ||
        typeof nextValue === "number" ||
        typeof nextValue === "bigint"
      ) {
        marker.data =
          nextValue == null || typeof nextValue === "boolean" ? "" : String(nextValue);
        return null;
      }

      marker.data = "";
      return nextValue;
    },
    options,
  );

  return () => {
    try {
      dispose();
    } finally {
      marker.data = "";
    }
  };
}
