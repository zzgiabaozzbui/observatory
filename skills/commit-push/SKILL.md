---
name: commit-push
description: 'Commit, push, tag and release. Use BEFORE every `git commit` / `git push`, and when the user says "commit", "push", "create a tag", "release", "cut a version", "bump version", or has just finished a task in a plan, even when committing a single docs file.'
---

# Commit · push · release

One place for every step that writes to git or leaves the machine. Source rules: R-015 (commit boundary, branch), R-114 (the user's working tree), R-016 (scan before every commit). This skill is the method; if it differs from a rule, the rule wins.

| Job | Open |
|---|---|
| Commit, any kind of file | §1 → §2 |
| Push, tag | §3 |
| Task branch done → merge locally / PR / keep | `references/quick-finish.md` |
| Cut a new version (repo has `CHANGELOG.md`) | `references/release.md` |

## 1. Before the commit

1. **Branch** per R-015: a code / rule / skill / hook task while on the main branch → ask the user before the task's first commit, plan commit included: one question, two options **Create a new branch** (recommended) · **Work on the current branch** (say plainly it commits to the main branch). The user already answered, or said so by name in the session → do not ask again for that task. Claude: `AskUserQuestion`; no ask tool → a numbered list. Chose a new branch → `git switch -c <type>/<task-name>`. A task with a plan → record the answer under `Decided` in `progress.md`. A temporary worktree branch during parallel runs is not asked.
2. **Separate the files.** `git status --short` → the task's files and stray files (R-114). Stray files: do not add, reset or stash them; name them in the report. `.gitignore` or shared config changed together with other files → split into its own commit.
3. **Verify the right kind** (R-119), green before commit: hook → selftest; rule / skill → the project's structure check script (if any) + a trial render; code → the stack's verify skill. A test written first (RED) is committed **together** with the code that turns it green: the main branch takes no red commit.
4. **Scan for sensitive data.** Call the Skill tool with `docs-standards` and run its `data-sensitivity` checklist. Then `git add` each file (§2) and run `node <this skill dir>/scripts/scan-staged.mjs` at the repo root: it scans the added lines of every staged file for credential shapes, 9-12 digit runs, IPs, emails, personal machine paths, hidden characters, key / `.env` files. It prints `file:line · LABEL`, never the value, and exits 1 when a line needs a look. Review each line: a real value → fix the file, `git add` again, rescan; fake data (tests) → say so in the report. A file-writing tool may turn an escape string (a `\u` plus a code) into the real character; when you need that character in source, write `String.fromCharCode(0x…)`.
5. **Three-part report, wait for the user:** **changed** (file: job) · **deliberately untouched** (file: why) · **concerns** (assumptions the user must confirm). The "untouched" part is the evidence the scope was kept. List each file; commit once the user agrees (R-015). A commit with only the task's artifacts (R-015) → state the three parts briefly and commit without waiting; step 4 still runs. A task commit while running a plan (`subagent-driven-development` or `executing-plans`) under the R-015 exception → do not wait for the user at each commit, step 4 still runs; the three parts go into the final report.

## 2. Commit

- `git add <each file>`: never `-A`, `.`, `commit -a`.
- Message in the language and style the project declares in its project info file (for example Conventional Commits `fix(core): …`). The body says why, does not copy the diff. A task with an artifact folder → a line `Artifacts: docs/artifact/<…>/`. Trailers (for example `Co-Authored-By`) follow the harness. Several lines → a POSIX heredoc: `git commit -F - <<'EOF'`.
- No `--no-verify`. A commit hook blocks → fix the cause, make a new commit; do not `--amend` an existing commit.
- A long task with `progress.md`: after **each** task set the Status cell to ``DONE — `<sha>` · R<n> · F<n>`` (R-132) and commit at once.
- Frontend → also call the Skill tool with the project's own frontend commit guide, if it has one.

## 3. Push · tag — always ask (except the R-015 exception)

1. Ask the user before every push (R-015, except its exception); agreement last time does not apply this time.
2. `git fetch`, then `git log --oneline HEAD..origin/<branch>`: unknown commits (another session pushed) → report; do not rebase / merge unless the user says so.
3. `git push origin <branch>`. Always create tags with `git tag -a vX.Y.Z -m "<summary>"`: `git push --follow-tags` pushes only annotated tags. A lightweight tag already exists → `git push origin vX.Y.Z` on its own.
4. Check: `git ls-remote origin refs/heads/<branch> refs/tags/<tag>` matches `git rev-parse`. `Everything up-to-date` → report plainly that the command pushed nothing (the remote already has it), do not say "pushed".
5. Rejected → report, stop. No `--force` unless the user says so by name. Never delete or move a pushed tag.
6. Feature branch done → `references/quick-finish.md` (merge locally / PR / keep). Merge keeping the sha (fast-forward or merge commit); no squash / rebase when the plan already recorded the sha. Push still asks, except the R-015 exception.

## Excuses

| Thought | Reality |
|---|---|
| "The user agreed to the commit, commit straight to the main branch" | Agreeing to commit is not the answer about the branch: ask per R-015 |
| "Only docs in this commit, skip the scan" | Scan before **every** commit (R-016): docs can hold copied credentials and IPs too |
| "Tag first, review later" | A tagged version is the one consumers pull; review before tagging |
| "`--follow-tags` ran, the tag is up" | A lightweight tag does not follow. Check with `ls-remote` (§3.4) |
| "`Everything up-to-date` = pushed" | The command pushed nothing; the remote already had it, maybe from another session |
