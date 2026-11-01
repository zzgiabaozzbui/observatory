// Selftest for scan-staged.mjs: temp git repo, stage sample files (fake values), check labels + line numbers + no value printed.
// Run: node scan-staged.selftest.mjs   (exit 0 = green)
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scan-staged.mjs'); // decodes %20 in the path
const ch = (...c) => c.map((x) => String.fromCharCode(x)).join('');
let fail = 0;
const check = (ok, msg, info = '') => { console.log(`${ok ? 'ok' : 'FAIL'} ${msg}${ok ? '' : `\n    ${info}`}`); if (!ok) fail++; };

function repo(files, commitFirst = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
  const g = (...a) => execFileSync('git', a, { cwd: d, stdio: 'pipe' });
  g('init', '-q'); g('config', 'user.email', 'selftest@example.invalid'); g('config', 'user.name', 'selftest');
  g('config', 'core.autocrlf', 'false');
  for (const [f, t] of Object.entries(commitFirst)) fs.writeFileSync(path.join(d, f), t);
  if (Object.keys(commitFirst).length) { g('add', '--', ...Object.keys(commitFirst)); g('commit', '-q', '-m', 'base'); }
  for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(d, f), t);
  if (Object.keys(files).length) g('add', '--', ...Object.keys(files));
  const r = spawnSync('node', [SCRIPT], { cwd: d, encoding: 'utf8' });
  fs.rmSync(d, { recursive: true, force: true });
  return { code: r.status, out: r.stdout + r.stderr };
}

const V = 'Sup3rSecret99'; // fake value
const B = ch(92);          // backslash
{
  const r = repo({
    'a.txt': [`DB_PASSWORD=${V}`, 'hello world', 'host 192.0.2.10', 'mail a.b@example.com', 'number 012345678901',
      `C:${B}Users${B}someone${B}x`, `hid${ch(0xfeff)}den`, `https://u:${V}@h.example/x`, `++ token: ${V}`, 'loopback 127.0.0.1'].join('\n'),
    'doc.md': `api_key: "${V}"\n`,
    'cert.pem': 'x\n',
    'clean.md': 'Nothing sensitive here.\n',
  });
  check(r.code === 1, 'lines to review -> exit 1', r.out);
  for (const want of ['a.txt:1 · CREDENTIAL', 'a.txt:3 · IP', 'a.txt:4 · EMAIL', 'a.txt:5 · LONG_NUMBER', 'a.txt:6 · PERSONAL_PATH',
    'a.txt:7 · HIDDEN_CHAR', 'a.txt:8 · CREDENTIAL', 'a.txt:9 · CREDENTIAL', 'doc.md:1 · CREDENTIAL', 'cert.pem · KEY_FILE']) {
    check(r.out.includes(want), `reports ${want}`, r.out);
  }
  check(!r.out.includes(V), 'does not print the secret value', r.out);
  check(!r.out.includes('a.txt:2 ') && !r.out.includes('a.txt:10 ') && !r.out.includes('clean.md'), 'clean lines, 127.0.0.1, clean file not reported', r.out);
}
{
  const r = repo({ 'b.md': ['one', 'two', 'three', 'four', `secret=${V}`, 'six'].join('\n') }, { 'b.md': ['one', 'two', 'three', 'four', 'five', 'six'].join('\n') });
  check(r.code === 1 && r.out.includes('b.md:5 · CREDENTIAL'), 'edited file: line numbers follow the new version', r.out);
}
{
  const r = repo({ 'ok.md': 'only lowercase words\n' });
  check(r.code === 0 && r.out.includes('clean: 1 files'), 'nothing found -> exit 0', r.out);
}
{
  const r = repo({});
  check(r.code === 2, 'nothing staged -> exit 2', r.out);
}
{ // names with spaces, two hunks, mysqldump, trailing number, escaped JSON path, .env.*, same-label dedup
  const base = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
  const next = [...base]; next[2] = `token: ${V}`; next[24] = `mysqldump -u r -p${V} db`;
  const r = repo({
    'with space.txt': `pwd=${V}\n`, 'c.md': next.join('\n'),
    'd.txt': ['ID 012345678901.', `"C:${B}${B}Users${B}${B}bob"`, `password=${V} --password=${V}`].join('\n'),
    '.env.local': 'x\n', '.env.example': 'X=\n',
  }, { 'c.md': base.join('\n') });
  for (const want of ['with space.txt:1 · CREDENTIAL', 'c.md:3 · CREDENTIAL', 'c.md:25 · CREDENTIAL', 'd.txt:1 · LONG_NUMBER',
    'd.txt:2 · PERSONAL_PATH', '.env.local · KEY_FILE']) check(r.out.includes(want), `reports ${want}`, r.out);
  check(!r.out.includes('.env.example'), '.env.example not reported', r.out);
  check(r.out.split('\n').filter((l) => l === 'd.txt:3 · CREDENTIAL').length === 1, 'one line matching several same-label patterns: reported once', r.out);
  check(!r.out.includes(V), 'does not print the secret value', r.out);
}
{ // long line without `@`, many `mysql`: regexes must stay linear
  const t0 = Date.now();
  const r = repo({ 'min.js': 'a'.repeat(200000) + '\n' + 'mysql '.repeat(40000) + '\n' });
  const ms = Date.now() - t0;
  check(r.code === 0 && ms < 5000, `200 KB + 240 KB lines scan fast (${ms} ms incl. git init)`, r.out);
}
console.log(fail ? `${fail} FAILED` : 'GREEN');
process.exit(fail ? 1 : 0);
