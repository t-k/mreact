// /server-actions — demonstrates three primitives in one stop:
//   1. "use server" actions invoked from <form action={addNote}>.
//   2. revalidatePath() invalidating the route's HTML cache.
//   3. export const revalidate = N — page-level cached HTML with
//      revalidation interval.
//
// The page also reads from the same in-memory store so a successful
// action immediately surfaces on the next render.

import { addNote } from "./actions.js";
import { listNotes } from "./store.js";

export const revalidate = 30;

export const metadata = {
  title: "Server Actions — mreact App Router",
  description: "Form actions, revalidatePath, and route HTML cache in one page.",
};

export default function Page() {
  const notes = listNotes();
  const generatedAt = new Date().toISOString();

  return (
    <main>
      <h1>Server Actions</h1>
      <p>
        Submitting the form below calls the <code>"use server"</code>{" "}
        function in <code>actions.ts</code>. The action stores the note,
        then calls <code>revalidatePath("/server-actions")</code>, which
        drops this page from the HTML cache so the next render shows the
        new entry.
      </p>
      <p class="muted">
        <code>export const revalidate = 30</code> — this page's HTML is
        cached for 30 seconds. Without the explicit revalidate call you
        would see the same snapshot until the timer expires. Page was
        rendered at <code>{generatedAt}</code>.
      </p>

      <form method="post" action={addNote} class="inline-form">
        <input
          class="action-input"
          name="text"
          placeholder="Type a note and press Enter…"
          maxlength="200"
          required
        />
        <button type="submit">Add note</button>
      </form>

      <h2>Notes</h2>
      <ul>
        {notes.map((note) => (
          <li key={note.id}>
            <strong>{note.text}</strong>{" "}
            <span class="muted">— {note.createdAt}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
