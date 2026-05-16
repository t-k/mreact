// /forms/zod — schema validation via Zod v4's Standard Schema support.
//
// Zod v4 schemas expose the Standard Schema interface. Passing the schema to
// `createForm` keeps the form state in input types and gives `submit()` the
// parsed output type after validation and transforms.
import { cell } from "@reckona/mreact-reactive-core";
import { createForm } from "@reckona/mreact-forms";
import * as z from "zod/v4";

const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  role: z.enum(["viewer", "editor", "admin"], "Choose a role."),
  seats: z
    .string()
    .trim()
    .refine((value) => value.length > 0, "Seats is required.")
    .transform((value) => Number(value))
    .pipe(
      z
        .number("Seats must be a number.")
        .int("Seats must be a whole number.")
        .min(1, "Choose at least one seat.")
        .max(100, "Choose at most 100 seats."),
    ),
  sendWelcomeEmail: z.boolean(),
});

type InviteValues = z.input<typeof inviteSchema>;
type InviteSubmitValues = z.output<typeof inviteSchema>;

const inviteForm = createForm<InviteValues, InviteSubmitValues>({
  initialValues: {
    email: "",
    role: "viewer",
    seats: "1",
    sendWelcomeEmail: false,
  },
  schema: inviteSchema,
  validateOn: ["blur", "submit"],
});
const inviteFormState = inviteForm.state;

const lastSubmitted = cell<InviteSubmitValues | null>(null);

async function onSubmit(): Promise<void> {
  const result = await inviteForm.submit((values) => {
    lastSubmitted.set(values);
    return values;
  });

  if (result.status === "success") {
    inviteForm.reset();
  }
}

function firstError(errors: readonly string[] | undefined): string {
  return errors?.[0] ?? "";
}

function submittedText(values: InviteSubmitValues | null): string {
  return values === null
    ? ""
    : `Invited ${values.email} as ${values.role} with ${values.seats} seats. Welcome email: ${
        values.sendWelcomeEmail ? "yes" : "no"
      }.`;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function syncInviteTarget(target: EventTarget | null): void {
  if (target instanceof HTMLInputElement) {
    if (target.name === "email") void inviteForm.setValue("email", target.value);
    if (target.name === "seats") void inviteForm.setValue("seats", target.value);
    if (target.name === "sendWelcomeEmail") {
      void inviteForm.setValue("sendWelcomeEmail", target.checked);
    }
  }
  if (target instanceof HTMLSelectElement && target.name === "role") {
    void inviteForm.setValue("role", target.value as InviteValues["role"]);
  }
}

export default function Page() {
  return (
    <main>
      <h1>Zod v4 form</h1>
      <p>
        This route passes a <code>zod/v4</code> schema directly to{" "}
        <code>createForm</code>. The form keeps <code>seats</code> as a string,
        but the submit handler receives a number after the Zod transform and
        number checks run.
      </p>

      <p class="counter-tone-hot">{firstError(inviteFormState.get().errors.root)}</p>

      <p class="muted">{submittedText(lastSubmitted.get())}</p>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
        onInput={(event) => syncInviteTarget(event.target)}
        onChange={(event) => syncInviteTarget(event.target)}
      >
        <p>
          <label>
            Email<br />
            <input
              class="action-input"
              name="email"
              type="email"
              value={inviteFormState.get().values.email}
              onInput={(event) =>
                void inviteForm.setValue("email", (event.target as HTMLInputElement).value)}
              onBlur={(event) => {
                void inviteForm.setValue("email", (event.target as HTMLInputElement).value);
                void inviteForm.field("email").blur();
              }}
            />
          </label>
          <span class="counter-tone-hot"> {firstError(inviteFormState.get().errors.email)}</span>
        </p>

        <p>
          <label>
            Role<br />
            <select
              class="action-input"
              name="role"
              value={inviteFormState.get().values.role}
              onInput={(event) =>
                void inviteForm.setValue(
                  "role",
                  (event.target as HTMLSelectElement).value as InviteValues["role"],
                )}
              onBlur={(event) => {
                void inviteForm.setValue(
                  "role",
                  (event.target as HTMLSelectElement).value as InviteValues["role"],
                );
                void inviteForm.field("role").blur();
              }}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <span class="counter-tone-hot"> {firstError(inviteFormState.get().errors.role)}</span>
        </p>

        <p>
          <label>
            Seats<br />
            <input
              class="action-input"
              inputMode="numeric"
              name="seats"
              type="text"
              value={inviteFormState.get().values.seats}
              onInput={(event) =>
                void inviteForm.setValue("seats", (event.target as HTMLInputElement).value)}
              onBlur={(event) => {
                void inviteForm.setValue("seats", (event.target as HTMLInputElement).value);
                void inviteForm.field("seats").blur();
              }}
            />
          </label>
          <span class="counter-tone-hot"> {firstError(inviteFormState.get().errors.seats)}</span>
        </p>

        <p>
          <label>
            <input
              checked={inviteFormState.get().values.sendWelcomeEmail}
              name="sendWelcomeEmail"
              type="checkbox"
              onInput={(event) =>
                void inviteForm.setValue(
                  "sendWelcomeEmail",
                  (event.target as HTMLInputElement).checked,
                )}
              onClick={(event) =>
                void inviteForm.setValue(
                  "sendWelcomeEmail",
                  (event.target as HTMLInputElement).checked,
                )}
              onBlur={(event) => {
                void inviteForm.setValue(
                  "sendWelcomeEmail",
                  (event.target as HTMLInputElement).checked,
                );
                void inviteForm.field("sendWelcomeEmail").blur();
              }}
            />{" "}
            Send welcome email
          </label>
          <span class="counter-tone-hot">
            {" "}
            {firstError(inviteFormState.get().errors.sendWelcomeEmail)}
          </span>
        </p>

        <p>
          <button type="button" disabled={inviteFormState.get().submitting} onClick={() => void onSubmit()}>
            Invite
          </button>{" "}
          <span class="muted">
            valid: <code>{yesNo(inviteFormState.get().valid)}</code>, dirty:{" "}
            <code>{yesNo(inviteFormState.get().dirty)}</code>, submit count:{" "}
            <code>{inviteFormState.get().submitCount}</code>
          </span>
        </p>
      </form>
    </main>
  );
}
