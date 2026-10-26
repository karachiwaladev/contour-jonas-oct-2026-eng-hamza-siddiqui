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

const createTask = (db, title) =>
  tx(db, "readwrite", (s) => s.add({ title, done: false, createdAt: Date.now() }));
const listTasks = (db) => tx(db, "readonly", (s) => s.getAll());
const updateTask = (db, task) => tx(db, "readwrite", (s) => s.put(task));
const deleteTask = (db, id) => tx(db, "readwrite", (s) => s.delete(id));

async function render(db) {
  const tasks = await listTasks(db);
  const list = document.getElementById("tasks");
  list.replaceChildren(...tasks.map((task) => taskItem(db, task)));
  document.getElementById("empty").hidden = tasks.length > 0;
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

  const title = document.createElement("span");
  title.textContent = task.title;

  const del = document.createElement("button");
  del.textContent = "Delete";
  del.className = "delete";
  del.addEventListener("click", async () => {
    await deleteTask(db, task.id);
    render(db);
  });

  li.append(check, title, del);
  return li;
}

openDb().then((db) => {
  const form = document.getElementById("new-task");
  const input = document.getElementById("title");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = input.value.trim();
    if (!title) return;
    await createTask(db, title);
    input.value = "";
    render(db);
  });
  render(db);
});
