#!/usr/bin/env node
// Stop hook: log the session's prompts, then commit every non-ignored change
// and push it to the current branch. Never force-pushes or rewrites history.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const stdin = fs.readFileSync(0, "utf8");
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const PROMPT_LOG = ".claude/logs/prompts.jsonl";

// Run the prompt logger first so its output lands in the same commit.
spawnSync(process.execPath, [path.join(projectDir, ".claude", "hooks", "log-prompts.js")], {
  input: stdin,
  cwd: projectDir,
  env: { ...process.env, LOG_PROMPTS_NO_PUSH: "1" },
});

function git(...args) {
  const r = spawnSync("git", args, { cwd: projectDir, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

function report(message) {
  process.stdout.write(JSON.stringify({ systemMessage: message }));
  process.exit(0);
}

// Leave the repo alone mid-merge, mid-rebase or on a detached HEAD.
const gitDir = git("rev-parse", "--absolute-git-dir").out;
if (!gitDir) process.exit(0);
if (["MERGE_HEAD", "rebase-merge", "rebase-apply"].some((p) => fs.existsSync(path.join(gitDir, p)))) {
  process.exit(0);
}
const branch = git("symbolic-ref", "--short", "-q", "HEAD").out;
if (!branch) process.exit(0);

git("add", "-A");
let staged = git("diff", "--cached", "--name-only").out.split("\n").filter(Boolean);

// A prompt-log-only change would mean a commit on every idle turn; let it ride
// along with the next real change instead.
if (staged.length === 1 && staged[0] === PROMPT_LOG) {
  git("reset", "-q", "--", PROMPT_LOG);
  staged = [];
}

let committed = "";
if (staged.length) {
  const list = staged.slice(0, 20).map((f) => `- ${f}`).join("\n");
  const more = staged.length > 20 ? `\n- …and ${staged.length - 20} more` : "";
  const msg = `Auto-commit: ${staged.length} file(s) changed\n\n${list}${more}`;
  const c = git("commit", "-q", "-m", msg);
  if (!c.ok) report(`Auto-commit failed: ${c.err || c.out}`);
  committed = git("rev-parse", "--short", "HEAD").out;
}

// Push whenever the branch is ahead of origin, including earlier unpushed commits.
git("fetch", "-q", "origin", branch);
const ahead = git("rev-list", "--count", `origin/${branch}..HEAD`);
if (ahead.ok && ahead.out === "0") {
  if (committed) report(`Auto-committed ${committed} (nothing new to push).`);
  process.exit(0);
}

let push = git("push", "-q", "origin", `HEAD:${branch}`);
if (!push.ok) {
  // Rejected because origin moved on: rebase our commits on top and retry once.
  const pull = git("pull", "-q", "--rebase", "--autostash", "origin", branch);
  if (!pull.ok) {
    git("rebase", "--abort");
    report(`Auto-push failed: could not rebase onto origin/${branch}. Resolve manually. ${pull.err}`);
  }
  push = git("push", "-q", "origin", `HEAD:${branch}`);
  if (!push.ok) report(`Auto-push failed: ${push.err}`);
}

const head = git("rev-parse", "--short", "HEAD").out;
report(committed ? `Auto-committed and pushed ${head} to ${branch}.` : `Pushed ${branch} (${head}).`);
