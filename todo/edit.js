// Editing a task: validate the form input and build the updated record.
// Pure functions; no DOM or storage.
import { parseTags } from "./tasks.js";
import { REPEATS, newRecurringFields } from "./recurrence.js";
import { normalizePriority } from "./priority.js";

// input: { title } -> an error message, or "" when valid.
export function validateEdit(input) {
  return String(input.title || "").trim() ? "" : "Title cannot be empty.";
}

// input: { title, due, repeat, tags: "comma, text", priority }. Returns a new task that
// keeps id, done, createdAt and spawned (so an edited done occurrence can't spawn twice).
export function applyEdit(task, input, today) {
  const due = input.due || "";
  const repeat = Object.hasOwn(REPEATS, input.repeat) ? input.repeat : "";
  const { anchorDay, ...rest } = task;
  const updated = {
    ...rest,
    title: String(input.title).trim(),
    due,
    tags: parseTags(input.tags || ""),
    repeat,
    priority: normalizePriority(input.priority),
  };
  if (repeat !== "monthly") return updated;
  const unchanged = repeat === task.repeat && due === (task.due || "");
  if (unchanged && anchorDay) return { ...updated, anchorDay };
  return { ...updated, ...newRecurringFields(due, repeat, today) };
}
