---
name: e2e-playwright
description: 'Write, run and fix Playwright e2e tests in the repo for a web UI. Use when the frontend needs user-flow tests, a plan task carries e2e, an e2e test is red or flaky, the user says "e2e", "Playwright", "test the flow", "test the UI", or uses the Playwright test agents (planner, generator, healer).'
---
<!-- Adapted from currents-dev/playwright-best-practices-skill (MIT, © 2026 Currents Software Inc.), read 2026-10-29, and playwright.dev/docs/test-agents (Apache-2.0, © Microsoft), read 2026-10-29. -->

# Playwright e2e tests

The frontend is checked by e2e: a test walks the real user flow on the running app. Unit tests belong to the backend
(`test-driven-development`). Trying the UI by hand in a browser is a separate job and does not replace an e2e test.

## 1 · Before writing

- Read `playwright.config.ts`, the test folder and the e2e command the project declares (its own instructions or
  `package.json`). No Playwright yet → tell the user: `@playwright/test` is a new dependency; install it with the repo's
  package manager only after the user agrees.
- One user flow per test; name it by the result the user sees (for example "an admin can lock an account").
- Data: each test creates its own data through the API or a fixture, with a unique name prefix; it does not rely on data
  another test created and does not share an account between workers.
- Login: one setup project saves `storageState` per role; credentials come from environment variables, never from the
  test file (R-016).
- Run only on local or on an environment the user confirms may take test data.

## 2 · Writing

Locators, waits, data, flakiness, CI: `references/writing-tests.md`.

- Assert what the user sees and the state after the action (the record is still in the list after reopening the page),
  not implementation details.
- Each main flow also gets one wrong path: a required field left empty, or a role without permission.

## 3 · Run and report

- Run the project's own e2e command. A new test also runs with `--repeat-each=3` before you call it green.
- Red → open the trace (`npx playwright show-trace <file>`) and sort the cause: app wrong · test wrong · environment ·
  data. App wrong → report it; do not edit the test to pass.
- No `test.skip`, `test.fixme`, longer timeout or removed assertion to turn a test green without the user's agreement.
- Report: the command, the last result line, and each red test with its trace path.

## 4 · Playwright test agents

Generating a plan, generating tests and fixing red tests with planner / generator / healer:
`references/playwright-agents.md`.

## Excuses

| Thought | Reality |
|---|---|
| "Add `waitForTimeout` to be safe" | A fixed wait slows the run and stays flaky; use web-first assertions |
| "The test is flaky, turn on retry and done" | Retry hides the bug; find the cause per `writing-tests.md` › Flaky tests |
| "The healer says green" | Read the healer's diff: a loosened or removed assertion is broken, not green |
| "The old test is red, skip it to merge" | A skip needs the user's agreement and a reason |
