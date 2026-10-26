// Editing a task: validate the form input and build the updated record.
// Pure functions; no DOM or storage.
import { parseTags } from "./tasks.js";
import { REPEATS, newRecurringFields } from "./recurrence.js";
import { normalizePriority } from "./priority.js";

// input: { title } -> an error message, or "" when valid.
export function validateEdit(input) {
  return String(input.title || "").trim() ? "" : "Title cannot be empty.";
}

// The id to keep editing: `editingId` while that task is in the visible list, else null
// (so a form hidden by a filter doesn't reappear later).
export function keepEditing(visible, editingId) {
  return visible.some((task) => task.id === editingId) ? editingId : null;
}

// input: { title, due, repeat, tags: "comma, text", priority }. Returns a new task that
// keeps id, done and createdAt. `spawned` is kept while the task is done (so an edited
// done occurrence can't spawn twice) and dropped when an open task starts repeating
// again, so ticking it carries the series on. It is never added.
export function applyEdit(task, input, today) {
  const due = input.due || "";
  const repeat = Object.hasOwn(REPEATS, input.repeat) ? input.repeat : "";
  const { anchorDay, spawned, ...rest } = task;
  const updated = {
    ...rest,
    title: String(input.title).trim(),
    due,
    tags: parseTags(input.tags || ""),
    repeat,
    priority: normalizePriority(input.priority),
  };
  if ("spawned" in task && (task.done || !repeat)) updated.spawned = spawned;
  if (repeat !== "monthly") return updated;
  const unchanged = repeat === task.repeat && due === (task.due || "");
  if (unchanged && anchorDay) return { ...updated, anchorDay };
  return { ...updated, ...newRecurringFields(due, repeat, today) };
}
