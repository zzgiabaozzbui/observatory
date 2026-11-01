---
name: subagent-driven-development
description: Run an approved plan that has plan.md and progress.md when the user chooses delegation, types /subagent-driven-development or says run the plan. Delegates by Who, reviews and commits each task; for tasks that require the developer agent and HIGH/CRITICAL tasks. Not for unapproved plans.
---

<!-- Replaces subagent-driven-development of github.com/obra/superpowers (MIT, © 2025 Jesse Vincent), v6.4.1. -->

# Run a plan — delegate to agents

**Run only when the user explicitly asks to run the plan** (the three ways in the R-015 exception for approved plan
runs). Do not load this skill on your own before the user asks.
A request to run = a request for the whole execution phase, including fixes after review within the R-120 cap.

Read `references/run-plan.md` first and follow it; the section below is step 3c of that frame. Delegation templates:
`references/dispatch-templates.md`.

## 3c · Delegate

Per `references/dispatch-templates.md` › Implementer.

- `Who` is the `developer` agent or `quick-fix` → delegate to that agent; an agent with no pinned model gets a `model`
  per R-007.
- `Who` = `main` → main does it when the task is LOW, ≤ 1 file, a few lines, or a coordination file whose wording is
  verbatim in the approved plan.
- A task that writes a rule / skill / agent / hook / `CLAUDE.md` whose wording is not verbatim in the plan → stop the
  task and wait for the user to approve the wording before writing, in every mode.
- Several LOW tasks of the same mechanical kind → batch them into one `quick-fix` dispatch with one report named after
  the first ID; never batch CRITICAL tasks.
- A task the user chose to run inline (`Decided`) that is not in the mandatory-developer-agent row (the `developer`
  agent for business logic, API contract, schema, permissions, architecture from MEDIUM; `quick-fix` for mechanical
  work) and is not HIGH/CRITICAL → main does it per `executing-plans` › 3c.
