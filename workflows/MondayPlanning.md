# Monday Planning Ritual

A 15-minute Monday prompt to set the week's direction. Run at the start of each work week.

## Inputs

- `bun tools/MondayPlan.ts` output (promises, overdue, initiatives, lead measures)
- Previous week's `~/work/reports/weekly-report/` (if it exists)
- `~/work/initiatives/{org,personal}/` — active ISAs for status check
- `~/src/tradecraft/company.md` — manager profile for tone calibration

## Instructions

1. Run `bun tools/MondayPlan.ts` and present the output.
2. If last week's report exists, surface:
   - Anything from "Next week" that wasn't done (carry forward?)
   - Any "Blocked" items still unresolved
3. Ask the user to fill in the **Top 3 outcomes** — push for specificity:
   - Each outcome should be demonstrable by Friday
   - At least one should be visible to the manager
   - If an outcome is "continue X", challenge: what's the Friday checkpoint?
4. Review **Lead measures** (if the file exists):
   - Did you hit them last week? (Quick yes/no, no guilt)
   - Are they still the right measures? (Retire if not predictive)
5. **Deep work protection**: ask which mornings this week are meeting-free, and suggest blocking 2-3 hour slots for the top outcome.
6. Output the final plan and STOP. Do not create files — the user decides where this goes.

## Tone

Direct, outcome-focused. Not a cheerful coach — a peer who's seen you waste Mondays on inbox triage before. Brief is better than thorough here; the plan should fit on a single screen.
