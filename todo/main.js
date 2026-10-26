// Entry point: wires storage, logic and rendering to the page.
import { openDb, addTask, listTasks, updateTask, deleteTask } from "./db.js";
import { parseTags, matches, tagsInUse } from "./tasks.js";
import { completeTask, stopRepeating, toISODate } from "./recurrence.js";
import { renderTasks, renderTagOptions } from "./render.js";

const $ = (id) => document.getElementById(id);
const filters = { status: "all", tag: "" };

const db = await openDb();

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
    if (checked) {
      const { updated, next } = completeTask(task, toISODate());
      await updateTask(db, updated);
      if (next) await addTask(db, next);
    } else {
      await updateTask(db, { ...task, done: false });
    }
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
    await updateTask(db, stopRepeating(task));
    refresh();
  },
};

$("new-task").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("title").value.trim();
  if (!title) return;
  await addTask(db, { title, due: $("due").value, tags: parseTags($("tags").value), repeat: $("repeat").value });
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
