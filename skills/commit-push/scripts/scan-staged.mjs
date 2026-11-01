#!/usr/bin/env node
// Scans the added lines of every `git add`ed file before commit: credential shapes, long digit runs, IPs, emails,
// personal machine paths, hidden characters, key files. Prints `file:line · LABEL`, NEVER the value (R-017).
// Exit 0 clean · 1 lines to review · 2 error. False positives are normal (tests with fake credentials): the agent
// reviews each line and decides; the script never edits anything.
// Run at the repo root: node <skill dir>/scripts/scan-staged.mjs        Selftest: scan-staged.selftest.mjs
import { execFileSync } from 'node:child_process';

const git = (...a) => execFileSync('git', ['-c', 'core.quotePath=false', ...a], { encoding: 'utf8', maxBuffer: 256 << 20 });
const ch = (...c) => c.map((x) => String.fromCharCode(x)).join('');

// `\x5c` = backslash. Every regex must be linear in line length: a minified / base64 one-liner of hundreds of KB
// must still scan.
const PATTERNS = [
  ['CREDENTIAL', /glpat-[A-Za-z0-9_-]{10,}|gh[po]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|\bBearer\s+[A-Za-z0-9._-]{20,}/],
  ['CREDENTIAL', /(?:password|passwd|pass|pwd|secret\w{0,40}|api[_-]?key|app[_-]?key|access[_-]?key\w{0,40}|token)\x5c?["']?\s*(?:[:=]|=>)\s*\x5c?["']?[^\s"'\x5c,;]{3,}/i],
  ['CREDENTIAL', /:\/\/[^\s/:@]+:[^\s/]+@|--(?:password|passwd|pass|pwd|token|secret|api[_-]?key)(?:=|\s+)\S/i],
  // `mysql`, `mysqldump`, `mysqlsh`... `-p<value>`: two steps, because one `mysql.*-p` regex is O(n^2) on lines with many `mysql`.
  ['CREDENTIAL', { test: (s) => /\bmysql\w*/i.test(s) && /\s-p\S/.test(s) }],
  ['LONG_NUMBER', /(?<!\w|\d\.)\d{9,12}(?!\w|\.\d)/],
  ['IP', /\b(?!127\.0\.0\.1\b|0\.0\.0\.0\b)(?:\d{1,3}\.){3}\d{1,3}\b/],
  // Anchored with a lookbehind: without it a long line of letters with no `@` is O(n^2).
  ['EMAIL', /(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}/],
  ['PERSONAL_PATH', /\b[A-Za-z]:[\x5c/]{1,2}Users[\x5c/]{1,2}[^\x5c/\s]+|\/(?:Users|home)\/[^/\s]+/],
  // Soft hyphen, BOM, zero-width, bidi controls (isolates too: "Trojan Source"). Built from code points: typing the
  // characters into the source is the very flaw being caught.
  ['HIDDEN_CHAR', new RegExp(`[${ch(0xad, 0xfeff, 0x200b)}-${ch(0x200f, 0x202a)}-${ch(0x202e, 0x2060, 0x2066)}-${ch(0x2069)}]`)],
];
const KEY_FILE = /\.(?:pfx|p12|key|pem|jks|keystore|zip)$|(?:^|\/)\.env(?:\.(?!example$|sample$|template$)[^/]+)?$|(?:^|\/)id_(?:rsa|ecdsa|ed25519)$|(?:^|\/)settings\.local\.json$/i;

let files, diff;
try {
  files = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').split('\0').filter(Boolean);
  // Fixed prefixes, no textconv: independent of diff.noprefix / mnemonicPrefix / gitattributes on the runner's machine.
  diff = git('diff', '--cached', '-U0', '--no-color', '--no-ext-diff', '--no-textconv', '--src-prefix=a/', '--dst-prefix=b/',
    '--diff-filter=ACMR');
} catch (e) { console.error(`cannot run git: ${e.message}`); process.exit(2); }
if (!files.length) { console.error('nothing staged: `git add <each file>` first, then scan'); process.exit(2); }

const hits = new Set(files.filter((f) => KEY_FILE.test(f)).map((f) => `${f} · KEY_FILE`));
// -U0: each hunk `@@ -a,b +c,d @@` has d `+` lines; counting d keeps a content line that starts with `++` from being read as a header.
let file = null, n = 0, left = 0;
for (const l of diff.split('\n')) {
  if (left > 0) {
    if (l[0] !== '+') continue;
    for (const [label, re] of PATTERNS) if (re.test(l.slice(1))) hits.add(`${file}:${n} · ${label}`);
    n++; left--;
    continue;
  }
  // Names with spaces: git appends a TAB after the name on the `+++` line.
  if (l.startsWith('+++ ')) file = l.slice(4).replace(/^b\//, '').replace(/\x09$/, '');
  const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(l);
  if (h) { n = +h[1]; left = h[2] === undefined ? 1 : +h[2]; }
}

const all = [...hits];
for (const h of all.slice(0, 200)) console.log(h);
if (all.length > 200) console.log(`... ${all.length - 200} more lines`);
console.log(all.length ? `${all.length} lines to review (${files.length} files staged)` : `clean: ${files.length} files staged`);
process.exit(all.length ? 1 : 0);
