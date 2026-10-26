# Testing: tests first, then build

Projects are plain JavaScript with no build step, so tests use Node's built-in runner: `node --test`. No dependencies to install.

## Where tests live

- Test files sit next to the module they test: `todo/tasks.js` → `todo/tasks.test.js`.
- Each project has a `package.json` with `{ "type": "module", "private": true }` so Node loads its `.js` files as ES modules, the same way the browser does with `<script type="module">`.
- Unit tests cover the **pure logic modules**: modules with no DOM or IndexedDB access (see `structure.md`). Browser behaviour is covered by the Chrome check.
- A project with no tests yet gets its first ones from the next ticket that touches it, including the `package.json` and a "Test" line in its `CLAUDE.md`.

## Order of work

1. **In the plan**, list the test cases as plain sentences under "Tests". Each one is a requirement or edge case with an exact input and expected result, for example "weekly from 2026-10-27 → 2026-11-03" or "monthly from 2027-01-31 → 2027-02-28". The human approves them with the plan.
2. **Red.** Write the tests before the code they test. Run them and confirm they fail for the right reason, such as "not a function" or a wrong value, not a syntax error in the test.
3. **Green.** Build until they pass. Don't weaken a test to make it pass. If a test turns out to be wrong, say so in the PR.
4. **Full run.** Before review and before the PR, run every test in the repo, not just the new ones:
   ```bash
   node --test
   ```
   Any failure blocks the PR.

## In the PR

Add a **Tests** section to the PR body:
- the test files added or changed;
- the pass count from the final `node --test` run, for example `14 passed, 0 failed`;
- any edge cases deliberately left untested, and why.

CI (`.github/workflows/test.yml`) reruns `node --test` on every PR, so the human sees a pass or fail check next to the merge button.
