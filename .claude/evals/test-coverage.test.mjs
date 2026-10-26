// Tests for the test-coverage eval. Each test builds a tiny project in a temp folder and
// checks that real tests pass the eval while fake ones (empty, import-only, always-true,
// failing, missing) are caught.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { evaluate } from "./test-coverage.mjs";

const HEADER = 'import { test } from "node:test";\nimport assert from "node:assert/strict";\n';

const FILES = {
  "calc.mjs": "export const add = (a, b) => a + b;\nexport function sub(a, b) {\n  return a - b;\n}\nexport function abs(n) {\n  if (n < 0) return -n;\n  return n;\n}\n",
  "add.test.mjs": `${HEADER}import { add } from "./calc.mjs";\ntest("add", () => assert.equal(add(1, 2), 3));\n`,
  "sub.test.mjs": `${HEADER}import { sub } from "./calc.mjs";\ntest("sub", () => assert.equal(sub(3, 1), 2));\n`,
  "abs-positive.test.mjs": `${HEADER}import { abs } from "./calc.mjs";\ntest("abs of a positive", () => assert.equal(abs(2), 2));\n`,
  "abs-negative.test.mjs": `${HEADER}import { abs } from "./calc.mjs";\ntest("abs of a negative", () => assert.equal(abs(-2), 2));\n`,
  "empty.test.mjs": `${HEADER}test("nothing", () => {});\n`,
  "always-true.test.mjs": `${HEADER}test("trivially true", () => assert.ok(true));\n`,
  "import-only.test.mjs": `${HEADER}import "./calc.mjs";\ntest("module loads", () => {});\n`,
  "failing.test.mjs": `${HEADER}import { sub } from "./calc.mjs";\ntest("wrong", () => assert.equal(sub(3, 1), 99));\n`,
};

// A temp project holding calc.mjs plus the chosen test files.
function project(testFiles) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cov-eval-fixture-"));
  for (const name of ["calc.mjs", ...testFiles]) fs.writeFileSync(path.join(root, name), FILES[name]);
  return root;
}

const run = (present, claimed) => evaluate({ root: project(present), claimed });
const failed = (report) => report.checks.filter((c) => !c.ok).map((c) => c.name);

test("a real test that calls new code passes", () => {
  const report = run(["add.test.mjs"], ["add.test.mjs"]);
  assert.equal(report.pass, true, JSON.stringify(report.checks));
  assert.ok(report.coverage.after.functions > report.coverage.before.functions);
});

test("a real test passes on top of existing tests", () => {
  assert.equal(run(["add.test.mjs", "sub.test.mjs"], ["sub.test.mjs"]).pass, true);
});

test("a new test that only covers a new branch of an already-tested function passes", () => {
  assert.equal(run(["abs-positive.test.mjs", "abs-negative.test.mjs"], ["abs-negative.test.mjs"]).pass, true);
});

test("an empty test fails", () => {
  const report = run(["add.test.mjs", "empty.test.mjs"], ["empty.test.mjs"]);
  assert.equal(report.pass, false);
  assert.ok(failed(report).includes("empty.test.mjs adds coverage"));
});

test("an always-true assertion fails", () => {
  assert.equal(run(["always-true.test.mjs"], ["always-true.test.mjs"]).pass, false);
});

test("importing the module without calling anything fails", () => {
  assert.equal(run(["import-only.test.mjs"], ["import-only.test.mjs"]).pass, false);
});

test("re-claiming a test that only repeats existing coverage fails", () => {
  const root = project(["add.test.mjs"]);
  fs.writeFileSync(path.join(root, "add-again.test.mjs"), FILES["add.test.mjs"]);
  assert.equal(evaluate({ root, claimed: ["add-again.test.mjs"] }).pass, false);
});

test("one fake file among real ones fails, and names the fake", () => {
  const report = run(["add.test.mjs", "empty.test.mjs"], ["add.test.mjs", "empty.test.mjs"]);
  assert.equal(report.pass, false);
  assert.deepEqual(failed(report), ["empty.test.mjs adds coverage"]);
});

test("failing tests fail the eval", () => {
  const report = run(["failing.test.mjs"], ["failing.test.mjs"]);
  assert.equal(report.pass, false);
  assert.ok(failed(report).includes("all tests pass"));
});

test("a claimed file that doesn't exist fails", () => {
  const report = run(["add.test.mjs"], ["ghost.test.mjs"]);
  assert.equal(report.pass, false);
  assert.deepEqual(failed(report), ["claimed files exist"]);
});

test("without --claimed, it evaluates test files changed since the base, ignoring .claude/", () => {
  const root = project([]);
  const git = (...a) => spawnSync("git", ["-c", "user.email=eval@example.com", "-c", "user.name=eval", ...a], { cwd: root });
  git("init", "-q");
  git("add", ".");
  git("commit", "-q", "-m", "base");
  fs.writeFileSync(path.join(root, "add.test.mjs"), FILES["add.test.mjs"]);
  fs.mkdirSync(path.join(root, ".claude"));
  fs.writeFileSync(path.join(root, ".claude", "tool.test.mjs"), FILES["empty.test.mjs"]);
  const report = evaluate({ root, base: "HEAD" });
  assert.deepEqual(report.claimed, ["add.test.mjs"]);
  assert.equal(report.pass, true, JSON.stringify(report.checks));
});

test("claiming no tests passes with nothing to evaluate", () => {
  assert.equal(run(["add.test.mjs"], []).pass, true);
});
