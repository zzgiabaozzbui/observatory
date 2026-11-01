# Writing e2e tests

<!-- Adapted from github.com/currents-dev/playwright-best-practices-skill · playwright-best-practices/core/locators.md, core/assertions-waiting.md, core/test-data.md, debugging/flaky-tests.md (MIT, © 2026 Currents Software Inc.). -->

## Locators

- Order: `getByRole` (with `name`) → `getByLabel` → `getByPlaceholder` → `getByText` → `getByTestId`.
- Do not use CSS classes, generated ids or XPath tied to the DOM structure.
- Several elements match → `filter({ hasText })` or nest locators by region
  (`getByRole('row', { name }).getByRole('button', { name })`); use `nth()` only when the order is business meaning.
- No role or label locator works → report the missing label to the frontend (an accessibility bug); do not add
  `data-testid` to dodge it.

## Waits and assertions

- Use web-first assertions: `await expect(locator).toBeVisible()`, `toHaveText`, `toHaveURL`. They wait on their own.
  Do not write `expect(await locator.textContent())`.
- No `page.waitForTimeout`, no `setTimeout`. Waiting for an API → `page.waitForResponse`, set before the action that
  triggers it. Waiting for a condition outside the DOM → `expect.poll` or `expect(...).toPass()`.
- `{ force: true }` only when you know why the element is covered; write the reason in a comment.

## Data

- Create through the API or a fixture inside the test; clean up in the fixture teardown.
- Random data uses a seed, and the seed is printed to the log so the exact case can be replayed.
- No dependence on test order: each test runs alone (`npx playwright test <file> -g "<name>"`).

## Flaky tests

1. Run `--repeat-each=10`, then run again with `--workers=1`.
2. Green with one worker, red with several → shared data or a shared account.
3. Red when run with another file → state leaks between tests.
4. Red only in CI → slow machine, headless, network: run locally headless with `CI=1`.
5. Red at exactly one action → a wait for the right state is missing.

Fix the cause. `retries` in the config is only for collecting traces (`trace: 'on-first-retry'`); a test that is green
only on the retry is still flaky and must be reported.

## CI

When red, keep `playwright-report/` and the traces as artifacts. A slow suite → split with `--shard=<i>/<n>`.
