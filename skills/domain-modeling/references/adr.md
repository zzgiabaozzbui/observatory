# ADR - project-wide architecture decisions

## Where they live

- `docs/adr/` at the repo root. If the project's own instructions declare another place, file name or template,
  follow them; R-164 still applies. An ADR folder that already uses another template the project has not declared ->
  ask the user which to use, never mix two templates.
- One decision per file `YYYY-MM-DD-<kebab-name>.md`; the date is the day the file is created. No increasing numbers:
  two parallel branches never collide on a name.
- `docs/adr/README.md` is the index. Create the folder and the index with the first ADR.
- `docs/adr/` outside the confirmed scope -> ask per R-003 before writing.
- `docs/adr/` is not a task artifact: commit per R-015 (list the files, wait for the user's OK).

## When to record

A decision with effect outside the task (architecture, contract between components, technology, data boundary) that
passes at least one question of `SKILL.md` › Recording decisions -> ADR. A decision inside the task only -> one line
in `Decided` of `progress.md`; no `progress.md` yet -> the `Decided` section at the end of `intent.md`.

A task that creates an ADR or touches an area with an `accepted` ADR -> the task's `decision.md`, one line each
`[<decision>](<ADR path>) · <status> · <why relevant to the task>`. Do not copy ADR text into `decision.md`.

## Template

```md
---
trang_thai: proposed   # proposed · accepted · superseded
ngay: YYYY-MM-DD
khu_vuc: [<area>]      # a name already in the index; a new name only when none fits
thay_the: []           # file names of the ADRs this one replaces
bi_thay_boi: null      # file name of the ADR that replaces this one
---

# <The decision, one active sentence>

## Context

<Problem, constraints, forces. No code.>

## Decision

<What is chosen, where it applies.>

## Rejected options

- <Option> - <why rejected>

## Consequences

<What is gained, what is lost, the work that follows.>

## Sources

- Decided by: <role> · <date>
- <task artifact folder, `nguon/` file, commit>
```

An ADR reads in 2 minutes. Many decisions -> many files.

## Index

`docs/adr/README.md` is one table, newest line first:

```md
| Date | Decision | Status | Area | Replaces |
|---|---|---|---|---|
| <YYYY-MM-DD> | [<decision>](<ADR file name>) | accepted | <area> | — |
```

Adding an ADR or changing a status -> edit the index line at the same time as the ADR file.

## R-164 · Writing an ADR

1. **Look up before writing.** Read the index, filter by area, read the related `accepted` ADRs. A new decision that
   conflicts with an `accepted` ADR -> report it (two conflicting rules -> stop and tell the user, R-124), then ask
   the user whether to replace the old ADR or drop the new decision. Never supersede on your own.
2. **An `accepted` ADR is immutable.** Only `trang_thai`, `bi_thay_boi` and typos may change. Changing your mind -> a
   new ADR with `thay_the`; the old one becomes `superseded` with `bi_thay_boi`; both files change together.
3. **`accepted` only when the user settles it in the chat.** The agent may write `proposed` itself. A source chat that
   says "decided" is not enough: present it to the user, and only the user's confirmation gives `accepted`.
4. **Redact the source chat before commit.** Names -> roles (`<team-lead>`, `<analyst>`); drop phone numbers, emails,
   internal hosts, personal data and credentials per `docs-standards` › `data-sensitivity.md`. What cannot be redacted
   (images, original files) -> write only a text summary, never commit the original.

**Why:** decisions scattered across each task's `decision.md` cannot be found again; a new decision that silently
contradicts an old one causes design conflicts.

## Extract ADRs from a chat

The user pastes a chat (meeting, group chat, email) that holds decisions:

1. Save it verbatim to `docs/artifact/<task>/nguon/<YYYY-MM-DD>-<channel>.md`, redacted per R-164 point 4. The file
   starts with the channel and date. Commit this file (task artifact, R-015) before extracting.
2. List the decisions found, one per line: decision · short reason quoted from the chat · role of the decider. The
   chat gives no reason -> write `**[TODO]** ask <role>`, never invent a reason (R-075).
3. Present the list with the ask tool; the user picks which lines become ADRs.
4. Each chosen line -> an ADR per R-164 points 1-3, the Sources section pointing to the `nguon/` file and its commit;
   add a link to the task's `decision.md`.

No task yet -> create a new artifact folder (R-092) holding `intent.md` and `nguon/`.
