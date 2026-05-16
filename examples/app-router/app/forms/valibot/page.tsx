// /forms/valibot — schema validation via Valibot's Standard Schema support.
//
// `createForm` accepts any Standard Schema compatible validator. Valibot
// schemas expose that interface directly, so no mreact-specific adapter is
// needed. The form values keep browser input shapes, while `signupForm.submit()`
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

const signupForm = createForm<SignupValues, SignupSubmitValues>({
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
const signupFormState = signupForm.state;

const lastSubmitted = cell<SignupSubmitValues | null>(null);

async function onSubmit(): Promise<void> {
  const result = await signupForm.submit((values) => {
    lastSubmitted.set(values);
    return values;
  });

  if (result.status === "success") {
    signupForm.reset();
  }
}

function firstError(errors: readonly string[] | undefined): string {
  return errors?.[0] ?? "";
}

function submittedText(values: SignupSubmitValues | null): string {
  return values === null
    ? ""
    : `Submitted ${values.name} for the ${values.plan} plan with ${values.seats} seats.`;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function syncSignupTarget(target: EventTarget | null): void {
  if (target instanceof HTMLInputElement) {
    if (target.name === "name") void signupForm.setValue("name", target.value);
    if (target.name === "email") void signupForm.setValue("email", target.value);
    if (target.name === "seats") void signupForm.setValue("seats", target.value);
    if (target.name === "acceptTerms") void signupForm.setValue("acceptTerms", target.checked);
  }
  if (target instanceof HTMLSelectElement && target.name === "plan") {
    void signupForm.setValue("plan", target.value as SignupValues["plan"]);
  }
}

export default function Page() {
  return (
    <main>
      <h1>Valibot form</h1>
      <p>
        This route uses <code>valibot</code> as a Standard Schema validator for{" "}
        <code>createForm</code>. Input values stay form-friendly strings and
        booleans, then <code>submit()</code> receives the parsed output:{" "}
        <code>seats</code> is a number after validation.
      </p>

      <p class="counter-tone-hot">{firstError(signupFormState.get().errors.root)}</p>

      <p class="muted">{submittedText(lastSubmitted.get())}</p>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
        onInput={(event) => syncSignupTarget(event.target)}
        onChange={(event) => syncSignupTarget(event.target)}
      >
        <p>
          <label>
            Name<br />
            <input
              class="action-input"
              name="name"
              type="text"
              value={signupFormState.get().values.name}
              onInput={(event) =>
                void signupForm.setValue("name", (event.target as HTMLInputElement).value)}
              onBlur={(event) => {
                void signupForm.setValue("name", (event.target as HTMLInputElement).value);
                void signupForm.field("name").blur();
              }}
            />
          </label>
          <span class="counter-tone-hot"> {firstError(signupFormState.get().errors.name)}</span>
        </p>

        <p>
          <label>
            Email<br />
            <input
              class="action-input"
              name="email"
              type="email"
              value={signupFormState.get().values.email}
              onInput={(event) =>
                void signupForm.setValue("email", (event.target as HTMLInputElement).value)}
              onBlur={(event) => {
                void signupForm.setValue("email", (event.target as HTMLInputElement).value);
                void signupForm.field("email").blur();
              }}
            />
          </label>
          <span class="counter-tone-hot"> {firstError(signupFormState.get().errors.email)}</span>
        </p>

        <p>
          <label>
            Plan<br />
            <select
              class="action-input"
              name="plan"
              value={signupFormState.get().values.plan}
              onInput={(event) =>
                void signupForm.setValue(
                  "plan",
                  (event.target as HTMLSelectElement).value as SignupValues["plan"],
                )}
              onBlur={(event) => {
                void signupForm.setValue(
                  "plan",
                  (event.target as HTMLSelectElement).value as SignupValues["plan"],
                );
                void signupForm.field("plan").blur();
              }}
            >
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
            </select>
          </label>
          <span class="counter-tone-hot"> {firstError(signupFormState.get().errors.plan)}</span>
        </p>

        <p>
          <label>
            Seats<br />
            <input
              class="action-input"
              inputMode="numeric"
              name="seats"
              type="text"
              value={signupFormState.get().values.seats}
              onInput={(event) =>
                void signupForm.setValue("seats", (event.target as HTMLInputElement).value)}
              onBlur={(event) => {
                void signupForm.setValue("seats", (event.target as HTMLInputElement).value);
                void signupForm.field("seats").blur();
              }}
            />
          </label>
          <span class="counter-tone-hot"> {firstError(signupFormState.get().errors.seats)}</span>
        </p>

        <p>
          <label>
            <input
              checked={signupFormState.get().values.acceptTerms}
              name="acceptTerms"
              type="checkbox"
              onInput={(event) =>
                void signupForm.setValue(
                  "acceptTerms",
                  (event.target as HTMLInputElement).checked,
                )}
              onClick={(event) =>
                void signupForm.setValue(
                  "acceptTerms",
                  (event.target as HTMLInputElement).checked,
                )}
              onBlur={(event) => {
                void signupForm.setValue(
                  "acceptTerms",
                  (event.target as HTMLInputElement).checked,
                );
                void signupForm.field("acceptTerms").blur();
              }}
            />{" "}
            Accept terms
          </label>
          <span class="counter-tone-hot">
            {" "}
            {firstError(signupFormState.get().errors.acceptTerms)}
          </span>
        </p>

        <p>
          <button type="button" disabled={signupFormState.get().submitting} onClick={() => void onSubmit()}>
            Submit
          </button>{" "}
          <span class="muted">
            valid: <code>{yesNo(signupFormState.get().valid)}</code>, dirty:{" "}
            <code>{yesNo(signupFormState.get().dirty)}</code>, submit count:{" "}
            <code>{signupFormState.get().submitCount}</code>
          </span>
        </p>
      </form>
    </main>
  );
}
