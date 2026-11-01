# Sensitive-data check before writing docs or committing (REQUIRED)

Treat everything committed as **not recoverable**: history keeps the blob even after the file is deleted. The
always-on guard is the security rule (R-016); it is what forces this checklist before each commit.

## R-078 · Never commit

| Kind | Examples | Replace with |
|---|---|---|
| Real personal data | names, birth dates, ID numbers, phone, email, address, portrait photos | `<user-1>`, `<ID-NUMBER>` |
| Real business data tied to a person | document numbers, scores, ratings of a real person | invented sample data, marked `[sample data]` |
| Credentials | passwords, tokens, API keys, **connection strings** | `<PASSWORD>`, `<CONN_STR>` |
| Keys / certificates | `.pfx`, `.p12`, `.key`, `.pem`, token PINs, signing keys | describe the role, never the content |
| Internal infrastructure | real IPs, hostnames, internal domains, service ports | `<DB_HOST>`, `<SERVER_A>` |
| Original images / files | screenshots with names and numbers, original Word / PDF | a text description, or a masked image |

Placeholders stay **consistent across the repo**: one machine is always `<SERVER_A>`. The mapping from placeholder to
real value lives in a git-ignored file, **never** `git add -f`.

**Talking about a credential: DESCRIBE, do not QUOTE.** Write "weak password shared by many accounts", never the
value. This holds everywhere: docs, code comments, commit messages, scratch notes, **even when warning about that
very credential**.

A project may have its own approved exceptions (for example a committed log folder whose credentials are filtered
automatically but whose personal data is not). The project declares them in its own instructions; they apply **only
to the approved scope**.

A chat or minutes pasted as the source of a decision (`nguon/` of the task) is not an exception: redact it per R-164
(`domain-modeling` › `adr.md`) before committing.

## R-079 · Checklist - run as the LAST step, right before `git commit`

After **every** file of the commit is written. A scan followed by more writing leaves the new text unscanned: **write
more, scan again**.

1. **Re-read every new or changed file** by eye, not only the diff.
2. **Scan number strings**: runs of 9-12 digits (ID, phone numbers), `\d+\.\d+\.\d+\.\d+` (IP), `@` (email).
3. **Scan keywords**: `password`, `pwd`, `token`, `secret`, `key`, `Bearer`, `Server=`, `User Id=`, `Data Source=`,
   `\` (UNC path), `http://` to an internal host.
4. **Check images and attachments**: any unmasked image? Any original Office / PDF file outside the temporary
   inbox folder?
5. **Check `git status`**: nothing from a temporary inbox folder, no local secret file, no local settings, no
   `*.pfx` / `*.key` / `*.zip`.
6. **In doubt, stop and ask.** Never decide "this is probably public".

## R-080 · After committing sensitive data by mistake

1. **Not pushed** -> fix the file, `git commit --amend` (or `git reset --soft HEAD~1`), commit again.
2. **Pushed** -> treat it as leaked: tell the user at once, **rotate the credential or key first**, handle history
   later. Never run `git push --force` or `filter-repo` without asking.

## R-081 · Allowed

System names, module and business function names, process descriptions, names of published public legal texts,
table / column structure (without real data).
