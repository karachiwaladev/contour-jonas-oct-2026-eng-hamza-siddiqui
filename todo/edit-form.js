// Builds the inline edit form for one task from data it is given. Reads no storage;
// user actions are reported through the `on` callbacks.
import { REPEATS } from "./recurrence.js";
import { PRIORITIES, priorityOf } from "./priority.js";

// on: { save(task, input) -> Promise<error message or "">, cancel() }
// input: { title, due, repeat, tags: "comma, text", priority }
export function editForm(task, on) {
  const form = document.createElement("form");
  form.className = "edit";
  const title = input("Title", { type: "text", value: task.title || "" });
  const due = input("Due date", { type: "date", value: task.due || "" });
  const repeat = select("Repeat", { "": "Does not repeat", ...REPEATS }, task.repeat || "");
  const tags = input("Tags", { type: "text", value: (task.tags || []).join(", ") });
  tags.placeholder = "Tags, comma separated";
  const priority = select("Priority", PRIORITIES, priorityOf(task));
  const error = document.createElement("p");
  error.className = "error";
  error.setAttribute("role", "alert");

  const row = document.createElement("div");
  row.className = "row";
  row.append(due, repeat, priority, button("submit", "Save", "save"), button("button", "Cancel", "cancel", on.cancel));

  form.append(title, tags, row, error);
  form.addEventListener("keydown", (e) => {
    if (e.key === "Escape") on.cancel();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const values = {
      title: title.value, due: due.value, repeat: repeat.value, tags: tags.value, priority: priority.value,
    };
    error.textContent = (await on.save(task, values)) || "";
  });
  return form;
}

function button(type, text, className, onClick) {
  const el = document.createElement("button");
  el.type = type;
  el.textContent = text;
  el.className = className;
  if (onClick) el.addEventListener("click", () => onClick());
  return el;
}

function input(label, props) {
  const el = Object.assign(document.createElement("input"), props);
  el.setAttribute("aria-label", label);
  el.autocomplete = "off";
  return el;
}

// A <select> with one option per `choices` entry (value -> text), set to `selected`.
function select(label, choices, selected) {
  const el = document.createElement("select");
  el.setAttribute("aria-label", label);
  el.append(...Object.entries(choices).map(([value, text]) => new Option(text, value)));
  el.value = selected;
  return el;
}
