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

## 3. Risk eval

Once the review fixes are committed, score how risky the PR is:

```bash
node .claude/evals/pr-risk.mjs --base main --head HEAD
```

The score is deterministic and comes only from the diff and the code:

| Signal | Points |
|---|---|
| Source modules changed | 4 each (max 40) |
| Code lines added or removed | 1 per 25 (max 25) |
| Projects touched beyond the first (code or config only) | 15 each |
| Blast radius: other modules importing a changed module | 3 per importer (max 20) |
| Storage or data layer changed (`db`, `storage`, `schema`, `migration` files) | 10 |
| Content-Security-Policy changed | 10 |
| Unsafe DOM or `eval` added | 10 |
| New dependencies | 10 each |
| Factory guardrails changed (`.claude/`, `.github/`) | 20 |
| Source files deleted or renamed | 5 each |
| Test files deleted | 10 each |
| Changed modules that no test imports | 3 each (max 15) |

**Levels:** Low is under 25, Medium is 25–49, High is 50 or more. As a reference, PR #6 (favicon and screenshots) scores 0, Low. PR #8 (recurring tasks plus splitting `app.js` into modules) scores 72, High.

The eval reports and doesn't block. Use the level to:
- add a `risk:<level>` label to the PR;
- write the PR's **Risk** section: the level, the score and each signal. For **High**, also say what drives the score and whether the change could have been split into smaller PRs.

## In the PR

Add a **Review** section to the PR body:
- **Code review:** what was found and how each finding was fixed, or "no findings".
- **Security:** the checklist results and any accepted lower-severity items with their reason.

Add a **Risk** section with the pr-risk output, as above.
