#!/usr/bin/env node
// Guard: may this factory branch become a pull request?
//
// A poisoned ticket can try to get its payload into the repo instead of into
// the agent: a change to the factory's own guardrails, instructions planted in
// a CLAUDE.md for the next agent to read, code that phones home, an install
// script, a secret. This checks the branch's diff against the base for those,
// using only git. Unlike pr-risk it blocks: any "block" finding exits 1.
// "confirm" findings (code that deletes stored data or sends messages out)
// don't fail, but the loop must get a human's "confirm" on the issue first.
//
// Usage: node .claude/guards/pr-guard.mjs [--base main] [--head HEAD] [--root .] [--json]
// Exit codes: 0 ok, 1 blocked, 2 usage or git error.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RULES, worst } from "./patterns.mjs";

// Paths a ticket branch must never touch: the factory itself, CI, tooling config,
// and every root-level file except the CLAUDE.md index.
const PROTECTED = [/^\.claude\//, /^\.github\//, /^\.vscode\//, /^\.devcontainer\//, /^\.husky\//, /^\.git[^/]*$/, /^\.mcp\.json$/, /(^|\/)\.npmrc$/];
const IMAGE = /\.(png|jpe?g|gif|webp|ico)$/i;
const CODE = /\.((c|m)?js|html?|css|svg)$/i;
const TEXT = /\.((c|m)?js|html?|css|svg|md|json|txt|ya?ml)$/i;
const MAX_BYTES = 2 * 1024 * 1024;
const BLOCK_RULES = RULES.filter((r) => r.level === "block" && r.id !== "guardrail-files");

const CODE_CHECKS = [
  { id: "external-url", level: "block", re: /\b(https?|wss?):\/\/(?!localhost\b|127\.0\.0\.1\b|www\.w3\.org\/)/i, why: "code loads or calls an outside address" },
  { id: "beacon-socket", level: "block", re: /\bsendBeacon\b|\bnew\s+WebSocket\b|\bnew\s+EventSource\b/, why: "code opens a channel out of the page" },
  { id: "code-from-strings", level: "block", re: /\beval\s*\(|\bnew\s+Function\s*\(|\bsetTimeout\s*\(\s*['"`]|\bsetInterval\s*\(\s*['"`]/, why: "code built from strings" },
  { id: "obfuscation", level: "block", re: /\batob\s*\(|String\.fromCharCode\s*\((\s*\d+\s*,){5,}|(\\x[0-9a-f]{2}){8,}|[A-Za-z0-9+/]{200,}={0,2}/i, why: "obfuscated or encoded payload" },
  { id: "network-call", level: "warn", re: /\bfetch\s*\(|\bXMLHttpRequest\b/, why: "network call (same-origin is fine; check where it goes)" },
  { id: "destroy-data", level: "confirm", re: /\bdeleteDatabase\b|\bdeleteObjectStore\b|\bDROP\s+(TABLE|DATABASE)\b|\bTRUNCATE\b|\blocalStorage\.clear\b|\bstore\.clear\s*\(/i, why: "deletes stored data" },
];
const SECRET = /(api[_-]?key|secret|token|passw(or)?d)\s*[:=]\s*['"][^'"\s]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY|\bgh[pousr]_[A-Za-z0-9]{30,}|github_pat_\w{20,}|\bsk-[A-Za-z0-9_-]{20,}|\bAKIA[0-9A-Z]{16}\b/;

// files: [{ path, status: "A"|"M"|"D"|"R", added: [lines], removed: [lines], binary, size }]
export function check(files) {
  const findings = [];
  const add = (file, id, level, why, line) => findings.push({ path: file.path, id, level, why, ...(line != null ? { line: trim(line) } : {}) });

  for (const f of files) {
    if (PROTECTED.some((re) => re.test(f.path)) || (!f.path.includes("/") && f.path !== "CLAUDE.md")) {
      add(f, "protected-path", "block", "a ticket branch may not change the factory, CI, tooling or root files");
      continue;
    }
    if (f.status === "D" || f.status === "R") add(f, "removes-file", "confirm", "deletes or renames an existing file");
    if (f.binary) {
      if (!IMAGE.test(f.path)) add(f, "binary", "block", "binary file that isn't an image");
      if (f.size > MAX_BYTES) add(f, "too-large", "block", `file is ${f.size} bytes`);
      continue;
    }
    if (f.size > MAX_BYTES) add(f, "too-large", "block", `file is ${f.size} bytes`);

    // The root index is loaded into every agent's context: only table rows may change there.
    if (f.path === "CLAUDE.md") {
      for (const line of [...f.added, ...f.removed]) {
        if (line.trim() && !line.trim().startsWith("|")) add(f, "index-prose", "block", "the root CLAUDE.md may only change project index rows", line);
      }
    }

    for (const line of f.added) {
      for (const rule of BLOCK_RULES) {
        if (rule.re.test(line)) add(f, `planted-${rule.id}`, "block", "text that tries to instruct an agent or reach a secret", line);
      }
      if (SECRET.test(line)) add(f, "secret", "block", "looks like a real secret", line);
      if (CODE.test(f.path)) {
        for (const c of CODE_CHECKS) if (c.re.test(line)) add(f, c.id, c.level, c.why, line);
        if (/Content-Security-Policy/i.test(line) && /unsafe-(inline|eval)|\*/.test(line)) add(f, "weak-csp", "block", "CSP allows inline code, eval or any source", line);
      }
    }
    if (/(^|\/)package\.json$/.test(f.path)) {
      for (const line of f.added) {
        if (/"(pre|post)?install"\s*:|"prepare"\s*:|"prepublish\w*"\s*:/.test(line)) add(f, "install-script", "block", "an install script runs code on npm install", line);
        if (/"(dependencies|devDependencies|optionalDependencies|peerDependencies)"\s*:/.test(line)) add(f, "new-dependencies", "block", "new dependencies need a human's sign-off", line);
      }
    }
    if (/\.html?$/i.test(f.path) && f.removed.some((l) => /Content-Security-Policy/i.test(l)) && !f.added.some((l) => /Content-Security-Policy/i.test(l))) {
      add(f, "csp-removed", "block", "removes the Content-Security-Policy");
    }
  }
  return { level: worst(findings), findings };
}

function trim(s) {
  const flat = s.trim();
  return flat.length > 100 ? `${flat.slice(0, 97)}...` : flat;
}

function git(root, ...args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.trim()}`);
  return r.stdout;
}

// Read the branch's diff into the shape check() takes.
export function collect(root, base, head) {
  const mergeBase = git(root, "merge-base", base, head).trim();
  const range = `${mergeBase}..${head}`;
  const files = new Map();
  for (const line of git(root, "diff", "--name-status", "-M", range, "--").split("\n").filter(Boolean)) {
    const [status, ...paths] = line.split("\t");
    const p = paths.at(-1);
    files.set(p, { path: p, status: status[0], added: [], removed: [], binary: false, size: 0 });
  }
  for (const line of git(root, "diff", "--numstat", "-M", range, "--").split("\n").filter(Boolean)) {
    const [a, , ...rest] = line.split("\t");
    const p = rest.join("\t").replace(/^.*=> /, "").replace(/[{}]/g, "");
    const f = files.get(p) ?? [...files.values()].find((x) => p.endsWith(x.path));
    if (f && a === "-") f.binary = true;
  }
  let current = null;
  for (const line of git(root, "diff", "-U0", "--no-color", "-M", range, "--").split("\n")) {
    if (line.startsWith("+++ ")) current = files.get(line.slice(4).replace(/^b\//, "")) ?? null;
    else if (!current || line.startsWith("--- ")) continue;
    else if (line.startsWith("+")) current.added.push(line.slice(1));
    else if (line.startsWith("-")) current.removed.push(line.slice(1));
  }
  for (const f of files.values()) {
    if (f.status !== "D") f.size = Number(git(root, "cat-file", "-s", `${head}:${f.path}`).trim()) || 0;
  }
  return [...files.values()];
}

function main(argv) {
  const args = { base: "main", head: "HEAD", root: process.cwd(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--json") args.json = true;
    else if (["--base", "--head", "--root"].includes(flag)) args[flag.slice(2)] = argv[++i];
    else throw new Error(`Unknown argument: ${flag}`);
  }
  const report = check(collect(path.resolve(args.root), args.base, args.head));
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`PR guard: ${report.level === "block" ? "BLOCKED" : report.level.toUpperCase()} (${args.base}...${args.head})`);
    for (const f of report.findings) console.log(`  [${f.level}] ${f.path}: ${f.id} - ${f.why}${f.line ? `\n      ${f.line}` : ""}`);
    if (report.level === "confirm") console.log("  A trusted human must reply \"confirm\" on the issue before this PR is opened.");
  }
  return report.level === "block" ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 2;
  }
}
