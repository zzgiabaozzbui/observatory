---
name: systematic-debugging
description: 'Find the root cause before fixing a bug. Use for a bug, a red test, a stack trace, "error", "wrong", "not working", "prod is broken", "a user reported", or a red verify with no clear reason, even when the bug looks obvious.'
---
<!-- Adapted from github.com/obra/superpowers · skills/systematic-debugging/ (MIT, © 2025 Jesse Vincent), v6.4.1. -->

# Investigate a bug

**No fix proposal until the root cause is found.** Fixing a symptom is a failure, even when the test turns green.

## Two kinds of step

| Kind | Includes | Allowed in |
|---|---|---|
| **Read-only** | read the error and existing logs · reproduce in dev/test without editing files · trace backwards · compare · `git log` / `git diff`. Reproducing that must write shared data or call an external service → ask the user | every call |
| **Edits files** | adding diagnostic logs · changing one variable to test a hypothesis | a task that already has `intent.md` allowing edits within its scope (bug fix #6, a red verify in the running task), **after** `intent.md` (R-002); done by the agent that does the fix, by role (the `developer` agent for business logic, API contract, schema, permissions, architecture from MEDIUM; `quick-fix` for mechanical work). Incident (#3) and research: write the experiment as a proposal for the user (R-116); for #3 follow `routing` › `references/qa-research.md` › Incident |

## 1 · Evidence

1. Read the whole error message and stack trace: line numbers, paths, error codes.
2. Reproduce reliably: the exact steps, does it happen every time. Cannot reproduce → collect more data, do not guess.
3. Look at recent changes: `git log`, `git diff`, dependencies, configuration, environment.
4. Multi-layer system (CI → build → deploy, API → service → DB): log the data in / out at each boundary (adding logs = editing files), run once, see which layer breaks, then dig into that layer.
5. Where does the wrong value come from: trace backwards from the broken spot to the source: `references/root-cause-tracing.md`.

## 2 · Compare

Find similar code that works in the repo. List **every** difference between the working and the broken one, even the ones that "surely do not matter". Understand its dependencies: configuration, environment, assumptions.

## 3 · Hypothesis

Write one hypothesis: "X is the cause because Y". Test it with the smallest change, one variable at a time. Wrong → a new hypothesis, do not stack more fixes. Do not understand something → say "I do not understand X", do not pretend. A test change is temporary: undo it with your own Edit (no `checkout` / `restore`, R-114) before step 4.

## 4 · Fix

Follow the bug fix flow of `routing`: the reproducing test first and red, one change aimed at the root cause, no "while I am here" edits (R-010, R-011). An expensive bug (data loss, wrong money, data leak) → `references/defense-in-depth.md`. The round limit and how to stop when stuck follow R-119; several failed fixes in a row signal a wrong architecture → stop, discuss with the user, do not try once more. Investigation ends with the cause outside the code (flaky external service, environment) → record what was checked, handle it on purpose (timeout, capped retry, clear error), add a log.

## Diagnostic logs

- Print only match / no match, yes / no, length: **never the value, never a hash of the value** (a hashed ID, OTP or password can still be reversed by guessing; R-016, R-017). To compare two places, compare in code.
- Remove all temporary logs before commit (R-012).

## Excuses

| Thought | Reality |
|---|---|
| "Urgent, fix fast and investigate later" | A guessed fix costs more than an investigation; an urgent prod problem needs the right spot even more |
| "Add a retry / raise the timeout and done" | That hides the symptom; find why it is slow, why it fails |
| "Try one more way" | Past the R-119 limit → stop, ask the user |
| "Prod incident, put a log in the code to be quick" | In #3 no file is edited yet; propose the experiment to the user |
