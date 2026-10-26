// Recurring tasks: when a repeating task is completed, work out its next occurrence.
// Pure functions over "YYYY-MM-DD" strings; no DOM or storage.

export const REPEATS = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

// Today's local date as "YYYY-MM-DD".
export function toISODate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Fields for a newly added task. Monthly series remember their day of the month, so a
// series on the 31st returns to the 31st after a shorter month instead of drifting.
export function newRecurringFields(due, repeat, today) {
  if (repeat !== "monthly") return { repeat };
  return { repeat, anchorDay: Number((due || today).slice(8, 10)) };
}

// The next due date after `due` (or after `today` when there is no due date), or null if
// the task doesn't repeat. Monthly uses `anchorDay` (default: the due day), moved back to
// the month's last day when that month is shorter.
export function nextDue(due, repeat, today, anchorDay) {
  if (!REPEATS[repeat]) return null;
  const [y, m, d] = (due || today).split("-").map(Number);
  let next;
  if (repeat === "monthly") {
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    next = new Date(Date.UTC(y, m, Math.min(anchorDay || d, lastDay)));
  } else {
    next = new Date(Date.UTC(y, m - 1, d + (repeat === "daily" ? 1 : 7)));
  }
  return next.toISOString().slice(0, 10);
}

// Mark a task done. For a repeating task that hasn't spawned yet, also return the next
// occurrence to add; `spawned` stops untick/re-tick from creating duplicates.
export function completeTask(task, today) {
  const due = task.spawned ? null : nextDue(task.due, task.repeat, today, task.anchorDay);
  const updated = { ...task, done: true };
  if (!due) return { updated, next: null };
  const next = { title: task.title, due, tags: task.tags || [], repeat: task.repeat };
  if (task.anchorDay) next.anchorDay = task.anchorDay;
  return { updated: { ...updated, spawned: true }, next };
}

// Untick a task. If it already spawned its next occurrence, that copy carries the series
// on, so this one reopens as a one-off rather than a second open repeating copy.
export function reopenTask(task) {
  const reopened = { ...task, done: false };
  return task.spawned ? { ...reopened, repeat: "" } : reopened;
}

export function stopRepeating(task) {
  return { ...task, repeat: "" };
}
