# Concepts

*What Tradecraft is, and the handful of ideas it runs on. Read this once; the [README](README.md) is the tool reference after that.*

## The problem it solves

Good work is invisible by default. You ship the thing, fix the incident, make the call — and a month later, when it's time to account for what you did, the details have evaporated. You reconstruct a vague list from memory and commit logs, and it reads like effort, not impact. Reviews, probation, promotion cases all run on the same fuel: evidence you can point to. The bottleneck is rarely the work. It's the record of the work.

Tradecraft treats that as a pipeline problem. The fix isn't to work harder or write a heroic essay every Friday — it's to capture the record continuously, at the moment of doing, so cheaply that the habit survives a busy week. A few deterministic tools then turn that captured stream into review-ready drafts you only have to edit, not assemble.

## The mental model

Three ideas carry the whole system:

1. **The ISA** — you define "done" before you start.
2. **Capture at the moment** — the record is written as work happens, never reconstructed.
3. **The compounding record** — small daily captures roll up into weekly reports and a durable career record.

Everything else — the tools, the hook, the file layout — is machinery in service of those three.

## 1. The ISA — definition of done, first

ISA stands for *Ideal State Artifact*, a primitive borrowed from [PAI's](https://github.com/danielmiessler/PAI) Algorithm. Stripped to its essence, it's a short document you write **before** the first edit: the goal, and the verifiable criteria that mean the goal is met. Done is when every criterion is checked, with evidence — not when it feels finished.

Each initiative gets one, at `$WORK_DIR/initiatives/<slug>/ISA.md`, started from `templates/ISA.md`. The discipline is small but load-bearing: if you wrote down what "finished" looks like up front, you can't quietly drift away from it, and "is this done?" becomes a question you answer against a written bar instead of a mood. The repo's own root `ISA.md` is the worked example — it's the definition-of-done for the tools you're reading about.

## 2. Capture at the moment — the discipline

The rule is simple: the record is written as work happens, never reconstructed later. Reconstruction is where impact goes to die, because the detail you needed is exactly the detail you've forgotten. Tradecraft captures on two tracks:

- **Passive.** A `Stop` hook (`SessionActivityLog`) appends one line to `$WORK_DIR/worklog/activity.jsonl` every time a session ends — timestamp, working directory, git branch, files touched. Zero effort, always on. This is the raw "what and where."
- **Active.** Once a day you author the part a machine can't: one plain-language line per thing that mattered, each tagged with its kind — `done:`, `decided:`, `promised:`, `learned:`, `met:`, `blocked:`. Decisions get logged to a per-initiative `DECISIONS.md` the moment they're made; promises ("I'll get X to Y by Z") go straight into `WORK_LEDGER.md`.

The split is deliberate. Passive capture costs nothing, so it never lapses. Active capture is one sentence, written at the one moment you still remember why it mattered — cheap enough to survive a bad week, which is the only test that counts. Impact is always human-authored; the tools never invent it.

## 3. The compounding record — the "memory"

This is the part the name "memory" gestures at, though it's worth being precise: there's no embedding store or knowledge graph here. It's an append-only evidence trail in three layers, each feeding the next:

1. **Passive activity** — machine-written, complete, low-signal (`activity.jsonl`).
2. **Human-authored capture** — your daily impact lines, decisions, and promises. High-signal, low-volume.
3. **Generated rollups** — the weekly report leads with your own `done:` lines and demotes raw commit activity to an *Evidence* appendix beneath them; the brag harvest sweeps any line you tagged `[BRAG?]` into stub entries where you write the one sentence that says why it mattered.

The reviewed Friday report is the artifact that lasts: it's the candidate for your durable career record. So the daily one-liners aren't busywork — they're the headline of the weekly, which is the seed of the brag doc, which is the evidence in your next review. Small captures compound upward.

## A week through the loop

- **Monday** — `MondayPlan` lays out the week: open promises, anything overdue, active initiatives, and stubs for the outcomes you intend.
- **Through the day** — you just work. The hook records activity passively. `DailyBrief` can front-load yesterday's summary and today's promises.
- **End of day** — `EodSummary --save` drafts your one-liners; you edit them into your own words and tag the brag-worthy ones. The tool refuses to overwrite an existing day's file, because your edits are the point.
- **Friday** — `WeeklyReport` drafts a manager-ready summary from the week; `BragHarvest` sweeps the tagged lines into your brag doc.

None of this has to be remembered. `schedule.ts` installs the cadence as `launchd` jobs that fire the drafts and a quiet end-of-day nudge, save them under `$WORK_DIR/reports/`, and surface them as native notifications; `serve.ts` shows everything at `localhost:3141`.

## Review before sharing

The tools **draft** — to your terminal or to local files. You review, edit, and send. Nothing is ever sent anywhere automatically. Beyond that, ordinary discretion applies to anything you share outside the company: your own words, ticket IDs as bare references, no code, secrets, hostnames, or customer data. This isn't a special apparatus — it's the obvious care you'd take with anything that might outlive the job, applied at the one moment it's cheap to apply (the daily edit).

## Why the tools are deliberately dumb

The generators contain no model calls and make no network requests. They are deterministic shapers: captured data in, structured draft out. Prose polish belongs to the Claude session that wraps them, not to the engine. That buys four things that matter on a work machine:

- **Testable** before any real data exists — the whole engine is proven against a synthetic fixture week, so you don't QA it on the job.
- **Portable** — runs on a bare corporate VM that has nothing but `bun`.
- **Reproducible** — the same activity log always yields the same draft.
- **Free and private** — no inference cost, no variance, nothing leaves the machine.

The intelligence lives in the discipline and in the session that wraps the tools, not in the tools themselves.

## What it is not

- **Not a tracker integration.** Ticket IDs are bare-text references, never exported, mirrored, or synced. Jira (or whatever you use) stays the system of record for tickets.
- **Not an auto-sender.** It produces drafts; a human reviews and sends. There is no "post to Slack" button by design.
- **Not your personal assistant.** This is the work profile only — no personal memory, voice, or life goals. That separation is intentional and account-level.
- **Not a "memory system"** in the AI sense — no vectors, no graph, just an append-only record you can read with your own eyes.

---

For the tool reference — flags, schedules, configuration — see the [README](README.md).
