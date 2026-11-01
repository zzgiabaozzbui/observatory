#!/usr/bin/env node
// Selftest for config-protection.mjs.
//
//   node hooks/config-protection.selftest.mjs
//
// Adapted from github.com/affaan-m/ecc · scripts/hooks/config-protection.js (MIT, © 2026 Affaan Mustafa), v2.2.3.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProtected, REASON } from './config-protection.mjs';

const NAMES = [
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml',
  ...['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'].map((e) => `eslint.config.${e}`),
  '.prettierrc', ...['js', 'cjs', 'json', 'yml', 'yaml'].map((e) => `.prettierrc.${e}`),
  ...['js', 'cjs', 'mjs'].map((e) => `prettier.config.${e}`),
  'biome.json', 'biome.jsonc', '.biome.json', '.biome.jsonc',
  '.stylelintrc', ...['json', 'yml', 'yaml', 'js', 'cjs', 'mjs'].map((e) => `.stylelintrc.${e}`),
  ...['js', 'cjs', 'mjs', 'ts', 'mts', 'cts'].map((e) => `stylelint.config.${e}`),
  ...['json', 'jsonc', 'yaml', 'yml', 'cjs', 'mjs'].map((e) => `.markdownlint.${e}`), '.markdownlintrc',
  ...['jsonc', 'yaml', 'cjs', 'mjs'].map((e) => `.markdownlint-cli2.${e}`),
  'ruff.toml', '.ruff.toml', '.shellcheckrc',
  '.eslintignore', '.prettierignore', '.stylelintignore', '.markdownlintignore',
];
for (const n of NAMES) assert.equal(isProtected(n), true, n);
assert.equal(isProtected('ESLINT.CONFIG.MJS'), true, 'case-insensitive');
for (const n of ['.prettierrc.ts', '.prettierrc.mts', '.prettierrc.cts', '.prettierrc.json5', '.eslintrc.base.ts']) assert.equal(isProtected(n), true, n);
assert.equal(isProtected('eslint.config.base.mjs'), true, 'pattern');
for (const n of ['tsconfig.json', 'tsconfig.app.json', 'vite.config.ts', 'package.json', '.editorconfig', 'vitest.config.ts', 'biome.ts']) {
  assert.equal(isProtected(n), false, n);
}
assert.match(REASON, /protected/);
assert.match(REASON, /ATHENA_CONFIG_PROTECTION=off/);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-cp-test-'));
try {
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'new'));
  for (const f of ['biome.json', '.eslintrc.json', 'ESLINT.CONFIG.MJS', 'commitlint.config.ts', '.commitlintrc.json', '.commitlintrc', '.commitlintrc.mts', 'tsconfig.json', 'vite.config.ts', 'src/biome.ts']) {
    fs.writeFileSync(path.join(repo, f), '{}');
  }
  const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), 'config-protection.mjs');
  const run = (payload, input, env = {}, file = hook) => execFileSync('node', [file], {
    input: input ?? JSON.stringify({ cwd: repo, ...payload }), env: { ...process.env, CLAUDE_PROJECT_DIR: '', ...env },
  }).toString();
  const edit = (tool, f, env, file) => run({ tool_name: tool, tool_input: { file_path: path.join(repo, f) } }, undefined, env, file);

  // Block: Edit an existing biome.json
  assert.match(edit('Edit', 'biome.json'), /"deny"/);
  // Block: Write an existing .eslintrc.json
  assert.match(edit('Write', '.eslintrc.json'), /"deny"/);
  // Block: upper-case name
  assert.match(edit('Write', 'ESLINT.CONFIG.MJS'), /"deny"/);
  // Block: existing commitlint.config.ts
  assert.match(edit('Write', 'commitlint.config.ts'), /"deny"/);
  // Block: existing .commitlintrc.*
  assert.match(edit('Write', '.commitlintrc.json'), /"deny"/);
  assert.match(edit('Write', '.commitlintrc'), /"deny"/);
  assert.doesNotMatch(edit('Write', '.commitlintrc.mts'), /"deny"/); // not in the exact-name list
  assert.equal(JSON.parse(edit('Edit', '.commitlintrc.json')).hookSpecificOutput.permissionDecisionReason, REASON);
  // Block: relative path against cwd
  assert.match(run({ tool_name: 'Edit', tool_input: { file_path: '.eslintrc.json' } }), /"deny"/);
  assert.match(run({ tool_name: 'Edit', tool_input: { file_path: 'biome.json' } }), /"deny"/);
  // Block: backslash absolute path, and script path with /
  assert.match(edit('Edit', '.eslintrc.json', {}, hook.replace(/\\/g, '/')), /"deny"/);
  if (process.platform === 'win32') {
    assert.match(run({ tool_name: 'Edit', tool_input: { file_path: path.join(repo, '.eslintrc.json').replace(/\//g, '\\') } }), /"deny"/);
  }

  // Opt-out: ATHENA_CONFIG_PROTECTION=off lets the same edits through
  const off = { ATHENA_CONFIG_PROTECTION: 'off' };
  assert.equal(edit('Edit', '.eslintrc.json', off), '');
  assert.equal(run({ tool_name: 'Edit', tool_input: { file_path: '.eslintrc.json' } }, undefined, off), '');

  // Pass: Write a biome.json that does not exist
  assert.equal(edit('Write', 'new/biome.json'), '');
  // Pass: existing tsconfig.json
  assert.equal(edit('Edit', 'tsconfig.json'), '');
  // Pass: existing vite.config.ts
  assert.equal(edit('Edit', 'vite.config.ts'), '');
  // Pass: src/biome.ts
  assert.equal(edit('Edit', 'src/biome.ts'), '');
  // Pass: Bash
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'echo > biome.json' } }), '');
  // Pass: empty stdin, broken stdin, missing tool_input
  assert.equal(run({}, ''), '');
  assert.equal(run({}, 'not json'), '');
  assert.equal(run({ tool_name: 'Edit' }), '');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('config-protection selftest OK');
