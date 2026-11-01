# Release a version

Applies when the repo has a `CHANGELOG.md` and a version field (for example in `package.json`, a plugin manifest) that is bumped per release.

1. **Reviewed enough?** `git log --oneline <last tag>..HEAD -- <source folders>`: every commit that touches a rule / skill / agent / hook has passed a reviewer (R-120), including commits from other sessions. Not yet → review first, no tag yet.
2. **CHANGELOG.** Collect `[Unreleased]` (keep entries other sessions already wrote) into `## [X.Y.Z] - YYYY-MM-DD`, leaving an empty `## [Unreleased]` above. Group by the file's headings (Added · Changed · Deprecated · Removed · Fixed · Security). What the consumer must do → a **Consumer action** entry. A behavior change against the previous version → write "differs from X.Y.Z". A remaining risk accepted on purpose → write it down, do not hide it. The file has comparison links at the bottom → add a line for the new version and fix the `[Unreleased]` line.
3. **Bump the version** by semver: breaking change → major · new capability → minor · fix only → patch. Map each changed file to the manifest that owns it and bump that version; a file kept in several places → bump every owner. The tag follows the version the CHANGELOG states.
4. **Commit + tag:** SKILL.md §1-§2; message `chore(release): X.Y.Z - <summary>`. Work was on a branch → merge to the main branch first (SKILL.md §3.6). Make the `chore` commit (CHANGELOG + bump) on the main branch after the merge. Tag on the main branch at exactly that commit: `git tag -a vX.Y.Z -m "<summary>"`.
5. **Push:** SKILL.md §3. Only when the user says so (push and tag both ask).
6. **Patching a released version.** Never delete or move a pushed tag; consumers may have pinned it. Patch with a new patch version; an impact on consumers (data already leaked, a step they must take) → a **Consumer action** entry.
