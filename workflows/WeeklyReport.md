# Weekly Report Draft

Draft a manager-ready weekly summary from the week's activity log. The user edits and sends it manually — never send it anywhere.

## Inputs

- `~/work/worklog/activity.jsonl` — this week's entries (Mon-Fri)
- `~/work/WORK_LEDGER.md` — promises closed or due
- Open initiative ISAs under `~/work/initiatives/{org,personal}/` — for status against definition-of-done
- This week's `met:` lines from `~/work/worklog/eod/*.md`, plus dated sections in `~/work/meetings/*.md` — the source for the People & network section

## Instructions

1. Group the week's activity into 3-5 themes, not a chronological dump.
2. Structure:
   - **Shipped / done** — concrete outcomes first, each with its ticket/PR reference
   - **In flight** — current state vs the initiative's ISA criteria, one line each
   - **Decisions** — consequential calls made this week, with the one-clause why
   - **Blocked / needs input** — only items that genuinely need the reader
   - **People & network** — who you met this week, split into **new connections** (first meetings = network growth) and **deepening** (recurring 1:1s / continued threads = deeper involvement). One line each: name, role, and a one-to-two-line summary of the meeting and what came of it. Purpose: show the relationship footprint widening and going deeper over time. Protect this section on length (cut "in flight" before it).
   - **Next week** — top 3 intended outcomes
3. Tone: plain, factual, specific. Lead with outcomes, not effort. No adjectives doing the work numbers should do.
4. Length: fits on one screen. If it doesn't, cut "in flight" detail first.
5. **Discretion check** before sharing it externally: own words, ticket refs not contents, nothing confidential — same as the EOD summary.
6. **Full drift / congruency sweep.** Once a week, do the broad reconcile the daily EOD is too narrow to catch: every open `[ ]` across `meetings/*.md` vs the dailies (stale-if-done), every `initiatives/REGISTRY.md` row vs its ISA's real state, and `SESSION-CONTEXT.md` vs current reality. Fix verifiable drift only; never guess-tick; don't retro-edit past dailies. This is the whole-record counterpart to EOD's change-driven reconcile.
7. Output the draft for review. Do not send the report anywhere — the user edits and sends it manually.
8. **Back up: commit and push.** Once the draft is settled, commit the week's work-notes and push to the backup remote (`cd ~/work && git add -A && git commit && git push`; end the commit message with the `Co-authored by Claude Code` trailer). This is a private backup to the user's own repo, not sharing the report. Skip only if `git status` is clean. Then STOP.
