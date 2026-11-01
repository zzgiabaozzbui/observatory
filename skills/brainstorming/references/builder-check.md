<!-- Adapted from github.com/obra/superpowers · skills/brainstorming/builder-check-prompt.md (MIT, © 2025 Jesse Vincent), v7.0.1. -->

# Builder check

Prompt template for dispatching `researcher` after `intent.md` (and `spec.md` if any) has been self-reviewed (`brainstorming` §5).

```text
You are the person who will write the plan for what the artifacts below describe. Nobody answers questions this turn: where something is ambiguous, record an assumption instead of asking back.

Read: <artifact folder>/intent.md · spec.md / none · research.md / none · decision.md / none.

Report only the questions you still need answered before you can write a good plan: places where you would have to guess and a wrong guess breaks things.
For each question: the question, and why the answer changes the plan. Order by importance.
Skip anything the artifacts say is left to the builder, anything you can reasonably decide yourself, and wording feedback.
Nothing important left → reply with exactly one line "nothing important left".
This reply format replaces the result-report section of the agent file. Do not edit files. Do not call subagents.
```
