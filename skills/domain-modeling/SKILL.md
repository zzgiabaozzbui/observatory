---
name: domain-modeling
description: Sharpen and record business terms (GLOSSARY.md) and architecture decisions (ADRs in docs/adr/). Use when the user discusses names or business concepts, when one word carries two meanings, when editing GLOSSARY.md or docs/adr/, when recording or looking up why a direction was chosen, or when the user pastes a meeting / group chat that holds decisions.
---

<!-- Adapted from github.com/mattpocock/skills · skills/engineering/domain-modeling/ (MIT, © 2026 Matt Pocock). -->

# Domain modeling

Sharpen the business model actively while designing: challenge wording, think of edge cases, record a concept the
moment it is settled. Only **reading** `GLOSSARY.md` to use the right word does not need this skill.

## Files

- One context: `GLOSSARY.md` at the repo root. If the project's own instructions name another place, follow them.
- Several contexts (for example separate business modules): `GLOSSARY-MAP.md` at the root lists each context, its
  `GLOSSARY.md` and how they relate. Unclear which context a topic belongs to -> ask.
- Create a file only when there is something to write. Format: `references/glossary.md`.

## In the session

1. **Challenge against the glossary.** The user uses a word with a different meaning from the recorded one -> say so
   at once: "The glossary defines X as ..., you use it as .... Which is right?"
2. **Sharpen vague words.** One word carrying two meanings -> propose one standard name for each meaning.
3. **Test with scenarios.** Discussing the relation of two concepts -> give a concrete case that forces the boundary.
4. **Check against the code.** The user says "it works like this" -> check the code; when they differ, state both.
5. **Record when the user agrees.** A settled word -> present the definition; when the user agrees, edit
   `GLOSSARY.md` at once, not at the end of the session. A glossary file outside the confirmed scope -> ask per R-003
   before editing. The glossary holds business meaning only - no implementation details, no specs, no drafts.

**Done when** every word settled in the session is in `GLOSSARY.md` (or the user declined to record it), and every
mismatch between code and the user's words has been stated.

## Recording decisions

A decision with effect outside the task -> an ADR in `docs/adr/` per `references/adr.md`. R-164: look up `accepted`
ADRs before writing, ask the user when the new one conflicts; the agent writes `proposed`, writes `accepted` only when
the user settles it; an `accepted` ADR is immutable; a chat the user pastes goes to `nguon/` of the task, redacted
before commit. File name `YYYY-MM-DD-<name>.md`, no numbering; the decider is recorded by role, not name or email.
The task's `decision.md` holds only links to ADRs. A decision inside the task only -> `Decided` in `progress.md`.
Three questions tell an architecture decision worth recording:

1. **Hard to reverse**: changing your mind later costs a lot.
2. **Surprising without context**: a later reader of the code will ask "why is it done this way?".
3. **A real trade-off**: there were other options and this one was chosen for a specific reason.

Often worth recording: the shape of the architecture, how two modules communicate, technology that is hard to swap,
data ownership boundaries, a deliberate departure from the obvious way, constraints invisible in the code, options
rejected for non-obvious reasons.

The user pastes a chat with decisions -> `references/adr.md` › Extract ADRs from a chat.
