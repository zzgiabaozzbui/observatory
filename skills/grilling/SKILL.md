---
name: grilling
description: Interview the user relentlessly about a plan or design. Use when the user wants to stress-test a plan before building, or uses any 'grill' trigger phrases.
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Batch independent questions into one response: one `AskUserQuestion` call holds up to 4 questions, more → several calls in parallel in the same response (R-138). Ask sequentially only when a question depends on an earlier answer. (No ask tool → numbered list, user answers in one message.)

If a question can be answered by exploring the codebase, explore the codebase instead.

Stop asking when you can predict my answers to your next three questions. If several rounds pass and you
still can't, say so — something foundational is missing.

Then restate, one line each, for me to confirm or correct:

- Outcome · Who benefits · Success (how we know) · Binding constraint · **Out of scope** (never omit)

Only an explicit "yes" confirms. "Whatever you think", "sounds good" → offer two concrete options instead.
After "yes", end the turn — don't start the next phase until I choose it.
