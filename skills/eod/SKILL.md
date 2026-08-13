---
name: eod
description: End-of-day summary — draft reviewable one-liners (done/decided/promised/learned/met/blocked) from today's activity, for the user to edit and share manually. Use when the user types /eod or asks to wrap up / summarize the day.
---

# EOD — End-of-Day Summary

Thin wrapper over the tradecraft EOD tooling. Produces a **draft for the user to review** — the summary is never sent to anyone. (The git backup in the final step is a private backup to the user's own repo, not sharing.)

## Steps

1. **Generate the deterministic draft** (saves to `$WORK_DIR/worklog/eod/<date>.md`, refuses to overwrite an existing day's file — human edits are sacred). Resolve the repo from this skill's install symlink so it works regardless of clone location:
   ```
   TC="$(dirname "$(dirname "$(readlink ~/.claude/skills/eod 2>/dev/null || echo "$HOME/src/personal/tradecraft/skills/eod")")")"
   bun "$TC/tools/EodSummary.ts" --save
   ```
   If today's file already exists, read it instead of regenerating — the user's edits win.

2. **Enrich from this session + today's daily note.** Fold in anything meaningful from the current conversation and `~/work/daily/<date>.md` (Activity, Blockers, Tickets raised, meetings) that the tool couldn't see. Follow the grammar in the repo's `workflows/EodSummary.md`: 1–6 one-liners, each prefixed with exactly one of `done:` / `decided:` / `promised:` / `learned:` / `met:` / `blocked:`.

3. **Apply share-safety** (per tradecraft `CLAUDE.md`): the user's own words; ticket/PR IDs as bare references; no code, secrets, hostnames, customer data, or internal-system detail beyond what's safe to share outside the company.

4. **Flag brag-worthy lines** with a trailing `[BRAG?]` so the user can promote them on Friday via `bun tools/BragHarvest.ts`.

5. **Ledger check.** Note any `WORK_LEDGER.md` promises made or touched today.

6. **Output the lines for review.** Show the draft (and the saved file path). Do not send the summary to anyone — the user copies what they approve.

7. **Targeted drift reconcile (change-driven).** Before backing up, reconcile living records that today's changes may have made stale. Scope to *today*, not a full scan; fix only the **verifiable** (never guess-tick). Living records = meeting files, ISAs, `REGISTRY.md`, `SESSION-CONTEXT.md` (the daily itself is immutable). Check:
   - **Completions** ticked today that originated in a meeting file or ISA → reconcile the source (tick with a "done <date>, see daily" note).
   - **Decisions** logged today → do the ISA / `REGISTRY.md` / `SESSION-CONTEXT.md` reflect them?
   - **Resolved blockers** cleared today → still listed active anywhere?
   - **Corrected facts** (a figure / attribution / date) → propagated everywhere they appear?
   - **`SESSION-CONTEXT.md` top section** → still true as of end of day?
   (The fuller whole-record congruency sweep lives in the Weekly report, not here.)

8. **Back up: commit and push.** Once the draft is settled and the drift reconcile is done, commit the day's work-notes and push to the backup remote. This is a private backup to the user's own repo, not sharing.
   ```
   cd ~/work && git add -A && git commit && git push
   ```
   End the commit message with the `Co-authored by Claude Code` trailer. Skip only if `git status` is clean. Note: anything the user edits in the EOD file *after* this step is captured by the next day's commit. Then STOP.
