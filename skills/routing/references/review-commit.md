# Review and commit

## Review

1. Pick the tier per R-120: a separate reviewer with fresh context, never reviewing its own diff. The `code-reviewer` agent reviews code, and also rule / skill / agent / hook / `CLAUDE.md` diffs.
2. Dispatch the reviewer with the description + plan/spec + `BASE..HEAD`, not the session history. This includes the review after each task of `subagent-driven-development`.
3. A finding is a hypothesis: read the cited place before fixing. The number of rounds follows R-120 (the confirmation round is only for HIGH/CRITICAL and rule diffs); do not loop until clean.
   The user rejects a finding: add one line to the task's `review.md` as
   `YYYY-MM-DD · <R- code or file#section> · why rejected`.
4. Handle findings:
   - Several reviewers or dimensions: merge duplicate findings first, same file + same quoted code (not line numbers, which differ between reviewers); keep the highest level. <!-- Adapted from github.com/affaan-m/ecc · workflows/orch-review.workflow.js (MIT, © 2026 Affaan Mustafa), v2.2.3. -->
   - Any item unclear: ask about all unclear items before fixing any (R-138); items may be related.
   - Five checks before fixing: is it true for this code · does it break anything that works · why does the current code do it this way · does it work on every platform / version the project supports · did the reviewer have enough context.
   - Reviewer asks to "make it complete": check real usage; if nothing calls it, ask the user to drop it (YAGNI) instead of adding more.
   - A finding looks wrong: mark it `deferred` or ask the user with the technical reason; never reject it yourself (only the user rejects).
   - Fix order: blocking (breaks, security) · simple (typos, imports) · complex (logic, refactor); run tests after each item, regression check last.
   - Report one line per item: what was fixed, where. No thanks, no praise.

## Verify

The command depends on the artifact type (R-119): code → the project's verify command · hook → its selftest + compare copies · rules / skills → the repo's own structure check script (if any) · config → syntax check.

| Claim | Evidence | Not enough |
|---|---|---|
| Tests green | output of this turn's test command: 0 failed | an earlier run, "should pass" |
| Builds | build command exits 0 | clean lint, plausible log |
| Bug fixed | a test reproducing the original symptom passes | the code was changed |
| Regression test works | red-then-green cycle (`test-driven-development`) | one green run |
| Agent finished | `git diff` shows the right change, main re-runs the command | the agent says "done" |
| Meets the requirement | check each acceptance / "done when" line | tests green |

## Verify fail

1. Classify per R-119. Fixing a regression: `systematic-debugging`, at most 2-3 rounds, inside scope. Roll back only your own change (R-012, R-114).
2. Stuck: stop, keep the failing state, and offer 3 choices: A keep fixing with an adjusted scope · B roll back your part · C leave it as is for the user to look at.

## Choosing model and effort

Base rule: R-007.

- Do not force every subagent to be cheaper than the main session. Use only versions that the client and account support.
- The default effort is the starting point for most work. Mechanical work can use `low`; hard work can go up one step at a time when there is evidence it needs more analysis or checking. Check the effective level and organization limits; do not assume every model has the same levels.
- Before changing model or effort, check the prompt, scope, source, context, tools and environment errors. Understood correctly but skipped a step: consider more effort. Still reasoning wrongly with enough context: propose a stronger allowed model to the user; a top-tier model for a subagent only when the user asks by name (R-007). Repeated checking or out-of-scope work: clarify the stopping point first.
- When changing model, retry with the new model's default effort. Effort does not replace verification or widen scope.
- Cheap lookups: the `Explore` agent with a small model.

## Subagent got it wrong

Check the prompt, scope, source, context, tools and environment first. Change model or effort only on evidence and per R-007. Do not blame every failure on weak capability or low effort. When re-running, keep the same acceptance criteria and record the verification result.

## Commit

Commit · push · tag · release → Skill tool with `commit-push`.
