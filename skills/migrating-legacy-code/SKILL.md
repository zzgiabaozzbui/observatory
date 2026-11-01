---
name: migrating-legacy-code
description: 'Workflow for large modernization / migration: upgrading a runtime or framework version, rewriting onto another stack, rebuilding an old system. Use when the user says "upgrade .NET", "rewrite in", "migrate the whole system", "modernize", or a task changes legacy code across many modules. Not for a new feature or a single bug fix.'
---

# Modernization / large migration

HIGH risk or above (R-117): `writing-plans` → the user approves before any file is touched. Artifacts per R-092.

1. **Pick the kind**, write it in `intent.md`: *Uplift* (version upgrade) · *Transform* (change stack) · *Reimagine*
   (rebuild).
2. **Code map:** give `researcher` the job → `research.md`: dependencies, flows, business rules with `path:line`; the old
   code style per `references/style-scan.md`.
3. **Certificate** in `spec.md`, written together with the reviewer: old tests green · characterization tests (R-130) ·
   old/new results compared · security scan. Each condition is a runnable command; exit 0 means met.
   **Roadmap:** before the pilot, propose a draft Goal of kind `nang_cap`: the Certificate becomes its criteria
   (`tieu_chi`), and each partition made in steps 4-5 becomes a phase item (`giai_doan`) (`docs-standards` ›
   `references/roadmap.md`). The project has no `docs/du-an/lo-trinh.json` yet → propose creating the roadmap (flow #35
   of `routing`) in the same question. The user approves before anything is written; if it was already proposed in this
   session, do not ask again.
4. **Pilot:** split into partitions and finish one small partition all the way through review; record tokens and rerun
   counts in `review.md` → estimate the whole project's cost and pick the model by difficulty (R-007).
5. **Each partition:** freeze that partition's code, pass the CI gate, only then move to the next partition.
6. **Repeated defects:** the same flag raised many times → fix the workflow / rules, not each spot.
