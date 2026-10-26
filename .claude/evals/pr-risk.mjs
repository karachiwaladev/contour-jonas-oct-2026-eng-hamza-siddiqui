#!/usr/bin/env node
// Eval: how risky is this pull request?
//
// Scores the branch's changes against the base, using only facts from git and the code:
// how many modules changed, how many lines, how many projects, how many other modules
// import the changed ones, and whether storage, security, dependencies, the factory's own
// guardrails or tests are touched. The same diff always gives the same score.
//
// Usage: node .claude/evals/pr-risk.mjs [--base main] [--head <ref>] [--root .] [--json] [--fail-on medium|high]
//   --head     score base..head. Default: the working tree (committed + uncommitted + untracked).
//   --fail-on  exit 1 when the level is at or above this. Default: never fail (report only).
// Exit codes: 0 ok, 1 risk at or above --fail-on, 2 usage error.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const LEVELS = [
  { name: "low", min: 0 },
  { name: "medium", min: 25 },
  { name: "high", min: 50 },
];

const TEST_FILE = /\.test\.(c|m)?js$/;
const MODULE = /\.(c|m)?js$/;
const CODE = /\.((c|m)?js|html|css)$/;
const STORAGE = /(^|\/)(db|storage|store|schema|migrations?)[^/]*\.(c|m)?js$/;
const UNSAFE_SINK = /\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write|\beval\s*\(|new Function\b/;
const FACTORY = /^(\.claude|\.github)\//;

function parseArgs(argv) {
  const args = { base: "main", head: null, root: process.cwd(), json: false, failOn: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--json") args.json = true;
    else if (flag === "--fail-on") args.failOn = argv[++i];
    else if (["--base", "--head", "--root"].includes(flag)) args[flag.slice(2)] = argv[++i];
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (args.failOn && !LEVELS.some((l) => l.name === args.failOn)) throw new Error(`--fail-on must be one of ${LEVELS.map((l) => l.name).join(", ")}`);
  args.root = path.resolve(args.root);
  return args;
}

function gitRunner(root) {
  return (...a) => {
    const r = spawnSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`git ${a.join(" ")} failed: ${r.stderr.trim()}`);
    return r.stdout;
  };
}

// The changed files, their line counts and statuses, plus a way to read any file before and after.
function collectDiff(root, base, head) {
  const git = gitRunner(root);
  const mergeBase = git("merge-base", base, head ?? "HEAD").trim();
  const range = head ? [`${mergeBase}..${head}`] : [mergeBase];
  const files = new Map();
  const entry = (p) => files.get(p) ?? files.set(p, { path: p, status: "M", added: 0, deleted: 0 }).get(p);

  for (const line of git("diff", "--name-status", "-M", ...range, "--").split("\n").filter(Boolean)) {
    const [status, a, b] = line.split("\t");
    const e = entry(b ?? a);
    e.status = status[0];
    if (b) e.from = a;
  }
  for (const line of git("diff", "--numstat", "-M", ...range, "--").split("\n").filter(Boolean)) {
    const [added, deleted, ...rest] = line.split("\t");
    const name = rest.join("\t");
    const target = name.includes("=>") ? renameTarget(name) : name;
    const e = entry(target);
    e.added = added === "-" ? 0 : Number(added);
    e.deleted = deleted === "-" ? 0 : Number(deleted);
  }
  if (!head) {
    for (const p of git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean)) {
      const e = entry(p);
      e.status = "A";
      e.added = isText(p) ? fs.readFileSync(path.join(root, p), "utf8").split("\n").length : 0;
    }
  }

  const addedLines = (p) => {
    const e = files.get(p);
    if (e?.status === "A" && !head) return fs.readFileSync(path.join(root, p), "utf8").split("\n");
    return git("diff", "-U0", ...range, "--", p).split("\n").filter((l) => /^[+-][^+-]/.test(l) || /^[+-]$/.test(l));
  };
  const readAfter = (p) => (head ? show(git, `${head}:${p}`) : readFile(root, p));
  const readBefore = (p) => show(git, `${mergeBase}:${p}`);
  const listAfter = () => (head ? git("ls-tree", "-r", "--name-only", head) : git("ls-files", "--cached", "--others", "--exclude-standard"))
    .split("\n").filter(Boolean).filter((p) => !head ? fs.existsSync(path.join(root, p)) : true);
  const sorted = [...files.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { mergeBase, files: sorted, addedLines, readAfter, readBefore, listAfter };
}

const renameTarget = (name) => name.replace(/\{([^}]*) => ([^}]*)\}/, "$2").replace(/^.* => /, "").replace(/\/\//g, "/");
const isText = (p) => CODE.test(p) || /\.(md|json|txt|yml|yaml)$/.test(p);
const readFile = (root, p) => { try { return fs.readFileSync(path.join(root, p), "utf8"); } catch { return null; } };
const show = (git, spec) => { try { return git("show", spec); } catch { return null; } };

const projectOf = (p) => {
  if (FACTORY.test(p)) return null;
  const parts = p.split("/");
  if (parts.length === 1) return "(root)";
  return parts[0] === "projects" && parts.length > 2 ? `projects/${parts[1]}` : parts[0];
};

// Relative imports in a module, resolved to repo paths.
function importsOf(file, source) {
  const found = new Set();
  for (const m of source.matchAll(/(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec.startsWith(".")) found.add(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)));
  }
  return found;
}

const deps = (json) => { try { const p = JSON.parse(json); return new Set(Object.keys({ ...p.dependencies, ...p.devDependencies, ...p.peerDependencies })); } catch { return new Set(); } };

export function assess({ root, base = "main", head = null }) {
  const diff = collectDiff(root, base, head);
  const files = diff.files.filter((f) => !f.path.startsWith(".claude/logs/"));
  const signals = [];
  const add = (name, points, detail) => { if (points > 0) signals.push({ name, points, detail }); };

  const isSource = (f) => !FACTORY.test(f.path) && !TEST_FILE.test(f.path);
  const modules = files.filter((f) => isSource(f) && MODULE.test(f.path));
  const changedModules = modules.filter((f) => f.status !== "D");
  add("Source modules changed", Math.min(40, 4 * changedModules.length),
    `${changedModules.length}: ${changedModules.map((f) => `${f.path} (${f.status})`).join(", ")}`);

  const codeLines = files.filter((f) => isSource(f) && CODE.test(f.path)).reduce((n, f) => n + f.added + f.deleted, 0);
  add("Code lines changed", Math.min(25, Math.floor(codeLines / 25)), `${codeLines} line(s) added or removed in source code`);

  // Only code and config count towards projects: docs and screenshots (like the root index row
  // every ticket updates) don't make a change cross-project.
  const projects = [...new Set(files.filter((f) => CODE.test(f.path) || /(^|\/)package\.json$/.test(f.path))
    .map((f) => projectOf(f.path)).filter(Boolean))].sort();
  add("Projects touched", 15 * Math.max(0, projects.length - 1), projects.join(", "));

  // Blast radius: how many other modules import a changed (not new) module.
  const allModules = [...new Set(diff.listAfter())].sort()
    .filter((p) => MODULE.test(p) && !FACTORY.test(p) && !p.split("/").includes("node_modules"));
  const importers = new Map();
  for (const file of allModules) {
    const source = diff.readAfter(file);
    if (source == null) continue;
    for (const target of importsOf(file, source)) importers.set(target, [...(importers.get(target) ?? []), file]);
  }
  const radius = changedModules.filter((f) => f.status !== "A")
    .map((f) => ({ path: f.path, by: (importers.get(f.path) ?? []).filter((p) => !TEST_FILE.test(p) && p !== f.path) }))
    .filter((r) => r.by.length);
  const radiusCount = radius.reduce((n, r) => n + r.by.length, 0);
  add("Blast radius", Math.min(20, 3 * radiusCount), radius.map((r) => `${r.path} is imported by ${r.by.join(", ")}`).join("; "));

  const storage = changedModules.filter((f) => STORAGE.test(f.path));
  add("Storage or data layer changed", storage.length ? 10 : 0, storage.map((f) => f.path).join(", "));

  const cspChanged = files.some((f) => /\.html$/.test(f.path) && diff.addedLines(f.path).some((l) => /Content-Security-Policy/i.test(l)));
  add("Content-Security-Policy changed", cspChanged ? 10 : 0, "a CSP <meta> line was added, removed or edited");
  const sinks = files.filter((f) => isSource(f) && CODE.test(f.path) && f.status !== "D")
    .filter((f) => diff.addedLines(f.path).some((l) => !l.startsWith("-") && UNSAFE_SINK.test(l)));
  add("Unsafe DOM or eval added", sinks.length ? 10 : 0, sinks.map((f) => f.path).join(", "));

  const newDeps = files.filter((f) => /(^|\/)package\.json$/.test(f.path) && f.status !== "D").flatMap((f) => {
    const before = deps(diff.readBefore(f.path) ?? "{}");
    return [...deps(diff.readAfter(f.path) ?? "{}")].filter((d) => !before.has(d)).map((d) => `${d} (${f.path})`);
  });
  add("New dependencies", 10 * newDeps.length, newDeps.join(", "));

  const factory = files.filter((f) => FACTORY.test(f.path));
  add("Factory guardrails changed", factory.length ? 20 : 0, factory.map((f) => f.path).join(", "));

  const removed = modules.filter((f) => f.status === "D" || f.status === "R");
  add("Source files deleted or renamed", 5 * removed.length, removed.map((f) => (f.from ? `${f.from} -> ${f.path}` : f.path)).join(", "));

  const deletedTests = files.filter((f) => TEST_FILE.test(f.path) && f.status === "D");
  add("Test files deleted", 10 * deletedTests.length, deletedTests.map((f) => f.path).join(", "));

  const tested = new Set(allModules.filter((p) => TEST_FILE.test(p)).flatMap((t) => [...importsOf(t, diff.readAfter(t) ?? "")]));
  const untested = changedModules.filter((f) => !tested.has(f.path));
  add("Changed modules no test imports", Math.min(15, 3 * untested.length), untested.map((f) => f.path).join(", "));

  const score = signals.reduce((n, s) => n + s.points, 0);
  const level = [...LEVELS].reverse().find((l) => score >= l.min).name;
  return {
    base, head: head ?? "working tree", mergeBase: diff.mergeBase, score, level, signals,
    summary: { files: files.length, modules: changedModules.length, codeLines, projects },
  };
}

function printReport(r) {
  console.log(`PR risk: ${r.level.toUpperCase()} (score ${r.score}; low < 25 <= medium < 50 <= high)`);
  console.log(`  ${r.summary.files} file(s), ${r.summary.modules} module(s), ${r.summary.codeLines} code line(s), project(s): ${r.summary.projects.join(", ") || "none"}`);
  for (const s of r.signals) console.log(`  +${String(s.points).padStart(2)}  ${s.name}: ${s.detail}`);
  if (!r.signals.length) console.log("  No risk signals.");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
if (isMain) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const report = assess(args);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
  const rank = (name) => LEVELS.findIndex((l) => l.name === name);
  process.exit(args.failOn && rank(report.level) >= rank(args.failOn) ? 1 : 0);
}
