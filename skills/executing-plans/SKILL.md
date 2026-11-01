---
name: executing-plans
description: Run an approved plan that has plan.md and progress.md when the user picks inline or types /executing-plans. Main does the tasks allowed inline; tasks that need the developer agent, and HIGH/CRITICAL tasks, go to subagent-driven-development. Not for unapproved plans.
---

<!-- Replaces executing-plans of github.com/obra/superpowers (MIT, © 2025 Jesse Vincent), v6.4.1. -->

# Run a plan — inline

**Run only when the user explicitly asks to run the plan** (the three ways in the R-015 exception for approved plan
runs). Do not load this skill on your own before the user asks.
A request to run = a request for the whole execution phase, including fixes after review within the R-120 cap.

Read the [run-plan frame](../subagent-driven-development/references/run-plan.md) first and follow it; the section below
is step 3c of that frame.
Review templates: [dispatch templates](../subagent-driven-development/references/dispatch-templates.md).

## 3c · Main does it

- Step 2 (check before running) finds a task in the mandatory-developer-agent row (business logic, contract, schema,
  permissions, architecture, from MEDIUM) or a HIGH/CRITICAL task → stop and run the whole plan with
  `subagent-driven-development` (a task the user chose inline that is not in this group is still done by main there).
- Main does the task and writes `report/<ID>.md` itself.
- A task that writes a rule / skill / agent / hook / `CLAUDE.md` whose wording is not verbatim in the plan → stop the
  task and wait for the user to approve the wording before writing.
- Separate reviews, the final review, and tasks whose `Who` is `verifier` / `ux-tester` are still subagents (R-120).
  Findings on an inline task: main fixes, then re-runs "Done when"; a task that changes rules gets a confirmation round;
  other tasks get no confirmation round (R-120).
- When checking the diff and committing, apply the R-015 exception to `docs/artifact/index.json` generated from
  artifacts: this file does not count as outside `Files touched`; stage it separately after a byte check. Any other
  file outside `Files touched` still stops the task (R-003).
