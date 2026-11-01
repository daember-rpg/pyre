export const MODULE_ID = "pyre";
export const TEMPLATE_PATH = `modules/${MODULE_ID}/templates`;
export const CONJURE_ID = "conjure";
/** PF2e roll option present on a chat card only when the spell was actually cast. */
export const CAST_OPTION = "origin:action:slug:cast-a-spell";

export function debug(...args) {
  try { if (game.settings.get(MODULE_ID, "debug")) console.log(`${MODULE_ID} |`, ...args); } catch { /* settings not ready */ }
}

function debugOn() {
  try { return !!game.settings.get(MODULE_ID, "debug"); } catch { return false; }
}

/** On-screen decision log (debug only): the last few things Pyre decided, bottom left. */
export function report(title, lines = [], { error = false } = {}) {
  if (!debugOn()) return;
  console[error ? "error" : "log"](`${MODULE_ID} | ${title}`, ...lines);
  let box = document.getElementById("pyre-debug");
  if (!box) {
    box = document.createElement("div");
    box.id = "pyre-debug";
    document.body.append(box);
  }
  const entry = document.createElement("div");
  entry.className = "pyre-debug-entry" + (error ? " err" : "");
  const h = document.createElement("strong");
  h.textContent = title;
  entry.append(h);
  for (const l of lines) {
    const p = document.createElement("div");
    p.textContent = typeof l === "string" ? l : JSON.stringify(l);
    entry.append(p);
  }
  box.prepend(entry);
  while (box.children.length > 5) box.lastChild.remove();
  setTimeout(() => entry.classList.add("fade"), 9000);
  setTimeout(() => entry.remove(), 10000);
}

/** Something went wrong: always to the console, and on screen in debug. */
export function fail(where, err) {
  console.error(`${MODULE_ID} | ${where}`, err);
  report(`Error in ${where}`, [String(err?.message ?? err)], { error: true });
}
