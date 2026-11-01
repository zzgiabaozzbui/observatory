# Large feature with a plan

> Before a stack-dependent step, apply [project-context.md](project-context.md); agent and skill names in examples apply only when the project maps them and their availability was checked.

No plan yet: call the Skill tool with `brainstorming`, then `writing-plans` (R-118). Artifacts go to
`docs/artifact/<YYYY-MM-DD-HHMM-name>/` (chain: intent, spec if any, plan + progress; R-092); call `docs-standards` before writing.
The agent **proposes** a run mode (`/subagent-driven-development` or `/executing-plans`); the user chooses (R-118). The agent never moves from plan to execution by itself.

## One side

Backend only, frontend only, or only rules / hooks / docs. After the plan is approved, the approval question of `writing-plans` asks how to run (delegate to agents / inline / later), the question mode and the branch; for "later" the user types `/subagent-driven-development <artifact folder>` or says "run the plan".
`subagent-driven-development` checks first, delegates by the `Who` column, reviews per R-120 ([review-commit.md](review-commit.md) › Review), commits each task, then does a final review.

## Both sides

Backend + frontend, or a contract change. Same as One side; `subagent-driven-development` adds a contract gate between backend and frontend.
