// Task priority: the allowed levels, reading a task's priority and the list order.
// Pure functions; no DOM or storage.

// Display order, highest first. Keys are what gets stored.
export const PRIORITIES = { high: "High", medium: "Medium", low: "Low" };
export const DEFAULT_PRIORITY = "medium";

const RANK = Object.fromEntries(Object.keys(PRIORITIES).map((key, i) => [key, i]));

// An exact key of PRIORITIES, else the default.
export function normalizePriority(value) {
  return Object.hasOwn(PRIORITIES, value) ? value : DEFAULT_PRIORITY;
}

// Older records have no priority; they (and unknown values) read as the default.
export function priorityOf(task) {
  return normalizePriority(task.priority);
}

// A new array ordered by priority, then due date (none last), then creation time.
export function sortTasks(tasks) {
  return [...tasks].sort(
    (a, b) =>
      RANK[priorityOf(a)] - RANK[priorityOf(b)] ||
      compareDue(a.due, b.due) ||
      (a.createdAt || 0) - (b.createdAt || 0)
  );
}

// "YYYY-MM-DD" strings compare correctly as text; an empty date sorts last.
function compareDue(a, b) {
  if (a === b || (!a && !b)) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
}
