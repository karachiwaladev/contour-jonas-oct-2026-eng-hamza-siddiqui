#!/usr/bin/env node
// Eval: did the claimed unit tests really test something?
//
// It runs the same code twice, once without the claimed test files and once with them,
// and checks that coverage goes up. Both runs use Node's built-in coverage, so the result
// depends only on the code and the tests, never on what an agent says it did.
//
// For each claimed test file to pass, adding it to the other tests must either:
//   - call at least one function that wasn't called before, or
//   - cover new lines or branches in a module that was already loaded.
// Importing a module without calling anything, an empty test or `assert.ok(true)` gains
// neither, so it fails. All tests must also pass.
//
// Usage: node .claude/evals/test-coverage.mjs [--base main] [--claimed a.test.js,b.test.js] [--root .] [--json]
//   --claimed  the test files the agent says it wrote. Default: test files changed vs --base.
// Exit codes: 0 pass, 1 fail, 2 usage error.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_FILE = /\.test\.(c|m)?js$/;
const SKIP_DIRS = new Set(["node_modules", ".git", ".claude"]);

function parseArgs(argv) {
  const args = { base: "main", root: process.cwd(), claimed: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--json") args.json = true;
    else if (["--base", "--root", "--claimed"].includes(flag)) args[flag.slice(2)] = argv[++i];
    else throw new Error(`Unknown argument: ${flag}`);
  }
  args.root = path.resolve(args.root);
  if (typeof args.claimed === "string") {
    args.claimed = args.claimed.split(",").map((f) => f.trim()).filter(Boolean).map(normalize);
  }
  return args;
}

const normalize = (file) => file.split(path.sep).join("/");

// All test files under root, as root-relative paths with forward slashes.
function listTestFiles(root, dir = root) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listTestFiles(root, full));
    else if (TEST_FILE.test(entry.name)) found.push(normalize(path.relative(root, full)));
  }
  return found.sort();
}

// Test files this branch added or changed since it split from `base` (committed, uncommitted
// or untracked). Diffing from the merge-base ignores test files that changed on `base` itself.
function changedTestFiles(root, base) {
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  const mergeBase = git("merge-base", base, "HEAD");
  if (mergeBase.status !== 0) throw new Error(`No merge-base with ${base}: ${mergeBase.stderr.trim()}`);
  const diff = git("diff", "--name-only", mergeBase.stdout.trim(), "--");
  if (diff.status !== 0) throw new Error(`git diff against ${base} failed: ${diff.stderr.trim()}`);
  const untracked = git("ls-files", "--others", "--exclude-standard").stdout;
  return [...new Set(`${diff.stdout}\n${untracked}`.split("\n").map((f) => f.trim()))]
    .map(normalize)
    .filter((f) => TEST_FILE.test(f) && !f.split("/").some((p) => SKIP_DIRS.has(p)) && fs.existsSync(path.join(root, f)))
    .sort();
}

// Run the given test files with coverage. Returns the covered lines, taken branches and called
// functions of non-test source files, the set of loaded source files, and whether tests passed.
function coverage(root, files) {
  // `untaken` counts not-taken branches per "file:line". V8 drops a branch's entry once it runs
  // rather than adding one, so newly covered branches show up as untaken counts going down.
  const result = { lines: new Set(), untaken: new Map(), functions: new Set(), files: new Set(), passed: true, output: "" };
  if (files.length === 0) return result;
  const lcov = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cov-eval-")), "out.lcov");
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // so this works when the eval itself runs under node --test
  const run = spawnSync(
    process.execPath,
    ["--test", "--experimental-test-coverage", "--test-reporter=lcov", `--test-reporter-destination=${lcov}`,
      "--test-reporter=spec", "--test-reporter-destination=stdout", ...files],
    { cwd: root, encoding: "utf8", env }
  );
  result.passed = run.status === 0;
  result.output = `${run.stdout}${run.stderr}`;
  if (fs.existsSync(lcov)) addLcov(result, root, fs.readFileSync(lcov, "utf8"));
  return result;
}

function addLcov(result, root, text) {
  let file = null;
  const fnLine = new Map();
  for (const line of text.split(/\r?\n/)) {
    const [tag, value = ""] = line.split(/:(.*)/s);
    if (tag === "SF") {
      const rel = normalize(path.relative(root, path.resolve(root, value)));
      const isSource = !TEST_FILE.test(rel) && !rel.startsWith("..") && !rel.split("/").some((p) => SKIP_DIRS.has(p));
      file = isSource ? rel : null;
      fnLine.clear();
      if (file) result.files.add(file);
    } else if (!file) {
      continue;
    } else if (tag === "FN") {
      const [lineNo, name] = value.split(/,(.*)/s);
      fnLine.set(name, lineNo);
    } else if (tag === "FNDA") {
      const [count, name] = value.split(/,(.*)/s);
      if (Number(count) > 0) result.functions.add(`${file}:${fnLine.get(name) ?? "?"}:${name}`);
    } else if (tag === "DA") {
      const [lineNo, count] = value.split(",");
      if (Number(count) > 0) result.lines.add(`${file}:${lineNo}`);
    } else if (tag === "BRDA") {
      const [lineNo, , , taken] = value.split(",");
      const key = `${file}:${lineNo}`;
      if (Number(taken) === 0) result.untaken.set(key, (result.untaken.get(key) ?? 0) + 1);
    }
  }
}

const minus = (a, b) => [...a].filter((x) => !b.has(x));

// What `after` covers that `before` doesn't. Lines and branches only count when their module
// was already loaded before, so the code that merely importing a module runs doesn't count.
function gain(after, before) {
  const loaded = (key) => before.files.has(key.slice(0, key.lastIndexOf(":")));
  const functions = minus(after.functions, before.functions);
  const lines = minus(after.lines, before.lines);
  const realLines = lines.filter(loaded);
  const realBranches = [...before.untaken]
    .filter(([key, count]) => loaded(key) && (after.untaken.get(key) ?? 0) < count)
    .map(([key]) => key);
  const added = functions.length > 0 || realLines.length > 0 || realBranches.length > 0;
  return { functions, lines, realLines, realBranches, added };
}

export function evaluate({ root, base = "main", claimed = null }) {
  const all = listTestFiles(root);
  const claimedFiles = claimed ?? changedTestFiles(root, base);
  const report = { root, claimed: claimedFiles, checks: [], pass: true };
  const check = (name, ok, detail) => {
    report.checks.push({ name, ok, detail });
    if (!ok) report.pass = false;
  };

  if (claimedFiles.length === 0) {
    check("claimed tests", true, "No test files claimed or changed, so there is nothing to evaluate.");
    return report;
  }
  const missing = claimedFiles.filter((f) => !fs.existsSync(path.join(root, f)));
  check("claimed files exist", missing.length === 0, missing.length ? `Missing: ${missing.join(", ")}` : `${claimedFiles.length} file(s)`);
  if (missing.length) return report;

  const suite = [...new Set([...all, ...claimedFiles])].sort();
  const baseline = suite.filter((f) => !claimedFiles.includes(f));
  const before = coverage(root, baseline);
  const after = coverage(root, suite);
  check("all tests pass", after.passed, after.passed ? `${suite.length} test file(s)` : lastLines(after.output));

  const total = gain(after, before);
  report.coverage = {
    before: { lines: before.lines.size, functions: before.functions.size },
    after: { lines: after.lines.size, functions: after.functions.size },
  };
  check("claimed tests add coverage", total.added,
    `+${total.functions.length} function(s), +${total.lines.length} line(s) (${before.lines.size} -> ${after.lines.size} lines)`);

  // Each claimed file must add coverage on its own, on top of the non-claimed tests.
  for (const file of claimedFiles) {
    const withFile = coverage(root, [...baseline, file].sort());
    const own = gain(withFile, before);
    check(`${file} adds coverage`, own.added && withFile.passed,
      !withFile.passed ? `Its tests fail.\n${lastLines(withFile.output)}`
        : own.added ? `+${own.functions.length} function(s), +${own.realLines.length} line(s), +${own.realBranches.length} branch(es) in loaded code${own.functions.length ? `: ${own.functions.slice(0, 5).map(shortFn).join(", ")}${own.functions.length > 5 ? ", ..." : ""}` : ""}`
        : "Calls no function and covers no new line, so it doesn't really test anything.");
  }
  return report;
}

const shortFn = (key) => { const [file, , name] = key.split(":"); return `${name} (${file})`; };
const lastLines = (text) => text.trim().split("\n").slice(-8).join("\n");

function printReport(report) {
  console.log(`Test coverage eval: ${report.pass ? "PASS" : "FAIL"}`);
  for (const c of report.checks) console.log(`  ${c.ok ? "ok  " : "FAIL"} ${c.name}: ${c.detail}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const report = evaluate(args);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
  process.exit(report.pass ? 0 : 1);
}
