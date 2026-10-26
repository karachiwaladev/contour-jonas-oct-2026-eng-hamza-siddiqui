// Builds the task list and tag dropdown from data it is given. Reads no storage;
// user actions are reported through the `on` callbacks.
import { isOverdue } from "./tasks.js";
import { REPEATS } from "./recurrence.js";
import { PRIORITIES, priorityOf } from "./priority.js";
import { editForm } from "./edit-form.js";

// Rebuild the tag dropdown. The caller makes sure `selected` is "" or a tag in `tags`.
export function renderTagOptions(select, tags, selected) {
  const options = tags.map((tag) => new Option(`#${tag}`, tag));
  select.replaceChildren(new Option("All tags", ""), ...options);
  select.value = selected;
}

// on: { toggle(task, checked), remove(task), filterTag(tag), stopRepeating(task),
//       edit(task), save(task, input), cancel() }
// `visible` is already filtered and sorted; the task whose id is `editingId` renders as a form.
export function renderTasks(list, empty, { visible, total, today, editingId, on }) {
  list.replaceChildren(
    ...visible.map((task) => (task.id === editingId ? editItem(task, on) : taskItem(task, today, on)))
  );
  list.querySelector("form.edit input")?.focus();
  empty.hidden = visible.length > 0;
  empty.textContent = total ? "No tasks match these filters." : "No tasks yet.";
}

function editItem(task, on) {
  const li = document.createElement("li");
  li.className = "editing";
  li.append(editForm(task, on));
  return li;
}

function taskItem(task, today, on) {
  const li = document.createElement("li");
  li.className = task.done ? "done" : "";

  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = task.done;
  check.setAttribute("aria-label", "Mark done");
  check.addEventListener("change", () => on.toggle(task, check.checked));

  const body = document.createElement("div");
  body.className = "body";
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = task.title;
  body.append(title);
  const meta = taskMeta(task, today, on);
  if (meta.childElementCount) body.append(meta);

  li.append(check, body);
  if (REPEATS[task.repeat] && !task.done) {
    li.append(button("Stop repeating", "stop", () => on.stopRepeating(task)));
  }
  li.append(button("Edit", "edit", () => on.edit(task)));
  li.append(button("Delete", "delete", () => on.remove(task)));
  return li;
}

// Priority badge, due date, repeat badge and tag chips.
function taskMeta(task, today, on) {
  const meta = document.createElement("div");
  meta.className = "meta";
  // The class comes from priorityOf's fixed key list, never the raw stored value.
  const level = priorityOf(task);
  const flag = document.createElement("span");
  flag.className = "priority " + level;
  flag.textContent = PRIORITIES[level];
  meta.append(flag);
  if (task.due) {
    const due = document.createElement("span");
    due.className = "due" + (isOverdue(task, today) ? " overdue" : "");
    due.textContent = "Due " + formatDate(task.due);
    meta.append(due);
  }
  if (REPEATS[task.repeat]) {
    const badge = document.createElement("span");
    badge.className = "repeat";
    badge.textContent = "↻ " + REPEATS[task.repeat];
    meta.append(badge);
  }
  for (const tag of task.tags || []) {
    const chip = button(`#${tag}`, "tag", () => on.filterTag(tag));
    chip.title = `Show only #${tag}`;
    meta.append(chip);
  }
  return meta;
}

function button(text, className, onClick) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = className;
  el.textContent = text;
  el.addEventListener("click", onClick);
  return el;
}

// "2026-10-30" -> "Oct 30"
function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
