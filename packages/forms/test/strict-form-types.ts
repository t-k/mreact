import { createForm } from "../src/index.js";

const form = createForm({ initialValues: { title: "Mreact" } });

form.field("title").bind();
form.field("title").bind({ format: (value) => value.length });

// @ts-expect-error A different binding output type requires a formatter.
form.field("title").bind<number>();

// @ts-expect-error A different binding output type requires a formatter.
form.field("title").bind<number>({ event: "change" });
