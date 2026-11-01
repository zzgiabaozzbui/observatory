---
name: writing-plans
description: Write plan.md + progress.md for a task whose intent (and spec, if any) is settled, for the user to approve and then run. Use for "write a plan", "plan this", "split into tasks", HIGH/CRITICAL tasks (R-117) and multi-step features. Not for requests that are still vague.
---
<!-- Adapted from github.com/obra/superpowers · skills/writing-plans/ (MIT, © 2025 Jesse Vincent), v6.4.1; §2 code tasks and §6 item 8 from v6.4.2. -->

# Write the plan

Input: `intent.md` (and `spec.md` if any), settled in the artifact folder (R-092). A request that is still vague →
clarify first, do not write a plan yet. The file structure lives in `docs-standards` › `style.md` (rows `plan.md`,
`progress.md`, R-132); this skill is the method and does not redefine it.

## 1 · File map

Before splitting into tasks, list the files to create or edit and the job of each. One file, one responsibility; files
that change together live together; follow the repo's existing structure.

## 2 · Split into tasks

- Task size per `style.md` (one purpose, one verify command, ≤ 3 files). Extra test: split where a reviewer could
  reject this task and still approve the next; setup, config and docs merge into the task that needs them.
- Each task: a section `### <ID>: <name>`, a pointer to the spec section or acceptance line, `Who` by role (the
  `developer` agent for business logic, API contract, schema, permissions, architecture from MEDIUM; `quick-fix` for
  mechanical work), and a **Done when** command that runs without a person (exit 0 = pass).
- `spec.md` has a new container or a new arrow in the contract table (`architecture` level 2) → the plan opens with a
  **vertical-slice group**: the thinnest main flow that runs through every such container (with login if the flow
  needs it), sample data, no polish. Each task in the group has one stack, one `Who`, and passes the contract gate
  (`subagent-driven-development` › `run-plan.md` §6); the last task of the group has a **Done when** that runs the
  flow's e2e. Later tasks build on this group. No new container / arrow → not required.
- A plan with a vertical-slice group → the last task of each main flow (a sequence in `spec.md`) carries that flow's
  e2e in **Done when**. The e2e command follows the project's declared verify command, e2e web tests follow skill
  `e2e-playwright`; none declared → the vertical-slice group builds the e2e infrastructure, and any new dependency is
  named in the lead-in to the approval question (§7). A system without UI → API-level e2e. The e2e command is re-run by
  `verifier` or main (R-119).
- The **Interfaces** block (meaning in `style.md`): the implementer reads only its own task; this block is where it
  learns the names in neighboring tasks.
- Code tasks: signatures in Interfaces (name, parameters, return type), the file that holds them, the values the spec
  fixes, and the Done-when command. Do not copy code bodies into the plan, except an algorithm that the signature and
  tests do not determine — state the reason right on the code block.
- Test steps: test name + assertion, carrying the exact values from the spec.
- Rule / skill / agent / hook / `CLAUDE.md` tasks: verbatim wording (`style.md`); if missing,
  `subagent-driven-development` stops the task and waits for the user to approve the wording.

## 3 · Plan header

Front matter `tao_boi` / `tao_luc` (R-132) · Goal (one sentence) · Architecture (2–3 sentences) · Spec · **Global
Constraints** · **Review Focus**, meaning and limits in `style.md`. Review Focus: the most likely problem first.

The artifact folder has `decision.md` → each `accepted` ADR in it becomes one `Global Constraints` line: the decision
sentence + link to the ADR. An ADR still `proposed` → add an **ADR** question to the plan approval (§7). Approving the
plan does not settle the ADR.

A plan with code tasks → one `Global Constraints` line: "New code follows R-169: plain, each piece of business logic
in one place, five-question check before reporting done."

## 4 · No blanks

These patterns are plan defects: "TBD", "do later" · "add suitable error handling", "handle edge cases" · "same as
Task N" · a type or function name that no task defines.

## 5 · Write the files

`progress.md` first (R-132 table, every cell `TODO`, the `Decided` section, the `Tried, did not work` section), then
`plan.md`: the table-checking hook reports an error when the order is reversed. No progress checkboxes, no Commit
step inside a task (R-118).

## 6 · Self-review

1. Spec coverage: every requirement points to a task; missing → add a task.
2. Blanks: scan for the patterns in §4.
3. Consistency: names and signatures in Interfaces match across tasks.
4. Review Focus: every line has a test in the task that owns it.
5. HIGH / CRITICAL: the plan states reason and risks (R-117) and has `rollback*` (R-133).
6. ADR: every `accepted` ADR in `decision.md` has a `Global Constraints` line.
7. Vertical slice, e2e: if `spec.md` has a new container / arrow the plan opens with a vertical-slice group; every
   main flow has a task carrying its e2e.
8. Proportion: a plan many times longer than the spec (no spec → intent), or code blocks making up most of the plan →
   the plan is copying code; replace code bodies with signatures, test names and assertions.

Fix in place, no second self-review.

A HIGH / CRITICAL plan (R-117), a plan with both backend and frontend tasks, or one that changes a contract →
dispatch `code-reviewer` (it reviews plans as well as diffs) with the template in `subagent-driven-development` ›
`dispatch-templates.md` › Review plan; one pass covers both `spec.md` and `plan.md`. A plan review is not a diff
review, so it sits outside the R-120 cap: one round, no confirmation round. Fix plan findings before presenting.
A finding that needs a spec change, or a finding left unfixed → name it in the lead-in before the approval question
(§7); approving the plan approves the spec change in that lead-in. Other plans are not dispatched.

## 7 · Approve and run

The lead-in (chat text right before the ask tool) names: unfixed plan-review findings and spec changes (§6), new
e2e dependencies (§2).

One ask-tool call (R-138; `AskUserQuestion`, or a numbered list when there is no ask tool), ≤ 3 questions, plus the
ADR question if any (> 4 questions → parallel calls, R-138):

- **Plan approval:** Run now, delegate to agents by `Who` (recommended) · Run now inline · Approve, run later · Edit the plan.
- **Question mode** (`subagent-driven-development` › `run-plan.md` §5): 2 · Batch at the end (recommended) · 1 · Ask now · 3 · Decide myself · Skip.
- **Branch** — only when on the main branch (R-015): Create a new branch (recommended) · Work on the current branch
  (commits go to the main branch) · Skip.
- **ADR** — only when `decision.md` has a `proposed` ADR, one question per ADR: Settle as `accepted` (recommended) ·
  Keep `proposed`. Settle → edit `trang_thai` and the index line (commit per R-015: `docs/adr/` is not a task
  artifact, list it and wait for the user's OK); add the `Global Constraints` line for that ADR to `plan.md` before
  committing the artifacts. Keep `proposed` → the plan does not run now: record `Decided` as `Approve, run later`
  even if the plan approval question chose run now.

After the answers:
- `Edit the plan` → edit as the user says, ask again; the other answers are not used.
- Approval (any choice except `Edit the plan`) → write the `Decided` section of `progress.md`: the plan-approval line,
  run mode, question mode, branch and the ADR results (a question answered `Skip` is not recorded). Commit the
  artifacts per `commit-push` (branch `Skip` while on the main branch → ask for the branch at the commit step), then
  write `plan_duyet` = `HEAD` into the `progress.md` front matter and commit (R-132).
- No ADR answered Keep `proposed` and the answer is "Run now, delegate to agents" → call the Skill tool with
  `subagent-driven-development`; "Run now inline" → `executing-plans`. Run later → stop, name how to call it:
  `/subagent-driven-development <folder>` (or `/executing-plans <folder>`) or say "run the plan".

## Rationalizations

| Thought | Reality |
|---|---|
| "Copy the code into the plan to be safe" | A code task carries signatures + a check command; the body is the implementer's job, except an algorithm the signature and tests do not determine (§2) |
| "This task is like task 3, just reference it" | Write it out; the implementer may read only this task |
| "The user approved, run it now" | Run only when the user chose to run at the approval question (exception: commits during an approved plan run, R-015) |
| "Ask for approval, then ask how to run" | One ask-tool call; chained questions cost an extra step |

## R-118 · Commits and how a plan runs

- Skills and agents do not commit on their own: verify done → stop → tell the user → commit per R-015. A green verify
  or GREEN test ≠ permission to commit. A `Commit` step in a plan is done by main per R-015; the implementer skips it.
- Planning / execution workflows: the agent **proposes** (`/subagent-driven-development` or `/executing-plans`), and
  the user picks how to run the plan (the plan approval question of this skill).
- Artifacts go into the task's artifact folder (R-092), **not** the plugin's default folder.
