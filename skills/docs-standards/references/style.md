# Where a task's artifacts live

## R-092 · Artifacts of a task share one folder, `intent.md` is required

One folder per task: `docs/artifact/<YYYY-MM-DD-HHMM-name>/` (a project may declare another path in its own
instructions). The chain is **`intent -> spec? -> plan`**: a lower layer derives from the one above, never created
alone. **`intent.md` is required**, created first; other files only when the "When" column matches:

| File | What it is | Holds · does not hold | When |
|---|---|---|---|
| `intent.md` | WHAT / WHY | problem, scope, what is **not** done, measurable acceptance; bug: current / expected / cause · no how-to | every task that edits files |
| `spec.md` | technical HOW | API contract, schema, business rules, flows; each item points to an acceptance line · no task list | contract / schema change, backend + frontend together, or `architecture` level 2 (Component, sequence, change against `docs/architecture/c4.md`) |
| `plan.md` | derived tasks, **the approved version** | tasks (`### <ID>` sections), files touched, verify, rollback pointer (`rollback*`, R-133); each task points to a spec section or acceptance line; sections `Global Constraints` (rules that apply to every task, one line each pointing to a spec section / rule, no copied body), `Review Focus` (at most 5 inputs or failure modes the spec implies but tests do not yet cover, each with a test in the owning task), an `Interfaces` block in each task (Consumes / Produces, exact signatures); rule / skill / agent / hook tasks carry verbatim wording · no progress table, no `Decided` / `Tried, did not work` sections (those are in `progress.md`); no copied contract / rule · once approved it is not edited while running, not even to tick a checkbox; editing = changing the plan, the user approves again | the user must approve the approach, many steps, HIGH / CRITICAL |
| `progress.md` | state while running | front matter `chay_tu` · `plan_duyet` (R-132); the R-132 table: status + sha + **review rounds · verify failures** (e.g. ``DONE — `abc1234` · R1 · F0``); sections `Pre-run check` (`subagent-driven-development`), `Decided`, `Tried, did not work` · only main writes; history = `git log -p progress.md`, no log section | a `plan.md` exists (new plans) |
| `rollback*` | how to go back (`rollback.md` or folder `rollback/`) | undo steps, undo scripts (`.sql`...), how to check the undo | R-133 |
| `research.md` | input to a decision | question, evidence (file:line, URL), trade-offs · no final decision | research feeding another decision, or `architecture` level 1 (sections per `architecture` › `discovery.md`) |
| `decision.md` | links to the ADRs relevant to the task | one line each: `[<decision>](<ADR path>) · <status> · <why relevant>` (`domain-modeling` › `adr.md`) · no copied ADR text | the task creates an ADR or touches an area with an `accepted` ADR |
| `nguon/` | chat or minutes used as a decision source | verbatim, redacted per R-164 (`domain-modeling` › `adr.md`) · no extracted decisions (those go to `docs/adr/`) | the user pastes a chat / minutes with decisions |
| `review.md` | finding ledger · main writes | one line per CRITICAL / HIGH / MEDIUM finding worth remembering: `<ID> · R<n> · <level> · file:line · summary · open / fixed <sha> / deferred`; only the user may reject, as `date · rule code · reason`; remaining risks · no LOW, no full review log, no diff copy | review in another session, user rejects a finding, or `subagent-driven-development` has findings |
| `report/<ID>.md` | evidence of one task · implementer writes | work done (1-3 lines), verify command + last result line, deviations from the plan, concerns; each fix round appends a section · no raw logs, no copied request (in `plan.md`), diff or file list (in git) | a plan task done by a subagent |

## Long sessions

- A multi-step task (many items, e2e suite, migration) -> `plan.md` + `progress.md` committed **before** task 1
  (branch: R-015); check `git log` shows that commit before starting task 1; after each task update `progress.md` and
  commit. A new session resumes **only from** `intent.md` + `progress.md` + `plan.md` (the section of the `DOING`
  task) + `review.md` (lines marked open) + `report/<ID>.md` of the `DOING` task + `git status` /
  `git log --grep <ID>`, no chat history needed.
- **Decided:** a decision the user makes mid-run -> one line `date · decision · who` in `Decided` of `progress.md`
  (old plans: `plan.md`). A later session reads it and does not ask again. No `progress.md` yet -> a `Decided` section
  at the end of `intent.md`. A decision with effect outside the task -> an ADR in `docs/adr/` (`domain-modeling` ›
  `adr.md`, R-164); the `decision.md` of a finished task in the old form stays.
- **Tried, did not work:** an approach tried and failed -> one line `date · approach · why it failed` (exact error /
  reason) in `Tried, did not work` of `progress.md`, next to `Decided`. A later session reads it and does not retry.
- **One-way edits:** the upper layer is wrong -> fix the upper layer (the user approves again), then regenerate what
  depends on it; never patch the plan to dodge the spec. The Goal in `intent.md` is fixed: changing the Goal is a new
  task; scope / acceptance may change when the user approves. The `intent.md` front matter may hold
  `trang_thai: done|archived`, the user's final decision; no key means the mission is still tracked. Only the Board
  (Observatory) or the user, after confirming, adds, changes or removes it. It is state metadata, not Goal.
- **A task small enough for a narrow-context subagent:** one task = one purpose, one verify command that runs without
  a person (exit 0 = pass, not a description); a behavior change in code without tests -> add a criterion comparing
  old and new results (a test capturing current behavior before the change, R-130); at most 3 files; what must be read
  besides is exactly the spec section the task points to (path + heading), not the whole spec or another task. Over
  that -> split.
- **Parallel declaration:** columns `Files touched · Deps · Wave`; the same wave shares no file; a contract change ->
  the next wave goes behind the contract gate. Missing columns -> sequential only. Parallel work needs one worktree
  per agent (R-123).
- `HHMM` (or equivalent) = the moment the folder is created, so tasks of the same day sort newest-first. An existing
  folder is never renamed: rules and document maps point to it.
- Folder names are **not tied to a tool / workflow**: whichever tool produces an artifact writes it here.
- `intent.md` is required: without it a later session does not know what the task meant to do and not do; the plan
  only says how.
- **How an agent looks up missions:** read `docs/artifact/index.json` first and open only the entry needed; a folder
  missing from the index -> read the `intent.md` front matter. `done` / `archived` are final; a missing or wrong key
  means still tracked. A missing `intent.md` is a data error to report; if the full list is needed, regenerate the
  index from the artifacts.
- **Roadmap:** the project has `docs/du-an/lo-trinh.json` -> when writing `intent.md`, propose the keys `hang_muc` and
  `tieu_chi` per `roadmap.md` (R-171).

## R-132 · Progress table in `progress.md` - a contract for machines

Every new plan has this table in `progress.md` of the same folder, even a short plan; create `progress.md` together
with `plan.md`. A folder without `progress.md` (old plan) keeps the table in `plan.md`, no backfill. Tools read
`progress.md`, else `plan.md`; they read only the table, never infer from prose.

- **The first task table** of `progress.md`. Required columns: `ID | Task | Deps | Status` (`Deps` is `—` when none).
  Optional: `Who | Files touched`; `Files touched` is required when the plan runs with `subagent-driven-development`
  or declares parallel work (R-092). Other tables (for example a module table) go after the progress table, in
  `plan.md` or `spec.md`. Extra columns (`Verify`, `Wave`...) are allowed; machines skip them.
- **Who created it, when:** a new `plan.md` opens with front matter before the `#` title:
  `tao_boi: <git user.name> · <agent> (<model>)` (e.g. `An · main (claude-opus-5-5)`) ·
  `tao_luc: <YYYY-MM-DDTHH:MM±hh:mm>` (time of first write, with time zone). Written once; updating the plan does not
  change it. No email (R-078).
- Every `ID` in the table has its own section in `plan.md`: `### Task <n>: <name>` (or `### <ID>: <name>`), including
  approval / review / acceptance tasks. The section has at least a line describing the work and the done criterion
  (`Done when` = a verify command per R-092; a task without a command states a checkable condition). Progress tools
  take a task's content from this section. A task may carry a line `Risk: LOW|MEDIUM|HIGH|CRITICAL` (R-117).
- **Status cell** starts with exactly one keyword: `TODO` · `DOING` · `CHỜ-USER` (waiting for the user) · `BLOCKED` ·
  `DONE` · `SKIP`. Notes follow `—`; a commit sha goes in backticks. E.g. ``DONE — `abc1234` · R1 · F0``.
- Status changes - edit the table **at once** and commit per R-015 (task artifact, committed without asking):

  | To | When | Cell |
  |---|---|---|
  | `TODO` | a new task enters the plan, untouched | `TODO` |
  | `DOING` | **before** the first code read / file edit of the task; also the state kept when verify is red (there is no `FAIL`) | `DOING` · red verify: `DOING — <reason>` |
  | `CHỜ-USER` | needs the user's approval or decision to go on; the user answers -> back to `DOING` | `CHỜ-USER — <what must be decided>` (never `DOING — waiting...`) |
  | `BLOCKED` | stuck on something outside the task (dependency not done, out of scope, environment); unblocked -> back to `DOING` | `BLOCKED — <stuck on what>` |
  | `DONE` | verify green with evidence; no evidence -> not DONE | ``DONE — `sha` · R<n> · F<n>`` or `DONE — PASS <verify command>` |
  | `SKIP` | the user drops the task, or it becomes redundant | `SKIP — <reason>` |

  Never jump `TODO` -> `DONE`: progress tools lose the running task.
- **While running:** the `progress.md` front matter has `chay_tu` (`HEAD` when the first run starts, never
  overwritten - the final review baseline) and `plan_duyet` (`HEAD` when the user approved the plan, `plan.md`
  committed and clean). Only the Status cells and the sections under the table may change. Editing any other column
  or `plan.md` = changing the plan -> stop; the user approves, then `plan_duyet` is rewritten. A `DOING` cell reads
  `DOING — base <sha>`.
- A checkbox `- [ ]` in a task body (if any) is a sub-step; machines skip it. Progress lives only in the table. Do
  not tick while running: an approved `plan.md` is not edited (table R-092).

**Why:** old plans recorded progress in a different form per file, most not at all, so no tool could read a
session's progress. A table inside `plan.md` makes every status change an edit to an approved file and mixes two
kinds of change in git history.

## R-133 · Risk level in the `intent.md` front matter, required artifacts by level

- A new `intent.md` opens with front matter holding `muc_rui_ro: LOW|MEDIUM|HIGH|CRITICAL` (the R-117 level, capital
  letters, one value). The reason for the level goes in the body; the body does not repeat the level (R-074).
- A task with an artifact folder must have:

  | Condition | Required |
  |---|---|
  | any level | `intent.md` |
  | `muc_rui_ro` HIGH · CRITICAL | also `plan.md` + `progress.md` (R-132 table) + `rollback*` (`rollback.md` or folder `rollback/`) |
  | the folder holds a `*.sql` file | `rollback*`, whatever the level |

- Every task that writes a file (even only `research.md`) has an artifact folder and `intent.md`, LOW included. A
  read-only task that writes no file has none.
- Shared-config exception of R-117 -> no `plan.md` / `progress.md` required; `rollback*` still is.
- No backfill of old intents.

## R-074 · Required

- **One fact, one place.** Other files link, never copy. The same information in two files -> merge into the owner
  file, the other points to it.
- **Always cite the source.** A final `Sources` section: who said it (role), which original file, which date
  (YYYY-MM-DD). No source = not a fact.
- **Mark certainty** inline: `**[Confirmed]**` (a verifiable source) · `**[Assumption]**` (inferred, nobody
  confirmed) · `**[TODO]**` (a gap - say whom to ask / which file is needed).

Front matter, templates and file names are per-project conventions, declared in the project's own docs skill,
**except** the kit's common `intent.md` keys: `muc_rui_ro` (R-133), `trang_thai` (R-092), `hang_muc` · `module` ·
`tieu_chi` · `xong_luc` (R-171, `roadmap.md`).

## R-075 · Forbidden

- **No invention.** Never make up form names, document numbers, deadlines, clauses, figures. Unknown -> `**[TODO]**`.
- **No pasting raw converter output** (markitdown / OCR). Read, distill, rewrite.
- **No rewriting history.** An outdated document is marked outdated and points to the new one; never silently
  deleted.
- **Do not describe code as if it were the business rule.** Reading code to cross-check: write "the system currently
  does X" with the file path, separate from "the rule requires Y".

## R-076 · Editing an existing document

Update **in place**, no `-v2` file. Bump the updated date in front matter and say what changed. Renaming a file also
fixes its entry in the project's document map (for example `docs/INDEX.md`).

## R-077 · Related

- `references/data-sensitivity.md` - check before writing and before committing (required).
- A project usually has a document map (for example `docs/INDEX.md`): every new file gets one line there.
