// SignupForm.compat.tsx — conform + Zod form as a React-compat island.
//
// conform manages form state, accessibility wiring, and validation. The router
// aliases `react` to @reckona/mreact-compat, so conform's hooks (useForm and its
// external-store subscription) run unmodified. This `.compat.tsx` file is a
// client boundary: the form hydrates on the client and validates with Zod.
import { useState } from "react";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod";
import { z } from "zod";

const schema = z.object({
  email: z.string({ required_error: "Email is required." }).email("Enter a valid email."),
  password: z
    .string({ required_error: "Password is required." })
    .min(8, "At least 8 characters."),
});

export default function SignupForm() {
  const [result, setResult] = useState<string | null>(null);

  const [form, fields] = useForm({
    id: "signup",
    constraint: getZodConstraint(schema),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate({ formData }) {
      return parseWithZod(formData, { schema });
    },
    onSubmit(event) {
      event.preventDefault();
      const submission = parseWithZod(new FormData(event.currentTarget as HTMLFormElement), {
        schema,
      });
      if (submission.status === "success") {
        setResult(`Signed up as ${submission.value.email}`);
      }
    },
  });

  return (
    <form {...getFormProps(form)}>
      <div className="form-group">
        <label htmlFor={fields.email.id}>Email</label>
        <input {...getInputProps(fields.email, { type: "email" })} />
        <div
          id={fields.email.errorId}
          data-testid="email-error"
          style={{ color: "#dc2626", fontSize: "0.85rem", minHeight: "1.2em" }}
        >
          {fields.email.errors}
        </div>
      </div>
      <div className="form-group">
        <label htmlFor={fields.password.id}>Password</label>
        <input {...getInputProps(fields.password, { type: "password" })} />
        <div
          id={fields.password.errorId}
          data-testid="password-error"
          style={{ color: "#dc2626", fontSize: "0.85rem", minHeight: "1.2em" }}
        >
          {fields.password.errors}
        </div>
      </div>
      <button type="submit" className="btn">
        Sign up
      </button>
      {result && (
        <p data-testid="form-result" style={{ color: "#16a34a", marginTop: "0.75rem" }}>
          {result}
        </p>
      )}
    </form>
  );
}
