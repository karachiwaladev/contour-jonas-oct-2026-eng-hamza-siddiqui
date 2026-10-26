# Todo app

A simple todo app: create a task, mark it done, delete it (#4). Tasks also have an optional due date and tags, and the list can be filtered by status (all, incomplete, completed) and by tag (#5). Tasks can repeat daily, weekly or monthly; ticking one creates the next occurrence (#7). Tasks have a priority (High, Medium, Low) with a priority filter, the list is sorted by priority, and every task can be edited inline (#9).

- **Stack:** plain HTML, CSS and JavaScript ES modules with no build step or dependencies.
- **Storage:** IndexedDB, the browser's client-side database. Database `todo-app` (version 1), object store `tasks`, records shaped `{ id, title, done, due, tags, repeat, anchorDay, spawned, createdAt, priority }`.
  - `due` is `"YYYY-MM-DD"` or `""`; `tags` is an array of lowercase strings.
  - `repeat` is `"daily"`, `"weekly"`, `"monthly"` or `""`. `anchorDay` is a monthly series' day of the month, so Jan 31 goes to Feb 28 and then back to Mar 31.
  - `spawned` is set once a done occurrence has created its next one. Unticking a spawned task reopens it as a one-off.
  - `priority` is `"high"`, `"medium"` or `"low"`. Missing or unknown values read as `"medium"` through `priorityOf`; nothing is migrated. New, edited and spawned tasks always store one.
  - Older records may lack all of these optional fields.
  - Completing, reopening, Stop repeating and saving an edit each run in one IndexedDB transaction (`changeTask` in `db.js`).
- **Modules** (one job each, see `.claude/skills/factory-loop/references/structure.md`):
  - `db.js`: IndexedDB access only.
  - `tasks.js`: pure logic for tag parsing, filtering (status, tag, priority) and overdue checks.
  - `recurrence.js`: pure logic for the next due date and completing a repeating task.
  - `priority.js`: pure priority rules (`PRIORITIES`, `priorityOf`, `normalizePriority`) and `sortTasks` (priority, then due date with none last, then `createdAt`).
  - `edit.js`: pure edit logic, `validateEdit` and `applyEdit` (keeps `id`, `done`, `createdAt`, `spawned`; keeps, recomputes or drops `anchorDay`).
  - `render.js`: builds the list, priority badges and the tag dropdown from data it's given.
  - `edit-form.js`: builds the inline edit form for one task (Enter saves, Escape cancels).
  - `main.js`: the thin entry point that wires them together and holds the filter and editing state.
- **Security:** `index.html` has a Content-Security-Policy `<meta>` tag (self-hosted scripts and styles only). User text is only ever set with `textContent`, `.value` or `new Option`. Badge classes come from `priorityOf`, never the raw stored value.
- **Run:** serve the folder over http, for example `npx http-server todo`. ES modules don't load from `file://`.
- **Test:** `node --test` from the repo root, with unit tests in `*.test.js` next to each module. In the browser:
  - Add a weekly High task due tomorrow with tag `home`. Tick it and check that a new open High copy appears, due a week later.
  - Check the Completed and Incomplete filters, the `#home` tag filter and the Priority filter, and that the list reads High, Medium, Low.
  - Edit a task (title, due, repeat, tags, priority), save, and check an empty title shows "Title cannot be empty.".
  - Press Stop repeating, reload (the data persists), then delete the task.
- **Screenshots:** `screenshots/issue-<n>-*.png`, one per requirement, taken in Chrome during verification.
