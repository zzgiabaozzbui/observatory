# High risk: HIGH / CRITICAL

> Before a stack-dependent step, apply [project-context.md](project-context.md); agent and skill names in examples apply only when the project maps them and their availability was checked.

Common to every section below (R-117): `writing-plans` (reason, risks, rollback; the rollback goes in a `rollback*` file, R-133), then **the user approves before any file is touched**, then work, then the reviewer for the diff type is mandatory (R-120), then the sensitive-data check (`docs-standards` › `data-sensitivity.md`) before commit.
While a plan runs (`subagent-driven-development` or `executing-plans`): commit under the plan-run exception of R-015.
Plans go to `docs/artifact/<YYYY-MM-DD-HHMM-name>/` (`plan.md` + `progress.md`), not a plugin's default folder (R-118).

## New module

New table + new permission registration: HIGH.

0. A request bundling **several independent modules** (each with its own data and users; dropping one does not force rewriting another): before the plan, make a table `module | responsibility | depends on` plus an order of work, dependencies one-way (two modules that need each other are one module). The user approves the table, then each module is planned in order.
1. Plan, user approves, user chooses the run workflow (R-118).
2. Use the project's declared CRUD / integration workflow and check it is available; finish the permission requirements first, then the contract gate, then the UI per [frontend.md](frontend.md) if any. Missing dependency: report it, do not default to another stack's workflow.
3. Data access follows the project's own stack guide.
4. Check permissions with an **ordinary account**, not an admin role (admins often bypass permission filters).
5. A screen with UI: acceptance per the stack and environment conditions in [frontend.md](frontend.md) › UI.

## Schema

HIGH.

1. Check whether a stored procedure is needed per the project's stack guide; when one is, use the project's schema guide, if any, and check availability before writing.
2. Verify the real schema through the access the project allows before merge code or procedures; do not trust old entities or SQL.
3. Pick the narrowest access that is enough, per the project's configuration; never put credentials inline (R-017).
4. Store migrations and procedures per the project's convention.
5. Verify database operations through the access the project allows, with the right role and environment; a green build does not prove the data is right. Do not use a console or credentials to bypass that access (R-017). Missing tool: stop and report.

## Data

1. Pick the narrowest access that is enough, per the project's configuration; never put credentials inline (R-017).
2. A broad `DELETE` / `DROP` / `TRUNCATE` is CRITICAL: plan and approval.

## Permissions

CRITICAL.

1. Propose first, wait for approval, then edit, especially anything that widens permissions (R-005, R-117). `quick-fix` is forbidden.
2. Find out the project's real permission mechanism; test that a user without the grant cannot reach the endpoint. Use a function/role table only if that is the mechanism in use.
3. After a permission change, clear the permission cache by the project's mechanism.
4. Use the project's permission review guide if it has one, and check permission config and records against the real mechanism before acceptance.
5. Verify with a live test, using an ordinary account.

## Public endpoint

An endpoint without login or a public lookup: CRITICAL.

1. Propose first, wait for approval (R-117).
2. It sits behind a rate limit and returns no more personal data than the lookup needs (R-016).
3. Test the security properties per the project's API test guide.
4. Unsure whether it may be public: stop and ask.

## Config

Environment config files, Dockerfile, env: HIGH.

1. Follow R-117 (shared-config exception), R-016 and R-005.
2. Verify JSON/YAML syntax (R-119). Do not read secret files (git-ignored local config).

## Shared files

Full conditions of R-005: edit a shared file only when all four hold.

1. **Additive only**: no deletion or modification of existing logic, fields or types.
2. **Strictly required**: directly necessary for the in-scope feature to work.
3. **No security/contract impact**: must NOT alter permissions, authorization scopes, security constants or feature flags, bypass validation, or break API contracts.
4. **Report before editing**: state the intended addition and its rationale before modifying the file.
