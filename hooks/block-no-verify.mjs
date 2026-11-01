#!/usr/bin/env node
// PreToolUse hook: block the agent from bypassing project git hooks (--no-verify, -n, core.hooksPath, HUSKY=0).
//
// Why: pre-commit / commit-msg / pre-push hooks are the project's quality gate. A model facing a red hook tends to
// dodge it with `--no-verify`; asking in prose is not enough, so the rule is enforced at the hook layer.
//
// Claude Code: PreToolUse matcher `Bash`; the command is `tool_input.command`; block with `permissionDecision: 'deny'`.
// No opt-out switch: to turn it off, disable the plugin.
//
// Adapted from github.com/affaan-m/ecc · scripts/hooks/block-no-verify.js (MIT, © 2026 Affaan Mustafa), v2.2.3.
// ponytail: does not catch bash -c / sh -c, eval, subshells `(...)` / `$(...)`, `time git`, git aliases, scripts wrapping git, GIT_CONFIG_* env. Add when a real bypass shows up.
//
// No external packages. Never throws: a failing hook must not block work.

import fs from 'node:fs';

export const REASON =
  'Blocked: bypassing git hooks (--no-verify / -n / core.hooksPath / HUSKY=0). Fix what the hook reports, do not dodge it. If the hook is truly wrong, tell the user.';

const PROTECTED = new Set(['commit', 'push', 'merge', 'rebase', 'cherry-pick', 'am']);
const GLOBAL_WITH_VALUE = new Set(['-C', '--git-dir', '--work-tree', '--namespace']);
const VALUE_SHORT = 'mFCct'; // take a value
const OPTIONAL_SHORT = 'uS'; // optional value glued to the flag

/** Split a command into segments (on ; & | newline), then words; quotes merge into the word, quoted chars never split. */
function segments(cmd) {
  const out = [];
  let words = [];
  let cur = '';
  let has = false;
  let q = '';
  const word = () => { if (has) words.push(cur); cur = ''; has = false; };
  const seg = () => { word(); if (words.length) out.push(words); words = []; };
  const s = cmd.replace(/\\\r?\n/g, ' '); // backslash line continuation = space
  for (let n = 0; n < s.length; n++) {
    const ch = s[n];
    if (q) { if (ch === q) q = ''; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; has = true; }
    else if (/\s/.test(ch) && ch !== '\n') word();
    else if (ch === '&' && (/[<>]$/.test(cur) || s[n + 1] === '>')) { cur += ch; has = true; } // 2>&1, >&, <&, &>, &>>
    else if (ch === '|' && s[n + 1] === '&') { seg(); n++; } // |& is one separator
    else if (ch === ';' || ch === '&' || ch === '|' || ch === '\n') seg();
    else { cur += ch; has = true; }
  }
  seg();
  return out;
}

/** Block reason if a segment is a protected git command skipping hooks; otherwise null. */
function checkSegment(words) {
  let i = 0;
  let husky = false;
  while (i < words.length && /^[A-Za-z_]\w*=/.test(words[i])) { if (words[i] === 'HUSKY=0') husky = true; i++; }
  const base = (words[i] || '').split(/[\\/]/).pop().toLowerCase();
  if (base !== 'git' && base !== 'git.exe') return null;
  i++;
  let hooksPath = false;
  while (i < words.length && words[i].startsWith('-')) {
    const t = words[i++];
    if (t === '-c') { if (/^core\.hookspath(=|$)/i.test(words[i] || '')) hooksPath = true; i++; }
    else if (GLOBAL_WITH_VALUE.has(t)) i++;
  }
  const sub = words[i++];
  if (!PROTECTED.has(sub)) return null;
  if (hooksPath || husky) return REASON;
  for (; i < words.length; i++) {
    const t = words[i];
    if (t === '--') break;
    if (t.length >= 6 && '--no-verify'.startsWith(t)) return REASON;
    if (sub !== 'commit' || !/^-[^-]/.test(t)) continue;
    for (let k = 1; k < t.length; k++) {
      const c = t[k];
      if (c === 'n') return REASON;
      if (OPTIONAL_SHORT.includes(c)) break;
      if (VALUE_SHORT.includes(c)) { if (k === t.length - 1) i++; break; }
    }
  }
  return null;
}

/** Block reason for a shell command, or null to allow. */
export function blockReason(cmd) {
  for (const words of segments(String(cmd || ''))) {
    const r = checkSegment(words);
    if (r) return r;
  }
  return null;
}

function main() {
  let payload = {};
  try { payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { /* empty stdin */ }
  if (payload.tool_name !== 'Bash') return;
  const reason = blockReason(payload.tool_input?.command);
  if (!reason) return;

  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
}

if (process.argv[1]?.endsWith('block-no-verify.mjs')) { try { main(); } catch { /* silent by design */ } process.exit(0); }
