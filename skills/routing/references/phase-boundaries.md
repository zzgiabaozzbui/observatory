# Phase boundaries

<!-- Adapted from github.com/mattpocock/skills · skills/engineering/ask-matt/PHASE-BOUNDARIES.md (MIT, © 2026 Matt Pocock). -->

A phase is one stretch of work in a session (clarify, plan, build, review). Decide context handling only **at the
boundary** between two phases; inside a phase, keep going or hand the rest to a subagent.

Go top to bottom; **the first "yes" wins**:

1. **Can you just continue?** The next phase needs this phase's exact wording (clarify to build is the typical case),
   or the context is still roomy. Yes: continue. Every option below turns the source into a summary, so rule this out first.
2. **Is the context behind you no longer needed?** Yes: clear. Cheapest, but one-way: clearing by mistake loses the
   reason behind what was just done.
3. **Must something travel** (to another harness, folder, repo or person, or a side job split off mid-phase)? Yes:
   write a handoff file. Only in those cases.
   The handoff file holds five things: scope and decisions made · tasks done / next task · files changed and working
   tree state (committed or not) · verify command and result · open questions, risks and approvals still pending. The
   next session reads this file plus the real `git status`; it never infers "approved" from old conversation.
4. **Is the job narrow enough to run without the user watching** (review, research)? Yes: subagent.
5. **Otherwise compact**, with a note on what to keep for the next phase (for example "about to review part X").
