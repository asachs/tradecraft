# claude-work-scaffold

Portable Claude Code working patterns for a corporate environment. **Patterns only — no personal data, no employer data.** This repo is pre-existing personal methodology, authored on personal equipment, consumed read-only by work machines.

## What this is

A starter kit for running a disciplined Claude Code "work brain" on a corporate laptop or VM:

- **CLAUDE.md** — work-profile instructions: operational rules, the confidentiality membrane, capture conventions
- **templates/** — ISA (definition-of-done) template, decision log, promise ledger, brag document
- **workflows/** — prompts for the end-of-day crossing summary and the weekly report
- **hooks/** — session activity logging (auto-accumulates "what was done, where") + settings snippet

## Core principles

1. **Definition of done before starting.** Every non-trivial piece of work gets an ISA — a short document stating the goal and the verifiable criteria — before the first edit.
2. **Record at the moment of doing.** The activity log and decision log are written as work happens, never reconstructed.
3. **The membrane.** Work artifacts (code, customer data, internal docs) stay on work infrastructure. Only self-authored summaries — plain prose, ticket IDs by reference — cross outward, and only after human review.
4. **Generated, then edited.** Reports are drafted by the work brain from the activity log; the human edits and sends. Nothing auto-sends.

## Bootstrap on a fresh work machine/VM

```bash
git clone <this-repo> ~/work-scaffold
mkdir -p ~/work/{worklog,decisions,initiatives}
cp ~/work-scaffold/CLAUDE.md ~/.claude/CLAUDE.md          # or merge into existing
cp ~/work-scaffold/templates/WORK_LEDGER.md ~/work/
cp ~/work-scaffold/templates/BRAG.md ~/work/
# Hook install: merge hooks/settings-snippet.json into ~/.claude/settings.json
# and copy hooks/SessionActivityLog.hook.ts to ~/.claude/hooks/
```

Then start `claude` (ideally inside tmux on an always-on host) and work normally. The activity log accumulates; run the workflows on Friday.

## Report engine

Four deterministic CLI tools that turn passively-captured activity and a promise ledger into review-ready markdown drafts. No LLM calls, no network access, no external dependencies — just bun + TypeScript.

### Tools

| Tool | Purpose | Key flags |
|------|---------|-----------|
| `bun tools/WeeklyReport.ts` | Manager-ready weekly summary (Shipped / In flight / Decisions / Blocked / Next week) | `--week YYYY-MM-DD` (ISO week containing that date; default: current week) |
| `bun tools/EodCrossing.ts` | Membrane-safe end-of-day one-liners (done/decided/promised/learned/met/blocked) | `--date YYYY-MM-DD` (default: today) |
| `bun tools/MondayPlan.ts` | Week plan with promises, overdue items, initiatives, and outcome stubs | `--date YYYY-MM-DD` (default: today) |
| `bun tools/DailyBrief.ts` | Yesterday's activity summary plus today's and overdue promises | `--date YYYY-MM-DD` (default: today) |

All tools accept `--out <file>` to write to a file (must resolve under `WORK_DIR`). Without `--out`, output goes to stdout only.

### EOD save-review loop

Run `bun tools/EodCrossing.ts --save` at end of day. The tool writes a draft to `$WORK_DIR/worklog/eod/<date>.md` — edit the saved file in your own words before close of business. Those human-authored `done:`, `decided:`, and `blocked:` lines become the headline of Friday's weekly report; commit activity demotes to an **Evidence** appendix underneath. The tool refuses to overwrite an existing file (human edits are sacred).

### Configuration

Set `WORK_DIR` to point at your work directory (default: `~/work`). The tools read:

- `$WORK_DIR/worklog/activity.jsonl` — session activity captured by the hook
- `$WORK_DIR/WORK_LEDGER.md` — promise ledger (markdown table)
- `$WORK_DIR/initiatives/` — initiative directories (for MondayPlan)
- `$WORK_DIR/repos.json` — optional map of repo basename → web base URL (e.g. `{"my-repo": "https://github.com/org/my-repo"}`). When present, WeeklyReport renders commit ids as clickable `<base>/commit/<sha>` links; otherwise ids stay bare text.

### The membrane rule

These tools **draft** to stdout. A human reviews, edits, and sends. Nothing is ever sent automatically. Every draft follows the membrane: self-authored prose, ticket IDs as bare references, no code, no secrets, no hostnames, no customer data.

### Running tests

```bash
bun test
```

## License / provenance

Personal methodology, MIT licensed. Created prior to and independent of any employment. Contains no employer confidential information by design — and the workflows are built to keep it that way.
