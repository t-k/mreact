// /forms — reactive form state via @reckona/mreact-forms.
//
// `createForm` produces a reactive FormApi. Each field is read through
// `contactForm.field(name).state.get()`, which is a ReadonlyCell, so the
// compiler binds the JSX text and the input value to the cell.
//
// Submit flow:
//   1. Per-field client validators reject bad input before any network call.
//   2. On valid client input the submit handler POSTs to /api/contact.
//   3. The server validates again (different rules!) and returns
//      `{ fieldErrors: ... }` on failure. `setServerErrors` maps that
//      back into the reactive errors so the UI updates.
//   4. On success the form resets and a success banner cell flips on.
import { cell } from "@reckona/mreact-reactive-core";
import { createForm } from "@reckona/mreact-forms";

interface ContactValues {
  name: string;
  email: string;
  message: string;
}

interface SuccessRecord {
  name: string;
  email: string;
  message: string;
  receivedAt: string;
}

const contactForm = createForm<ContactValues>({
  initialValues: { name: "", email: "", message: "" },
  validate: {
    name: (value) =>
      value.trim().length < 2 ? "Name must be at least 2 characters." : undefined,
    email: (value) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? undefined : "Enter a valid email.",
    message: (value) => {
      if (value.trim().length < 10) return "Message must be at least 10 characters.";
      if (value.length > 500) return "Message must be at most 500 characters.";
      return undefined;
    },
  },
  validateOn: ["blur", "submit"],
});
const contactFormState = contactForm.state;

const lastSaved = cell<SuccessRecord | null>(null);

async function postContact(values: ContactValues): Promise<{
  ok: boolean;
  data?: SuccessRecord;
  fieldErrors?: Partial<Record<keyof ContactValues, readonly string[]>>;
}> {
  const response = await fetch("/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(values),
  });
  return response.json();
}

async function onSubmit(): Promise<void> {
  const result = await contactForm.submit(async (values) => {
    const response = await postContact(values);
    if (response.ok && response.data) return response.data;
    contactForm.setServerErrors({ fieldErrors: response.fieldErrors });
    throw new Error("server validation failed");
  });
  if (result.status === "success") {
    lastSaved.set(result.data);
    contactForm.reset();
  }
}

function firstError(errors: readonly string[] | undefined): string {
  return errors?.[0] ?? "";
}

function savedText(record: SuccessRecord | null): string {
  return record === null ? "" : `Saved ${record.name} <${record.email}> at ${record.receivedAt}.`;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function syncContactTarget(target: EventTarget | null): void {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    if (target.name === "name") void contactForm.setValue("name", target.value);
    if (target.name === "email") void contactForm.setValue("email", target.value);
    if (target.name === "message") void contactForm.setValue("message", target.value);
  }
}

export default function Page() {
  return (
    <main>
      <h1>Forms</h1>
      <p>
        <code>createForm</code> from <code>@reckona/mreact-forms</code>{" "}
        returns a reactive form state. Per-field validators run on
        blur and on submit. The submit handler POSTs to{" "}
        <code>/api/contact</code> — the server applies its own
        validation, and any <code>fieldErrors</code> it returns are
        mapped back into the form via <code>setServerErrors</code>.
        Try the input <code>spam</code> in the message to trigger a
        server-only rejection.
      </p>

      <p class="muted">{savedText(lastSaved.get())}</p>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
        onInput={(event) => syncContactTarget(event.target)}
        onChange={(event) => syncContactTarget(event.target)}
      >
        <p>
          <label>
            Name<br />
            <input
              class="action-input"
              name="name"
              type="text"
              value={contactFormState.get().values.name}
              onInput={(event) =>
                contactForm.field("name").setValue((event.target as HTMLInputElement).value)
              }
              onBlur={(event) => {
                void contactForm.field("name").setValue((event.target as HTMLInputElement).value);
                void contactForm.field("name").blur();
              }}
            />
          </label>
          <span class="counter-tone-hot"> {firstError(contactFormState.get().errors.name)}</span>
        </p>
        <p>
          <label>
            Email<br />
            <input
              class="action-input"
              name="email"
              type="email"
              value={contactFormState.get().values.email}
              onInput={(event) =>
                contactForm.field("email").setValue((event.target as HTMLInputElement).value)
              }
              onBlur={(event) => {
                void contactForm.field("email").setValue((event.target as HTMLInputElement).value);
                void contactForm.field("email").blur();
              }}
            />
          </label>
          <span class="counter-tone-hot"> {firstError(contactFormState.get().errors.email)}</span>
        </p>
        <p>
          <label>
            Message<br />
            <textarea
              class="action-input"
              cols={50}
              name="message"
              rows={4}
              value={contactFormState.get().values.message}
              onInput={(event) =>
                contactForm.field("message").setValue((event.target as HTMLTextAreaElement).value)
              }
              onBlur={(event) => {
                void contactForm.field("message").setValue(
                  (event.target as HTMLTextAreaElement).value,
                );
                void contactForm.field("message").blur();
              }}
            />
          </label>
          <span class="counter-tone-hot"> {firstError(contactFormState.get().errors.message)}</span>
        </p>

        <p>
          <button type="button" disabled={contactFormState.get().submitting} onClick={() => void onSubmit()}>
            Send
          </button>{" "}
          <span class="muted">
            submit count: <code>{contactFormState.get().submitCount}</code>, valid:{" "}
            <code>{yesNo(contactFormState.get().valid)}</code>, dirty:{" "}
            <code>{yesNo(contactFormState.get().dirty)}</code>
          </span>
        </p>
      </form>
    </main>
  );
}
