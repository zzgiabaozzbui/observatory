<!-- Adapted from github.com/mattpocock/skills · skills/engineering/prototype/LOGIC.md (MIT, © 2026 Matt Pocock). -->

# Logic prototype

One self-contained HTML file to click buttons and watch the state change. Use it for questions about business rules,
state transitions and data shape: things that look fine on paper and only show their flaw when pushed through real cases.
One file, nothing to install, so a business person can click through it alone.

## Steps

1. **Write the question** as a paragraph at the top of the page (visible text, not only a comment): which state model,
   which question. **Done when** reading that paragraph tells you what the prototype answers.
2. **Split the logic into a pure module** inside one `<script>` block: a reducer `(state, action) => state`, a state
   machine (when "which action is valid now" is part of the question), or a few pure functions on simple data types. The
   module never touches the DOM; the page calls the module, never the reverse. **Done when** the module can be copied to
   another file and run unchanged.
3. **Build the page**: plain HTML/CSS/JS, everything inline, no framework, no bundler. Labels use **business language**,
   not variable names. Top to bottom:
   - title + the question from step 1;
   - the current state as a labelled table (not raw JSON), redrawn after each click, with the changed spot marked;
   - free buttons: one per action, clickable in any order;
   - scenarios: one tab per scenario (normal case, hard edge case, a case that should be forbidden), a short description
     plus the buttons to press in order; opening a scenario resets to the initial state.
   **Done when** every scenario runs through by buttons with no console error.
4. **Hand over**: the user asking for a prototype already agreed to the HTML; do not ask again. Keep the file in the
   scratchpad, and publish it as an Artifact if the harness has one; do not write it into the repo. A
   "wait, this should not be allowed" reaction is a flaw in the **idea**, which is exactly what you want to find. The user
   asks for more actions / scenarios → add them.
5. **Capture the conclusion** per `SKILL.md` › General rules 6: the verified logic module is what moves into real code;
   the page shell is dropped.

## Do not, and why

- Connect to a real database: a broken prototype breaks real data.
- Mix logic into the page: a module tied to the DOM cannot be carried over.
- Frameworks, dev server: they lose the "open the file and it runs" property.
- Put the page shell in the product: it is made for hand clicking, not for users.
