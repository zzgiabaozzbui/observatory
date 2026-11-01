---
name: brainstorming
description: Use before writing a plan for a new request that has no intent / spec yet — the user says "build feature X", "add a module", "design", "think about how to do it", or a large feature is not yet pinned down.
---
<!-- Adapted from github.com/obra/superpowers · skills/brainstorming/ (MIT, © 2025 Jesse Vincent), v6.4.1; technical decisions (§1) and builder check (§5) from v7.0.1; the coverage checklist in §5 draws on github.com/github/spec-kit · templates/commands/clarify.md (MIT, © GitHub, Inc.), v1.2.5. -->

# Design the request

The output is one shared understanding that the user recognizes and can correct, and only then a plan. The risk level
and the flow come from the `routing` table and R-117; this skill does not reclassify.

## 1 · Understand

- Read the repo state first (files, docs, recent commits). A question that code can answer: read the code, do not ask.
- The request spans several independent subsystems → say so at once, propose splitting into several tasks, do one at a time.
- `intent.md` already settled (flow "clarify" #4) → read it, ask only about what is still open.
- To clarify intent, users and success criteria: call the Skill tool with `grilling`. The restatement separates what
  the user said from what the agent inferred (from code, assumptions) so the user can correct it.
- The request adds, changes or connects containers (app, service, database, external system) or models a legacy
  system → call the Skill tool with `architecture` before §2.
- Roadmap (`docs-standards` › `roadmap.md`, R-171): the project has `docs/du-an/lo-trinh.json` → `intent.md` proposes
  the `hang_muc` and `tieu_chi` that the mission serves. None yet, and the request is a new system or a whole-system
  upgrade → propose building a roadmap once (flow #35 of `routing`) inside the question already being asked, unless
  already proposed this session; if the user declines, carry on and do not ask again this session.
- Technical decisions (platform, language, library, storage): ask which parts the user wants to decide, even when the
  user skips the clarifying part. For the parts the user delegates, pick a default that fits the repo and say what was
  picked in the presentation (§6) so the user can overrule it.

## 2 · Options

2–3 options, the recommended one first with its reason, each with its trade-off. Drop what is not needed yet (YAGNI).
Ask the option question with the ask tool. Flow, architecture, or a relationship of ≥ 3 components → ask "Draw a
diagram?" before drawing; the diagrams of `architecture` need no question. `research.md` already has an Options
section from `architecture` → reuse it, do not write a new one.

## 3 · Approval gates by stage

Approving the idea ≠ approving the spec ≠ approving the plan. Each "yes" opens only the stage just presented; what does
not exist yet cannot be approved. Resume at the earliest unfinished stage.

The risk level only goes up: unsure between two R-117 levels → take the higher; higher-level content found midway →
stop, say so, raise the level. Never lower it midway. Within one level, pick the workflow with the fewest steps that
still has the required checks (R-115); HIGH / CRITICAL do not drop steps.

## 4 · Write the artifacts

Per R-092, in the task's artifact folder:
- WHAT, scope, what is not done, acceptance → `intent.md` (no how).
- Technical HOW → `spec.md`, only when it matches the "Create when" column of `style.md` (contract / schema change,
  backend + frontend together, `architecture` level 2).
- Decisions → per `domain-modeling` › `adr.md` › When to record (ADR, linked from `decision.md`, or `Decided`); with a
  spec, the spec points to the ADR.
- The rest is carried by the plan.

Do not commit outside the task's artifacts on your own (R-015, R-118).

## 5 · Self-review the spec (no spec → review `intent.md`)

1. Gaps: "TBD", "[TODO]" with no named person to ask.
2. Contradictions: two sections that say opposite things; an architecture that does not match the feature description.
3. Scope: does it fit one plan, or must it be split.
4. Ambiguity: any sentence with two readings → pick one, state it.
5. Coverage: go through each category — scope and user roles · data (entities, identity, state lifecycle) · main flow
   and error / empty / loading states · non-functional (performance, security, logging) · external systems and their
   failure · edge cases (concurrency, limits) · terms (`GLOSSARY.md`) · measurable done criteria. A category that
   applies but is not recorded → write `**[TODO]**` with the person who answers; a category that does not apply →
   collect into one closing line `Not applicable: <category> (<reason quoted from intent / scope>)`. An unmeasurable
   adjective ("fast", "friendly") → ask the user for a numeric threshold or write `**[TODO]**` with the person who
   answers; do not invent a number.

Fix in place. **Done when** every category in item 5 is recorded in the artifact, is a `**[TODO]**` with a named
answerer, or is in the `Not applicable` line with a reason quoted from intent / scope.

**Builder check** — when there is a `spec.md`, or the level is HIGH / CRITICAL, after the self-review: dispatch
`researcher` (fresh context) using `references/builder-check.md`. Sort the questions it returns into three groups:
- **Already answered** in the chat or repo → record in the artifact (the relevant spec section; otherwise `Decided` at
  the end of `intent.md`).
- **Small** — the builder can decide without changing what gets built → main decides, writes one `Decided` line at the
  end of `intent.md`, marked as a main decision.
- **The user's** — the answer changes what gets built → ask the user in one round (R-138), most important question first.

One round only. A harness without subagents → main reads the artifacts itself in the builder's role. **Done when**
every question is in a group, the first two groups are recorded, and the user's group has been asked.

## 6 · Stop

Present the artifact paths and ask the user to approve. After approval → name the next step of the `routing` flow that
was chosen (plan flow → `writing-plans`) and wait for the user to choose; do not start writing the plan or code.

## Rationalizations

| Thought | Reality |
|---|---|
| "Small job, skip the design" | For a small job, design it in two chat sentences and still wait for "yes" |
| "The user approved the idea, write the spec and plan now" | One approval per stage |
| "Midway I found it touches schema / permissions / personal data, just finish" | Stop, say so, raise the R-117 level |
| "Put the how into intent to keep it short" | `intent.md` is WHAT only; the how lives in spec / ADR / plan |
