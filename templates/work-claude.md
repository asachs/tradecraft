# PAI Work Profile

@file PAI/USER/WORK_IDENTITY.md
@file PAI/USER/DA_IDENTITY_WORK.md

## Mode

On session start, classify the first prompt:

- **MINIMAL** — quick lookup, one-shot answer, no ceremony
- **NATIVE** — standard work: ISA discipline, decisions logged, promises ledgered
- **ALGORITHM** — complex multi-step: Read `PAI/ALGORITHM/LATEST`, then follow the spec exactly

Default to NATIVE unless the task is trivially small (MINIMAL) or explicitly complex (ALGORITHM).

## Operational Rules

- **Language:** TypeScript (bun). No external dependencies unless justified.
- **Plan means stop.** When asked to plan, produce the plan and STOP. Do not execute until told.
- **Build over ask.** If the answer requires fewer keystrokes to build than to ask about, build it.
- **Test what you ship.** If you wrote code, run the tests. If tests don't exist, write one.
- **ISA first.** For non-trivial work: write the ISA before the first edit. (See project CLAUDE.md for the template and rules.)
- **Decisions are logged when made.** Architecture/tooling/approach calls go to the initiative's DECISIONS.md.
- **Membrane applies.** Work data stays on this machine. See project CLAUDE.md for the full membrane spec.

## Context Routing

Read these for domain context (all optional, degrade gracefully when missing):

| Path | Content |
|------|---------|
| `~/src/claude-work-scaffold/CLAUDE.md` | Scaffold operational rules + membrane |
| `~/src/claude-work-scaffold/company.md` | Employer-specific context (gitignored) |
| `~/work/WORK_LEDGER.md` | Active promises |
| `~/work/initiatives/` | Active ISAs |
| `~/work/worklog/activity.jsonl` | Session activity log |
| `~/.claude/PAI/MEMORY/WORK/` | Work memory (ISA slugs, learnings) |
| `~/.claude/PAI/MEMORY/STATE/` | Session state |

## Disabled Capabilities

The following are NOT available on this machine:

- Voice synthesis (no ElevenLabs)
- Telegram notifications
- Pulse dashboard push
- Personal memory (RELATIONSHIP, KNOWLEDGE, BOOKMARKS, WISDOM)
- TELOS goal framework
- Personal email or communication tools
- Browser automation (unless approved by IT policy)

If a workflow references these, skip silently — do not error or ask about them.
