# Project roadmap

## R-171 · `docs/du-an/lo-trinh.json` - a contract for machines

The roadmap answers "how far along is the project". "What the project is" already lives in the project's own
instructions, `docs/architecture/c4.md`, `GLOSSARY.md` and `docs/adr/`; do not copy it here. The roadmap is optional: a
project without this file skips every key below, and that is not an error.

Four layers: **Goal** (`dich`: the top objective - finish the system, upgrade it) -> **Item** (`hang_muc`: a module or
phase of one Goal) -> mission (`docs/artifact/<...>/`) -> task (the R-132 table). The JSON keys keep their original
spelling so Observatory can read them.

### Structure

```json
{
  "schemaVersion": 2,
  "module": [
    { "id": "records", "ten": "Records" }
  ],
  "dich": [
    {
      "id": "DICH-01",
      "ten": "System live, release 1",
      "loai": "xay_moi",
      "trang_thai": "DOING",
      "chu": "Project lead",
      "han": "2027-03-31",
      "doi_han": [],
      "nguong": 1,
      "thay_the": null,
      "adr": null,
      "khong_lam": ["Mobile app"],
      "tieu_chi": [
        { "id": "TC-01", "noi_dung": "Users accept in UAT", "kiem": "signed UAT minutes", "diem": 0, "dat_luc": null, "bang_chung": null }
      ]
    }
  ],
  "hang_muc": [
    {
      "id": "HM-01",
      "dich": "DICH-01",
      "ten": "Records module live",
      "loai": "module",
      "module": "records",
      "trang_thai": "TODO",
      "pha": null,
      "chu": null,
      "han": null,
      "doi_han": [],
      "khong_lam": [],
      "tieu_chi": []
    }
  ]
}
```

| Key | Required | Value |
|---|---|---|
| `schemaVersion` | yes | `2` |
| `id` | yes | Goal `DICH-NN`, item `HM-NN`, module lowercase ASCII joined by `-`. Unique in the file, permanent, never reused, even after the entry is `SKIP` |
| `ten` | yes | one line |
| `dich[].loai` | yes | `xay_moi` (build new) · `nang_cap` (upgrade) · `van_hanh` (operate) |
| `hang_muc[].loai` | yes | `module` · `giai_doan` (phase) |
| `trang_thai` | yes | `TODO` · `DOING` · `DONE` · `SKIP` (a subset of R-132); the user decides, the agent writes after the user confirms |
| `han` | no | `YYYY-MM-DD` or `null` |
| `hang_muc[].dich` | yes | the `id` of a Goal |
| `hang_muc[].module` | no | an `id` in `module[]` or `null` |
| `dich[].thay_the` · `dich[].adr` | no | `id` of the Goal replaced · path of the ADR that records why; or `null` |
| `tieu_chi[]` | Goals `xay_moi` / `nang_cap`: at least one; others: no | each has `id` (`TC-NN`, unique in the file, permanent) · `noi_dung` · `kiem` (a command that exits 0 on pass, or a sentence on how to check when it cannot be automated) · `diem` (a number 0-1; `null` = not scored, counts as 0) · `dat_luc` (`YYYY-MM-DD` or `null`) · `bang_chung` (commit sha, minutes name, or `null`) |
| `chu` | yes | the person or role responsible, one line, no email (R-078); or `null` |
| `doi_han[]` | yes | one entry `{ "han_cu": "YYYY-MM-DD", "ly_do": "<one line>" }` per `han` move, appended at the end; `[]` if never moved |
| `dich[].nguong` | yes | a number in `(0, 1]`, default `1` |
| `khong_lam[]` | yes | one line per thing the Goal / item will not do; `[]` if none |
| `hang_muc[].pha` | yes | `do` (not all work known yet) · `lam` (all work known, only doing left) · `null` |

- A criterion is **met** when `diem` >= the Goal's `nguong`; an item's criteria use the parent Goal's `nguong`.
  `dat_luc` is the date the criterion was first met, `bang_chung` the evidence at that time.
- `trang_thai`, `pha`, `diem`, `chu`, `han`, `doi_han`, `nguong`, `khong_lam`: the agent proposes, the user confirms,
  then the agent writes. Never lower `nguong` to make a Goal pass; changing `nguong` needs the user's approval with a
  reason.
- Moving `han`: append `{ han_cu, ly_do }` to `doi_han` and change `han` in the same commit.
- Write JSON indented by 2 spaces, keep the key order of the sample, append new entries at the end of arrays.
- `kiem` never holds a host, IP or credential (R-078): commands read values from environment variables. No tool runs
  `kiem` by itself. The agent runs `kiem` only when the user approves that exact command line in the turn; a command
  outside the project's verify commands (R-119) is asked first. The user confirms, then `dat_luc` and `bang_chung`
  are written.
- Goals are immutable: never edit `ten`, `loai`. Changing a Goal -> the old Goal becomes `SKIP`, the new Goal records
  `thay_the` and `adr` (`domain-modeling` › `adr.md`). Items and criteria may change when the user approves; moving
  an item to a new Goal = changing its `dich` key.
- Tasks in a plan never edit `lo-trinh.json`: changing the status of a Goal / item is done later, with the user,
  committed per R-015.

### `intent.md` front matter

Four optional keys beside `muc_rui_ro` (R-133) and `trang_thai` (R-092):
- `hang_muc: HM-NN` - one main item. The project has `lo-trinh.json` -> when writing `intent.md`, the agent proposes
  the matching item inside a question already being asked (R-138), the user confirms; no match -> no key (a mission
  outside the roadmap).
- `module: <id>` - only for a mission outside the roadmap; a mission with `hang_muc` takes the item's module.
- `tieu_chi: TC-NN, TC-NN` - criteria of the item or its parent Goal that the mission serves, one line, comma
  separated; only with `hang_muc`. The agent proposes it with `hang_muc`, the user confirms.
- `xong_luc: YYYY-MM-DD` - whoever writes `trang_thai: done` adds it (the Board writes it itself); if present it stays,
  even when set `done` again; moving to `archived` or removing `trang_thai` removes `xong_luc`. A mission already
  `done` before this key existed does not get `xong_luc`: reports say "unknown".

Adding or editing these four keys does not change the `intent.md` Goal (like `trang_thai`, R-092).

### Check rules

Check `lo-trinh.json` by reading, against the table below, before committing it and when reporting. Errors and
overdue entries are fixed before commit; warnings go into the report.

| Kind | Condition |
|---|---|
| Error | unreadable JSON · `schemaVersion` not `2` · a required key missing · a value outside its list · duplicate `id` · `hang_muc[].dich`, `hang_muc[].module` or `thay_the` pointing to a missing `id` · a Goal `xay_moi` / `nang_cap` with no criterion · `diem` outside `[0, 1]` · `nguong` outside `(0, 1]` · `chu` containing `@` · a `doi_han` entry missing `han_cu` / `ly_do` · a criterion `id` not matching `TC-NN` |
| Overdue | past `han` and not `DONE` / `SKIP` - move `han` with a `doi_han` entry, or `SKIP` |
| Warning | a `DONE` Goal whose mean criterion score is below `nguong` · a `DONE` item with an unmet criterion · a criterion of a not-`DONE`/`SKIP` Goal / item met more than 90 days ago (re-check it) · a `DOING` item with no `pha` · `han` not after the last `han_cu` · more than one `DOING` Goal that is not `van_hanh` · a `DONE` item with a mission not `done` / `archived` · an `intent.md` with `hang_muc` / `module` / `tieu_chi` pointing to a missing `id`, or a `tieu_chi` outside the mission's item / parent Goal |

### Create and backfill

1. Read the project profile ("what the project is") and the front matter of every `intent.md`.
2. Propose Goals with criteria, items and the module list; group existing missions into items. Present as a table and
   ask the user to approve (R-138); nothing is written before approval.
3. After approval write `lo-trinh.json`, check it against the rules above, add `hang_muc` to the `intent.md` of the
   missions the user assigned; an `intent.md` with uncommitted changes is not written, tell the user (R-114).
   `lo-trinh.json` and the changed `intent.md` files are not task artifacts: list them, commit when the user agrees
   (R-015).

### Report

Read `lo-trinh.json` and the `intent.md` front matter (`trang_thai` · `hang_muc` · `module` · `tieu_chi` ·
`xong_luc`) of every mission directly; do not read intent bodies unless needed. Do not use `docs/artifact/index.json`
(the index drops `done` / `archived` missions and lacks these keys). Answer in this order: running Goals (mean score
against `nguong`, criteria met / not met, oldest `dat_luc`) · each item (phase, missions done / total,
`archived` not counted) · share of missions outside the roadmap · overdue entries and warnings from the check rules.

**Why:** Observatory and AI only see the progress of single missions; they cannot say whether the project is done or
what is missing. The count of finished missions hides work not yet known; criteria met / not met alone are too coarse.
