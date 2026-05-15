// In-memory note store kept on globalThis so it survives the router's
// per-request module reloads during dev.

interface Note {
  id: number;
  text: string;
  createdAt: string;
}

interface StoreShape {
  notes: Note[];
  nextId: number;
}

const KEY = Symbol.for("examples.app-router.server-actions.store");
const globalStore = globalThis as unknown as Record<symbol, StoreShape>;

function getStore(): StoreShape {
  if (!globalStore[KEY]) {
    globalStore[KEY] = {
      notes: [
        { id: 1, text: "Welcome to the server-actions demo.", createdAt: new Date().toISOString() },
      ],
      nextId: 2,
    };
  }
  return globalStore[KEY];
}

export function listNotes(): readonly Note[] {
  return getStore().notes;
}

export function addNoteToStore(text: string): Note {
  const store = getStore();
  const note: Note = { id: store.nextId++, text, createdAt: new Date().toISOString() };
  store.notes = [note, ...store.notes];
  return note;
}
