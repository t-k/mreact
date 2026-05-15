"use server";

import { revalidatePath } from "@reckona/mreact-router";
import { addNoteToStore } from "./store.js";

export async function addNote(formData: FormData): Promise<void> {
  const raw = formData.get("text");
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length > 200) {
    throw new Error("Note text must be at most 200 characters.");
  }
  if (text.length > 0) {
    addNoteToStore(text);
    revalidatePath("/server-actions");
  }
}
