# Todo app

A simple todo app: create a task, mark it done, delete it (#4). Tasks also have an optional due date and tags, and the list can be filtered by status (all, incomplete, completed) and by tag (#5). Tasks can repeat daily, weekly or monthly; ticking one creates the next occurrence (#7). Tasks have a priority (High, Medium, Low) with a priority filter, the list is sorted by priority, and every task can be edited inline (#9). A search box filters by title or tag as you type, combined with the other filters (#14).

- **Stack:** plain HTML, CSS and JavaScript ES modules with no build step or dependencies.
- **Storage:** IndexedDB, the browser's client-side database. Database `todo-app` (version 1), object store `tasks`, records shaped `{ id, title, done, due, tags, repeat, anchorDay, spawned, createdAt, priority }`.
  - `due` is `"YYYY-MM-DD"` or `""`; `tags` is an array of lowercase strings.
  - `repeat` is `"daily"`, `"weekly"`, `"monthly"` or `""`. `anchorDay` is a monthly series' day of the month, so Jan 31 goes to Feb 28 and then back to Mar 31.
  - `spawned` is set once a done occurrence has created its next one. Unticking a spawned task reopens it as a one-off. Editing keeps `spawned` while the task is done, but drops it when an open task is given a repeat again, so ticking it carries the series on.
  - `priority` is `"high"`, `"medium"` or `"low"`. Missing or unknown values read as `"medium"` through `priorityOf`; nothing is migrated. New, edited and spawned tasks always store one.
  - Older records may lack all of these optional fields.
  - Completing, reopening, Stop repeating and saving an edit each run in one IndexedDB transaction (`changeTask` in `db.js`).
  - The search text is never stored: it lives in `filters.search` in memory and starts empty on every load.
- **Modules** (one job each, see `.claude/skills/factory-loop/references/structure.md`):
  - `db.js`: IndexedDB access only.
  - `tasks.js`: pure logic for tag parsing, filtering (status, tag, priority, search) and overdue checks.
  - `search.js`: pure search matching. `parseQuery` lowercases, splits on spaces and strips leading `#`; `matchesSearch` needs every word to be part of the title or of one tag (no words matches all).
  - `recurrence.js`: pure logic for the next due date and completing a repeating task.
  - `priority.js`: pure priority rules (`PRIORITIES`, `priorityOf`, `normalizePriority`) and `sortTasks` (priority, then due date with none last, then `createdAt`).
  - `edit.js`: pure edit logic: `validateEdit`, `applyEdit` (keeps `id`, `done`, `createdAt`; keeps or drops `spawned` as above; keeps, recomputes or drops `anchorDay`) and `keepEditing` (closes the edit when a filter hides the task).
  - `render.js`: builds the list, priority badges and the tag dropdown from data it's given. An open edit form for the same task is reused across re-renders, so unsaved input and focus survive; its title is focused only when first opened.
  - `edit-form.js`: builds the inline edit form for one task (Enter saves, Escape cancels).
  - `controls.js`: builds the add form and filter priority selects from `PRIORITIES` (Medium is the add default; the filter starts with "All priorities") and reports filter bar changes (the search box on every keystroke; Escape clears it).
  - `main.js`: the thin entry point that wires them together and holds the filter and editing state.
- **Security:** `index.html` has a Content-Security-Policy `<meta>` tag (self-hosted scripts and styles only). User text is only ever set with `textContent`, `.value` or `new Option`. Badge classes come from `priorityOf`, never the raw stored value.
- **Run:** serve the folder over http, for example `npx http-server todo`. ES modules don't load from `file://`.
- **Test:** `node --test` from the repo root, with unit tests in `*.test.js` next to each module. In the browser:
  - Add a weekly High task due tomorrow with tag `home`. Tick it and check that a new open High copy appears, due a week later.
  - Check the Completed and Incomplete filters, the `#home` tag filter and the Priority filter, and that the list reads High, Medium, Low.
  - Type in "Search tasks" (`BUY`, `#home`, `milk home`) and check it narrows the list with the other filters; Escape, the x button and deleting the text all clear it, and a reload empties it.
  - Edit a task (title, due, repeat, tags, priority), save, and check an empty title shows "Title cannot be empty.". While editing, tick another task and check the typed input stays; filter the edited task out and back and check the form is gone.
  - Press Stop repeating, reload (the data persists), then delete the task.
- **Persona specs:** `persona-specs/<persona-id>.spec.mjs`, one quicke2e flow per goal in `personas.yaml`, run by `/persona-test todo`. Each flow starts with empty storage.
- **Screenshots:** `screenshots/issue-<n>-*.png`, one per requirement, taken in Chrome during verification.
