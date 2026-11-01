# Project context before stack-dependent actions

The project declares its own stack, verify commands and agent / skill mapping in its `CLAUDE.md` (or `.claude/rules/`). Use one project info source; if several files claim that role, report the conflict before any configuration-dependent action. No such declaration yet: continue read-only or mechanical work the rules allow; before stack-dependent implementation, report what is missing and do not guess. A short section is enough, for example:

```md
## Stack and verify
- Stack / renderer, module paths
- Developer agent for the stack (default: `developer`) and the project's own stack guide, if any
- Verify commands: typecheck, test, lint, build
- Access for database or services: which narrow doors exist; no credentials in the file
```

Match stack or renderer, module paths, implementing agent, the stack guide / library / test / review / permission / schema guides, verify commands and integration conditions with the real project. A field that does not apply says `none`; do not use that to skip a mandatory gate. Call only agents, skills and tools that exist in the harness; seeing a name in a file is not enough. When one is missing, report the exact dependency or mapping to add and stop that step. Never move mandatory developer-agent work to `main` or a general-purpose agent.

The profile only picks the project-specific parts: it does not widen scope, change the model rule (R-007), allow inline credentials (R-017), skip red-test-first (bug fixes and behavior changes from MEDIUM, R-139), skip review per R-120 ([review-commit.md](review-commit.md) › Review) or skip the sensitive-data check before every commit. Never store credentials, connection strings, or internal database / host / IP names in it.

The executor opens the stack guide before code, the protective guide before that operation, and runs the full verify command before reporting done. `main` passes the mapping and the matching gates in the dispatch prompt.

**Done when** the mapping for the coming step is stated (agent, guide, verify command), or the missing part is reported and that step stops.

## Repo with several stacks

A repo with two or more stacks: the project info must have a stack map, one row per root folder with stack, developer agent, stack guide and verify command.

- A file's stack is the row with the longest root folder containing that file. The guide and agent come from this row, not from another stack in the repo.
- A file in no row: tell the user the row is missing, do not guess the stack. Shared non-UI code (a types library, an API client) gets its own row.
- A task touching files of two or more stacks: split per stack, one developer agent and one verify command per part. Shared-code changes go first, stack parts after.
- Several stacks and no map: tell the user the map is missing and stop stack-dependent steps. A single-stack repo needs no map.

## Local developer agent for a stack without one

The core rules require business logic from MEDIUM to go to a developer agent for the stack (business logic, API contract, schema, permissions and architecture from MEDIUM; `quick-fix` for mechanical work), never to `main` or `general-purpose`. If the project's stack needs its own agent, the project creates `.claude/agents/<project>-<kind>-dev.md` and names it in its `CLAUDE.md`. No agent yet: tell the user the template below; do not do the work in its place.

```md
---
name: <project>-be-dev
description: Backend developer for <project> (<stack>). MANDATORY for business logic, APIs and schema from MEDIUM. Takes a task naming the files, returns a diff + verify command output.
model: sonnet
---
Read the project info first. Load the project's stack guide (if any) before the first line of code.
Bug fixes and behavior changes from MEDIUM: red test first (R-139). Edit only the assigned files; when done run the full declared verify command.
Do not commit, do not call other agents.
```

The pinned model must be an allowed one (R-007). A local agent still goes through the reviewer per R-120.
