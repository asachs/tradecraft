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

## License / provenance

Personal methodology, MIT licensed. Created prior to and independent of any employment. Contains no employer confidential information by design — and the workflows are built to keep it that way.
