# Flow question, details

## Labels
- `AskUserQuestion`: label "<name> · #N"; the recommended row adds "(Recommended)", for example "Bug fix · #6 (Recommended)"; the `description` field says what will be done.
- A harness without a question tool: numbered list, each line "<name> · #N, <short description>".

## Examples
**1.** Message: "How does OrderService cancel an order?" This is read-only Q&A: do not ask, print `Flow: #1`, `main` reads the code. If the flow crosses many services, switch to `Flow: #2`.

**2.** Message: "the manager does not see the Approve button although the role has the approve permission"
- question: "Do you need to fix the Approve button not showing for the manager although the role has the permission?"
- options: "Auth / permissions · #12 (Recommended)", CRITICAL, propose a fix and wait for approval before touching a file · "UI change · #15", if the frontend hides the button on a wrong condition · "Bug fix · #6", if permissions are not involved.

**3.** Message: "use the developer agent to add a Notes field to the order DTO" names its flow: do not ask, print `Flow: #7`, check `project-context.md`, then dispatch that agent.

## Free-text answers
- The user types free text with no `#N`: print `Flow: other - <kind of work, at most 8 words, no names>` and follow the user's words; the level is still rated per R-117.

## Switching flows
- A skill loaded mid-way (named by a reference, plan or other skill), or the flow changes per the "Spawned flows" table: do not ask again; if the number changes, print `Flow: #M`.
- In #1 / #2 and a file outside `docs/artifact/` must change: ask the flow question (SKILL §2), even if the new flow is a spawned flow.
- The user adds to or corrects something inside the current `intent.md` / running plan scope: do not ask again, do not print.
- The user adds work outside the current `intent.md` scope, or the plan is done and the new work edits files: this is a new request. Ask the flow question (SKILL §2); if files change, create a new `intent.md` (R-092).
