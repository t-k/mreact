import { describe, expect, it } from "vitest";
import {
  type InferStandardSchemaInput,
  type InferStandardSchemaOutput,
  validateStandardSchema,
} from "../src/standard-schema.js";

describe("Standard Schema integration", () => {
  it("accepts Zod and Valibot compatible Standard Schema shapes without runtime adapters", async () => {
    const schema = {
      "~standard": {
        version: 1 as const,
        vendor: "schema-lib",
        validate(value: unknown) {
          return typeof value === "string"
            ? { value: value.trim() }
            : { issues: [{ message: "Expected string" }] };
        },
        types: undefined as unknown as {
          input: string;
          output: string;
        },
      },
    };

    const result = await validateStandardSchema(schema, " Ada ");

    expect(result).toEqual({ success: true, value: "Ada" });
  });

  it("exposes schema input and output inference helpers", () => {
    type Schema = {
      "~standard": {
        types: {
          input: { count: string };
          output: { count: number };
        };
      };
    };

    const input: InferStandardSchemaInput<Schema> = { count: "1" };
    const output: InferStandardSchemaOutput<Schema> = { count: 1 };

    expect(input).toEqual({ count: "1" });
    expect(output).toEqual({ count: 1 });
  });
});
