// Shared rules for text that came from outside the factory: issue titles,
// bodies and comments, and lines a ticket branch adds to the repo.
//
// Three levels:
//   block   - looks like an attack on the agent (prompt injection, secret
//             exfiltration, guardrail changes, remote code). The ticket is
//             quarantined until a maintainer clears it.
//   confirm - asks for something irreversible (deleting data, sending
//             messages out). Allowed, but a human must confirm first.
//   warn    - worth noting, not acted on.

// Invisible characters used to hide instructions from a human reader:
// zero-width spaces and joiners (not U+200D, which emoji need), bidi controls,
// word joiners, the BOM, soft hyphens and Unicode tag characters.
const HIDDEN = /[​‌‎‏‪-‮⁠-⁤⁦-⁩﻿­]|[\u{E0000}-\u{E007F}]/gu;
const HTML_COMMENT = /<!--([\s\S]*?)(?:-->|$)/g;
export const FACTORY_MARKER = /<!--\s*factory-loop\s*-->/i;

export const RULES = [
  // Attempts to take over the agent.
  { id: "instruction-override", level: "block", re: /\b(ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any|your|the|system)\b[^.\n]{0,20}\b(instructions?|rules|prompts?|guidelines|guardrails|constraints)\b/i },
  { id: "role-tags", level: "block", re: /<\s*\/?\s*(system|assistant|developer|instructions?)\s*>|\[\/?(INST|SYS)\]|<\|im_(start|end)\|>/i },
  { id: "persona-switch", level: "block", re: /\b(you are now|developer mode|jailbreak|DAN mode|new system prompt|system prompt\s*:|from now on,? you (will|must))\b/i },
  // Requests aimed at the factory's own guardrails.
  { id: "guardrail-files", level: "block", re: /(^|[\s`'"(/\\])\.claude[\\/]|\bsettings(\.local)?\.json\b|\.github[\\/]workflows|\.mcp\.json|\bPreToolUse\b|\bpermissions\.(allow|deny)\b|\.git[\\/]hooks/i },
  // Secrets and exfiltration.
  { id: "secret-request", level: "block", re: /\b(print|echo|show|reveal|dump|send|post|upload|exfiltrat\w*|leak|share|paste|include|cat|read|output)\b[^\n]{0,60}\b(tokens?|secrets?|credentials?|api[ _-]?keys?|private keys?|ssh keys?|env(ironment)? var\w*)\b/i },
  { id: "secret-names", level: "block", re: /\b(GITHUB_TOKEN|GH_TOKEN|ANTHROPIC_API_KEY|AWS_SECRET\w*|NPM_TOKEN)\b|gh auth token|\bprintenv\b|\.git-credentials|\.ssh[\\/]|\bid_(rsa|ed25519)\b|\.npmrc\b|\bhosts\.yml\b/i },
  // Running code fetched from somewhere else.
  { id: "remote-exec", level: "block", re: /\b(curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n|]*\|\s*(sudo\s+)?(sh|bash|zsh|iex|Invoke-Expression|python3?|node|pwsh|powershell)\b|base64\s+(-d|--decode)[^\n]*\|\s*(sh|bash)|\b(powershell|pwsh)(\.exe)?\b[^\n]*\s-e(nc|ncodedcommand)?\s+[A-Za-z0-9+/=]{20,}/i },
  // Skipping review or rewriting history.
  { id: "git-danger", level: "block", re: /git\s+push\b[^\n]*(--force|\s-f\b|--mirror)|--no-verify|git\s+reset\s+--hard|git\s+clean\s+-|gh\s+(pr\s+merge|repo\s+delete|secret\b|auth\s+token)|gh\s+pr\s+review\b[^\n]*--approve/i },
  { id: "skip-review", level: "block", re: /\b(push|commit)\b[^\n]{0,30}\b(directly|straight)\b[^\n]{0,20}\b(to|on|into)\s+(main|master)\b|\b(skip|bypass)\b[^\n]{0,15}\b(the )?(review|tests|pull request|pr|ci)\b|\b(merge|approve)\b[^\n]{0,15}\b(your own|it yourself|without review)\b/i },
  { id: "mass-delete", level: "block", re: /\b(delete|remove|close)\b[^\n]{0,30}\b(all|other|every)\b[^\n]{0,20}\b(issues?|branches|repos?(itory)?|tags|releases|labels|pull requests?)\b/i },
  // Irreversible actions: allowed only after a human confirms.
  { id: "destroy-data", level: "confirm", re: /\b(delete|drop|truncate|wipe|purge|erase|destroy|reset)\b[^\n]{0,40}\b(tables?|databases?|db|object ?stores?|indexeddb|data|records?|rows?|history|users?|accounts?|everything)\b|\bDROP\s+(TABLE|DATABASE|SCHEMA)\b|\bTRUNCATE\s+TABLE\b|\bDELETE\s+FROM\b|\bdeleteDatabase\b|\bdeleteObjectStore\b/i },
  { id: "send-message", level: "confirm", re: /\b(send|email|e-mail|sms|text|notify|message|tweet|broadcast)\b[^\n]{0,40}\b(users?|customers?|everyone|subscribers?|team|channel|mailing list|slack|discord|teams|webhook|phone|inbox)\b|\b(slack|discord|twilio|sendgrid|mailgun|smtp)\b/i },
  { id: "publish", level: "confirm", re: /\b(deploy|publish|release)\b[^\n]{0,30}\b(to )?(production|prod|npm|the store|live|pages)\b/i },
  // Worth noting only.
  { id: "external-link", level: "warn", re: /https?:\/\/(?!(www\.)?github\.com\/|localhost|127\.0\.0\.1)[^\s)>"']+/i },
  { id: "encoded-blob", level: "warn", re: /[A-Za-z0-9+/]{120,}={0,2}/ },
];

// Text as the agent should see it: invisible characters removed, look-alike
// characters folded, HTML comments (invisible on GitHub) replaced with a note,
// and any attempt to close the untrusted wrapper neutralised.
export function sanitize(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(HIDDEN, "")
    .replace(HTML_COMMENT, "[hidden HTML comment removed]")
    .replace(/<\/?\s*untrusted-[a-z-]*[^>]*>/gi, "[tag removed]");
}

// Every rule the text trips, scanning the hidden parts too, since hidden text
// is exactly where an attacker puts instructions.
export function scan(text) {
  const raw = String(text ?? "");
  const visible = raw.normalize("NFKC").replace(HIDDEN, "");
  const findings = [];
  const hidden = raw.match(HIDDEN);
  if (hidden) findings.push({ id: "hidden-characters", level: "block", detail: `${hidden.length} invisible character(s)` });
  if (/<!--/.test(visible) && !FACTORY_MARKER.test(visible)) findings.push({ id: "html-comment", level: "warn", detail: "hidden HTML comment" });
  for (const rule of RULES) {
    const m = visible.match(rule.re);
    if (m) findings.push({ id: rule.id, level: rule.level, detail: excerpt(m[0]) });
  }
  return findings;
}

// A short, inert excerpt for reports: never more than 60 characters, no newlines.
function excerpt(s) {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}...` : flat;
}

export function worst(findings) {
  if (findings.some((f) => f.level === "block")) return "block";
  if (findings.some((f) => f.level === "confirm")) return "confirm";
  if (findings.some((f) => f.level === "warn")) return "warn";
  return "ok";
}
