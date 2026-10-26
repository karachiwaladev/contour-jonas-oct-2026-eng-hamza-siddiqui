// IndexedDB storage for tasks. No DOM access.
const DB_NAME = "todo-app";
const STORE = "tasks";

export function openDb() {
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

// fields: { title, due, tags, repeat }
export const addTask = (db, fields) =>
  tx(db, "readwrite", (s) => s.add({ ...fields, done: false, createdAt: Date.now() }));
export const listTasks = (db) => tx(db, "readonly", (s) => s.getAll());
export const deleteTask = (db, id) => tx(db, "readwrite", (s) => s.delete(id));

// Read the stored task, apply `change(task) -> { updated, next }`, save `updated` and add
// `next` (if any), all in one transaction. A fresh read avoids acting on a stale copy, and
// the single transaction means a failure saves neither write.
export function changeTask(db, id, change) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const store = t.objectStore(STORE);
    const get = store.get(id);
    get.onsuccess = () => {
      if (!get.result) return;
      const { updated, next } = change(get.result);
      store.put(updated);
      if (next) store.add({ ...next, done: false, createdAt: Date.now() });
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
