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
export const updateTask = (db, task) => tx(db, "readwrite", (s) => s.put(task));
export const deleteTask = (db, id) => tx(db, "readwrite", (s) => s.delete(id));
