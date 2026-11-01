---
name: architecture
description: Draw the architecture picture before planning - Discovery when the request is still vague, C4 Context / Container when adding, changing or connecting systems or modeling a legacy system, with a contract table and sequence diagrams. Use when brainstorming calls it, or the user says "C4", "overall architecture", "big picture", "draw the system".
---

# Architecture before the plan

The output is a picture the user (in the analyst role) can approve before the spec / plan is written. The risk level
and flow are decided by `routing` and R-117; this skill only picks the level of drawing.

## 1 · Pick the level

1. Does the work add, change or connect a container (app, service, database, external system), or does the user need
   a legacy system modeled? No -> **Level 0**: draw nothing, go back to the calling skill.
2. Yes, and after reading the repo and clarifying the request you still cannot name the related systems, actors, and
   in / out of scope -> **Level 1 · Discovery** (§2), then level 2 when done.
3. Yes, and you can name them -> **Level 2 · C4** (§3).

State the chosen level and why in one line.

## 2 · Level 1 · Discovery

No artifact folder yet -> create it per R-092 (with `intent.md`) before writing. Write into the task's `research.md`
per `references/discovery.md`: overview diagram, main business flow, rough scope, assumptions, open questions (marked
blocking / non-blocking), at least 2 options with trade-offs.

Exit when both hold: no blocking open question remains · the user approves the picture. Not yet -> batch the blocking
questions (R-138), update, present again. Until then, do not go down to C4 and do not write the spec.

## 3 · Level 2 · C4

Per `references/c4.md`:

1. Read `docs/architecture/c4.md` if it exists (if the project's own instructions name another place, follow them). A
   legacy system with no model yet -> build it from the code, and write the date it was checked against the code.
2. Draw Context + Container as a Mermaid `flowchart` (not `C4Context`). Component only for the container being
   changed, written in the task's `spec.md`. Never draw the Code level.
3. Contract table: one row per arrow between two containers. An arrow with no contract yet -> the Contract cell reads
   `**[TODO]** contract`, and the presentation says so.
4. A sequence diagram for each main flow; every message between containers carries a contract code that is in the
   table. A message with no code -> add a table row, or state the gap.
5. The change against the living model -> `spec.md`. `docs/architecture/c4.md` is updated in the same commit as the code
   that changes a container, not at design time. Modeling a legacy system without changing containers -> write
   straight into `docs/architecture/c4.md` after the user approves; outside the confirmed scope -> ask per R-003; the
   file is not a task artifact, commit per R-015 (list it, wait for the user's OK).
6. The project has no `docs/du-an/lo-trinh.json` and the whole system was just modeled (new or old) -> in the
   presentation, propose once to build a roadmap per the containers / modules just drawn (flow #35 of `routing`),
   unless it was already proposed in the session (e.g. in `brainstorming`); if the user does not choose it, drop it
   and do not ask again in the session.

An architecture decision made while drawing -> an ADR per `domain-modeling` › `adr.md`.

## 4 · Present and stop

Show the diagram in chat with the harness's drawing tool (none -> a Mermaid block), without asking "Draw a diagram?".
Add the artifact path and the list of gaps (arrows without contract, open questions), then ask the user to approve with
the ask tool. After approval -> go back to the next step of the calling skill; called from `routing` #33 -> stop. Never
write the plan on your own.

## Rationalizations

| Thought | Reality |
|---|---|
| "Even a small feature gets a C4, to be safe" | Level 0 draws nothing; a needless diagram costs tokens and nobody reads it |
| "There is a diagram, the dev can handle contracts" | An arrow with no contract is a gap; state it now, not at the contract gate while running the plan |
| "Draw the Code level too, for completeness" | Code is the source of truth at that level; a Code diagram is stale by the next commit |
| "Edit `docs/architecture/c4.md` right away at design time" | The living model reflects the running system; update it in the same commit as the code that changes a container, except when modeling a legacy system (§3.5) |
| "A blocking question is open, but draw the C4 first" | Discovery not finished means the C4 is drawn on a wrong assumption |
