// /forms/valibot — schema validation via Valibot's Standard Schema support.
//
// `createForm` accepts any Standard Schema compatible validator. Valibot
// schemas expose that interface directly, so no mreact-specific adapter is
// needed. The form values keep browser input shapes, while `form.submit()`
// receives the transformed output shape after schema validation succeeds.
import { cell } from "@reckona/mreact-reactive-core";
import { createForm } from "@reckona/mreact-forms";
import * as v from "valibot";

const signupSchema = v.object({
  name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(2, "Name must be at least 2 characters."),
    v.maxLength(80, "Name must be at most 80 characters."),
  ),
  email: v.pipe(v.string(), v.trim(), v.email("Enter a valid email.")),
  plan: v.picklist(["starter", "pro"], "Choose a plan."),
  seats: v.pipe(
    v.string(),
    v.trim(),
    v.toNumber("Seats must be a number."),
    v.integer("Seats must be a whole number."),
    v.minValue(1, "Choose at least one seat."),
    v.maxValue(50, "Choose at most 50 seats."),
  ),
  acceptTerms: v.literal(true, "Accept the terms to continue."),
});

type SignupValues = v.InferInput<typeof signupSchema>;
type SignupSubmitValues = v.InferOutput<typeof signupSchema>;

const form = createForm<SignupValues, SignupSubmitValues>({
  initialValues: {
    acceptTerms: false,
    email: "",
    name: "",
    plan: "starter",
    seats: "1",
  },
  schema: signupSchema,
  validateOn: ["blur", "submit"],
});

const lastSubmitted = cell<SignupSubmitValues | null>(null);

async function onSubmit(): Promise<void> {
  const result = await form.submit((values) => {
    lastSubmitted.set(values);
    return values;
  });

  if (result.status === "success") {
    form.reset();
  }
}

export default function Page() {
  const state = form.state.get();
  const submitted = lastSubmitted.get();

  return (
    <main>
      <h1>Valibot form</h1>
      <p>
        This route uses <code>valibot</code> as a Standard Schema validator for{" "}
        <code>createForm</code>. Input values stay form-friendly strings and
        booleans, then <code>submit()</code> receives the parsed output:{" "}
        <code>seats</code> is a number after validation.
      </p>

      {state.errors.root?.map((error) => (
        <p class="counter-tone-hot">{error}</p>
      ))}

      {submitted !== null && (
        <p class="muted">
          Submitted <strong>{submitted.name}</strong> for the{" "}
          <strong>{submitted.plan}</strong> plan with{" "}
          <code>{submitted.seats}</code> seats.
        </p>
      )}

      <p>
        <label>
          Name<br />
          <input
            class="action-input"
            type="text"
            value={state.values.name}
            onInput={(event) =>
              void form.setValue("name", (event.target as HTMLInputElement).value)}
            onBlur={() => void form.field("name").blur()}
          />
        </label>
        {state.errors.name?.map((error) => (
          <span class="counter-tone-hot"> {error}</span>
        ))}
      </p>

      <p>
        <label>
          Email<br />
          <input
            class="action-input"
            type="email"
            value={state.values.email}
            onInput={(event) =>
              void form.setValue("email", (event.target as HTMLInputElement).value)}
            onBlur={() => void form.field("email").blur()}
          />
        </label>
        {state.errors.email?.map((error) => (
          <span class="counter-tone-hot"> {error}</span>
        ))}
      </p>

      <p>
        <label>
          Plan<br />
          <select
            class="action-input"
            value={state.values.plan}
            onInput={(event) =>
              void form.setValue(
                "plan",
                (event.target as HTMLSelectElement).value as SignupValues["plan"],
              )}
            onBlur={() => void form.field("plan").blur()}
          >
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
          </select>
        </label>
        {state.errors.plan?.map((error) => (
          <span class="counter-tone-hot"> {error}</span>
        ))}
      </p>

      <p>
        <label>
          Seats<br />
          <input
            class="action-input"
            inputMode="numeric"
            type="text"
            value={state.values.seats}
            onInput={(event) =>
              void form.setValue("seats", (event.target as HTMLInputElement).value)}
            onBlur={() => void form.field("seats").blur()}
          />
        </label>
        {state.errors.seats?.map((error) => (
          <span class="counter-tone-hot"> {error}</span>
        ))}
      </p>

      <p>
        <label>
          <input
            checked={state.values.acceptTerms}
            type="checkbox"
            onInput={(event) =>
              void form.setValue(
                "acceptTerms",
                (event.target as HTMLInputElement).checked,
              )}
            onBlur={() => void form.field("acceptTerms").blur()}
          />{" "}
          Accept terms
        </label>
        {state.errors.acceptTerms?.map((error) => (
          <span class="counter-tone-hot"> {error}</span>
        ))}
      </p>

      <p>
        <button type="button" onClick={() => void onSubmit()} disabled={state.submitting}>
          {state.submitting ? "Submitting..." : "Submit"}
        </button>{" "}
        <span class="muted">
          valid: <code>{state.valid ? "yes" : "no"}</code>, dirty:{" "}
          <code>{state.dirty ? "yes" : "no"}</code>, submit count:{" "}
          <code>{state.submitCount}</code>
        </span>
      </p>
    </main>
  );
}
