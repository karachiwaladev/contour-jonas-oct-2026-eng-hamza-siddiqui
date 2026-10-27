#!/usr/bin/env node
// Runs persona specs through quicke2e, with Jev picking each click.
//   node .claude/skills/persona-test/jev/run-jev.mjs --base http://localhost:8090 --out <run folder> <spec.mjs>...
//   node .claude/skills/persona-test/jev/run-jev.mjs --check <spec.mjs>...   (validate only, no key)
// One quicke2e process per spec file (one per persona), all in parallel. Each run gets its own
// browser context, so personas never share storage. The key comes from JEV_API_KEY in the repo's
// .env, read here so no shell command ever names that file. It is never printed.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "node_modules", "quicke2e", "bin", "quicke2e.mjs");

// quicke2e's jev engine reads OPENROUTER_API_KEY; the factory keeps the key as JEV_API_KEY.
export function childEnv(env) {
  const out = { ...env };
  if (!out.OPENROUTER_API_KEY && out.JEV_API_KEY) out.OPENROUTER_API_KEY = out.JEV_API_KEY;
  return out;
}

// With --json, the last stdout line is the array of run records.
export function parseRecords(stdout) {
  const last = stdout.trim().split("\n").pop() || "";
  try {
    const recs = JSON.parse(last);
    return Array.isArray(recs) ? recs : [];
  } catch {
    return [];
  }
}

// One line per persona: how many flows passed, why the rest stopped, cost and time.
export function summarize(name, records) {
  const passed = records.filter((r) => r.passed).length;
  const failed = records.filter((r) => !r.passed).map((r) => `${r.flow} ${r.outcome}`);
  const cost = records.reduce((s, r) => s + (r.cost || 0), 0);
  const secs = Math.max(0, ...records.map((r) => r.wallMs || 0)) / 1000;
  return `${name}: ${passed}/${records.length} passed, $${cost.toFixed(4)}, longest ${secs.toFixed(1)}s`
    + (failed.length ? `\n  failed: ${failed.join(", ")}` : "");
}

export function parseArgs(argv) {
  const opts = { base: "http://localhost:8090", out: null, check: false, specs: [], extra: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") opts.check = true;
    else if (a === "--base") opts.base = argv[++i];
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--runs" || a === "--only") opts.extra.push(a, argv[++i]);
    else if (a === "--emit") opts.extra.push(a, argv[++i]);
    else if (a.startsWith("--")) throw new Error(`unknown flag ${a}`);
    else opts.specs.push(a);
  }
  if (!opts.out && !opts.check) throw new Error("--out <run folder> is required");
  if (!opts.specs.length) throw new Error("give at least one spec file");
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(opts.base)) throw new Error("--base must be a localhost URL");
  return opts;
}

function loadKey() {
  const root = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).stdout.trim();
  const file = path.join(root || process.cwd(), ".env");
  if (fs.existsSync(file)) process.loadEnvFile(file);
  return childEnv(process.env);
}

function runSpec(spec, opts, env) {
  const name = path.basename(spec).replace(/\.spec\.mjs$|\.mjs$/, "");
  const args = [CLI, "run", path.resolve(spec), "--base", opts.base, "--json", "--headless",
    "--trace", path.join(opts.out, "trace", name), ...opts.extra];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      fs.writeFileSync(path.join(opts.out, `${name}.log`), stdout + stderr);
      const records = parseRecords(stdout);
      fs.writeFileSync(path.join(opts.out, `${name}.json`), JSON.stringify(records, null, 2));
      resolve({ name, code, records, tail: (stdout + stderr).trim().split("\n").slice(-3).join("\n") });
    });
  });
}

async function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`run-jev: ${e.message}`); process.exit(2); }
  if (!fs.existsSync(CLI)) {
    console.error(`run-jev: quicke2e is not installed. Run: npm ci --prefix ${path.relative(process.cwd(), HERE)}`);
    process.exit(2);
  }
  // --check validates the specs (schema, WEAK_ASSERTION) with no model call and no key.
  if (opts.check) {
    let worst = 0;
    for (const s of opts.specs) {
      const args = [CLI, "check", path.resolve(s), "--base", opts.base, "--headless"];
      worst = Math.max(worst, spawnSync(process.execPath, args, { stdio: "inherit" }).status ?? 1);
    }
    process.exit(worst);
  }
  const env = loadKey();
  if (!env.OPENROUTER_API_KEY) { console.error("run-jev: set JEV_API_KEY in the repo's .env"); process.exit(2); }
  fs.mkdirSync(opts.out, { recursive: true });

  const results = await Promise.all(opts.specs.map((s) => runSpec(s, opts, env)));
  let worst = 0;
  for (const r of results) {
    console.log(r.records.length ? summarize(r.name, r.records) : `${r.name}: no records (exit ${r.code})\n  ${r.tail}`);
    worst = Math.max(worst, r.code ?? 1);
  }
  console.log(`records: ${path.join(opts.out, "<persona>.json")}`);
  process.exit(worst);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
