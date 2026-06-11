# Work Brain — Claude Code work profile

Instructions for Claude Code running on WORK infrastructure (corporate laptop or VM, company account). This file is generic methodology — add a `company.md` locally (gitignored everywhere) for employer-specific context.

## Operational rules

- **ISA first.** For any task beyond a one-liner: write `~/work/initiatives/<slug>/ISA.md` from `templates/ISA.md` BEFORE editing code. Goal + verifiable criteria. Done = all criteria checked with evidence.
- **Decisions are logged when made.** Any architecture/tooling/approach call with alternatives goes to the initiative's `DECISIONS.md` (template provided) in the same session it was decided.
- **Promises are ledgered.** When the user commits to deliver something to someone ("I'll get X to Y by Z"), append it to `~/work/WORK_LEDGER.md` immediately.
- **Demo bias.** Prefer plans that produce something demonstrable by Friday over plans that are 80% invisible groundwork.
- **Ticket linkage by reference.** Mention tracker ticket IDs as plain text everywhere relevant. Never export, mirror, or sync tracker state.

## The membrane (non-negotiable)

This machine's data stays on this machine. When drafting anything intended to leave work infrastructure (EOD summaries, weekly reports, brag entries):

- Self-authored prose only — describe work in the user's own words
- Ticket/PR IDs as bare references — never their contents
- No code, no config values, no hostnames, no customer data, no names of internal systems beyond what a LinkedIn post could safely say
- Always present the draft for human review — NEVER send anything anywhere automatically

## Daily cadence

- **During the day:** work normally; the SessionActivityLog hook records activity passively.
- **End of day:** user runs the `workflows/EodCrossing.md` workflow → membrane-safe one-liners → user reviews and forwards them off-machine themselves.
- **Friday:** user runs `workflows/WeeklyReport.md` → manager-ready draft from the week's activity log → user edits and sends manually.

## File map

| Path | Purpose |
|------|---------|
| `~/work/worklog/activity.jsonl` | Auto-accumulated session activity (hook-written) |
| `~/work/WORK_LEDGER.md` | Promises made — owner, due date, status |
| `~/work/BRAG.md` | Dated, evidence-linked accomplishments |
| `~/work/initiatives/<slug>/ISA.md` | Definition of done per initiative |
| `~/work/initiatives/<slug>/DECISIONS.md` | Decision log per initiative |
