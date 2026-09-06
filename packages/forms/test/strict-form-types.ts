import { createForm, type FieldBindingOptions } from "../src/index.js";

const form = createForm({ initialValues: { title: "Mreact" } });

form.field("title").bind();
form.field("title").bind({ format: (value) => value.length });

// @ts-expect-error A different binding output type requires a formatter.
form.field("title").bind<number>();

// @ts-expect-error A different binding output type requires a formatter.
form.field("title").bind<number>({ event: "change" });

// @ts-expect-error An explicitly undefined formatter cannot widen the output type.
form.field("title").bind<number>({ format: undefined });

const optionalFormatOptions: FieldBindingOptions<string, number> = { event: "input" };

// @ts-expect-error An options object without a formatter cannot widen the output type.
form.field("title").bind(optionalFormatOptions);
