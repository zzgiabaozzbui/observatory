<!-- Adapted from github.com/obra/superpowers · skills/systematic-debugging/defense-in-depth.md (MIT, © 2025 Jesse Vincent), v6.4.1. -->

# Defense in depth

Fixing the source blocks the bad path you saw. Other paths (a new call, a mock in a test, another branch) can still feed the wrong value. After fixing the source, consider adding checks at the layers the data passes through, only when that bug is expensive (data loss, wrong money, data leak); do not add them for every bug.

| Layer | What to check |
|---|---|
| Input | reject invalid input at the boundary (API, file read, config read) |
| Logic | a business function checks the conditions it needs (not empty, in range) |
| Environment | block dangerous operations in the wrong context (for example writing outside a temp folder while tests run) |
| Logging | enough context in the log to investigate fast next time (no sensitive values) |

The project's own stack guide already says which layer checks what → follow it (the stack guide beats personal preference). An extra check outside the fixed spot is a separate behavior change (rejecting input = a contract change) → re-rate the R-117 level; outside the scope → R-003.

Every added check gets a red test first (bug fix flow). A check that hides errors (swallowing an exception, a silent default return) does not count.
