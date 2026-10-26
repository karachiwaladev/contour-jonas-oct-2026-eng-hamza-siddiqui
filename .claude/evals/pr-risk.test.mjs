// Tests for the PR risk eval. Each test builds a throwaway git repo, makes a change on a
// branch and checks which risk signals fire and what level comes out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assess } from "./pr-risk.mjs";

const BASE_FILES = {
  "CLAUDE.md": "# Factory\n",
  "app/util.js": "export const twice = (n) => n * 2;\n",
  "app/a.js": 'import { twice } from "./util.js";\nexport const a = () => twice(1);\n',
  "app/b.js": 'import { twice } from "./util.js";\nexport const b = () => twice(2);\n',
  "app/c.js": 'import { twice } from "./util.js";\nexport const c = () => twice(3);\n',
  "app/db.js": "export const open = () => null;\n",
  "app/util.test.js": 'import { twice } from "./util.js";\n',
  "app/index.html": '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">\n',
  "app/package.json": '{ "name": "app", "type": "module" }\n',
  "other/x.js": "export const x = 1;\n",
};

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pr-risk-fixture-"));
  for (const [p, body] of Object.entries(BASE_FILES)) write(root, p, body);
  git(root, "init", "-q", "-b", "main");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "base");
  git(root, "switch", "-q", "-c", "feature");
  return root;
}
function git(root, ...args) {
  const r = spawnSync("git", ["-c", "user.email=eval@example.com", "-c", "user.name=eval", ...args], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
function write(root, p, body) {
  fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
  fs.writeFileSync(path.join(root, p), body);
}
const signal = (report, name) => report.signals.find((s) => s.name === name);

test("a docs and screenshot only change is low risk with no signals", () => {
  const root = repo();
  write(root, "CLAUDE.md", "# Factory\n\nMore docs.\n");
  write(root, "app/screenshots/shot.png", "PNG");
  const report = assess({ root });
  assert.equal(report.level, "low");
  assert.equal(report.score, 0);
});

test("a small change to one tested module stays low", () => {
  const root = repo();
  write(root, "app/util.js", "export const twice = (n) => n + n;\n");
  const report = assess({ root });
  assert.equal(report.level, "low");
  assert.equal(signal(report, "Source modules changed").points, 4);
  assert.equal(signal(report, "Changed modules no test imports"), undefined);
});

test("blast radius counts the modules that import a changed module", () => {
  const root = repo();
  write(root, "app/util.js", "export const twice = (n) => n + n;\n");
  const s = signal(assess({ root }), "Blast radius");
  assert.equal(s.points, 9);
  assert.match(s.detail, /app\/a\.js, app\/b\.js, app\/c\.js/);
});

test("changing the storage module is flagged", () => {
  const root = repo();
  write(root, "app/db.js", "export const open = () => indexedDB.open('x', 2);\n");
  assert.equal(signal(assess({ root }), "Storage or data layer changed").points, 10);
});

test("adding innerHTML and editing the CSP are flagged as security-sensitive", () => {
  const root = repo();
  write(root, "app/a.js", 'import { twice } from "./util.js";\nexport const a = (el, t) => { el.innerHTML = t; return twice(1); };\n');
  write(root, "app/index.html", "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src * 'unsafe-inline'\">\n");
  const report = assess({ root });
  assert.equal(signal(report, "Unsafe DOM or eval added").points, 10);
  assert.equal(signal(report, "Content-Security-Policy changed").points, 10);
});

test("a new dependency costs 10 points", () => {
  const root = repo();
  write(root, "app/package.json", '{ "name": "app", "type": "module", "dependencies": { "left-pad": "1.3.0" } }\n');
  const s = signal(assess({ root }), "New dependencies");
  assert.equal(s.points, 10);
  assert.match(s.detail, /left-pad/);
});

test("deleting a test file and a source file are both flagged", () => {
  const root = repo();
  fs.rmSync(path.join(root, "app/util.test.js"));
  fs.rmSync(path.join(root, "other/x.js"));
  const report = assess({ root });
  assert.equal(signal(report, "Test files deleted").points, 10);
  assert.equal(signal(report, "Source files deleted or renamed").points, 5);
});

test("touching the factory's guardrails is flagged", () => {
  const root = repo();
  write(root, ".github/workflows/test.yml", "on: push\n");
  assert.equal(signal(assess({ root }), "Factory guardrails changed").points, 20);
});

test("a wide change across projects is high risk", () => {
  const root = repo();
  for (const m of ["a", "b", "c", "util", "db"]) write(root, `app/${m}.js`, `export const ${m} = 1;\n`.repeat(40));
  write(root, "other/x.js", "export const x = 2;\n");
  write(root, "other/y.js", "export const y = 3;\n");
  const report = assess({ root });
  assert.equal(report.level, "high");
  assert.ok(signal(report, "Projects touched").points >= 15);
});

test("the root docs index alone does not count as another project", () => {
  const root = repo();
  write(root, "CLAUDE.md", "# Factory\n| app | ... |\n");
  write(root, "app/util.js", "export const twice = (n) => n + n;\n");
  assert.equal(signal(assess({ root }), "Projects touched"), undefined);
});

test("committed branch (--head) and working tree give the same score, and it is deterministic", () => {
  const root = repo();
  write(root, "app/util.js", "export const twice = (n) => n + n;\n");
  write(root, "app/new.js", 'import { twice } from "./util.js";\nexport const n = () => twice(4);\n');
  const tree1 = assess({ root });
  const tree2 = assess({ root });
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "change");
  const committed = assess({ root, head: "feature" });
  assert.deepEqual(tree2.signals, tree1.signals);
  assert.equal(committed.score, tree1.score);
  assert.deepEqual(committed.signals, tree1.signals);
});
