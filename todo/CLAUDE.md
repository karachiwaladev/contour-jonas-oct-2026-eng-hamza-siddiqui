# Todo app

A simple todo app: create a task, mark it done, delete it (#4). Tasks also have an optional due date and tags, and the list can be filtered by status (all, incomplete, completed) and by tag (#5). Tasks can repeat daily, weekly or monthly; ticking one creates the next occurrence (#7).

- **Stack:** plain HTML, CSS and JavaScript ES modules with no build step or dependencies.
- **Storage:** IndexedDB, the browser's client-side database. Database `todo-app`, object store `tasks`, records shaped `{ id, title, done, due, tags, repeat, spawned, createdAt }`. `due` is `"YYYY-MM-DD"` or `""`; `tags` is an array of lowercase strings; `repeat` is `"daily"`, `"weekly"`, `"monthly"` or `""`; `spawned` is set once a done occurrence has created its next one. Older records may lack `due`, `tags`, `repeat` and `spawned`, so treat them all as optional.
- **Modules** (one job each, see `.claude/skills/factory-loop/references/structure.md`):
  - `db.js`: IndexedDB access only.
  - `tasks.js`: pure logic for tag parsing, filtering and overdue checks.
  - `recurrence.js`: pure logic for the next due date and completing a repeating task.
  - `render.js`: builds the list and the tag dropdown from data it's given.
  - `main.js`: the thin entry point that wires them together and holds the filter state.
- **Security:** `index.html` has a Content-Security-Policy `<meta>` tag (self-hosted scripts and styles only). User text is only ever set with `textContent` or `new Option`.
- **Run:** serve the folder over http, for example `npx http-server todo`. ES modules don't load from `file://`.
- **Test:** `node --test` from the repo root, with unit tests in `*.test.js` next to each module. In the browser:
  - Add a weekly task due tomorrow with tag `home`. Tick it and check that a new open copy appears, due a week later.
  - Check the Completed and Incomplete filters and the `#home` tag filter.
  - Press Stop repeating, reload (the data persists), then delete the task.
- **Screenshots:** `screenshots/issue-<n>-*.png`, one per requirement, taken in Chrome during verification.
