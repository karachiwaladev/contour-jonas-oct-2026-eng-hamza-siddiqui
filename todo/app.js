// Todo app backed by IndexedDB, the browser's built-in client-side database.
const DB_NAME = "todo-app";
const STORE = "tasks";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Run one request against the tasks store and resolve with its result.
function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const createTask = (db, { title, due, tags }) =>
  tx(db, "readwrite", (s) => s.add({ title, due, tags, done: false, createdAt: Date.now() }));
const listTasks = (db) => tx(db, "readonly", (s) => s.getAll());
const updateTask = (db, task) => tx(db, "readwrite", (s) => s.put(task));
const deleteTask = (db, id) => tx(db, "readwrite", (s) => s.delete(id));

// Current filter selection; tasks are stored unfiltered and filtered on render.
const filters = { status: "all", tag: "" };

// "work, Home , work" -> ["work", "home"]
function parseTags(text) {
  const tags = text.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  return [...new Set(tags)];
}

function matches(task) {
  if (filters.status === "active" && task.done) return false;
  if (filters.status === "done" && !task.done) return false;
  if (filters.tag && !(task.tags || []).includes(filters.tag)) return false;
  return true;
}

// Rebuild the tag dropdown from the tags in use, keeping the current choice if it still exists.
function renderTagOptions(tasks) {
  const select = document.getElementById("tag-filter");
  const tags = [...new Set(tasks.flatMap((t) => t.tags || []))].sort();
  if (!tags.includes(filters.tag)) filters.tag = "";
  const options = tags.map((tag) => new Option(`#${tag}`, tag));
  select.replaceChildren(new Option("All tags", ""), ...options);
  select.value = filters.tag;
}

async function render(db) {
  const tasks = await listTasks(db);
  renderTagOptions(tasks);
  const visible = tasks.filter(matches);
  const list = document.getElementById("tasks");
  list.replaceChildren(...visible.map((task) => taskItem(db, task)));
  const empty = document.getElementById("empty");
  empty.hidden = visible.length > 0;
  empty.textContent = tasks.length ? "No tasks match these filters." : "No tasks yet.";
}

// "2026-10-30" -> "Due Oct 30", flagged when the date has passed on an open task.
function dueLabel(task) {
  const [y, m, d] = task.due.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const span = document.createElement("span");
  span.className = "due" + (!task.done && date < today ? " overdue" : "");
  span.textContent = "Due " + date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return span;
}

function taskItem(db, task) {
  const li = document.createElement("li");
  li.className = task.done ? "done" : "";

  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = task.done;
  check.setAttribute("aria-label", "Mark done");
  check.addEventListener("change", async () => {
    await updateTask(db, { ...task, done: check.checked });
    render(db);
  });

  const body = document.createElement("div");
  body.className = "body";
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = task.title;
  const meta = document.createElement("div");
  meta.className = "meta";
  if (task.due) meta.append(dueLabel(task));
  for (const tag of task.tags || []) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tag";
    chip.textContent = `#${tag}`;
    chip.title = `Show only #${tag}`;
    chip.addEventListener("click", () => {
      filters.tag = tag;
      render(db);
    });
    meta.append(chip);
  }
  body.append(title);
  if (meta.childElementCount) body.append(meta);

  const del = document.createElement("button");
  del.textContent = "Delete";
  del.className = "delete";
  del.addEventListener("click", async () => {
    await deleteTask(db, task.id);
    render(db);
  });

  li.append(check, body, del);
  return li;
}

openDb().then((db) => {
  const form = document.getElementById("new-task");
  const input = document.getElementById("title");
  const due = document.getElementById("due");
  const tags = document.getElementById("tags");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = input.value.trim();
    if (!title) return;
    await createTask(db, { title, due: due.value, tags: parseTags(tags.value) });
    form.reset();
    input.focus();
    render(db);
  });

  const statusButtons = document.querySelectorAll("[data-status]");
  statusButtons.forEach((btn) =>
    btn.addEventListener("click", () => {
      filters.status = btn.dataset.status;
      statusButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      render(db);
    })
  );
  document.getElementById("tag-filter").addEventListener("change", (e) => {
    filters.tag = e.target.value;
    render(db);
  });

  render(db);
});
