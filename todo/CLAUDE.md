# Todo app

A simple todo app: create a task, mark it done, delete it (#4). Tasks also have an optional due date and tags, and the list can be filtered by status (all, incomplete, completed) and by tag (#5).

- **Stack:** plain HTML, CSS and JavaScript with no build step or dependencies.
- **Storage:** IndexedDB, the browser's client-side database. Database `todo-app`, object store `tasks`, records shaped `{ id, title, done, due, tags, createdAt }`. `due` is `"YYYY-MM-DD"` or `""`; `tags` is an array of lowercase strings. Older records may lack `due` and `tags`, so treat both as optional.
- **Filters:** kept in memory (`filters` in `app.js`) and applied on render. The tag dropdown is rebuilt from the tags in use; clicking a tag chip filters by it.
- **Files:** `index.html` (markup), `app.js` (database helpers and rendering), `style.css`.
- **Run:** open `index.html` in a browser, or serve the folder (for example `npx serve todo`).
- **Test:** add a task with a due date and tags `work, urgent`. Tick it, then check that the Completed and Incomplete filters show it correctly. Pick `#work` in the tag filter, reload the page (the data persists), then delete the task.
