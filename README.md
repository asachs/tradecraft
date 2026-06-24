# Tradecraft

*Do the work well, and keep the record that proves it.*

Portable Claude Code working patterns for a corporate environment. **Patterns only — no personal data, no employer data.** This repo is pre-existing personal methodology, authored on personal equipment, consumed read-only by work machines.

> **New here?** [CONCEPTS.md](CONCEPTS.md) explains the idea behind Tradecraft — the ISA, the capture discipline, and how the record compounds into review-ready evidence. This README is the tool reference.

## What this is

A starter kit for running a disciplined Claude Code work brain on a corporate laptop or VM:

- **CLAUDE.md** — work-profile instructions: operational rules, the review conventions, capture conventions
- **templates/** — ISA (definition-of-done) template, decision log, promise ledger, brag document
- **workflows/** — prompts for the end-of-day summary and the weekly report
- **hooks/** — session activity logging (auto-accumulates "what was done, where") + settings snippet

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

`install.ts` is idempotent. It creates `~/work/{worklog,initiatives,reports}`, seeds `WORK_LEDGER.md` and `BRAG.md`, installs the work-profile `CLAUDE.md` and the `SessionActivityLog` hook into `~/.claude/`, and merges the hook into `settings.json` (backing up any existing file). Re-runs skip what's already there, and it never silently overwrites an existing `~/.claude/CLAUDE.md` — it tells you to merge by hand or pass `--force`.

Then start `claude` (ideally inside tmux on an always-on host) and work normally. The activity log accumulates; run the workflows on Friday.

> Running full PAI on the work machine instead of vanilla Claude Code? Use `bootstrap-work-profile.ts` with a PAI archive — it installs the PAI work profile (identity files, memory dirs) on top of this kit.

## Report engine

Deterministic CLI tools that turn passively-captured activity and a promise ledger into review-ready markdown drafts. No LLM calls, no network access, no external dependencies — just bun + TypeScript.

### Tools

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `bun tools/WeeklyReport.ts` | Manager-ready weekly summary (Shipped / In flight / Decisions / Blocked / Next week) | `--week YYYY-MM-DD` (ISO week containing that date; default: current week) |
| `bun tools/EodSummary.ts` | End-of-day one-liners to review (done/decided/promised/learned/met/blocked) | `--date YYYY-MM-DD` (default: today) |
| `bun tools/MondayPlan.ts` | Week plan with promises, overdue items, initiatives, and outcome stubs | `--date YYYY-MM-DD` (default: today) |
| `bun tools/DailyBrief.ts` | Yesterday's activity summary plus today's and overdue promises | `--date YYYY-MM-DD` (default: today) |
| `bun tools/BragHarvest.ts` | Sweep `[BRAG?]`-tagged EOD lines into BRAG.md stub entries | `--week YYYY-MM-DD` (ISO week; default: current week) |
| `bun tools/schedule.ts` | Install/run scheduled report delivery via launchd + macOS notifications | `install`, `uninstall`, `status`, `run <job>`, `run-all` |
| `bun tools/serve.ts` | Localhost report dashboard at http://localhost:3141 | `--port 3141` |

All report tools accept `--out <file>` to write to a file (must resolve under `WORK_DIR`). Without `--out`, output goes to stdout only.

### EOD save-review loop

Run `bun tools/EodSummary.ts --save` at end of day. The tool writes a draft to `$WORK_DIR/worklog/eod/<date>.md` — edit the saved file in your own words before close of business. Those human-authored `done:`, `decided:`, and `blocked:` lines become the headline of Friday's weekly report; commit activity demotes to an **Evidence** appendix underneath. The tool refuses to overwrite an existing file (human edits are sacred).

### BRAG harvest loop

Tag any EOD line with a trailing `[BRAG?]` while editing your saved EOD file. On Friday, run `bun tools/BragHarvest.ts` — each tagged line becomes a pre-filled stub in `$WORK_DIR/BRAG.md` (date, What in your own words, Evidence from ticket refs). Only the "Why it mattered" sentence is left for you to write — impact is always human-authored. Idempotent: re-runs skip entries already present.

### Configuration

Set `WORK_DIR` to point at your work directory (default: `~/work`). The tools read:

- `$WORK_DIR/worklog/activity.jsonl` — session activity captured by the hook
- `$WORK_DIR/WORK_LEDGER.md` — promise ledger (markdown table)
- `$WORK_DIR/initiatives/` — initiative directories (for MondayPlan)
- `$WORK_DIR/repos.json` — optional map of repo basename → web base URL (e.g. `{"my-repo": "https://github.com/org/my-repo"}`). When present, WeeklyReport renders commit ids as clickable `<base>/commit/<sha>` links; otherwise ids stay bare text.

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

Reports are viewable with any editor or via the built-in dashboard:

```bash
bun tools/serve.ts              # http://localhost:3141
```

Logs go to `$WORK_DIR/logs/`.

### Review before sharing

These tools **draft** to stdout or local files. You review, edit, and send — nothing is ever sent automatically. Ordinary discretion on anything you share: your own words, ticket IDs as bare references, no code, secrets, hostnames, or customer data.

### Running tests

```bash
bun test
```

## License / provenance

Personal methodology, MIT licensed. Created prior to and independent of any employment. Contains no employer confidential information by design — and the workflows are built to keep it that way.
