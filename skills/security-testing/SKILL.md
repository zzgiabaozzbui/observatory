---
name: security-testing
description: 'Test authorization with a role × endpoint matrix (401, 403, IDOR) and audit dependencies for known vulnerabilities (pnpm, npm, NuGet). Use when adding or changing an endpoint, a permission, a data scope or a dependency; before a release; or when the user says "security test", "permission test", "IDOR", "audit dependencies".'
---
<!-- Cases A / B adapted from github.com/addyosmani/agent-skills · skills/security-and-hardening (MIT, © Addy Osmani); "missing data means no verdict" adapted from github.com/trailofbits/skills · plugins/supply-chain-risk-auditor (CC BY-SA 4.0, © Trail of Bits), rewritten. See LICENSE in this folder. -->

# Security testing

Two jobs: authorization tests (§1, §2) and dependency audit (§3). Reading code for vulnerabilities belongs to the
reviewer (`code-reviewer`); this skill writes tests and runs commands to produce evidence.

## 1 · Authorization matrix

Before writing tests, build a table (in the test plan, or in the e2e spec):

| Endpoint · method | No token | Role without permission | Permitted role, own data | Permitted role, another person's / unit's data |
|---|---|---|---|---|

Each cell holds the expected code: `401` · `403` · `200` · `403` or `404` per the project's convention (no convention yet
→ ask the user). Take the data from the project's permission map and data scope (unit, owner). A new endpoint or a
changed permission → one test per cell.

## 2 · Writing the tests

- Run only on local or on an environment the user confirms may write and delete test data; the test cleans up the
  records it creates.
- One test account per role. Two accounts of the same role that belong to different units / owners give the IDOR case.
- IDOR case: A creates a record; B reads, edits and deletes it by that id → the code in the last column; A reads it again
  and sees it unchanged.
- Also try the indirect paths: lists, search, counts and exports do not leak records outside the scope.
- Do not use a superadmin to conclude anything about permissions.
- Use the project's own test framework (for example xUnit for .NET, or Playwright's `request` with a per-role
  `storageState` per `e2e-playwright` for web stacks).
- Test account credentials come from environment variables, never from code (R-016, R-017).

## 3 · Dependency audit

Run according to the lockfile in the repo:

| Repo has | Command |
|---|---|
| `pnpm-lock.yaml` | `pnpm audit --prod` |
| `package-lock.json` | `npm audit --omit=dev` |
| `*.csproj` | `dotnet list package --vulnerable --include-transitive` |

- Report each vulnerability: package, version in use, severity, advisory id, fixed version, and the direct package that
  pulls it in.
- The command fails, there is no network, or the advisory source cannot be read → report "cannot assess: <reason>". Never
  report clean.
- Do not run `audit fix`, `--force` or a major upgrade on your own. Propose the smallest fixed version; the user approves,
  then a developer agent applies it.
- A vulnerability only in a dev dependency, or on a code path that is never called → still list it, with the reason it
  ranks lower.

## Excuses

| Thought | Reality |
|---|---|
| "The endpoint already has `[Authorize]`" | `[Authorize]` blocks anonymous users, not B reading A's data; the IDOR case is needed |
| "Green with admin is enough" | Admin passes every check; test with an ordinary role |
| "The audit failed on network, treat it as clean" | Write "cannot assess" |
| "`audit fix` is faster" | It may bump a major version and change behavior; the user approves first |
