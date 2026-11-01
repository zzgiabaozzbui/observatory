---
name: using-git-worktrees
description: 'Create or recognize a git worktree when R-123 allows it. Use for wide refactors, migrations, parallel subagents, HIGH/CRITICAL tasks that may break the build, a working tree holding the user''s unfinished changes, or when the user says "create a worktree", "work in a worktree", "separate workspace".'
---
<!-- Adapted from github.com/obra/superpowers · skills/using-git-worktrees/ (MIT, © 2025 Jesse Vincent), v6.4.1. -->

# Use worktrees

## R-123 · A worktree only when really needed

Default: work directly in the current workspace. Use `using-git-worktrees` only for: a wide refactor · a migration · parallel subagents (one worktree per agent; Claude: `Agent` with `isolation: "worktree"`; a harness without it → run one after another) · HIGH/CRITICAL work that may break the build · the user asks · the working tree holds the user's unfinished changes (R-114). A nested repo of its own → create the worktree from that repo. The worktree folder is not ignored yet → ask the user; do not edit `.gitignore` and commit it yourself (R-015).

Conditions met → do not ask the user again whether they want a worktree.

## 1 · Already in a worktree?

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
git rev-parse --show-superproject-working-tree   # prints a path → you are in a submodule, treat as a normal repo
```

`GIT_DIR` differs from `GIT_COMMON` and it is not a submodule → already in a worktree: do not create another, report the path and branch (detached HEAD: the harness manages the worktree, create a branch when the work is done), go to §4.

## 2 · Create — the harness tool first

The harness has a worktree tool → use it (Claude: `Agent` with `isolation: "worktree"` for subagents, `EnterWorktree` for the main session). `git worktree add` when the harness has a tool creates state the harness cannot see and cannot clean up. No tool → §3.

Claude: a worktree is created by default from the default branch of `origin`, not from `HEAD`. To continue from an unpushed commit → set `"worktree": { "baseRef": "head" }` in `.claude/settings.local.json` (personal, not committed), or create it with git (§3). Editing committed settings → ask the user first (R-016).

## 3 · Create with git

1. Folder: the project declares one in its project info file → use it. Not declared → `.worktrees/` if it exists, then `worktrees/`; both exist → `.worktrees/`; neither → `.worktrees/`.
2. `git check-ignore -q <folder>`: not ignored → stop, ask the user (R-123); do not edit `.gitignore` and commit it yourself.
3. `git worktree add <folder>/<branch> -b <branch>`. A nested repo of its own → create from that repo (R-123).
4. Blocked (sandbox, permissions): the reason for the worktree was the user's unfinished changes (R-114) → stop, ask the user. Any other reason → work in place and tell the user the worktree could not be created.

## 4 · Baseline

Do not install dependencies yourself; missing → tell the user the install command. Run the artifact's verify command (R-119) before editing. Red → report, ask the user whether to continue or investigate; an existing failure does not count against the task (baseline, R-119). Report: worktree path, branch, the verify result line.

## Excuses

| Thought | Reality |
|---|---|
| "Clearly not in a worktree, skip the check" | A harness-made worktree and a submodule both fool the eye; run §1 |
| "`git worktree add` is faster than finding the tool" | The harness cannot see a self-made worktree and cannot clean it up |
| "The folder is probably ignored already" | Run `git check-ignore`; if it is not ignored you may commit the whole tree |
| "Add `.worktrees/` to `.gitignore` and commit it" | `.gitignore` is a file outside the task: ask the user (R-123, R-015) |
| "Baseline later" | A dirty baseline makes every later failure ambiguous |
| "Done, `worktree remove --force` / `branch -D` to clean up" | Clean up per `commit-push` › `references/quick-finish.md` §5; `--force` and `-D` delete for good |
