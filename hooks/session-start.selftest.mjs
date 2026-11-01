// Selftest for session-start.mjs. Run: node hooks/session-start.selftest.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const script = join(dir, 'session-start.mjs');
const { output } = await import('./session-start.mjs');
const R = '# RULES-SENTINEL';

assert.ok(output('startup', R).includes(R));
assert.ok(output('startup', R).includes('invokes skill `routing`'));
assert.ok(output('compact', R).includes('does not invoke'));
assert.ok(output('startup', '').includes('invokes skill'));

const run = (input, cwd) => spawnSync(process.execPath, [script], { input, cwd, encoding: 'utf8' });
const bad = run('not json');
assert.equal(bad.status, 0);
assert.ok(bad.stdout.includes('invokes skill'));

const tmp = run(JSON.stringify({ source: 'compact' }), mkdtempSync(join(tmpdir(), 'ss-')));
assert.equal(tmp.status, 0);
assert.ok(tmp.stdout.includes('# athena-starter core rules'));
assert.ok(tmp.stdout.includes('does not invoke'));
console.log('session-start selftest ok');
