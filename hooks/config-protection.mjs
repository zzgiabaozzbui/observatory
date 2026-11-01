#!/usr/bin/env node
// PreToolUse hook: protect lint / format config files. The agent must fix the code to pass the checks, not loosen the config.
//
// Why: when lint is red, a model often edits `biome.json` / `.eslintrc` to go green instead of fixing the code;
// asking in prose is not enough, so the rule is enforced at the hook layer.
//
// Claude Code: PreToolUse matcher `Edit|Write|MultiEdit|NotebookEdit`.
//
// Blocks when the file basename (case-insensitive) is in the list AND the file already exists; creating a new one passes.
// Not protected: tsconfig*, vite.config.*, package.json, .editorconfig, test config.
// Opt-out for a user who really wants to edit config: env ATHENA_CONFIG_PROTECTION=off.
// Adapted from github.com/affaan-m/ecc · scripts/hooks/config-protection.js (MIT, © 2026 Affaan Mustafa), v2.2.3.
// ponytail: only blocks file-writing tools; Bash sed/echo can still dodge it. Block Bash when a real bypass shows up.
//
// No external packages. Never throws: a failing hook must not block work.

import fs from 'node:fs';
import path from 'node:path';

export const REASON =
  'Lint / format config files are protected: fix the code to pass the checks, do not loosen the config. ' +
  'If a change is truly needed, tell the user: they edit it themselves or set ATHENA_CONFIG_PROTECTION=off, even if they already approved it in chat. Do not edit via Bash (sed, echo >).';

const NAMES = new Set([
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml',
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', 'eslint.config.mts', 'eslint.config.cts',
  '.prettierrc', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.json', '.prettierrc.yml', '.prettierrc.yaml',
  'prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs',
  '.commitlintrc', '.commitlintrc.json', '.commitlintrc.yml', '.commitlintrc.yaml', '.commitlintrc.js', '.commitlintrc.cjs', '.commitlintrc.mjs', '.commitlintrc.ts',
  'biome.json', 'biome.jsonc', '.biome.json', '.biome.jsonc',
  '.stylelintrc', '.stylelintrc.json', '.stylelintrc.yml', '.stylelintrc.yaml', '.stylelintrc.js', '.stylelintrc.cjs', '.stylelintrc.mjs',
  'stylelint.config.js', 'stylelint.config.cjs', 'stylelint.config.mjs', 'stylelint.config.ts', 'stylelint.config.mts', 'stylelint.config.cts',
  '.markdownlint.json', '.markdownlint.jsonc', '.markdownlint.yaml', '.markdownlint.yml', '.markdownlint.cjs', '.markdownlint.mjs',
  '.markdownlintrc',
  '.markdownlint-cli2.jsonc', '.markdownlint-cli2.yaml', '.markdownlint-cli2.cjs', '.markdownlint-cli2.mjs',
  'ruff.toml', '.ruff.toml', '.shellcheckrc',
  '.eslintignore', '.prettierignore', '.stylelintignore', '.markdownlintignore',
]);

const PATTERNS = [
  /^(eslint|prettier|stylelint|commitlint|oxlint)\.config(\.[A-Za-z0-9_-]+)*\.(js|mjs|cjs|ts|mts|cts)$/i,
  /^\.(eslintrc|prettierrc|stylelintrc|markdownlintrc)(\.[A-Za-z0-9_-]+)*\.(js|cjs|mjs|ts|mts|cts|json|jsonc|json5|yml|yaml|toml)$/i,
];

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** Nearest ancestor of `start` (or itself) holding `.git`; null when none. */
function repoRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** Target file and cwd of a file-writing tool call; not a write tool → null. */
function writeTarget(payload) {
  if (!WRITE_TOOLS.has(payload.tool_name || '')) return null;
  const input = payload.tool_input || {};
  return { file: input.file_path || input.notebook_path, cwd: payload.cwd };
}

/** Whether the file basename is in the protected list. */
export function isProtected(name) {
  return NAMES.has(name.toLowerCase()) || PATTERNS.some((re) => re.test(name));
}

function main() {
  if (process.env.ATHENA_CONFIG_PROTECTION === 'off') return;
  let payload = {};
  try { payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { /* empty stdin */ }
  const w = writeTarget(payload);
  if (!w || !w.file || !isProtected(path.basename(w.file))) return;

  const base = process.env.CLAUDE_PROJECT_DIR || w.cwd || process.cwd();
  if (!fs.existsSync(path.resolve(repoRoot(base) || base, w.file))) return;

  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: REASON } }));
}

if (process.argv[1]?.endsWith('config-protection.mjs')) { try { main(); } catch { /* silent by design */ } process.exit(0); }
