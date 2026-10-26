// Entry point: wires storage, logic and rendering to the page.
import { openDb, addTask, listTasks, changeTask, deleteTask } from "./db.js";
import { parseTags, matches, tagsInUse } from "./tasks.js";
import { completeTask, reopenTask, stopRepeating, newRecurringFields, toISODate } from "./recurrence.js";
import { renderTasks, renderTagOptions } from "./render.js";

const $ = (id) => document.getElementById(id);
const filters = { status: "all", tag: "" };

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
    visible: tasks.filter((t) => matches(t, filters)),
    total: tasks.length,
    today: toISODate(),
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
};

$("new-task").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("title").value.trim();
  if (!title) return;
  const due = $("due").value;
  const recurring = newRecurringFields(due, $("repeat").value, toISODate());
  await addTask(db, { title, due, tags: parseTags($("tags").value), ...recurring });
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

refresh();
