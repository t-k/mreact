// /forms — reactive form state via @reckona/mreact-forms.
//
// `createForm` produces a reactive FormApi. Each field is read through
// `form.field(name).state.get()`, which is a ReadonlyCell, so the
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

const form = createForm<ContactValues>({
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
  const result = await form.submit(async (values) => {
    const response = await postContact(values);
    if (response.ok && response.data) return response.data;
    form.setServerErrors({ fieldErrors: response.fieldErrors });
    throw new Error("server validation failed");
  });
  if (result.status === "success") {
    lastSaved.set(result.data);
    form.reset();
  }
}

export default function Page() {
  const state = form.state.get();
  const saved = lastSaved.get();

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

      {saved !== null && (
        <p class="muted">
          ✓ Saved <strong>{saved.name}</strong> &lt;{saved.email}&gt; at{" "}
          <code>{saved.receivedAt}</code>.
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
              form.field("name").setValue((event.target as HTMLInputElement).value)
            }
            onBlur={() => form.field("name").blur()}
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
              form.field("email").setValue((event.target as HTMLInputElement).value)
            }
            onBlur={() => form.field("email").blur()}
          />
        </label>
        {state.errors.email?.map((error) => (
          <span class="counter-tone-hot"> {error}</span>
        ))}
      </p>
      <p>
        <label>
          Message<br />
          <textarea
            class="action-input"
            rows={4}
            cols={50}
            value={state.values.message}
            onInput={(event) =>
              form.field("message").setValue((event.target as HTMLTextAreaElement).value)
            }
            onBlur={() => form.field("message").blur()}
          />
        </label>
        {state.errors.message?.map((error) => (
          <span class="counter-tone-hot"> {error}</span>
        ))}
      </p>

      <p>
        <button type="button" onClick={() => onSubmit()} disabled={state.submitting}>
          {state.submitting ? "Submitting…" : "Send"}
        </button>{" "}
        <span class="muted">
          submit count: <code>{state.submitCount}</code>, valid:{" "}
          <code>{state.valid ? "yes" : "no"}</code>, dirty:{" "}
          <code>{state.dirty ? "yes" : "no"}</code>
        </span>
      </p>
    </main>
  );
}
