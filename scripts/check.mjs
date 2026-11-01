#!/usr/bin/env node
// Structure check for the plugin repo. Usage: node scripts/check.mjs [root]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const errors = [];
const fail = (file, line, msg) => errors.push(`${relative(root, file).replaceAll('\\', '/')}:${line}: ${msg}`);
const read = (f) => readFileSync(f, 'utf8');
const lines = (f) => read(f).split(/\r?\n/);
const at = (...p) => join(root, ...p);

// Files under `dir` (recursive), skipping any path that contains `skip`.
const walk = (dir, skip = '') =>
  !existsSync(dir) ? [] : readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (skip && p.replaceAll('\\', '/').includes(skip)) return [];
    return statSync(p).isDirectory() ? walk(p, skip) : [p];
  });
const subdirs = (dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory()) : []);
const md = (dir) => walk(dir).filter((f) => f.endsWith('.md'));

const frontmatter = (f) => {
  const m = read(f).match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  return m ? Object.fromEntries(m[1].split(/\r?\n/).map((l) => l.match(/^(\w+):\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()])) : {};
};
const json = (f) => {
  try { return JSON.parse(read(f)); } catch (e) { fail(f, 1, `invalid JSON: ${e.message}`); }
};

// 1. manifests
const pluginFile = at('.claude-plugin', 'plugin.json');
const marketFile = at('.claude-plugin', 'marketplace.json');
if (!existsSync(pluginFile)) fail(pluginFile, 1, 'missing');
else json(pluginFile);
if (!existsSync(marketFile)) fail(marketFile, 1, 'missing');
else for (const p of json(marketFile)?.plugins ?? []) {
  const manifest = join(root, p.source, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifest)) fail(marketFile, 1, `source "${p.source}" has no .claude-plugin/plugin.json`);
  else if (json(manifest)?.name !== p.name) fail(marketFile, 1, `plugin name "${p.name}" differs from ${p.source} manifest`);
}

// 2. skills
const skillRoots = [at('skills'), ...subdirs(at('plugins')).map((n) => at('plugins', n, 'skills'))];
for (const sr of skillRoots) for (const name of subdirs(sr)) {
  const f = join(sr, name, 'SKILL.md');
  if (!existsSync(f)) { fail(join(sr, name), 1, 'missing SKILL.md'); continue; }
  const fm = frontmatter(f);
  if (fm.name !== name) fail(f, 1, `frontmatter name "${fm.name ?? ''}" must equal folder "${name}"`);
  if (!fm.description) fail(f, 1, 'empty description');
}

// 3. agents
for (const f of walk(at('agents')).filter((f) => f.endsWith('.md'))) {
  const fm = frontmatter(f);
  if (!fm.name) fail(f, 1, 'missing name');
  if (!fm.description) fail(f, 1, 'missing description');
  if (fm.tools?.includes('mcp__')) fail(f, 1, 'tools must not contain mcp__ entries');
}

// 4. relative Markdown links (fenced code skipped)
const docs = [...md(at('skills')), ...md(at('agents')), ...md(at('rules')), at('README.md')].filter(existsSync);
for (const f of docs) {
  let fenced = false;
  lines(f).forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fenced = !fenced;
    if (fenced) return;
    for (const [, href] of l.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      if (/^([a-z][a-z0-9+.-]*:|#)/i.test(href)) continue;
      const target = resolve(dirname(f), decodeURI(href.split('#')[0]));
      if (!existsSync(target)) fail(f, i + 1, `broken link ${href}`);
    }
  });
}

// 5. R-NNN codes need a definition line in rules/core.md or any file under skills/
const defRe = /^\s*(?:[-*]|#{1,6})\s+(R-\d{3})\b/;
const defined = new Set([at('rules', 'core.md'), ...walk(at('skills'))]
  .filter(existsSync).flatMap((f) => lines(f).map((l) => l.match(defRe)?.[1]).filter(Boolean)));
for (const f of docs.filter((f) => f !== at('README.md')))
  lines(f).forEach((l, i) => {
    for (const [code] of l.matchAll(/R-\d{3}\b/g)) if (!defined.has(code)) fail(f, i + 1, `${code} has no definition`);
  });

// 6. no Vietnamese diacritics
const viRe = /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/iu;
const appDir = 'plugins/observatory/skills/observatory/app/';
const viFiles = [...walk(at('skills')), ...walk(at('agents')), ...walk(at('rules')), ...walk(at('hooks')),
  at('README.md'), at('plugins', 'observatory', 'skills', 'observatory', 'SKILL.md')].filter(existsSync);
for (const f of viFiles.filter((f) => !f.replaceAll('\\', '/').includes(appDir)))
  lines(f).forEach((l, i) => { if (viRe.test(l.replaceAll('CHỜ-USER', ''))) fail(f, i + 1, 'Vietnamese diacritics'); });

// 7. SessionStart output size (skipped until the hook exists)
const hook = at('hooks', 'session-start.mjs');
if (existsSync(hook)) {
  const r = spawnSync(process.execPath, [hook], { input: '{"source":"startup"}', encoding: 'utf8', cwd: root });
  if (r.stdout.length > 9000) fail(hook, 1, `SessionStart output ${r.stdout.length} chars exceeds 9000`);
}

errors.forEach((e) => console.log(e));
process.exit(errors.length ? 1 : 0);
