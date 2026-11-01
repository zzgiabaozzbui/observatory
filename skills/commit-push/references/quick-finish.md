<!-- Adapted from github.com/obra/superpowers · skills/finishing-a-development-branch/ (MIT, © 2025 Jesse Vincent), v6.4.1. -->

# Finish a branch: merge, PR, keep

Use when the work on a task branch is done and you must decide where it goes. Source rules: R-015 (push and the "Push + PR" exception), R-114, R-119. Do not use while a plan runs (`subagent-driven-development` or `executing-plans`) before the final review.

## 1 · Verify

Run the artifact's full verify command (R-119) on the tree about to be merged. Red → report, stop; do not ask the choice yet.

## 2 · Environment

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
WORKTREE_PATH=$(git rev-parse --show-toplevel)
```

Record these three values before changing directory; §5 needs them.

| State | Options | Cleanup |
|---|---|---|
| `GIT_DIR` = `GIT_COMMON` (normal repo) | Merge locally · Push + PR · Keep as is | no worktree |
| different, on a branch | Merge locally · Push + PR · Keep as is | §5 |
| different, detached HEAD | Push + PR · Keep as is | none, the harness manages it |

On the main branch → drop the **Push + PR** option; push is asked separately (R-015).

## 3 · Base branch

The base branch is recorded in the plan, under `Decided`, or is the branch's upstream. Unsure → ask the user to confirm; merging into the wrong base is hard to undo.

## 4 · Ask, then act

One question with the ask tool (Claude `AskUserQuestion`; no ask tool → a numbered list): **Merge locally into `<base>`** · **Push + PR** · **Keep as is**. Add no delete option. Wait for the user's choice.

**Merge locally**
1. Go to the root of the main repo: `cd "$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)"`.
2. `git status --short` there: stray changes → stop, ask the user (R-114). Clean → `git switch <base>`.
3. `git fetch`; `git log --oneline <base>..origin/<base>` shows commits → report, do not pull / rebase yourself (`commit-push` §3).
4. `git merge --ff-only <branch>` or `git merge --no-ff <branch>`: keep the sha; no squash / rebase when the plan recorded the sha.
5. Rerun verify on the merge result. Red → stop, keep the branch and worktree, investigate (a local merge can still be undone).
6. Green → clean up the worktree (§5), `git branch -d <branch>`. Pushing the base branch is still asked separately (R-015).

**Push + PR**: choosing this option agrees to the push this once (R-015 exception).
1. `git push -u origin <branch>`; detached HEAD: `git push origin HEAD:refs/heads/<new branch>`.
2. Open a PR / MR into `<base>` with the forge CLI (for example `gh pr create`, `glab mr create`) or the forge URL printed on push; follow the repo's PR template if any. Report the URL.
3. Keep the worktree: PR feedback is fixed there.
4. Push rejected → report, stop (`commit-push` §3).

**Keep as is**: report: keeping branch `<name>`, worktree at `<path>`.

**The user wants to throw the work away** (not an option in the question): list the branch, the commits and the worktree that will be lost; do it only when the user types exactly `discard`. Then clean up (§5) and `git branch -D <branch>`.

## 5 · Clean up the worktree

Only after a green local merge, or after `discard`. Run from outside the worktree, using the values recorded in §2.
- `GIT_DIR` = `GIT_COMMON` → nothing to clean.
- A worktree created with git per `using-git-worktrees` §3 → `git worktree remove "$WORKTREE_PATH"`, then `git worktree prune`.
- Refused because uncommitted files remain → `git -C "$WORKTREE_PATH" status --porcelain -uall`, ask the user: commit to the branch · move to the main repo · delete. No `--force` until the user chooses delete.
- A harness-made worktree (for example `isolation: "worktree"`, `EnterWorktree`) → leave it to the harness (Claude: `ExitWorktree`).

## Excuses

| Thought | Reality |
|---|---|
| "The test was green a moment ago" | That run proved only the tree at that time; rerun on the tree about to be merged (R-119) |
| "Obviously the user wants a merge" | Where to merge is the user's choice; ask, then wait |
| "The user agreed to the commit, push too" | Agreeing to commit is not agreeing to push; only the "Push + PR" option counts, once (R-015) |
| "The base branch is probably main" | Confirm or ask; merging into the wrong base is hard to undo |
| "`branch -D` to keep it short" | `-D` deletes unmerged commits too; only after the user types `discard` |
| "`worktree remove --force` to finish" | Refusal means files exist only there; `--force` deletes for good |
| "Push was rejected, `--force` fixes it" | The remote changed; investigate, `--force` only when the user says so by name |
| "The PR is up, delete the worktree" | PR feedback is fixed in that worktree; keep it until merged |
