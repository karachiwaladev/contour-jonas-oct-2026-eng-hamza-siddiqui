# Code structure: no god objects

Split code by responsibility, not into one big controller file that holds everything.

## Rules

- **One responsibility per module.** A typical browser project has:
  - `db.js`: storage only (IndexedDB open, get, put, delete). No DOM.
  - `<domain>.js`, for example `tasks.js`: pure logic such as filtering, parsing and date maths. No DOM, no storage, no globals. This is what unit tests import.
  - `<view>.js`, for example `render.js`: builds DOM from data it is given. It doesn't read storage itself.
  - `main.js`: the entry point. It wires the modules together and attaches event listeners. Keep it thin.
- **Use ES modules** (`<script type="module" src="main.js">`, `import`/`export`). Never share state through globals.
- **Size limits as a smell test:** a file over ~150 lines or a function over ~30 lines should probably be split. Exceeding one needs a reason in the PR.
- **New features go in the module that owns that responsibility, or in a new module.** Don't grow `main.js`. A new concept, like recurrence, gets its own pure module (`recurrence.js`) with its own tests.
- **Pass dependencies in.** Use arguments rather than reaching for module-level singletons, so logic can be tested without a browser.

## Existing code

When a ticket touches a project that already has a large file, the plan includes splitting the parts the ticket touches. It keeps the behaviour and the stored data unchanged and adds tests for the logic it moves. Don't rewrite unrelated parts in the same PR.

ES modules need the page served over http (`npx http-server`), not opened as `file://`. Note this in the project's `CLAUDE.md` "Run" line.
