# Weekly Report Draft

Draft a manager-ready weekly summary from the week's activity log. The user edits and sends it manually — never send it anywhere.

## Inputs

- `~/work/worklog/activity.jsonl` — this week's entries (Mon-Fri)
- `~/work/WORK_LEDGER.md` — promises closed or due
- Open initiative ISAs under `~/work/initiatives/` — for status against definition-of-done

## Instructions

1. Group the week's activity into 3-5 themes, not a chronological dump.
2. Structure:
   - **Shipped / done** — concrete outcomes first, each with its ticket/PR reference
   - **In flight** — current state vs the initiative's ISA criteria, one line each
   - **Decisions** — consequential calls made this week, with the one-clause why
   - **Blocked / needs input** — only items that genuinely need the reader
   - **Next week** — top 3 intended outcomes
3. Tone: plain, factual, specific. Lead with outcomes, not effort. No adjectives doing the work numbers should do.
4. Length: fits on one screen. If it doesn't, cut "in flight" detail first.
5. **Membrane check** if the report will leave work infrastructure: same rules as EodCrossing.
6. Output the draft and STOP.
