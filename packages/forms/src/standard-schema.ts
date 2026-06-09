/** Represents the Standard Schema v1 wrapper shape used by compatible validation libraries. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

/** Contains the Standard Schema v1 protocol helper types. */
export namespace StandardSchemaV1 {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
      options?: Options | undefined,
    ) => Result<Output> | Promise<Result<Output>>;
    readonly types?: Types<Input, Output> | undefined;
  }

  export interface Options {
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }

  export type Result<Output> = SuccessResult<Output> | FailureResult;

  export interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }

  export interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }

  export interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }

  export interface PathSegment {
    readonly key: PropertyKey;
  }

  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }
}

/** Infers the input value type accepted by a Standard Schema. */
export type InferStandardSchemaInput<Schema> = Schema extends {
  readonly "~standard": { readonly types?: (infer Types) | undefined };
}
  ? NonNullable<Types> extends { readonly input: infer Input }
    ? Input
    : never
  : never;

/** Infers the output value type produced by a Standard Schema. */
export type InferStandardSchemaOutput<Schema> = Schema extends {
  readonly "~standard": { readonly types?: (infer Types) | undefined };
}
  ? NonNullable<Types> extends { readonly output: infer Output }
    ? Output
    : never
  : never;

/** Represents the normalized result returned after Standard Schema validation. */
export type StandardSchemaValidationResult<Output> =
  | {
      success: true;
      value: Output;
    }
  | {
      issues: ReadonlyArray<StandardSchemaV1.Issue>;
      success: false;
    };

/** Validates an unknown value with a Standard Schema and normalizes success and issue results. */
export async function validateStandardSchema<Schema extends StandardSchemaV1>(
  schema: Schema,
  value: unknown,
): Promise<StandardSchemaValidationResult<InferStandardSchemaOutput<Schema>>> {
  const result = await schema["~standard"].validate(value);

  return result.issues === undefined
    ? {
        success: true,
        value: result.value as InferStandardSchemaOutput<Schema>,
      }
    : {
        issues: result.issues,
        success: false,
      };
}
