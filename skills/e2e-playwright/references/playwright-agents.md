# Playwright test agents

<!-- Adapted from playwright.dev/docs/test-agents (Apache-2.0, © Microsoft), read 2026-10-29. -->

Use when a new flow needs many tests, or a batch of red tests needs fixing. Every agent turn calls a paid model; tell the
user before running it over the whole suite.

## Setup

`npx playwright init-agents --loop=claude`. The command generates the agent definitions and `seed.spec.ts`. The agent
definitions are generated files: do not hand-edit them and do not copy them into the shared kit; after a Playwright
upgrade, run the command again. Commit the generated files only when the user agrees (R-015).

## Process

1. **Seed**: `seed.spec.ts` opens the app in its starting state, already logged in per `SKILL.md` §1. Seed red → stop and
   fix the seed first.
2. **Planner**: input is the flow to test (the user's words, acceptance lines in the intent / spec) and the seed. Output
   is a Markdown plan in `specs/`. The main agent checks the plan against the acceptance lines before step 3; a flow is
   missing → ask the planner to add it.
3. **Generator**: input is one `specs/*.md` file. Output is a test in `tests/`. Review the generated test against
   `writing-tests.md`, then run it per `SKILL.md` §3.
4. **Healer**: input is the name of a red test. The healer reruns it, looks at the UI and edits the test. Its result is a
   proposal: the main agent reads the diff before keeping it.

## Guard rails for the healer

- The healer may change only locators and waits, per `writing-tests.md`.
- A diff that removes or loosens an assertion, changes an expected value, adds `waitForTimeout`, or adds `test.skip` /
  `test.fixme` is not kept; file that test under "app wrong or needs the user".
- The healer decides the feature is broken and skips the test → treat it as an app bug report: tell the user with the
  trace; do not merge the skip.
