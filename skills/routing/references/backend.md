# Backend, ordinary level

> Before a stack-dependent step, apply [project-context.md](project-context.md); agent and skill names in examples apply only when the project maps them and their availability was checked.

## Routine CRUD

Add or change a field or endpoint on **existing** tables and permissions: MEDIUM (R-117). New table or new permission: [high-risk.md](high-risk.md).

1. Write `intent.md` (R-092); delegate to the `developer` agent.
2. The `developer` agent loads the project's own stack guide, if it has one, before the first line of code. `main` does not load it when only delegating.
3. Contract change: **backend first**; when done, list the new DTOs / endpoints to put in the frontend agent's prompt ([frontend.md](frontend.md) › UI).
4. Verify: the full backend verify command declared in `CLAUDE.md`; a diff touching controllers / middleware / auth / DTOs also runs live tests if the project has them.
5. Review per R-120 ([review-commit.md](review-commit.md) › Review).

## Tests

An isolated unit test is LOW (R-117).

1. Delegate to the `developer` agent (writing tests is writing code, not a few mechanical lines); its prompt names the project's test guide, if any. Permission / IDOR tests: also name skill `security-testing`.
2. Red first per `test-driven-development` (R-139), inside the coding work, not a separate workflow branch (R-115).
3. Run the project's verify command (with live tests if any). Do **not** type a `--filter` yourself and report green, and do not loosen a test to pass. Business logic from MEDIUM: also run mutation testing if the project's test guide has it.
4. Report the result with the output verbatim.
