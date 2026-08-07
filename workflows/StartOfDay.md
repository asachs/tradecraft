# Start-of-Day Routine

A 5-minute morning setup: check today's calendar, ensure the daily note exists with yesterday's open items carried forward, and stub meeting files for today's meetings. Run once at the start of the work day.

## Inputs

- Today's calendar — Microsoft 365 (Outlook). Use `outlook_calendar_search` (via ToolSearch) scoped to **today**.
- `~/work/daily/` — daily notes (`YYYY-MM-DD.md`). Most recent file = carry-forward source.
- `~/work/meetings/` — meeting notes. Conventions: **1:1s → per-person running file `Andre_<Name>.md`** (standing `## Questions` list + newest-first dated `## YYYY-MM-DD` sections); **recurring standups → single rolling `<slug>.md`**; **one-off / group / external events → dated `YYYY-MM-DD-<slug>.md`**.
- `~/work/SESSION-CONTEXT.md` — live work state (read first; blockers/onboarding numbering).
- `~/work/WORK_LEDGER.md` — promises, for surfacing anything due today (the `WorkBrief` hook already prints overdue/due-today on session start).

## Instructions

1. **Resolve today's date** (do not guess — use the environment's current date).

2. **Pull today's calendar.** Search Outlook for today's events. Present a compact schedule: time, title, attendees. Flag all-day/focus blocks, declined events, and external-only meetings separately.

3. **Ensure today's daily note exists** at `~/work/daily/YYYY-MM-DD.md`. If missing, create it from the most recent daily, carrying forward ONLY still-open items:
   - `## Carry-over (from <date>)` — unchecked `[ ]` tasks and open onboarding items. Do NOT carry items resolved in the source note. Cross-check `SESSION-CONTEXT.md` so resolved-elsewhere items aren't resurrected.
   - `## Blockers / debugging` — active threads still open (pull from the prior daily + `SESSION-CONTEXT.md`).
   - `## Meetings` — one pointer line per meeting file created in step 4 (do not inline meeting content).
   - `## Activity` and `## Tickets raised` — empty stubs.
   - If the note already exists, leave it; just reconcile the Meetings pointers.

4. **Stub / append meeting files.** For each substantive **internal** meeting on the calendar, use the right convention:
   - **1:1 with a person** → the per-person running file `~/work/meetings/Andre_<Name>.md`. If it exists, **prepend** a dated `## YYYY-MM-DD` section; if not, create it with a short standing context block + a `## Questions` list, then the dated section. Seed context from `SESSION-CONTEXT.md` / initiatives / prior notes when the person or topic is known.
   - **Recurring standup / status meeting** → a SINGLE rolling `~/work/meetings/<slug>.md`. Prepend a dated `## YYYY-MM-DD` section; create with a standing header (cadence, organizer, regulars) if absent.
   - **One-off / group / external event** → a dated `~/work/meetings/YYYY-MM-DD-<slug>.md` stub (Why / Agenda / Notes / Action items).
   - **Ask before creating** for ambiguous events: focus/hold blocks, all-day events, declined invites, or external-only meetings.
   - **Skip** events that clearly aren't working meetings.
   - Add a pointer line (with start time) for each meeting to the daily's `## Meetings` section.

5. **Surface the day's commitments.** List any promises due today / overdue from `WORK_LEDGER.md`, and any meeting whose prep touches an open blocker (link them).

6. **Output a short summary and STOP.** Report: schedule, daily note (created/existed), meeting files created, anything skipped/asked. Do not send anything anywhere; the user fills in agendas and notes.

## Tone

Direct, operational. A crisp launchpad for the day, not a checklist ceremony — fit the summary on one screen.
