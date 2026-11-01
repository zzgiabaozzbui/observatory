---
name: resolving-merge-conflicts
description: 'Resolve the conflicts of an in-progress merge/rebase by the intent of each side, never by picking lines at random. Use when git reports CONFLICT, in the middle of a merge/rebase/cherry-pick, or when the user asks to "resolve the conflict".'
---

<!-- Adapted from github.com/mattpocock/skills · skills/engineering/resolving-merge-conflicts (MIT, © 2026 Matt Pocock). Adjusted for R-015, R-114, R-119. -->

1. **See the state**: `git status`, merge or rebase, which commit, which files conflict. The conflict comes from the work of a session / subagent that is still alive → let it resolve its own, it knows the intent.
2. **Find the origin of each side**: `git log` / `git show` of both commits, the PR / ticket if any; understand why each change was made.
3. **Resolve hunk by hunk**: keep both intents when possible. Incompatible → pick the side that fits the goal of the merge and record the trade-off. Do not invent new behavior. A hunk whose intent cannot be inferred → stop, quote the hunk, ask the user. `--abort` only when the user says so.
4. **Run the project's automatic checks** (typecheck → test → format the right files) per R-119; fix what the merge broke.
5. **Finish**: `git add` each resolved file by name (never `-A` / `.`). Report to the user the file list and the trade-offs chosen; commit or `rebase --continue` once the user agrees (R-015).
