#!/usr/bin/env node
// SessionStart hook: print core rules plus a routing reminder to stdout (added to context).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const START = "Session start: before acting on the user's first message, the agent invokes skill `routing`.";
const COMPACT = 'Context was just compacted: the agent does not invoke `routing` again; a running plan resumes from intent.md and progress.md.';

export function output(source, rulesText) {
  const note = source === 'compact' ? COMPACT : START;
  return rulesText ? `${rulesText}\n\n${note}\n` : `${note}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    let source = 'startup';
    try { source = JSON.parse(readFileSync(0, 'utf8')).source ?? source; } catch {}
    let rules = '';
    // ponytail: resume also prints rules (~2k tokens each time); drop when a resumed transcript is shown to keep them.
    try { rules = readFileSync(new URL('../rules/core.md', import.meta.url), 'utf8').trimEnd(); } catch {}
    process.stdout.write(output(source, rules));
  } catch {}
}
