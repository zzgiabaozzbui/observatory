---
name: prototype
description: 'Build throwaway code that answers one design question before writing real code. Use when the user wants to "try whether this logic holds", "run the state model", "prototype the approval flow", "spike", or is unsure about a business flow / state transition that paper cannot answer.'
---

<!-- Adapted from github.com/mattpocock/skills · skills/engineering/prototype/ (MIT, © 2026 Matt Pocock). -->

# Prototype

A prototype is **throwaway code that answers one question**. The question decides its shape.

## Pick the branch

- **"Is this logic / state model right?"** → `references/logic.md`: one self-contained HTML file; click buttons to push
  the state through the hard cases; someone who does not read code can run it.
- **"How does this screen look?"** → a mockup (`routing` › `references/frontend.md` › Mockup): a few clearly different
  variants in a scratchpad / Artifact, **never** written into the real frontend code folder.

The question is unclear and the user cannot answer → for a backend module or business flow use the logic branch, for a
screen use the UI branch; write the assumption at the top of the prototype.

## General rules

1. **Throwaway from the start, labelled as a prototype** in the file name and the first line of the page.
2. **Runs without thinking**: open the file and it runs; no install, no server.
3. **No stored data**: state lives in memory. If the main question is about storage → store in the browser (IndexedDB) or
   a JSON file in the scratchpad, installing nothing. A real database is needed → ask the user first and never touch the
   project database; delete the scratch data afterwards.
4. **No technical polish**: no tests, no error handling beyond what makes it run, no abstractions.
5. **Show state**: after each action, print all relevant state so you can see what just changed.
6. **Finish by capturing the conclusion**: write the question and its answer in the task's `intent.md` (R-092); if the
   conclusion is a decision, follow `domain-modeling` › `references/adr.md` › When to record. Prototype code does not go
   to the main branch; to keep it as a source, use its own branch (ask the user which, R-015) and write the branch name
   in the task artifacts. Changing real code per the conclusion is a new task and follows the normal flow.

**Done when** the question at the top of the prototype has an answer written in the task artifacts, and `git status` of
the main branch holds no prototype file.

## Excuses

| Thought | Reality |
|---|---|
| "The prototype runs, copy it into the real code" | Only the pure logic module is worth carrying over; the page shell goes. Carrying over is a new task with tests (red test first, R-139) |
| "Add a few tests to be safe" | A prototype that needs tests has become real code |
| "While here, support case X for later" | A prototype answers exactly one question |
