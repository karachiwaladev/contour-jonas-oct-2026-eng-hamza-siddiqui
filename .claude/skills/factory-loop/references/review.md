# Review: code review and security review before the PR

Run both after the tests pass and the Chrome check is done, on the ticket branch.

## 1. Code review

Run the `code-review` skill on the branch's changes against `main`:

```
Skill: code-review   args: main...HEAD
```

On top of its findings, check:
- **Structure** (`structure.md`): no god files, each module has one job, `main.js` stays thin, no new globals.
- **Tests** (`testing.md`): every requirement and edge case in the approved plan has a test, and tests check behaviour, not implementation details.
- **Compatibility:** older stored data still loads.
- **Scope:** nothing unrelated to the ticket changed.

Fix every real finding, then rerun `node --test`. If the UI changed, also redo the affected Chrome check.

## 2. Security review

Run the `security-review` skill on the same changes, then go through this checklist for these browser apps:

- **XSS:** user text goes into the page with `textContent`, `new Option(...)` or `setAttribute`. Never use `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write` with data.
- **No code from strings:** no `eval`, `new Function`, or `setTimeout` given a string.
- **Content Security Policy:** each `index.html` has a CSP `<meta>` tag. The baseline is `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'`. Loosen it only with a reason in the PR.
- **Third-party code:** no scripts or styles from a CDN unless pinned with an `integrity` hash. Prefer none.
- **Secrets:** check the diff for keys, tokens and passwords:
  ```bash
  git diff main...HEAD | grep -nEi "(api[_-]?key|secret|token|password|BEGIN [A-Z ]*PRIVATE KEY)"
  ```
- **Dependencies:** if the project has dependencies in `package.json`, run `npm audit --omit=dev`.
- **Stored data:** treat everything read back from IndexedDB or localStorage as untrusted input when rendering it.

**High or critical findings block the PR.** Fix them, or flag the ticket for a human and leave it open. Lower findings are fixed, or listed in the PR with a reason.

## In the PR

Add a **Review** section to the PR body:
- **Code review:** what was found and how each finding was fixed, or "no findings".
- **Security:** the checklist results and any accepted lower-severity items with their reason.
