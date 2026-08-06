# Tradecraft — Claude Code work profile

*The craft of doing the work, and the discipline of recording it.*

Instructions for Claude Code running on WORK infrastructure (corporate laptop or VM, company account). This file is generic methodology — add a `company.md` locally (gitignored everywhere) for employer-specific context.

## Operational rules

- **ISA first.** For any task beyond a one-liner: write `~/work/initiatives/{org,personal}/<slug>/ISA.md` from `templates/ISA.md` BEFORE editing code. Goal + verifiable criteria. Done = all criteria checked with evidence.
- **Decisions are logged when made.** Any architecture/tooling/approach call with alternatives goes to the initiative's `DECISIONS.md` (template provided) in the same session it was decided.
- **Promises are ledgered.** When the user commits to deliver something to someone ("I'll get X to Y by Z"), append it to `~/work/WORK_LEDGER.md` immediately.
- **Demo bias.** Prefer plans that produce something demonstrable by Friday over plans that are 80% invisible groundwork.
- **Ticket linkage by reference.** Mention tracker ticket IDs as plain text everywhere relevant. Never export, mirror, or sync tracker state.
- **Plan when you execute.** When an initiative moves from "what's done" to "what to do first," write `PLAN.md` from `templates/PLAN.md` — phased, discovery-first, real blockers only (never invented ones), and a Status line if it's still provisional.
- **Log the method for multi-step work.** For work spanning many steps or sessions, keep `WORKLOG.md` (from template) — the provenance of *how* the evidence was built, not the findings.
- **Score the portfolio.** Maintain `~/work/initiatives/REGISTRY.md` (from template): every initiative scored against the org's prioritisation filter (defined in `company.md`). It's the triage view — what survives grooming, what to promote.

## Sharing drafts

These tools produce drafts. The user reviews and decides — nothing is sent anywhere automatically. Ordinary discretion applies to anything shared (EOD summaries, weekly reports, brag entries):

- Self-authored prose — describe work in the user's own words
- Ticket/PR IDs as bare references — never their contents
- No code, config values, hostnames, customer data, or internal-system names beyond what's safe to share outside the company
- Always present the draft for review — never send anything anywhere automatically

## Daily cadence

- **Start of day:** user runs the `workflows/StartOfDay.md` workflow → checks today's calendar, ensures the daily note exists with yesterday's open items carried forward, and stubs meeting files for today's meetings.
- **During the day:** work normally; the SessionActivityLog hook records activity passively.
- **End of day:** user runs the `workflows/EodSummary.md` workflow → one-liners to review → user edits and shares them as they see fit.
- **Friday:** user runs `workflows/WeeklyReport.md` → manager-ready draft from the week's activity log → user edits and sends manually.

## File map

| Path | Purpose |
|------|---------|
| `~/work/worklog/activity.jsonl` | Auto-accumulated session activity (hook-written) |
| `~/work/WORK_LEDGER.md` | Promises made — owner, due date, status |
| `~/work/BRAG.md` | Dated, evidence-linked accomplishments |
| `~/work/initiatives/{org,personal}/<slug>/ISA.md` | Definition of done per initiative |
| `~/work/initiatives/{org,personal}/<slug>/DECISIONS.md` | Decision log per initiative |
| `~/work/initiatives/{org,personal}/<slug>/PLAN.md` | Execution plan — written when moving to execution |
| `~/work/initiatives/{org,personal}/<slug>/WORKLOG.md` | Method/provenance log for multi-step work |
| `~/work/initiatives/{org,personal}/<slug>/briefs/` | Initiative-local evidence & briefs |
| `~/work/initiatives/REGISTRY.md` | Portfolio scored on the prioritisation filter |

## Initiative layout & conventions

An initiative folder grows as the work does:

- `ISA.md` — definition of done. Always, first.
- `PLAN.md` — execution plan. When it moves from "what's done" to "what to do first."
- `WORKLOG.md` — method/provenance. For multi-step or multi-session work.
- `DECISIONS.md` — decisions, logged as made.
- `briefs/` — the initiative's own evidence (pain maps, analyses, drafts).

**Brief location.** An initiative's own evidence lives in its `briefs/`. Briefs that span initiatives — or belong to onboarding, meetings, or incidents — live in the shared `~/work/briefs/`.

**Personal → org promotion.** Personal (self-found) initiatives carry `candidate_org` in frontmatter. One that clears the org's prioritisation filter and names a candidate org is a promotion candidate — surface it in `REGISTRY.md` and pitch it for org backing.

## Working methods

- **Evidence before planning.** For non-trivial initiatives, gather evidence before designing: mine the existing record (tickets, docs), survey the people who live the problem. Background subagents do the heavy lifts. Keep counts directional and honest; capture a baseline to measure against later. A plan grounded in evidence beats one grounded in assumptions — and the evidence is itself the case for the plan.
- **Adversarial verification.** Before an evidence artefact drives a decision (a pain map, an exemplar analysis, a recommendation), have an *independent* pass try to refute it against the source — not the author marking their own work. It catches over-reach (claiming more than the evidence supports) and blind spots (what the method structurally couldn't see). Fix findings before acting.
- **Log only what's said or verified.** Record findings as stated or evidenced; don't add interpretation or causal links you haven't confirmed. Mark inferences as inferences.
