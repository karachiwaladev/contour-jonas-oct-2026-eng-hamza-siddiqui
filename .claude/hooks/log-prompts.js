#!/usr/bin/env node
// Stop hook: append the user prompts added to the transcript since the last
// stop to .claude/logs/prompts.jsonl, one JSON object per prompt.
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
  const content = entry.message && entry.message.content;
  const blocks = typeof content === "string"
    ? [content]
    : Array.isArray(content)
      ? content.filter((b) => b.type === "text").map((b) => b.text)
      : [];
  // Drop injected context such as <ide_opened_file> and <system-reminder>.
  const text = blocks
    .filter((t) => !/^\s*<(ide_|system-reminder)/.test(t))
    .join("\n")
    .trim();
  if (!text) return null;
  // Slash commands are stored as tags; log them the way they were typed.
  const name = text.match(/<command-name>([\s\S]*?)<\/command-name>/);
  if (name) {
    const args = text.match(/<command-args>([\s\S]*?)<\/command-args>/);
    return [name[1], args && args[1]].filter(Boolean).join(" ").trim();
  }
  return text;
}

const out = [];
for (let i = start; i < end; i++) {
  if (!lines[i]) continue;
  let entry;
  try { entry = JSON.parse(lines[i]); } catch { continue; }
  const prompt = promptText(entry);
  if (prompt === null) continue;
  out.push(JSON.stringify({
    timestamp: entry.timestamp,
    session_id: entry.sessionId || input.session_id,
    prompt_id: entry.promptId || entry.uuid,
    prompt,
  }));
}

if (out.length) fs.appendFileSync(logFile, out.join("\n") + "\n");
state[transcript] = end;
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
