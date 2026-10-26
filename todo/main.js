// Entry point: wires storage, logic and rendering to the page.
import { openDb, addTask, listTasks, changeTask, deleteTask } from "./db.js";
import { parseTags, matches, tagsInUse } from "./tasks.js";
import { completeTask, reopenTask, stopRepeating, newRecurringFields, toISODate } from "./recurrence.js";
import { normalizePriority, sortTasks } from "./priority.js";
import { validateEdit, applyEdit } from "./edit.js";
import { renderTasks, renderTagOptions } from "./render.js";

const $ = (id) => document.getElementById(id);
const filters = { status: "all", tag: "", priority: "" };
let editingId = null; // id of the task shown as an edit form, if any

let db;
try {
  db = await openDb();
} catch (err) {
  $("empty").textContent = "Storage is unavailable in this browser, so tasks can't be saved.";
  $("new-task").querySelector("button[type=submit]").disabled = true;
  throw err;
}

async function refresh() {
  const tasks = await listTasks(db);
  const tags = tagsInUse(tasks);
  if (!tags.includes(filters.tag)) filters.tag = "";
  renderTagOptions($("tag-filter"), tags, filters.tag);
  renderTasks($("tasks"), $("empty"), {
    visible: sortTasks(tasks.filter((t) => matches(t, filters))),
    total: tasks.length,
    today: toISODate(),
    editingId,
    on: handlers,
  });
}

const handlers = {
  async toggle(task, checked) {
    const today = toISODate();
    await changeTask(db, task.id, (current) =>
      checked ? completeTask(current, today) : { updated: reopenTask(current), next: null }
    );
    refresh();
  },
  async remove(task) {
    await deleteTask(db, task.id);
    if (editingId === task.id) editingId = null;
    refresh();
  },
  filterTag(tag) {
    filters.tag = tag;
    refresh();
  },
  async stopRepeating(task) {
    await changeTask(db, task.id, (current) => ({ updated: stopRepeating(current), next: null }));
    refresh();
  },
  edit(task) {
    editingId = task.id;
    refresh();
  },
  cancel() {
    editingId = null;
    refresh();
  },
  // Returns the validation error for the form to show, or "" once saved.
  async save(task, input) {
    const error = validateEdit(input);
    if (error) return error;
    const today = toISODate();
    await changeTask(db, task.id, (current) => ({ updated: applyEdit(current, input, today), next: null }));
    editingId = null;
    refresh();
    return "";
  },
};

$("new-task").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("title").value.trim();
  if (!title) return;
  const due = $("due").value;
  const recurring = newRecurringFields(due, $("repeat").value, toISODate());
  const priority = normalizePriority($("priority").value);
  await addTask(db, { title, due, tags: parseTags($("tags").value), priority, ...recurring });
  e.target.reset();
  $("title").focus();
  refresh();
});

const statusButtons = document.querySelectorAll("[data-status]");
statusButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    filters.status = btn.dataset.status;
    statusButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    refresh();
  })
);
$("tag-filter").addEventListener("change", (e) => {
  filters.tag = e.target.value;
  refresh();
});
$("priority-filter").addEventListener("change", (e) => {
  filters.priority = e.target.value;
  refresh();
});

refresh();
