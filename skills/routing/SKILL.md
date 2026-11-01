---
name: routing
description: 'Route the first message of a session and every new request mid-session (implementation, Q&A, research, review), including multi-step features and mock/demo screens in a real app; also use when the user asks about flows or agents.'
---

# Request routing

Run `routing` on every new request, also mid-session (what counts as new: [references/flow-question.md](references/flow-question.md) › Switching flows). A new request that names no flow gets the flow question (§2) before any repo exploration.
A message that already names its flow (`Flow: #N`, a flow name, the `developer` agent, a slash command), a Q&A (#1) or research (#2) that edits no file, a small mechanical job, or a greeting: do not ask; print `Flow: #N` (§4) and work. If #1 / #2 turns into a file edit, ask the flow question first.

This skill is a **map**, not a source of rules: each reference keeps only the order of steps and where to call skills. A skill's content lives in its own `SKILL.md`.

After a flow is chosen, before dispatching the `developer` agent, calling the project's stack guide or running the project's verify command, open [references/project-context.md](references/project-context.md). `researcher`, `quick-fix` and reviewers do not need this step.

## 1 · Place the request

**Done when** there is one recommended flow plus at most 3 runners-up.

### R-115 · Pick the smallest workflow that keeps the required checks

Pick the workflow with the fewest steps that still has the mandatory verification. **Does not apply to HIGH/CRITICAL (R-117).** Q&A, lookups, clarifying a request, small text edits: no full workflow.

### Main flows — idea to delivery

| # | Case | Signals | Level (R-117) | Open |
|---|---|---|---|---|
| 4 | Vague request | unclear what to do or where | - | [references/clarify.md](references/clarify.md) |
| 17 | Large one-sided feature | one side (backend, frontend, or docs/config), splits into 2+ tasks each with its own diff and check command | by content | [references/plan.md](references/plan.md) › One side |
| 18 | Feature across backend + frontend | contract change, new field reaching the UI | by content | [references/plan.md](references/plan.md) › Both sides |
| 23 | Code review | "review", "look at the diff" | - | [references/review-commit.md](references/review-commit.md) › Review |
| 24 | Commit / push / merge | "commit", "push", "open a PR", "tag", "release" | - | Skill tool with `commit-push` |

User approval points: scope (4) · spec if any, plan (17/18) · after review, before commit (23 to 24). While a plan runs (`subagent-driven-development` or `executing-plans`), approving the plan replaces approving each commit (R-015). Boundaries between steps decide context handling: [references/phase-boundaries.md](references/phase-boundaries.md).

### Spawned flows — one job creates another, then joins a main flow

| # | Case | Signals | Level | Open |
|---|---|---|---|---|
| 3 | Production incident | "prod is down", "users report", "outage" | by the fix | [references/qa-research.md](references/qa-research.md) › Incident |
| 6 | Bug fix | "bug", "wrong", "not working", stack trace | by content | [references/small-changes.md](references/small-changes.md) › Bug fix |
| 9 | New CRUD module | "add an admin screen for X", new table + new permission | HIGH | [references/high-risk.md](references/high-risk.md) › New module |
| 10 | Schema / migrations | stored procedure, table, column, index, migration | HIGH | [references/high-risk.md](references/high-risk.md) › Schema |
| 11 | Writing project database data | "update the records", "delete the data" | real INSERT/UPDATE = HIGH · broad DELETE or personal data = CRITICAL | [references/high-risk.md](references/high-risk.md) › Data |
| 12 | Auth / permissions / roles | permission, role, claim, JWT, 403 | CRITICAL | [references/high-risk.md](references/high-risk.md) › Permissions |
| 13 | Public endpoint | endpoint without login, public lookup | CRITICAL | [references/high-risk.md](references/high-risk.md) › Public |
| 14 | Shared config | environment config files (`.env`, app settings), Dockerfile | HIGH | [references/high-risk.md](references/high-risk.md) › Config |

### Small jobs — one session, no plan

| # | Case | Signals | Level | Open |
|---|---|---|---|---|
| 5 | Typo / format / rename | "fix the typo", "rename the variable", "format" | LOW | [references/small-changes.md](references/small-changes.md) › Mechanical |
| 7 | Routine code (backend / service / script) | add a field, endpoint or helper on existing tables and permissions | MEDIUM | [references/backend.md](references/backend.md) › Routine CRUD |
| 8 | Write tests | "write a test", "test the endpoint", "test for function X", "e2e", "Playwright" | LOW | backend: [references/backend.md](references/backend.md) › Tests · frontend: Skill tool with `e2e-playwright` |
| 15 | UI change | "screen", "component", "layout is off", frontend code; identify the stack from the files to edit before choosing a dev agent | LOW-CRITICAL | [references/frontend.md](references/frontend.md) › UI |

### Standalone

| # | Case | Signals | Level | Open |
|---|---|---|---|---|
| 1 | Q&A / lookup | "where", "what is", "why", no edit requested | - | [references/qa-research.md](references/qa-research.md) › Lookup |
| 2 | Multi-file research | "analyze", "investigate", "compare", "map" | - | [references/qa-research.md](references/qa-research.md) › Research |
| 16 | Mockup / prototype | "mockup", "sketch the UI", "demo UI", "try the logic", "spike", "prototype the flow" | - | [references/frontend.md](references/frontend.md) › Mockup |
| 19 | Docs / domain knowledge | process, domain, `docs/` | LOW | [references/docs.md](references/docs.md) |
| 25 | Resolve conflicts | git reports CONFLICT, mid merge/rebase | by content | Skill tool with `resolving-merge-conflicts` |
| 27 | Modernization / large migration | "upgrade the runtime", "rewrite in", "migrate the whole system" | HIGH | Skill tool with `migrating-legacy-code` |
| 30 | Plan / agent progress | "open observatory", "show plan progress", "how far is the agent" | - | Optional plugin `athena-observatory` (skill `observatory`); not installed: tell the user to run `/plugin install athena-observatory@athena`. Progress of one specific plan: read its `progress.md` like #1 |
| 31 | Domain terms / hard-to-reverse decisions | "glossary", "how do X and Y differ", a word with two meanings, "record why we chose", "ADR", pasted meeting notes with decisions | - | Skill tool with `domain-modeling` |
| 33 | Architecture / C4 / modeling a legacy system | "C4", "overall architecture", "big picture", "draw the system", "model the old system", external integration | - | Skill tool with `architecture` |
| 34 | Security testing | "test permissions", "IDOR", "security test", "audit dependencies", "scan libraries for vulnerabilities" | by content | Skill tool with `security-testing`; writing backend tests: dispatch the `developer` agent per [references/backend.md](references/backend.md) › Tests |
| 35 | Create / edit a project roadmap | "make a roadmap", "project goal", "work items", "assign a mission to an item", "backfill the roadmap" | LOW | Skill tool with `docs-standards`, open its `roadmap.md` › Create and backfill |

`#16` is only for a mockup or prototype made to look at or throw away, outside the product frontend code. Finishing a mock/demo screen inside the real app is frontend implementation; if it splits into 2+ tasks (test `7 / 15 ↔ 17`), consider `#17` before `#16`. The word "mock" or "demo" alone is not enough to choose `#16`.

### Boundaries — two nearby rows

| Pair | Test |
|---|---|
| 1 ↔ 2 | Can it be answered after 3 file reads or fewer? No → 2 |
| 1 ↔ 11 | Does it write or delete database data? Yes → 11 · Read-only → 1 |
| 5 ↔ 6 | Does behavior change? Yes → 6 |
| 7 ↔ 9 | A new table or new permission? Yes → 9 |
| 17 ↔ 18 | Does the API contract change? Yes → 18 |
| 7 / 15 ↔ 17 | Splits into 2+ tasks each with its own diff and check, or HIGH / CRITICAL, needs plan approval? Yes → 17 · No → 7 / 15 |
| 6 ↔ 12 | Does the fix touch auth / permissions / claims? Yes → 12, even for a one-line diff |
| 3 ↔ 6 | Affecting real users in production? Yes → 3 · No → 6 |
| 9 ↔ 15 | New screen with a new table or permission? Yes → 9 · UI over an existing API only → 15 |
| 17 ↔ 33 | Still editing code after drawing? Yes → 17 (`brainstorming` calls `architecture`) · Only drawing / modeling → 33 |
| 2 ↔ 33 | Need a C4 diagram or contract table? Yes → 33 · Only reading and answering → 2 |
| 8 ↔ 34 | Test checks permissions, data scope or dependency vulnerabilities? Yes → 34 · Otherwise → 8 |
| 12 ↔ 34 | Editing auth / permission / claim code? Yes → 12 (tests follow `security-testing` inside that flow) · Only writing tests or running an audit → 34 |
| 1 ↔ 35 | Only asking how far the project is? Yes → 1 ([references/qa-research.md](references/qa-research.md) › Project overview) · Writing or editing `roadmap.json` → 35 |

When several rows match, the row with the **highest level** is the recommendation; level follows content (R-117).

### Common rationalizations

| Thought | Reality |
|---|---|
| "The user says it's urgent / the boss approved, skip the question" | Urgency does not change risk; still ask, unless the user named the flow |
| "The request is clear, just do it" | A clear request is not a chosen flow; skip the question only when the message names a flow, is Q&A / research without file edits, is a small mechanical job, or is a greeting |
| "Read the repo a bit first so the question is better" | No answer yet means no repo reading and no edits; ask from the message and the tables |
| "Asked, so wait for the next turn" | When the question tool answers in the same turn, continue; only a numbered list waits for the next turn |
| "Only a review, no flow question" | Reviews still ask; skip only in the cases above |
| "Long task, just start task 1" | Multi-step work gets `plan.md` + `progress.md` committed before task 1 (`docs-standards` › `style.md` › Long sessions) |

## 2 · Ask

**No answer means no repo reading and no edits.** The question tool (`AskUserQuestion`) answers in the same turn → continue with the chosen flow. A harness without a question tool → numbered list 1-4 plus "Type a number to choose.", end the turn.

One question, header `Flow`, 2-4 options from the tables:
- `question` restates the request in one sentence so the user can catch a misreading.
- The recommended row goes first, label "<name> · #N (Recommended)"; the rest are the next-best matches. No "Other" option: the tool has its own text box.
- `description`: what will be done, the risk level, whether a plan approval is awaited.

Labels, examples: [references/flow-question.md](references/flow-question.md).

**Done when** the user answered (question tool in-turn, or the next message for a numbered list).

## 3 · Follow the choice

Open the reference in the "Open" column (one flow, one reference), plus `project-context.md` at steps that depend on the stack and any extra reference that reference or this section names. A reference that says to call skill X → call the Skill tool with X and follow X's `SKILL.md`, not the summary in the reference. Free-text answers → follow the text, still open the best-matching reference. Phase changes only when the user asks (R-115).
A flow that edits files → write `intent.md` before touching a file (R-092, R-002), even for LOW.
#17 and #18 with a frontend part: after `references/plan.md`, also open [references/frontend.md](references/frontend.md) › UI for the frontend gate.

**Done when** the reference is open (or the skill in the "Open" column is called). A skill that a reference names is called **when that step is reached**, by whoever does that step. When dispatching a dev agent: a skill the agent does not load itself goes by name in the dispatch prompt.

## 4 · The `Flow:` line

- No question asked → first line of the answer: `Flow: #N`. Greeting → print nothing.
- No row matches → still ask per §2 (options = the nearest rows).
- Free-text answer without `#N`, or a flow change mid-session: [references/flow-question.md](references/flow-question.md).

The `#N` numbers in the §1 tables are **permanent**, like `R-NNN` codes: a new row takes the highest number + 1; a removed row leaves its number unused; never renumber. Gaps in the numbering (20-22, 26, 28, 29, 32) are intentional.
