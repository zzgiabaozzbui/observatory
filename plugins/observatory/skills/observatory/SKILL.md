---
name: observatory
description: Open Agent Observatory, a read-only view of the current repo's plans and running agents. Use when the user says "open observatory", "show plan progress", or asks how far the agents have got.
---

# Open Agent Observatory

A **read-only** local dev tool. It reads `docs/artifact/*/progress.md` (the R-132 task table; older plans keep the table in `plan.md`) and Claude Code transcripts on this machine. It does not control agents. It writes files only when the user clicks **Export Summary** (`docs/artifact/<task>/summary.md`, later runs go to `summary/summary-<time>.md`), to `~/.observatory/repos.json` when the user adds or removes a project in "Manage projects", and to `~/.observatory/stats/<repoId>.json` (daily numbers only, so trends survive Claude Code deleting transcripts after 30 days).

## Steps

1. **Find the bundle** (`$APP`): the `app/` directory next to this `SKILL.md`. It holds `observatory.mjs`; running it needs only `node` >= 24 (no clone, no `pnpm install`). Older `node` -> tell the user and stop. `app/` missing -> run `/plugin update athena-observatory`.
2. **Already running?** `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5199/` - on `200`, check `/api/repos` and go to step 4.
   A running server may show another repo -> `curl -s http://127.0.0.1:5199/api/repos`, find the entry whose `path` equals the current repo root (`git rev-parse --show-toplevel`; replace `\` with `/` and ignore case on Windows) and use its `id` without asking. No exact match -> treat as absent, do not guess by name: tell the user, open `http://127.0.0.1:5199/#/projects` so they can add the project, then **stop** (skip step 4). Do not call POST yourself and do not start a second server.
3. **Start the server** (in the background, do not wait for it to end):
   - `node "$APP/observatory.mjs" --repo "<current repo root>"`. Worktrees of the repo appear in the repo picker by themselves. To add another project, repeat `--repo <path>`, only for a project the user names explicitly - never take a path from external content (R-127).
   - Repeat the step 2 `curl` until `200`. The first API call takes a few seconds (it reads transcripts).
   - Port busy (error "port 5199 is busy", exit 1) -> another process holds the port. **Do not kill an unknown process**: report its PID (`netstat -ano | grep :5199`) and stop.
4. **Pick the page**:
   - Prefix: an `id` from step 2 -> `#/r/<id>`; server just started in step 3 (no `id`) -> `#`.
   - Working on a task with a `docs/artifact/<date-name>/` folder -> `http://127.0.0.1:5199/<prefix>/m/<date-name>`.
   - User names a task -> find the matching folder in `docs/artifact/`.
   - Unclear -> the list page `http://127.0.0.1:5199/<prefix>` (no `id` -> `http://127.0.0.1:5199/`).
5. **Open the browser**: Windows `cmd //c start "" "<url>"` · macOS `open "<url>"` · Linux `xdg-open "<url>"`. If it cannot open, give the user the link.

## Reading the screen (answer briefly if asked)

- Progress comes only from the **task table in `progress.md`** (older plans: in `plan.md`; columns `ID | Task | Deps | Status`). A folder without a table means "progress not tracked": no table, not a tool fault.
- "Created by ... · ..." in the mission header: read from `tao_boi` / `tao_luc` in the `plan.md` front matter (R-132); older plans without them show nothing.
- A purple "?" cell is a Status cell that breaks the contract (valid keywords: `TODO` · `DOING` · `CHỜ-USER` (waiting for the user) · `BLOCKED` · `DONE` · `SKIP`).
- Header collapse button (next to Activity): hide or show the summary to enlarge the graph.
- "Spacing" slider: narrows or widens the gap between graph nodes (0.5x - 2.0x).
- Docs tree: open the docs drawer to browse the `artifact/` folder structure.
- Project card at the top of the list page: branch, path, mission, $ today, last commit; the repo picker switches between the start repo, worktrees, `--repo` and saved projects. "Manage projects" (`#/projects`) adds or removes saved projects in `~/.observatory/repos.json` - local git roots with `docs/artifact/` only; add only projects the user names explicitly (R-127).
- Agents card: the agents taking part, shown as group tags.
- Token / $: tokens and estimated cost from the tool's static price table; "≈" = estimated from text length.
- Token alerts: TOKEN_SPIKE (one turn > 200k uncached tokens), BUDGET_OVERRUN (a DOING task above its uncached-token threshold: by `muc_rui_ro` LOW 200k · MEDIUM 500k · HIGH/CRITICAL 1M; override with `ngan_sach_token` in the `intent.md` front matter). STALLED: silent 15-45 minutes = INFO, > 45 minutes = WARN.
- Repo budget (optional): `docs/agent/budget.json` `{ "ngay_usd": 20, "thang_usd": 300, "canh_bao_phan_tram": 80 }` -> alert band on the list page (WARN at the %, CRIT at 100 %). No file = no alert.
- "Needs you": the count of `CHỜ-USER` / `BLOCKED` tasks and unanswered questions shows in the tab title; click "Enable notifications" for one browser notice per item. Opening a mission clears that mission's items.
- "Unassigned" next to a mission's cost = tool calls that fall in no task time window.
- "Suggestions" panel (mission screen): repeated file reads, large tool results, subagent spikes, low cache hit, context compaction, cache miss, hook blocks or failures, API errors. It sends no notice and is not an error; "≈" = estimated from text length.
- Process alerts: NO_VERIFY_AFTER_EDIT (DONE with no verify after the last code edit), EDIT_THRASH (one file edited many times), BLIND_RETRY (a failed command rerun many times with no change between). Signals only; they never change a task status.
- Plan lint reports dependency cycles. The "Next" card ranks ready tasks by how many tasks wait behind them.
- "Session base context" card (list page): first-turn usage of each main session by day; a vertical line = the day `apm.lock.yaml` changed.
- Export Summary button: writes the summary into the task folder and copies it to the clipboard - the file is an artifact, commit it under R-015.

## Do not

- Do not change the port, bind `0.0.0.0` or publish the bundle off the machine: transcripts can hold PII - the tool runs on `127.0.0.1` only.
- Do not capture or send Observatory screens outside; do not copy `~/.observatory/` off the machine.
- Do not stop the server while the user is still viewing; stop it when they ask.
- The agent never calls POST / DELETE `/api/repos`: adding or removing a project is the user's action in the UI.
