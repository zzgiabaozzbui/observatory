# Small changes and bug fixes

> Before a stack-dependent step, apply [project-context.md](project-context.md); agent and skill names in examples apply only when the project maps them and their availability was checked.

## Mechanical (typo, format, internal rename)

LOW (R-117).

0. Write `intent.md` (R-092).
1. At most 1 file and a few lines: `main` edits directly. Spread over many files: the `quick-fix` agent.
2. Light verify: build, or lint the touched file, with the project's own command.

## Bug fix

0. Write `intent.md` (current / expected / cause once found, R-092).
1. Call the Skill tool with `systematic-debugging`, then write a regression test per `test-driven-development` (R-139); see it fail for the right reason, fix, see it pass.
2. Rate the level by **content**: a bug touching personal data, auth or the database is HIGH/CRITICAL and takes the full process even for a one-line diff (R-117). Then open the matching section of [high-risk.md](high-risk.md).
3. Cause 100% clear and one line: `quick-fix`. Unclear, or touching business logic: the `developer` agent (check availability per project-context.md).
4. Silent backend failure (the API succeeds but data is missing or overwritten): review the data path before fixing; if a required review skill is missing, report the blocker instead of skipping the data check.
5. Verify and handle failures per R-119; review per R-120 ([review-commit.md](review-commit.md) › Review).
