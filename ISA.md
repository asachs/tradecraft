---
task: "Report engine — four bun/TS CLI tools turning passive activity capture into manager-ready reporting drafts"
project: claude-work-scaffold
effort: E3
effort_source: classifier
phase: verify
progress: 38/38
mode: interactive
started: 2026-06-12T01:05:00Z
updated: 2026-06-12T01:05:00Z
---

## Problem

The scaffold repo has the capture side (SessionActivityLog hook → activity.jsonl) and the prose workflows (EodCrossing.md, WeeklyReport.md), but the workflows are LLM instructions with no deterministic engine underneath. Every report currently requires a Claude session to re-derive structure from raw JSONL — slow, non-reproducible, and untestable. The probation-evidence pipeline needs generators that are proven with synthetic data *before* day one, because the user will not QA them on the job.

## Vision

On a Friday afternoon, one command turns a week of passively-captured activity and a promise ledger into a weekly draft the user only has to edit for voice, not assemble. The morning brief and EOD crossing each cost one command and seconds of review. The first time the user runs `bun tools/WeeklyReport.ts` against real work data, the draft reads like something they would have written — structure, references, and promises already in place.

## Out of Scope

No LLM calls inside the tools — they are deterministic shapers; prose polish stays with the Claude session that wraps them. No Jira/Slack/tracker API integration — ticket IDs are bare-text references only. No sending, posting, or syncing anywhere — output is stdout (or an explicit `--out` file) for human review. No BRAG.md auto-writing — brag promotion stays a human decision flagged by `[BRAG?]`. No employer-specific configuration, strings, or examples — the repo stays generic methodology.

## Constraints

- bun + TypeScript only; zero external dependencies beyond bun builtins (repo must run on a fresh corp VM with only bun installed)
- No network calls of any kind in any tool
- Tools read only under `WORK_DIR` (env-configurable, default `~/work`) and the repo's own files; write only to stdout or `--out <file>` under `WORK_DIR`
- Membrane: generated drafts carry ticket refs as bare references; tools never embed file contents, diffs, or commit messages beyond the one-line `last_commit` already captured
- Repo stays employer-agnostic: no company names, internal hostnames, or personal-PAI paths anywhere in code, fixtures, or docs

## Goal

Four deterministic CLI tools (WeeklyReport, EodCrossing, MondayPlan, DailyBrief) plus a shared parsing lib exist in `tools/`, every tool produces correct drafts from a synthetic fixture week, and `bun test` passes a suite that proves date-windowing, ledger parsing, membrane-safety, and output shape — all verified before any real work data exists.

## Criteria

### Shared lib

- [x] ISC-1: `tools/lib/activity.ts` exports a parser that reads activity.jsonl and returns typed entries; invalid JSON lines are skipped with a stderr warning, never a crash
- [x] ISC-2: `tools/lib/activity.ts` filters entries by [start, end) date window using the `ts` field
- [x] ISC-3: `tools/lib/activity.ts` groups entries by repo (cwd basename) and branch
- [x] ISC-4: `tools/lib/ledger.ts` parses the WORK_LEDGER.md markdown table into typed promises (promised, to, due, ticket, status)
- [x] ISC-5: `tools/lib/ledger.ts` classifies promises: open, done, renegotiated, overdue (open + due < today)
- [x] ISC-6: `tools/lib/ledger.ts` tolerates an empty or template-only ledger (returns [], no crash)
- [x] ISC-7: `tools/lib/dates.ts` computes the Mon-Sun ISO-week window containing a given date
- [x] ISC-8: `tools/lib/dates.ts` computes "today" and "yesterday" day-windows; all date logic accepts an injectable `now` for testability
- [x] ISC-9: `tools/lib/config.ts` resolves WORK_DIR from env with `~/work` default and tilde expansion

### WeeklyReport.ts

- [x] ISC-10: `bun tools/WeeklyReport.ts` with fixture WORK_DIR prints a draft containing the five sections: Shipped / In flight / Decisions / Blocked / Next week
- [x] ISC-11: Weekly draft groups activity by repo+branch as themes, not a chronological dump
- [x] ISC-12: Weekly draft lists promises closed this week under Shipped and open promises due next week under Next week
- [x] ISC-13: Weekly draft includes ticket refs from the ledger as bare text (e.g. `ABC-123`)
- [x] ISC-14: `--week YYYY-MM-DD` selects the ISO week containing that date; default is the current week
- [x] ISC-15: Empty activity week produces a graceful draft stating no captured activity, exit code 0

### EodCrossing.ts

- [x] ISC-16: `bun tools/EodCrossing.ts` with fixture data prints 1-6 one-liners, each starting with one of done:/decided:/promised:/learned:/met:/blocked:
- [x] ISC-17: EOD output derives `done:` suggestions from today's activity entries (repo, branch, last_commit one-liner)
- [x] ISC-18: EOD output includes `promised:` lines for ledger promises created or due today
- [x] ISC-19: EOD output ends with a review reminder line instructing the human to edit before carrying anything off-machine
- [x] ISC-20: `--date YYYY-MM-DD` overrides "today" for the EOD window

### MondayPlan.ts

- [x] ISC-21: `bun tools/MondayPlan.ts` prints a week plan containing open promises due this week with owner and due date
- [x] ISC-22: Monday plan lists overdue promises in a distinct "carried over / overdue" block
- [x] ISC-23: Monday plan lists initiative slugs found under `WORK_DIR/initiatives/` with a status placeholder
- [x] ISC-24: Monday plan includes a "top 3 outcomes" stub section for the human to fill

### DailyBrief.ts

- [x] ISC-25: `bun tools/DailyBrief.ts` prints yesterday's activity summary (repos touched, commits seen)
- [x] ISC-26: Daily brief lists promises due today and overdue promises, each with ticket ref
- [x] ISC-27: Daily brief on a Monday uses Friday as "yesterday" (working-day logic)

### Tests & fixtures

- [x] ISC-28: `tests/fixtures/` contains a synthetic week: activity.jsonl with 5 weekdays, ≥2 repos, ≥3 branches; WORK_LEDGER.md with open, done, overdue, and renegotiated promises; ≥1 initiative dir
- [x] ISC-29: `bun test` passes with zero failures
- [x] ISC-30: Tests cover date windowing across the Mon-Sun boundary (Sunday entry excluded from next week)
- [x] ISC-31: Tests cover ledger status classification including overdue derivation
- [x] ISC-32: Tests cover malformed JSONL line skip behaviour
- [x] ISC-33: Each of the four tools has at least one end-to-end test asserting output shape against the fixture week

### Anti-criteria & hygiene

- [x] ISC-34: Anti: no tool writes any file unless `--out` is given; running all four tools against fixtures leaves the filesystem unchanged (stdout only)
- [x] ISC-35: Anti: `rg -i "payroc|worldnet|sachs|asachs|/Users/" tools/ tests/` returns zero matches — repo stays employer- and person-agnostic
- [x] ISC-36: Anti: `rg "fetch\(|XMLHttpRequest|net\.|http\." tools/` returns zero network-call matches
- [x] ISC-37: README.md documents the four tools, WORK_DIR config, and the membrane rule (draft → human review → manual send)
- [x] ISC-38: Repo committed and pushed with tools, tests, fixtures; `bun test` output captured in Verification

## Test Strategy

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-1..9 | unit | lib functions against fixture inputs | all assertions pass | bun test |
| ISC-10..15 | e2e | WeeklyReport stdout against fixture week | sections + content present | Bash + bun test |
| ISC-16..20 | e2e | EodCrossing stdout against fixture day | prefix grammar + count 1-6 | Bash + bun test |
| ISC-21..24 | e2e | MondayPlan stdout | blocks present | Bash + bun test |
| ISC-25..27 | e2e | DailyBrief stdout incl. Monday case | working-day logic correct | bun test |
| ISC-28 | fixture | fixture files exist with required variety | counts met | Read/Bash |
| ISC-29..33 | suite | full test run | 0 failures | bun test |
| ISC-34 | anti | fs snapshot before/after tool runs | no diff | Bash |
| ISC-35, ISC-36 | anti | ripgrep sweeps | zero matches | Grep |
| ISC-37 | doc | README section exists | present | Read |
| ISC-38 | ops | git push + captured test output | pushed, green | Bash |

## Features

| name | description | satisfies | depends_on | parallelizable |
|------|-------------|-----------|------------|----------------|
| shared-lib | activity/ledger/dates/config parsers | ISC-1..9 | — | false |
| fixtures | synthetic week + ledger + initiative | ISC-28 | — | true |
| weekly-report | WeeklyReport.ts CLI | ISC-10..15 | shared-lib, fixtures | true |
| eod-crossing | EodCrossing.ts CLI | ISC-16..20 | shared-lib, fixtures | true |
| monday-plan | MondayPlan.ts CLI | ISC-21..24 | shared-lib, fixtures | true |
| daily-brief | DailyBrief.ts CLI | ISC-25..27 | shared-lib, fixtures | true |
| test-suite | unit + e2e tests | ISC-29..33 | all above | false |
| hygiene-docs | anti-sweeps, README, push | ISC-34..38 | all above | false |

## Decisions

- 2026-06-12: Project ISA placed at repo root as system of record; the Work OS task ISA (MEMORY/WORK/20260612-001500) references this build via ISC-23..29 but the engine's own done-condition lives here with the code.
- 2026-06-12: Deterministic tools, no LLM inside — prose polish belongs to the Claude session wrapping the tool; the engine must be testable without inference and runnable on a bare corp VM.
- 2026-06-12: Injectable `now` in all date logic — Europe/Dublin week boundaries and "Monday yesterday=Friday" logic are untestable otherwise.
- 2026-06-12: Implementation by Forge (GPT-5.4) against this ISA as spec; primary verified independently (re-ran bun test, ran all four tools, ran anti-sweeps). Show-your-math on E3 delegation floor (2nd delegation skipped): single cohesive repo spec — a second writer adds merge risk, not speed; research delegation already spent in the payments-primer run this session.

## Verification

- ISC-29 (and 1..33 via suite): `bun test` → "41 pass, 0 fail, 73 expect() calls, 4 files [355ms]" — re-run by primary, not just Forge's claim.
- ISC-10..15: `WORK_DIR=tests/fixtures/work bun tools/WeeklyReport.ts --week 2026-06-03` → five sections present; activity grouped by repo+branch (infra-migration/main, api-gateway/feature/rate-limiting, …); done promises under Shipped; OPS-102/OPS-106 under Next week; OVERDUE flag on OPS-103.
- ISC-16..20: EodCrossing --date 2026-06-03 → 2 `done:` lines + membrane review reminder; prefix grammar correct.
- ISC-21..24: MondayPlan --date 2026-06-08 → due-this-week block, "Carried over / overdue" block with OPS-103, sample-initiative listed, Top-3 stub.
- ISC-25..27: DailyBrief → "Yesterday (2026-05-29)" from Monday 2026-06-01 proves Friday-as-yesterday; overdue OPS-103 listed; e2e tests cover the rest.
- ISC-34: `git status --porcelain tests/fixtures/` shows only `??` (untracked new fixtures); no files modified by tool runs.
- ISC-35: `rg -il "payroc|worldnet|sachs|asachs|/Users/" tools/ tests/ | wc -l` → 0.
- ISC-36: `rg -l 'fetch\(|XMLHttpRequest|net\.|http\.' tools/ | wc -l` → 0.
- ISC-37: README "Report engine" section added (Forge); content confirmed in diff review at commit time.
- ISC-38: commit/push evidence recorded below at commit time.
