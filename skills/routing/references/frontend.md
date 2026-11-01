# Frontend

> Before a stack-dependent step, apply [project-context.md](project-context.md); agent and skill names in examples apply only when the project maps them and their availability was checked.

## UI

Level by content (R-117): CSS that does not change layout = LOW · simple UI = MEDIUM · showing real users' personal data = CRITICAL.

After the user picks `#17`, write the intent, make a plan and wait for approval before dispatching a developer agent or editing code. The frontend developer loads the project's own stack guide, if it has one, before code; a behavior change from MEDIUM needs a test that fails for the right reason first. If a tool or environment lacks a step, tell the user exactly which step is blocked; do not count it as done.

1. Write `intent.md` (R-092) first, even for LOW; then choose the agent. LOW, at most 1 file and a few mechanical lines: `main` edits directly; mechanical changes across many files: `quick-fix`; business logic, API contract, schema, permissions or architecture from MEDIUM: the `developer` agent. Find the stack from the files to edit (the project's `CLAUDE.md`, `package.json`); if the repo has several stacks, split the task per stack. Missing mapping: tell the user, never pretend an agent or skill exists.
2. If the frontend is a separate sub-repo (when the project says so), run `git -C <frontend path>`; do not commit it from the root repo.
3. The writer loads the project's own stack guide, if it has one, before the first line of code. The frontend repo's own `CLAUDE.md` wins over everything else. Bug fix or behavior change from MEDIUM: red test first (R-139, skill `test-driven-development`).
4. No hard-coded colors if the project has a design system; a role without enough permission sees personal data masked (for example `001****4567`).
5. Lint, format and commit go through the project's own commit guide; `commit-push` covers the general rules.
6. Verify with the project's scripts: typecheck + build + test, then acceptance in a real browser. A changed flow (from MEDIUM) gets an e2e test per skill `e2e-playwright`; report done only when the project's e2e command passes. A changed screen (from MEDIUM): dispatch `ux-tester` once the screen runs in an environment where the user confirmed test data may be written; rate the issues it reports per R-117 before assigning fixes.
   Native mobile: lint, typecheck, test and try the affected platform on a device or emulator; web preview is not acceptance for native.
   No confirmed environment or device: tell the user the testing limit; do not count UX as accepted.

## Mockup

1. Call the Skill tool with `prototype`: a UI question gets a mockup, a logic / state question gets a logic prototype. A mockup is an artifact only, never written into the real frontend code folder. After the user approves it and asks for the real thing, dispatch the frontend developer agent.
