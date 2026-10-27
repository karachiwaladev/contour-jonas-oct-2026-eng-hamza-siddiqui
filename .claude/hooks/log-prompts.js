#!/usr/bin/env node
// Stop hook: append the user prompts added to the transcript since the last
// stop to .claude/logs/prompts.jsonl, one JSON object per prompt, then commit
// that file alone and push it to main. Only what a human typed is logged:
// scheduled loop ticks, compaction summaries and task notifications are not,
// and a prompt already logged is never logged twice.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
const transcript = input.transcript_path;
if (!transcript || !fs.existsSync(transcript)) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const logDir = path.join(projectDir, ".claude", "logs");
const logFile = path.join(logDir, "prompts.jsonl");
const stateFile = path.join(logDir, ".prompts-state.json");
fs.mkdirSync(logDir, { recursive: true });

// Remember how many transcript lines each session has already been scanned.
let state = {};
try { state = JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch {}

const lines = fs.readFileSync(transcript, "utf8").split("\n");
const start = state[transcript] || 0;
// The last line may still be partially written; only scan complete lines.
const end = lines.length - 1;

// Turn a transcript user entry into the prompt text, or null if it isn't one.
function promptText(entry) {
  if (entry.type !== "user" || entry.isMeta || entry.isSidechain) return null;
  if (entry.turnOrigin === "scheduled" || entry.isCompactSummary) return null;
  const content = entry.message && entry.message.content;
  const blocks = typeof content === "string"
    ? [content]
    : Array.isArray(content)
      ? content.filter((b) => b.type === "text").map((b) => b.text)
      : [];
  // Drop injected context such as <ide_opened_file> and <system-reminder>.
  const text = blocks
    .filter((t) => !/^\s*<(ide_|system-reminder|task-notification)/.test(t))
    .join("\n")
    .trim();
  if (!text || /^This session is being continued from a previous conversation/.test(text)) return null;
  // Slash commands are stored as tags; log them the way they were typed.
  const name = text.match(/<command-name>([\s\S]*?)<\/command-name>/);
  if (name) {
    const args = text.match(/<command-args>([\s\S]*?)<\/command-args>/);
    return [name[1], args && args[1]].filter(Boolean).join(" ").trim();
  }
  return text;
}

// Keys of recently logged prompts, so a re-scanned transcript can't log one twice.
const seen = new Set(state.__seen || []);
const out = [];
for (let i = start; i < end; i++) {
  if (!lines[i]) continue;
  let entry;
  try { entry = JSON.parse(lines[i]); } catch { continue; }
  const prompt = promptText(entry);
  if (prompt === null) continue;
  const key = `${entry.promptId || entry.uuid}|${prompt.slice(0, 200)}`;
  if (seen.has(key)) continue;
  seen.add(key);
  out.push(JSON.stringify({
    timestamp: entry.timestamp,
    session_id: entry.sessionId || input.session_id,
    prompt_id: entry.promptId || entry.uuid,
    prompt,
  }));
}

if (out.length) fs.appendFileSync(logFile, out.join("\n") + "\n");
state[transcript] = end;
state.__seen = [...seen].slice(-2000);
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

// auto-commit.js runs this logger and does its own commit, so it opts out here.
if (out.length && !process.env.LOG_PROMPTS_NO_PUSH) pushLog();

// Commit only the prompt log and push it to main. Skipped on any other branch,
// so a ticket's pull request carries ticket files alone. Never force-pushes.
function pushLog() {
  const git = (...args) => spawnSync("git", args, { cwd: projectDir, encoding: "utf8" });
  if (git("symbolic-ref", "--short", "-q", "HEAD").stdout.trim() !== "main") return;
  // A pathspec commit leaves anything else in the index or working tree untouched.
  if (git("commit", "-q", "-m", "Update prompt log", "--", ".claude/logs/prompts.jsonl").status !== 0) return;
  if (git("push", "-q", "origin", "main").status === 0) return;
  // Rejected because origin moved on: rebase onto it and retry once.
  if (git("pull", "-q", "--rebase", "--autostash", "origin", "main").status !== 0) {
    git("rebase", "--abort");
    return;
  }
  git("push", "-q", "origin", "main");
}
