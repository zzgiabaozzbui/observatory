# Athena Starter

Athena Starter is a ready-to-use kit of agent rules, skills, agents and safety hooks for Claude Code. It routes each new request to the right flow (Q&A, research, implementation, review), plans work before coding, asks for a red test before a fix, requires an independent review for risky changes, and keeps task documents in one predictable place.

## Install

As a Claude Code plugin (Claude Code 2.1.275 or later):

```
/plugin install athena-starter --marketplace zzgiabaozzbui/observatory
```

Older Claude Code, two steps (the marketplace is named `athena`):

```
/plugin marketplace add zzgiabaozzbui/observatory
/plugin install athena-starter@athena
```

With APM:

```
apm install zzgiabaozzbui/observatory
```

The hooks run with `node`: Node 18 or later must be on your PATH. A native Claude Code install may not include Node; without it the hooks stay silent and do nothing.

## Skills

| Skill | When to use |
|---|---|
| `routing` | First message of a session and every new request: picks the flow. |
| `brainstorming` | New request with no intent or spec yet. |
| `grilling` | Stress-test a plan or design before building. |
| `architecture` | Vague request, or adding / changing / connecting systems: C4 pictures before the plan. |
| `writing-plans` | Intent is settled: write plan.md and progress.md for approval. |
| `executing-plans` | Run an approved plan inline. |
| `subagent-driven-development` | Run an approved plan by delegating tasks to agents. |
| `test-driven-development` | Bug fix or behavior change: red test first. |
| `systematic-debugging` | Bug, red test or stack trace: find the root cause before fixing. |
| `commit-push` | Before every commit, push, tag or release. |
| `using-git-worktrees` | Wide refactor, parallel agents, or a dirty working tree. |
| `resolving-merge-conflicts` | A merge or rebase reports CONFLICT. |
| `docs-standards` | Writing or editing Markdown docs; sensitive-data check before commit. |
| `domain-modeling` | Business terms (GLOSSARY.md) and architecture decisions (ADRs). |
| `e2e-playwright` | Write, run or fix Playwright e2e tests for a web UI. |
| `security-testing` | Role x endpoint authorization tests and dependency audit. |
| `migrating-legacy-code` | Large upgrade, rewrite or modernization. |
| `prototype` | Throwaway code that answers one design question. |

## Agents

| Agent | Role |
|---|---|
| `developer` | Implements non-trivial changes from a spec or plan; returns diff and test output. |
| `researcher` | Read-only investigation and codebase analysis. |
| `quick-fix` | Small mechanical changes (typos, formatting, one-line fixes). |
| `code-reviewer` | Read-only review of code, rule, skill, agent and hook changes. |
| `verifier` | Independent build, typecheck, lint and test run; reports only. |
| `ux-tester` | Tries the real UI as a newcomer (needs the Playwright MCP server); reports only. |

## Hooks

- **SessionStart**: injects the core rules (`rules/core.md`) and reminds the agent to invoke `routing` first (after a context compaction it reminds the agent to resume the running plan instead).
- **Block `--no-verify`**: stops Bash commands that skip git hooks.
- **Protect lint config**: stops edits to existing lint / format config files (eslint, prettier, biome, commitlint); the agent must fix the code, not loosen the config. Set `ATHENA_CONFIG_PROTECTION=off` to edit one yourself.

To turn the hooks off, disable the plugin with `/plugin` (select `athena-starter`, then Disable).

## Documentation convention

Each task keeps its documents in `docs/artifact/<YYYY-MM-DD-HHMM-name>/`: `intent.md` first, then plan.md and progress.md for larger work. The progress table uses the columns `ID | Task | Deps | Status` with the statuses `TODO`, `DOING`, `CHỜ-USER` (waiting for the user), `BLOCKED`, `DONE`, `SKIP`. Details are in the `docs-standards` skill.

## Optional: Observatory plugin

`athena-observatory` is a read-only local view of a repo's plans and running agents:

```
/plugin install athena-observatory@athena
```

It is bundled as is: the interface is in Vietnamese, and the app also reads transcripts of other coding agents and route logs when they exist. These are features of the app, not data shipped with it. It listens on 127.0.0.1 only.

## Releases

This repository holds the official releases of Agent Observatory Desktop.

## License

MIT; see `LICENSE` for third-party sources.
