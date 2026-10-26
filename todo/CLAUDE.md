# Todo app

A simple todo app: create a task, mark it done, delete it. Created for ticket #4.

- **Stack:** plain HTML, CSS and JavaScript with no build step or dependencies.
- **Storage:** IndexedDB, the browser's client-side database. Database `todo-app`, object store `tasks`, records shaped `{ id, title, done, createdAt }`.
- **Files:** `index.html` (markup), `app.js` (database helpers and rendering), `style.css`.
- **Run:** open `index.html` in a browser, or serve the folder (for example `npx serve todo`).
- **Test:** add a task, tick it, reload the page (the task stays done), then delete it.
