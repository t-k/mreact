document.addEventListener("click", async (event) => {
  const button = event.target instanceof Element ? event.target.closest(".code-copy") : null;
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const code = button.parentElement?.querySelector("pre")?.textContent;
  if (code === undefined) {
    return;
  }

  const original = button.textContent ?? "Copy";
  try {
    await copyText(code);
    button.textContent = "Copied";
  } catch {
    button.textContent = "Failed";
  } finally {
    window.setTimeout(() => {
      button.textContent = original;
    }, 1400);
  }
});

async function copyText(value) {
  if (navigator.clipboard !== undefined) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto 0";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("copy command failed");
    }
  } finally {
    textarea.remove();
  }
}
