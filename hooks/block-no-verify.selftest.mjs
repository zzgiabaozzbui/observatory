#!/usr/bin/env node
// Selftest for block-no-verify.mjs.
//
//   node hooks/block-no-verify.selftest.mjs
//
// Adapted from github.com/affaan-m/ecc · scripts/hooks/block-no-verify.js (MIT, © 2026 Affaan Mustafa), v2.2.3.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockReason } from './block-no-verify.mjs';

const blocked = [
  'git commit --no-verify -m x', // full flag
  'git commit --no-v -m x', // shortest accepted prefix
  'git commit -anm x', // n before m in a flag cluster
  'git commit -n -m x', // commit -n = --no-verify
  'git push --no-verify', // other subcommands are protected too
  'git merge --no-verify dev',
  'git -c core.hooksPath=/dev/null commit -m x', // hook dir override
  'git -c CORE.HOOKSPATH=x push', // key is case-insensitive
  'HUSKY=0 git commit -m x', // husky off via env
  'cd a && git commit --no-verify -m x', // segment after &&
  'GIT.EXE commit --no-verify -m x', // basename git.exe, any case
  'git commit 2>&1 --no-verify -m x', // & in a redirect does not split
  'git commit \\\n --no-verify -m x', // backslash line continuation
  'git commit &> o --no-verify', // &> is a redirect
  'git commit &>o -n',
  'git commit --no-verify |& cat', // |& is one separator
];
for (const c of blocked) assert.ok(blockReason(c), `must block: ${c}`);

const allowed = [
  'git commit -m "fix --no-verify doc"', // text in quotes
  'git commit -mn', // n is the value of -m
  'git push -n', // push -n is a dry run
  'git log --no-verify', // unprotected subcommand
  'echo git commit --no-verify', // not a git command
  'git commit -m x -- -n', // flags end after --
  'git status',
  'git status 2>&1 && echo ok', // redirect + && still right
  'git status &> o && echo ok',
  'git commit -m x |& cat --no-verify', // flag belongs to cat, not git
];
for (const c of allowed) assert.equal(blockReason(c), null, `must allow: ${c}`);

// Real run over stdin
const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), 'block-no-verify.mjs');
const run = (input, file = hook) => execFileSync('node', [file], { input }).toString();
const bash = (command, file) => run(JSON.stringify({ tool_name: 'Bash', tool_input: { command } }), file);
const deny = (out) => JSON.parse(out).hookSpecificOutput.permissionDecision;
assert.equal(deny(bash('git commit --no-verify -m x')), 'deny');
assert.equal(deny(bash('git commit --no-verify -m x', hook.replace(/\\/g, '/'))), 'deny', 'script path with /');
assert.equal(bash('git status'), '');
assert.equal(run(JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'a' } })), '', 'Edit payload is silent');
assert.equal(run(''), '', 'empty stdin is silent');
assert.equal(run('not json'), '', 'broken stdin is silent');
assert.equal(run(JSON.stringify({ tool_name: 'Bash' })), '', 'missing tool_input is silent');

console.log('block-no-verify selftest OK');
