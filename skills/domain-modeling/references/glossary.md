<!-- Adapted from github.com/mattpocock/skills · skills/engineering/domain-modeling/GLOSSARY-FORMAT.md (MIT, © 2026 Matt Pocock). -->

# GLOSSARY.md format

```md
# <Context name>

<One or two sentences: what this context is and why it exists.>

## Terms

**Application**:
<One or two sentences: what it is.>
_Avoid_: request, form
```

- **Choose firmly.** Several words for one concept -> pick one, the others go under `_Avoid_`.
- **Short definitions**, at most two sentences: what it **is**, not what it does.
- **Business-specific terms only.** General programming concepts (timeout, retry, DTO) stay out, however much the
  project uses them.
- **Group under subheadings** when natural clusters exist; with one cluster keep it flat.
- **No personal data, no real data** as examples (R-078).

`GLOSSARY-MAP.md` (several contexts): a section `## Contexts` - one line each: a link to the context's
`GLOSSARY.md` titled with its name, then a colon and one sentence; a section `## Relations` - one line each `**A -> B**: what A emits / calls, how B uses it`.
