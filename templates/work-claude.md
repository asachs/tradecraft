# PAI Work Profile

@PAI/USER/WORK_IDENTITY.md
@PAI/USER/DA_IDENTITY_WORK.md

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
- **Review before sharing.** Drafts get a human review before anything is shared; ordinary discretion on confidential detail. See project CLAUDE.md.

## Context Routing

Read these for domain context (all optional, degrade gracefully when missing):

| Path | Content |
|------|---------|
| `~/src/tradecraft/CLAUDE.md` | Scaffold operational rules + sharing discretion |
| `~/src/tradecraft/company.md` | Employer-specific context (gitignored) |
| `~/work/WORK_LEDGER.md` | Active promises |
| `~/work/initiatives/` | Active ISAs |
| `~/work/worklog/activity.jsonl` | Session activity log |
| `~/.claude/PAI/MEMORY/WORK/` | Work memory (ISA slugs, learnings) |
| `~/.claude/PAI/MEMORY/STATE/` | Session state |

## Learning Router Override

The Algorithm's Learning Router (LEARN phase) references personal surfaces that don't exist here. Use these work-mode targets instead:

| TYPE | Personal surface (DON'T USE) | Work surface |
|------|------------------------------|-------------|
| `knowledge` | `MEMORY/KNOWLEDGE/` | `MEMORY/LEARNING/` (work learnings only) |
| `rule` | `CLAUDE.md` Operational Rules | `~/src/tradecraft/CLAUDE.md` — propose, don't write |
| `gotcha` | Skill `SKILL.md` Gotchas | Same (skills are present on work machine) |
| `state` | `USER/PROJECTS/PROJECTS.md` | `~/work/initiatives/` — update the relevant ISA |
| `business` | `USER/BUSINESS/<topic>.md` | `~/src/tradecraft/company.md` — propose, don't write |
| `identity` | `USER/PRINCIPAL_IDENTITY.md` | `PAI/USER/WORK_IDENTITY.md` — surface to user |
| `doctrine` | Algorithm version file | Surface to user (don't modify Algorithm on work machine) |
| `hook` | `hooks/*.hook.ts` | Surface to user |
| `permission` | `settings.json` | Surface to user |

When the Algorithm's LEARN phase routes a learning, check this table first. If the personal surface doesn't exist, use the work surface. If both say "surface to user", present it and stop.

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
