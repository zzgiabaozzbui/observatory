---
name: docs-standards
description: Shared conventions for writing documents - where a task's artifacts live, which file to create when and in what format, the progress table contract, the roadmap file, and the sensitive-data checklist before every commit. Use when creating or editing Markdown files in the repo, and before every commit.
---

# Documentation standards

Which document to create, when, and in what format (R-092):

| Document | When to create | Format |
|---|---|---|
| `intent.md` | every task that edits files; first | WHAT / WHY: problem, scope, what is **not** done, measurable acceptance; bug: current / expected / cause |
| `spec.md` | contract or schema change, backend + frontend together, or `architecture` level 2 | HOW: API contract, schema, business rules, flows; each item points to an acceptance line |
| `plan.md` | the user must approve the approach, many steps, HIGH / CRITICAL | approved tasks (`### <ID>`), files touched, verify, rollback pointer, Global Constraints, Review Focus, Interfaces |
| `progress.md` | there is a `plan.md` | front matter + R-132 table, `Pre-run check`, `Decided`, `Tried, did not work` |
| `rollback*` | HIGH / CRITICAL, or any `*.sql` in the folder (R-133) | steps back, undo scripts, how to check the undo |
| `research.md` | research feeding another decision, or `architecture` level 1 | question, evidence (file:line, URL), trade-offs; no final decision |
| `decision.md` | the task creates an ADR or touches an area with an `accepted` ADR | one link line per ADR |
| `nguon/` | the user pastes a chat or minutes that hold decisions | redacted verbatim source |
| `review.md` | review in another session, user rejects a finding, or run-plan findings | one line per finding |
| `report/<ID>.md` | a plan task done by a subagent | evidence of one task |

| Doing what | Open |
|---|---|
| Writing a task's artifacts: folder, required files, progress table, long sessions (R-092, R-132, R-133) | `references/style.md` |
| About to `git commit` anything: scan for personal data, credentials, keys, internal IPs, unmasked images; what to do after a leak (R-078..R-081) | `references/data-sensitivity.md` |
| Making, editing or reading the project roadmap `docs/du-an/lo-trinh.json`; the `intent.md` keys `hang_muc` · `module` · `tieu_chi` · `xong_luc` (R-171) | `references/roadmap.md` |

Codes `R-NNN` are permanent identifiers.

A project may extend this skill with its own document conventions (front matter, certainty levels, business
templates) in a skill of its own.

**The two worst failures, even before opening a file:** never commit real personal data, credentials or internal
IPs; when talking about a credential, **describe it, never quote it**, even while warning about it.
