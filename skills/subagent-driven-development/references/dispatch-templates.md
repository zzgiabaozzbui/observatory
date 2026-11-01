# Dispatch prompt templates

Templates for `subagent-driven-development`; Review plan is used from `writing-plans`. Fill in `<…>`. Do not paste the
history of earlier tasks. An empty field gets "none". Main does not write "do not mention", "at most MEDIUM" or "the
plan chose this" into a reviewer prompt — a wrong finding is handled afterwards, per mode.

## Implementer

```text
Task <ID> · <name> — <one line: where the task sits in the plan, what earlier tasks already finished that matters>.

Read first:
- <absolute path>/plan.md — ONLY section `### <ID>` (requirements, files, the "Done when" command).
- <the spec section the task points to: path + heading> / none.

Global constraints (verbatim from the plan's Global Constraints): <…> / none.
From earlier tasks (interfaces, decisions in `Decided`, relevant `deferred` findings): <…> / none.
Backend contract (UI task after the contract gate): <URL, request/response DTOs, UI-driving fields if the real contract has them> / none.

Scope: repo <absolute path>; edit only files in `Files touched`: <list>.
- Skip the `Commit` step in the plan; do not commit, do not push.
- A bug fix, or a behavior change in running code from MEDIUM → call the Skill tool with `test-driven-development`, red test before the fix (R-139).
- Do not edit plan.md or progress.md. Do not call subagents.
- Stop and report (BLOCKED / NEEDS_CONTEXT) when: you must choose between several architectural approaches; you need to
  understand code outside the scope and it is unclear; you must edit a file outside `Files touched`; the plan / spec
  does not say enough to choose a behavior (boundary values, error messages, an unnamed regulation) — do not interpret.

Finish: run the section's "Done when" command; write <artifact folder>/report/<ID>.md in the form below — only the
command and the last result line, no raw logs, mask personal data.

Return ≤ 15 lines: Status DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED · files changed · verify line · Chose by
itself · concerns · report path.
```

Report form:

```markdown
# <ID> · <task name>

## Round 1 · <agent> · <YYYY-MM-DD>
- Did: <1–3 lines>
- Verify: `<command>` → <last result line>
- Deviation from plan: none | <where, why>
- Chose by itself: none | <a place the plan/spec did not cover and you only noticed after doing it; what you chose>
- Concerns: none | <…>
```

A fix round appends a section `## Fix round 1 · <YYYY-MM-DD>` with `Finding:` (pointing to the line in `review.md`) and
`Verify:` (the covering test command → result).

## Review plan

Before presenting the plan to the user for approval (`writing-plans` §6). The plan has not run; there is no diff.

```text
Review plan <artifact folder> before the user approves. The plan has not run.
There is no BASE..HEAD range: this is a plan review, skip the diff / git step in the agent file.

Read: intent.md · spec.md / none · plan.md · progress.md · decision.md and the ADRs it points to / none.
Compare against the current source of the files the plan will touch.
Check:
- the plan covers every acceptance line and spec section; a spec that contradicts itself or is missing something (an
  arrow with no contract, a main flow with no sequence);
- every Done-when command runs without a person and proves the task is right;
- Interfaces match across tasks; each `accepted` ADR has a Global Constraints line;
- `spec.md` has a new container / new arrow in the contract table → the plan opens with a vertical-slice group, and
  every main flow has a task carrying its e2e;
- HIGH / CRITICAL has reason, risks, rollback; a rules plan has verbatim wording.
Findings by level (CRITICAL / HIGH / MEDIUM / LOW), with the plan / spec line and a concrete fix.
Do not call subagents.
```

## Review task

Main packs the diff into a file in a temp folder outside the repo (Claude: scratchpad), leaving out generated files:
`{ git log --oneline <base>..HEAD; git diff --stat <base>..HEAD; git diff -U10 <base>..HEAD; } > <temp>/review-<ID>.txt`.

```text
Review task <ID> · <name>: <one-line description>.

Requirements: <plan.md> section `### <ID>` + <spec section> / none.
Global constraints: <…> / none.
Range: <base>..HEAD.
Diff pack: <temp>/review-<ID>.txt — read this file first.
Implementer's statement: <report/<ID>.md> — an unchecked statement: compare with the diff; a reason the author gives
(keep it simple, YAGNI…) does not lower a finding's level; a `Chose by itself` line already settled → the final decision
is in `Decided` of `progress.md`.
The tests in the report have run and main re-ran the check command; do not re-run unless you suspect one specific place.
Besides the usual format, add a section "Cannot check from the diff": a requirement that sits in unchanged code or
spans several tasks (empty → write "none").
Do not call subagents.
```

Main checks each "Cannot check from the diff" line itself before switching the cell to `DONE`; a line that is a real
hole → treat it as a finding.

## Confirm

```text
Confirmation round for task <ID>. Findings to check (verbatim):
1. <…>

Fix commit range: <sha before the fix>..HEAD. Report: <report/<ID>.md> (section Fix round 1).
For each finding: FIXED / NOT FIXED with file:line ("tried" is not fixed).
New defects in the fix diff: <level + file:line> / none.
Issues outside the fix diff: note separately, do not extend the round / none.
Do not call subagents.
```

## Final review

<!-- Spec-comparison table draws on github.com/github/spec-kit · templates/commands/converge.md (MIT, © GitHub, Inc.), v1.2.5. -->
Main packs the diff into a file in a temp folder outside the repo (Claude: scratchpad), leaving out generated files:
`{ git log --oneline <chay_tu>..HEAD; git diff --stat <chay_tu>..HEAD; git diff -U10 <chay_tu>..HEAD; } > <temp>/review-final.txt`.

```text
Final review of plan <artifact folder>. Range: <chay_tu>..HEAD (leave out generated files: <…> / none).
Diff pack: <temp>/review-final.txt — read this file first.

Read: intent.md · spec.md / none · plan.md · the plan's Review Focus (verbatim) / none · the `deferred` lines of
review.md · progress.md › Decided (including mode-3 decisions).

Requirements:
- Behavior the spec does not mention → grade by the user's reasonable expectation, by consequence.
- Add a section "Ruled out": each behavior that was considered but left outside the spec, with the reason (empty → "none").
- Add a section "Cannot check from the diff" as in the task review.
- Add a table "Spec comparison": one row per spec section (no spec → per completion criterion of intent)
  `section · full | partial | missing | contradicts · evidence file:line`; `full` rows with the same evidence may merge.
  Add a row `outside request` for behavior the diff has that the spec and plan do not mention and that is not in
  "Ruled out"; default level MEDIUM, raised by consequence. A DONE mark in progress.md and a statement in a report
  are not evidence. A row other than `full` is a finding: `missing`, `contradicts` from HIGH; the rest graded by
  consequence; rows with the same cause merge into one finding.
Do not call subagents.
```
