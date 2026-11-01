# Q&A, research, incident

> Before a stack-dependent step, apply [project-context.md](project-context.md); agent and skill names in examples apply only when the project maps them and their availability was checked.

All four are the research track (research-only work: no plan, TDD or commit; R-116).

## Lookup

1. `main` looks it up (R-115). Use the project's code search tools; read data only through the read-only access the project has configured, and never put credentials inline (R-017). If that access is missing, report it and stop; do not connect another way.
2. Answer with `file:line`.

## Research

1. Deep, multi-file or architecture analysis: the `researcher` agent; shallow: `main` reads. Several independent questions (none needs another's result): several `researcher` agents in one response, one question each (depth 1).
2. The prompt to `researcher` says "I need to know X to decide Y".
3. If the result must be written to a file, create `intent.md` first (the question to decide, R-092), then `docs/artifact/<YYYY-MM-DD-HHMM-name>/research.md`; call the Skill tool with `docs-standards` before writing. Writing `research.md` is still #2; no flow question.
4. Read 2-3 citations of the report before using its conclusion.

## Incident

1. Investigate first, change no code (R-116); call the Skill tool with `systematic-debugging` and run only read-only steps.
2. Suspected data or credential leak: tell the user at once and ask them to rotate the credential before going on; the agent never rotates it.
3. Cause found: go back to the routing tables and place the fix in its own flow (bug fix, schema, permissions...).
4. State in the report whether the project has CI; with no CI, say the only evidence is verification on this machine.

## Project overview

"How far is the project", "is it done", "what is missing", "which items / modules": read and answer per `docs-standards` › `roadmap.md` › Report. If the project has no roadmap file, answer from the documents it does have (`CLAUDE.md`, architecture docs, glossary, ADRs, `intent.md` front matter), say there is no roadmap yet and suggest flow #35.
