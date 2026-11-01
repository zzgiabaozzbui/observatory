---
name: test-driven-development
description: 'Red test before fixing code. Use when fixing a bug, changing the behavior of running code (backend / frontend / script / hook) from MEDIUM, refactoring / upgrading / migrating code that has no tests, writing a regression test, or when the user says "write the test first", "TDD", "red test", "would a test written afterwards catch the bug".'
---
<!-- Adapted from github.com/obra/superpowers · skills/test-driven-development/ (MIT, © 2025 Jesse Vincent), v6.4.1. -->

# Write the test right

Before choosing an agent, a skill or a verify command that depends on the stack, open `routing` › `references/project-context.md` and check the mapping and availability; do not assume the router step ran. A `node` selftest of a hook or script does not count as "depends on the stack".

**Until you have seen the test fail, you do not know it catches the right thing.** Scope per R-139: every bug fix and every behavior change of running code from MEDIUM; mechanical LOW changes are exempt; rules / skills are tried with evals.

## R-130 · Capture behavior before changing code that has no tests

Refactoring, upgrading or migrating code without test coverage → first write a test that captures the **current** behavior (even wrong behavior, marked `// old behavior`), make it green on the old code, then change the code. A deliberate behavior change → edit that test in the same commit and say so in the report.

## 1 · Red, green, clean

1. **Red.** One test per behavior; the test name states that behavior. Use real code; mock only a slow or external dependency (§3).
2. **Check it is red for the right reason.** Run that test alone. It must FAIL (assertion misses), not ERROR (compile error, bad import, typo); the failure message names the thing that is missing. Green at once → the test checks behavior that already exists, fix the test. ERROR → fix that error and rerun until it FAILs for the right reason.
3. **Green.** Write the least code that makes the test pass. No options, no edits to neighboring code (R-010, R-011).
4. **Check green.** That test passes, then run the artifact's **full verify command** (R-119; the project's own command). Filtering one test (`--filter`, one file) is only for measuring red / green inside the loop; report done only after the full command. Another test red → name it, even if you did not break it.
5. **Clean** after green: remove duplication, rename. Add no behavior. Rerun the tests.

Green is not permission to commit (R-015): a red test is committed together with the code that makes it green (`commit-push` §1).

## 2 · Before writing the test body

- **Name the bug the test blocks:** which change to the real code makes this test red? Cannot name one → switch to an observable behavior. Can only name "the text in the source file changed" → run the artifact and assert the result. Only a deliberate decision (a constant, a message) turns the test red → the test catches a change, not a bug; test the behavior that depends on that decision.
- **Independent expectation:** the expected value is a literal or hand-checked data, not computed by the code under test or its helper.
- Test the contract of your code at the boundary (route, query, payload), not the framework's mechanism.

## 3 · Mocks

- Do not assert on a mock. Assert the behavior of the real component; checking the mock itself → drop the mock or the assert.
- Mock at the right layer: list the real function's side effects first; keep real what the test needs, mock only the slow / external layer below.
- Mock data has the full real structure, not only the fields the test reads.
- A function only tests call → put it in a test utility, not in the product class.
- Mock setup longer than half the test → switch to an integration test with the real component.

Test-double details of the stack: the project's own test guide, if it has one.

## 4 · Mutation check

Before reporting done, mutate the code in your head. Every realistic mutation must turn at least one test red: wrong constant or argument · wrong branch · missing state change or side effect · empty / default return · missing check for empty, zero, wrong permission, wrong format. No test turns red → the behavior is unprotected, or the test always passes.

If the project's own test guide has a mutation tool, run the real tool for business logic from MEDIUM, not only the mental mutation.

## 5 · Test written after the fix — red-green revert

Required when the test was written **after** the fix exists. Prove the test is red without the fix:

1. `git status --short`: a file outside the task → stop, ask the user (R-114).
2. Save a patch of **the fix files only**, not the test files, outside the repo: `git diff -- <fix files…> > <tmp>/fix.patch`. A new untracked fix file is not in the patch → at step 3 move it to the temp folder, at step 4 move it back. A committed fix → `git diff <commit before the fix> HEAD -- <fix files…> > <tmp>/fix.patch`. Empty patch → stop and report; it does not count as a pass.
3. `git apply -R <tmp>/fix.patch` → run the test: it must FAIL, not ERROR.
4. `git apply <tmp>/fix.patch` → the fix files are back as before step 3 (uncommitted fix: `git diff -- <fix files…>` matches the patch; committed fix: `git diff -- <fix files…>` is empty) → run the test: green.

No `stash`, `checkout --`, `restore`, `reset` (R-114).

## Excuses

| Thought | Reality |
|---|---|
| "Too simple, skip the test" | Simple code still breaks; bug fixes and behavior changes from MEDIUM need a red test first (R-139) |
| "Writing the test afterwards is the same" | A test written afterwards is green at once and proves nothing → red-green revert (§5) |
| "The test was green on the first run, good" | A test that was never red was never checked (§1 step 2) |
| "I tried it by hand" | A manual try cannot be rerun; a test runs the same every time |
| "One green test means done" | Report done after the full verify command (R-119) |
