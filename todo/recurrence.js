// Recurring tasks: when a repeating task is completed, work out its next occurrence.
// Pure functions over "YYYY-MM-DD" strings; no DOM or storage.

export const REPEATS = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

// Today's local date as "YYYY-MM-DD".
export function toISODate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The next due date after `due` (or after `today` when there is no due date), or null if
// the task doesn't repeat. Monthly keeps the day, moved back to the month's last day if needed.
export function nextDue(due, repeat, today) {
  if (!REPEATS[repeat]) return null;
  const [y, m, d] = (due || today).split("-").map(Number);
  let next;
  if (repeat === "monthly") {
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    next = new Date(Date.UTC(y, m, Math.min(d, lastDay)));
  } else {
    next = new Date(Date.UTC(y, m - 1, d + (repeat === "daily" ? 1 : 7)));
  }
  return next.toISOString().slice(0, 10);
}

// Mark a task done. For a repeating task that hasn't spawned yet, also return the next
// occurrence to add; `spawned` stops untick/re-tick from creating duplicates.
export function completeTask(task, today) {
  const due = task.spawned ? null : nextDue(task.due, task.repeat, today);
  const updated = { ...task, done: true };
  if (!due) return { updated, next: null };
  return {
    updated: { ...updated, spawned: true },
    next: { title: task.title, due, tags: task.tags || [], repeat: task.repeat },
  };
}

export function stopRepeating(task) {
  return { ...task, repeat: "" };
}
