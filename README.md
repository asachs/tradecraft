# Tradecraft

*Do the work well, and keep the record that proves it.*

Portable Claude Code working patterns for a corporate environment. **Patterns only — no personal data, no employer data.** This repo is pre-existing personal methodology, authored on personal equipment, consumed read-only by work machines.

> **New here?** [CONCEPTS.md](CONCEPTS.md) explains the idea behind Tradecraft — the ISA, the capture discipline, and how the record compounds into review-ready evidence. This README is the tool reference.

## What this is

A starter kit for running a disciplined Claude Code work brain on a corporate laptop or VM.

### Repository layout

```
tradecraft/
├── CLAUDE.md                    Work-profile instructions Claude Code loads: operational
│                                  rules, sharing bar, daily cadence, initiative conventions
├── CONCEPTS.md                  Why the pieces exist — read this first
├── ISA.md                       This repo's own definition of done (the worked example)
│
├── templates/                   Starting points, copied into $WORK_DIR
│   ├── ISA.md                     Definition of done, per initiative
│   ├── PLAN.md                    Execution plan, written when work starts moving
│   ├── WORKLOG.md                 Method/provenance log for multi-session work
│   ├── DECISIONS.md               Decision log
│   ├── REGISTRY.md                Portfolio scored against the prioritisation filter
│   ├── WORK_LEDGER.md             Promise ledger
│   ├── BRAG.md                    Dated, evidence-linked accomplishments
│   ├── company-template.md        Scaffold for your gitignored company.md
│   └── work-claude.md             CLAUDE.md for a full LifeOS work profile
│
├── workflows/                   Prompts you invoke by name
│   ├── StartOfDay.md              Calendar, daily note, meeting stubs
│   ├── EodSummary.md              End-of-day one-liners to review
│   ├── MondayPlanning.md          Week plan from promises and initiatives
│   └── WeeklyReport.md            Manager-ready weekly draft
│
├── tools/                       Deterministic CLIs — no LLM calls, no network
│   ├── EodSummary.ts  WeeklyReport.ts  DailyBrief.ts  MondayPlan.ts
│   ├── BragHarvest.ts  Reconcile.ts                   Report generators
│   ├── serve.ts                   Localhost dashboard over the work record
│   ├── schedule.ts                launchd delivery (skipped on managed machines)
│   ├── install.ts                 Full install
│   ├── install-lite.ts            Additive, MDM-safe install (+ --check)
│   ├── build-work-archive.ts      Package a work-safe profile on the personal machine
│   ├── bootstrap-work-profile.ts  Unpack it on the work machine
│   ├── verify-clean.ts            Fail if identity/employer strings reach the repo
│   ├── verify-isolation.ts        Fail if personal content reaches the work profile
│   ├── archive-work.sh            Weekly tarball snapshots of the work notes
│   └── lib/                       Shared: activity, ledger, dates, eod, initiatives,
│                                    config, links, markdown
│
├── hooks/                       Passive capture
│   ├── SessionActivityLog.hook.ts Records what was done and where, per session
│   ├── WorkBrief.hook.ts          SessionStart brief: overdue promises, EOD state
│   └── settings-snippet.json      Wiring merged into ~/.claude/settings.json
│
├── skills/eod/SKILL.md          /eod — wraps the end-of-day loop
├── tests/                       235 tests, mirroring tools/ and hooks/
└── Plans/                       Dated records of past work (history, not live docs)
```

Not in the repo and never committed: `company.md` (employer-specific context) and
`*.local.json` (real containment patterns). Both are gitignored, and
`bun tools/verify-clean.ts` fails the build if either leaks in.

## Core principles

1. **Definition of done before starting.** Every non-trivial piece of work gets an ISA — a short document stating the goal and the verifiable criteria — before the first edit.
2. **Record at the moment of doing.** The activity log and decision log are written as work happens, never reconstructed.
3. **Review before sharing.** The tools draft; you decide what to do with the output. Anything shared carries ordinary discretion — your own words, ticket IDs by reference, no code, secrets, or customer data — and only after you've reviewed it.
4. **Generated, then edited.** Reports are drafted by the work brain from the activity log; the human edits and sends. Nothing auto-sends.

## Bootstrap on a fresh work machine/VM

```bash
git clone <this-repo> ~/src/tradecraft
cd ~/src/tradecraft
bun tools/install.ts          # --dry-run to preview · --force to overwrite · WORK_DIR=… to relocate
```

`install.ts` is idempotent. It creates `~/work/{worklog,initiatives/{org,personal},reports}`, seeds `WORK_LEDGER.md` and `BRAG.md`, installs the work-profile `CLAUDE.md` and the `SessionActivityLog` hook into `~/.claude/`, and merges the hook into `settings.json` (backing up any existing file). Re-runs skip what's already there, and it never silently overwrites an existing `~/.claude/CLAUDE.md` — it tells you to merge by hand or pass `--force`.

Then start `claude` (ideally inside tmux on an always-on host) and work normally. The activity log accumulates; run the workflows on Friday.

> Running full LifeOS on the work machine instead of vanilla Claude Code? Use `bootstrap-work-profile.ts` with a LifeOS archive — it installs the LifeOS work profile (identity files, memory dirs) on top of this kit.

## Report engine

Deterministic CLI tools that turn passively-captured activity and a promise ledger into review-ready markdown drafts. No LLM calls, no network access, no runtime dependencies — just bun + TypeScript. (The only dev dependencies are `typescript` and `@types/bun`, used for the typecheck; nothing is fetched when the tools run.)

### Tools

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `bun tools/WeeklyReport.ts` | Manager-ready weekly summary (Shipped / In flight / Decisions / Blocked / Next week) | `--week YYYY-MM-DD` (ISO week containing that date; default: current week) |
| `bun tools/EodSummary.ts` | End-of-day one-liners to review (done/decided/promised/learned/met/blocked) | `--date YYYY-MM-DD` (default: today) |
| `bun tools/MondayPlan.ts` | Week plan with promises, overdue items, initiatives, and outcome stubs | `--date YYYY-MM-DD` (default: today) |
| `bun tools/Reconcile.ts` | Org-assigned vs personal initiatives: what feeds what, orphans, and unmapped personal work | `--date YYYY-MM-DD` (default: today) |
| `bun tools/DailyBrief.ts` | Yesterday's activity summary plus today's and overdue promises | `--date YYYY-MM-DD` (default: today) |
| `bun tools/BragHarvest.ts` | Sweep `[BRAG?]`-tagged EOD lines into BRAG.md stub entries | `--week YYYY-MM-DD` (ISO week; default: current week) |
| `bun tools/schedule.ts` | Install/run scheduled report delivery via launchd + macOS notifications | `install`, `uninstall`, `status`, `run <job>`, `run-all` |
| `bun tools/install-lite.ts --check` | Report whether the lite hook wiring is still in `~/.claude/settings.json` | exit 1 on drift |
| `bun tools/serve.ts` | Localhost dashboard over the whole work record at http://localhost:3141 | `--port 3141` |

All report tools accept `--out <file>` to write to a file (must resolve under `WORK_DIR`). Without `--out`, output goes to stdout only.

### EOD save-review loop

Run `bun tools/EodSummary.ts --save` at end of day. The tool writes a draft to `$WORK_DIR/worklog/eod/<date>.md` — edit the saved file in your own words before close of business. Those human-authored `done:`, `decided:`, and `blocked:` lines become the headline of Friday's weekly report; commit activity demotes to an **Evidence** appendix underneath. The tool refuses to overwrite an existing file (human edits are sacred).

### Skills

> **On enterprise-managed Claude, expect the wiring to be undone.** `install-lite.ts` merges its hooks into `~/.claude/settings.json`. Enterprise Claude has been observed rewriting that file, dropping the merged hooks without any error — the file stays valid, and activity capture silently stops. Check with `bun tools/install-lite.ts --check` (exit 0 = intact, 1 = drifted); re-running the installer restores it, and the install is idempotent so re-running is always safe. Worth checking whenever a session brief looks empty, or on a calendar reminder.

Skills in `skills/` are symlinked into `~/.claude/skills/` by `install-lite.ts` (referenced, never copied — the repo stays source of truth). A pre-existing non-symlink skill of the same name is left untouched.

- **`/eod`** — thin wrapper over the EOD save-review loop below: runs `EodSummary.ts --save`, enriches from the session + daily note, applies share-safety, flags `[BRAG?]` lines, and stops for review. Available after a Claude Code restart.

### BRAG harvest loop

Tag any EOD line with a trailing `[BRAG?]` while editing your saved EOD file. On Friday, run `bun tools/BragHarvest.ts` — each tagged line becomes a pre-filled stub in `$WORK_DIR/BRAG.md` (date, What in your own words, Evidence from ticket refs). Only the "Why it mattered" sentence is left for you to write — impact is always human-authored. Idempotent: re-runs skip entries already present.

### Configuration

Set `WORK_DIR` to point at your work directory (default: `~/work`). This is where your
actual record lives — separate from this repo, and private:

```
~/work/
├── WORK_LEDGER.md               Promises made — owner, due date, status
├── BRAG.md                      Dated, evidence-linked accomplishments
├── repos.json                   Optional: repo basename → web base URL
│
├── initiatives/
│   ├── REGISTRY.md                Portfolio scored against the prioritisation filter
│   ├── org/                       Formally-assigned work
│   │   └── api-gateway/
│   │       ├── ISA.md               Definition of done — always, first
│   │       ├── PLAN.md              Execution plan — when work starts moving
│   │       ├── WORKLOG.md           Method/provenance — for multi-session work
│   │       ├── DECISIONS.md         Decisions, logged as made
│   │       └── briefs/              This initiative's own evidence
│   └── personal/                  Self-found work, carrying candidate_org
│       └── flaky-test-hunt/
│           └── ISA.md
│
├── worklog/
│   ├── activity.jsonl             Session activity, written by the hook
│   └── eod/2026-08-19.md          Daily EOD drafts you edit in your own words
│
├── meetings/                    Who you met, what came of it
├── observations/                Captured as noticed
├── briefs/                      Evidence spanning initiatives
└── reports/                     Generated: weekly-report/, daily-brief/, monday-plan/
```

`repos.json` maps repo basename → web base URL (e.g. `{"my-repo": "https://github.com/org/my-repo"}`).
When present, WeeklyReport renders commit ids as clickable `<base>/commit/<sha>` links; otherwise
ids stay bare text. Everything else is created on demand — `bun tools/install.ts` scaffolds the
directories, and the rest appear as you use them.

### Scheduled delivery

`schedule.ts` runs report tools on a schedule via macOS launchd, saves output to `$WORK_DIR/reports/<type>/<date>.md`, and fires native macOS notifications. No network, no external services — just local file writes and `osascript`.

```bash
bun tools/schedule.ts install    # install launchd plists (~5 jobs)
bun tools/schedule.ts status     # show what's installed
bun tools/schedule.ts run-all    # dry-run all jobs once
bun tools/schedule.ts uninstall  # clean up
```

Default schedule (all times Europe/Dublin):

| Job | Schedule | What it does |
|-----|----------|--------------|
| `monday-plan` | Mon 08:30 | MondayPlan → reports/monday-plan/ |
| `daily-brief` | Tue–Fri 07:45 | DailyBrief → reports/daily-brief/ |
| `eod-nudge` | Mon–Fri 17:00 | macOS notification if no EOD file for today |
| `weekly-report` | Fri 16:00 | WeeklyReport → reports/weekly-report/ |
| `brag-harvest` | Fri 16:30 | BragHarvest sweep |

### Dashboard

```bash
bun tools/serve.ts              # http://localhost:3141
```

Read-only browser over the whole of `$WORK_DIR`, not just generated reports. The home page cards the major sections — initiatives, meetings, briefs, observations, worklog, reports — with file counts, and pins `WORK_LEDGER.md`, `BRAG.md`, and `initiatives/REGISTRY.md`.

- **Tables render as tables.** The registry, the promise ledger, and any tabulated report display as HTML rather than raw pipes.
- **Initiative progress is visible.** Any directory with an `ISA.md` shows a bar and an `n/total` count of criteria met, in listings and at the top of the document.
- **Criteria read as checkmarks.** `- [x]` and `- [ ]` render as status markers rather than literal brackets.

Everything lives under `/browse/<path>`, mirroring the directory layout. The server is read-only and refuses anything outside `$WORK_DIR` — traversal, absolute paths, and symlinks pointing out of the tree all 404. Only text formats are served (`.md`, `.txt`, `.json`, `.jsonl`, `.yaml`, `.yml`); `logs/`, `node_modules/`, and dotfiles are never listed.

Logs go to `$WORK_DIR/logs/`.

### Weekly archive snapshots

`tools/archive-work.sh` writes a point-in-time tarball of the work-notes repo at HEAD, complementing the continuous git push with recoverable restore points. `workflows/WeeklyReport.md` step 9 runs it after the weekly commit.

```bash
bash tools/archive-work.sh
```

It archives to `~/work-archives/` and, when a backup git remote is configured, alongside it — keeping the newest 7 per location and pruning older ones. Every path is overridable: `WORK_DIR`, `ARCHIVE_REMOTE`, `WORK_ARCHIVE_DIR`, `WORK_ARCHIVE_REMOTE_DIR`, `ARCHIVE_KEEP`. With no resolvable remote it warns, writes the local snapshot, and exits 0.

### Review before sharing

These tools **draft** to stdout or local files. You review, edit, and send — nothing is ever sent automatically. Ordinary discretion on anything you share: your own words, ticket IDs as bare references, no code, secrets, hostnames, or customer data.

### Running tests

```bash
bun install     # dev dependencies for the typecheck (first time only)
bun test        # 192 tests
bun run typecheck   # tsc --noEmit, strict
```

`bun test` does not typecheck — `bun run typecheck` is the separate gate.

## License / provenance

Personal methodology, MIT licensed. Created prior to and independent of any employment. Contains no employer confidential information by design — and the workflows are built to keep it that way.
