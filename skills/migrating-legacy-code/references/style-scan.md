<!-- Adapted from github.com/affaan-m/ecc · skills/inherit-legacy-style/ (MIT, © 2026 Affaan Mustafa), v2.2.3, rewritten for this kit. -->

# Scanning the legacy code style

Goal: new code written inside an old system looks like the old authors wrote it. The result goes into the task's
`research.md` (R-092); do not write files at the repo root, add hooks, or edit project instructions.

## 1 · Scan size

Count source files: `git ls-files | grep -cE '\.(cs|ts|tsx|js|java|py)$'` (change the extensions to fit the stack).

| Files | How to read |
|---|---|
| ≤ 50 | read all |
| 50-500 | read all infrastructure; for business code take 2-3 samples per dimension |
| > 500 | tight sampling; look at recent `git log --stat` first to find the live areas |

## 2 · Four dimensions

1. File layout: declaration order, how files are split.
2. Naming of state and control flow.
3. Where infrastructure helpers live and how they are called.
4. Error handling (try/catch, interceptor, Result type).

## 3 · Majority and minority

- Minority < 5 % **and** < 10 places → follow the majority; record the minority under "Do not".
- Roughly equal, or two ways with different meaning → ask the user (R-138, batch the independent questions).
- Small project: 3 against 2 is not yet a majority → ask.

## 4 · Writing into `research.md`

A `## Style` section holds: the commit scanned + scan size · **Sample files** (path + what it shows) · **Naming / state
conventions** · **Do not**. On a later scan: `git diff <old commit> HEAD --stat`, append, do not overwrite.

Do not copy bugs from a sample file: take the structure, and write down any defect you see in the sample.
