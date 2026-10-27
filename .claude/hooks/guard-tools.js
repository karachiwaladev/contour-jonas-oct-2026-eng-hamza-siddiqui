#!/usr/bin/env node
// PreToolUse hook: the last line of defence if a poisoned ticket gets an agent
// to try something it shouldn't. Every tool call passes through here first.
//   deny - never allowed: force push, rm -rf, curl | sh, reading .env or other
//          secrets, merging or approving PRs, editing the factory's guardrails,
//          talking to outside hosts from the shell, browsing outside localhost.
//   ask  - irreversible, so the human decides: deleting files, branches or
//          GitHub items, dropping data, sending messages, publishing.
//   allow everything else (the normal permission rules still apply).
// A human can turn it off for one session with FACTORY_GUARD_OFF=1.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SHELL_DENY = [
  [/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|--recursive\s+--force|--force\s+--recursive)\b|\bRemove-Item\b[^\n]*-Recurse[^\n]*-Force|\bRemove-Item\b[^\n]*-Force[^\n]*-Recurse|\brd\s+\/s\s+\/q\b/i, "rm -rf / recursive force delete"],
  [/\bgit\s+push\b[^\n]*(--force\b|--force-with-lease|\s-f\b|\s\+[\w/-]+|--mirror)/i, "git push --force"],
  [/\b(curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n|]*\|\s*(sudo\s+)?(sh|bash|zsh|iex|Invoke-Expression|python3?|node|pwsh|powershell)\b|base64\s+(-d|--decode)[^\n]*\|\s*(sh|bash)/i, "piping a download into a shell"],
  [/(^|[\s"'=/\\])\.env(\.[\w.-]+)?($|[\s"';|&)])/i, "reading a .env file"],
  [/\.git-credentials|[\\/]\.ssh[\\/]|\bid_(rsa|ed25519)\b|\.npmrc\b|[\\/]gh[\\/]hosts\.yml|\bgit\s+credential\b/i, "reading credentials"],
  [/\bprintenv\b|^\s*(env|set)\s*$|\benv\s*\||Get-ChildItem\s+env:|\bgci\s+env:|\$env:\w*(TOKEN|KEY|SECRET)|\$\{?\w*(TOKEN|SECRET|API_KEY)\w*\}?|\bgh\s+auth\s+(token|status\b[^\n]*(-t\b|--show-token))/i, "reading environment secrets"],
  [/\bgh\s+pr\s+merge\b|\bgh\s+pr\s+review\b[^\n]*--approve|\bgh\s+api\b[^\n]*\/merge\b/i, "merging or approving a pull request"],
  [/\bgh\s+(repo\s+delete|secret\b|variable\b)|--no-verify\b|\bgit\s+reset\s+--hard\b|\bgit\s+clean\s+-/i, "destructive git/GitHub command"],
  [/\b(ssh|scp|sftp|nc|ncat|netcat|telnet|ftp)\s/i, "opening a network connection"],
  [/\bnpm\s+(i|install)\s+(-g|--global)\b|\bnpm\s+publish\b/i, "global install or publish"],
];

// Shell commands that are allowed but irreversible: ask the human.
const SHELL_ASK = [
  [/(^|[;&|]\s*)(rm|del|erase|rmdir|rd|Remove-Item|ri|unlink|shred)\b/i, "deletes files"],
  [/\bgit\s+(rm|branch\s+-[dD]|push\b[^\n]*(--delete|\s:[\w/-]+)|tag\s+-d|stash\s+(drop|clear))\b/i, "deletes git data"],
  // Closing an issue is the loop's normal way to finish a question ticket, and can be undone.
  [/\bgh\s+(issue|pr|release|label|repo|run|cache)\s+delete\b|\bgh\s+pr\s+close\b|\bgh\s+api\b[^\n]*(-X|--method)\s*DELETE/i, "deletes a GitHub item or closes a pull request"],
  [/\bDROP\s+(TABLE|DATABASE|SCHEMA)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bdeleteDatabase\b|\bdeleteObjectStore\b/i, "deletes stored data"],
  [/\b(mail|mailx|sendmail|mutt|Send-MailMessage)\b/i, "sends a message"],
  [/\bgh\s+release\s+create\b|\bgit\s+push\b[^\n]*--tags\b|\bvercel\b|\bnetlify\s+deploy\b|\bgh-pages\b/i, "publishes or deploys"],
];

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/i;
const NPX_ALLOWED = new Set(["http-server", "chrome-devtools-mcp", "chrome-devtools-mcp@latest"]);
// The factory's guardrails: only a human edits these.
const PROTECTED = [/^\.claude\/(settings[^/]*\.json|hooks\/|guards\/|skills\/|agents\/|evals\/)/i, /^\.github\//i, /^\.mcp\.json$/i, /^\.git\/(hooks|config)/i];
const SECRET_FILE = /(^|\/)\.env(\.[\w.-]+)?$|\.git-credentials$|(^|\/)\.ssh\/|\bid_(rsa|ed25519)\b|(^|\/)\.npmrc$|(^|\/)gh\/hosts\.yml$|(^|\/)credentials(\.json)?$/i;
const WRITE_VERB = /\b(rm|del|mv|move|cp|copy|tee|Set-Content|Add-Content|Out-File|New-Item|Move-Item|Copy-Item|Remove-Item|truncate|chmod|sed\s+-i|perl\s+-pi|git\s+(rm|mv|checkout|restore))\b/i;

function rel(p, root) {
  if (!p) return "";
  const abs = path.resolve(root, String(p));
  return path.relative(root, abs).split(path.sep).join("/");
}

const isProtected = (p) => PROTECTED.some((re) => re.test(p));

// Every outside host a shell command mentions.
function outsideHosts(cmd) {
  const hosts = [];
  for (const m of cmd.matchAll(/\b(?:https?|wss?|ftp):\/\/([^/\s:'"?#]+)/gi)) if (!LOCAL_HOST.test(m[1])) hosts.push(m[1]);
  return hosts;
}

// ctx: { root, branch, outgoingFiles: () => [paths on HEAD not yet on origin/main] }
function checkShell(cmd, ctx) {
  for (const [re, why] of SHELL_DENY) if (re.test(cmd)) return { decision: "deny", reason: `Blocked: ${why}.` };

  const fetches = /\b(curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod|Start-BitsTransfer)\b/i.test(cmd);
  if (fetches && outsideHosts(cmd).length) return { decision: "deny", reason: `Blocked: shell network call to ${outsideHosts(cmd).join(", ")}. Only localhost is allowed.` };

  for (const m of cmd.matchAll(/\bnpx\s+(?:-y\s+|--yes\s+)?([^\s]+)/gi)) {
    if (!NPX_ALLOWED.has(m[1])) return { decision: "deny", reason: `Blocked: npx ${m[1]} is not on the allow list.` };
  }

  // Writing to the guardrails through the shell.
  const targets = [...cmd.matchAll(/>>?\s*["']?([^\s"';|&]+)/g)].map((m) => rel(m[1], ctx.root));
  if (targets.some(isProtected)) return { decision: "deny", reason: "Blocked: writes to the factory's guardrail files." };
  if (WRITE_VERB.test(cmd)) {
    const words = cmd.split(/[\s"'=]+/).map((w) => rel(w, ctx.root));
    if (words.some(isProtected)) return { decision: "deny", reason: "Blocked: changes the factory's guardrail files." };
  }

  // Pushing to main: only the prompt log may go straight there.
  const push = cmd.match(/\bgit\s+push\b([^\n;&|]*)/i);
  if (push) {
    const toMain = /(^|[\s:])(main|master)\b/.test(push[1]) || (!/\S+\s+\S+/.test(push[1].trim()) && ctx.branch === "main");
    if (toMain) {
      const files = ctx.outgoingFiles();
      if (files.some((f) => f !== ".claude/logs/prompts.jsonl")) {
        return { decision: "deny", reason: "Blocked: pushing to main. Ticket work goes on a branch and through a pull request." };
      }
    }
  }

  for (const [re, why] of SHELL_ASK) if (re.test(cmd)) return { decision: "ask", reason: `Irreversible: this ${why}. Confirm before it runs.` };
  return { decision: "allow" };
}

function check(event, ctx) {
  const tool = event.tool_name || "";
  const input = event.tool_input || {};

  if (tool === "Bash" || tool === "PowerShell") return checkShell(String(input.command || ""), ctx);

  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
    const p = rel(input.file_path || input.notebook_path, ctx.root);
    if (isProtected(p)) return { decision: "deny", reason: `Blocked: ${p} is a factory guardrail. Only a human edits it.` };
    if (SECRET_FILE.test(p)) return { decision: "deny", reason: `Blocked: ${p} holds secrets.` };
    return { decision: "allow" };
  }

  if (["Read", "Grep", "Glob"].includes(tool)) {
    const p = String(input.file_path || input.path || input.pattern || "").replace(/\\/g, "/");
    if (SECRET_FILE.test(p) || /(^|\/)\.env\b/.test(p)) return { decision: "deny", reason: "Blocked: reading a .env or credentials file." };
    return { decision: "allow" };
  }

  if (/^mcp__chrome-devtools__(navigate_page|new_page)$/.test(tool)) {
    const url = String(input.url || "");
    let host = "";
    try { host = new URL(url).hostname; } catch {}
    if (url && url !== "about:blank" && !LOCAL_HOST.test(host)) return { decision: "deny", reason: `Blocked: the browser may only open localhost, not ${url}.` };
    return { decision: "allow" };
  }

  if (tool === "WebFetch") {
    const url = String(input.url || "");
    if (/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|sk-[A-Za-z0-9_-]{20,}/.test(url) || url.length > 500) {
      return { decision: "deny", reason: "Blocked: the URL carries what looks like a secret or a data payload." };
    }
    return { decision: "allow" };
  }

  // Any other connector that sends, posts or deletes (Slack, email, databases): ask first.
  if (tool.startsWith("mcp__") && /(send|post|message|mail|email|chat|notify|publish|reply|delete|drop|remove|destroy|truncate|purge)/i.test(tool)) {
    return { decision: "ask", reason: `Irreversible: ${tool} sends a message or deletes data. Confirm before it runs.` };
  }
  return { decision: "allow" };
}

function git(root, ...args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "";
}

module.exports = { check, checkShell };

if (require.main === module) {
  if (process.env.FACTORY_GUARD_OFF === "1") process.exit(0);
  let event = {};
  try { event = JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch {}
  const root = process.env.CLAUDE_PROJECT_DIR || event.cwd || process.cwd();
  const ctx = {
    root,
    branch: git(root, "symbolic-ref", "--short", "-q", "HEAD"),
    outgoingFiles: () => git(root, "diff", "--name-only", "origin/main..HEAD").split("\n").filter(Boolean),
  };
  const result = check(event, ctx);
  if (result.decision === "allow") process.exit(0);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: result.decision,
      permissionDecisionReason: result.reason,
    },
  }));
  process.exit(0);
}
