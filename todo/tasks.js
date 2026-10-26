// Task list logic: tag parsing and filtering. Pure functions; no DOM or storage.
import { priorityOf } from "./priority.js";

// "work, Home , work" -> ["work", "home"]
export function parseTags(text) {
  const tags = text.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  return [...new Set(tags)];
}

// filters: { status: "all" | "active" | "done", tag: "" | tagName, priority?: "" | key }
// A missing or empty priority filter means all priorities.
export function matches(task, filters) {
  if (filters.status === "active" && task.done) return false;
  if (filters.status === "done" && !task.done) return false;
  if (filters.tag && !(task.tags || []).includes(filters.tag)) return false;
  if (filters.priority && priorityOf(task) !== filters.priority) return false;
  return true;
}

export function tagsInUse(tasks) {
  return [...new Set(tasks.flatMap((t) => t.tags || []))].sort();
}

// "YYYY-MM-DD" strings compare correctly as text.
export function isOverdue(task, today) {
  return !task.done && Boolean(task.due) && task.due < today;
}
