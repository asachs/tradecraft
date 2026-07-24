#!/usr/bin/env bun
/**
 * WorkBrief — Claude Code SessionStart hook (MDM-safe, pull-based).
 *
 * On session start, surfaces the day's pending work into session context:
 * overdue promises, promises due today, and whether today's EOD file exists.
 * Writes a one-line WORK_DIR/.pending marker for the status line to read.
 *
 * Deliberately does NOT push OS notifications (no osascript), schedule
 * anything (no launchd), generate reports, or touch the network — it only
 * reads the ledger/EOD state and prints. This is the event-driven replacement
 * for schedule.ts on a managed machine.
 *
 * Install: referenced at its repo path by install-lite.ts — NOT copied to
 * ~/.claude/hooks/ — so the tools/lib imports below resolve. Requires bun.
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveWorkDir } from "../tools/lib/config.ts";
import { parseLedger, filterOverdue, filterByDueWindow } from "../tools/lib/ledger.ts";
import { formatDate, todayWindow, isoDayOfWeek } from "../tools/lib/dates.ts";

export interface Brief {
  /** Human-readable briefing block for session context (empty if nothing to surface). */
  text: string;
  /** One-line status marker written to WORK_DIR/.pending. */
  marker: string;
}

/**
 * Build the day's brief from ledger + EOD state. Pure w.r.t. its inputs —
 * reads only under `workDir`, never writes, never throws for missing files.
 */
export function buildBrief(workDir: string, now: Date): Brief {
  const today = formatDate(now);
  const tw = todayWindow(now);
  const weekday = isoDayOfWeek(now) <= 5; // Mon-Fri

  const promises = parseLedger(workDir, today);
  const overdue = filterOverdue(promises);
  const dueToday = filterByDueWindow(promises, tw.start, tw.end).filter((p) => p.status === "open");
  const eodExists = existsSync(join(workDir, "worklog", "eod", `${today}.md`));

  const lines: string[] = [];
  lines.push(`# Work brief — ${today}`);
  lines.push("");

  if (overdue.length > 0) {
    lines.push(`## Overdue (${overdue.length})`);
    for (const p of overdue) lines.push(`- ${p.promised} — was due ${p.due} to ${p.to} (${p.ticket})`);
    lines.push("");
  }

  if (dueToday.length > 0) {
    lines.push(`## Due today (${dueToday.length})`);
    for (const p of dueToday) lines.push(`- ${p.promised} — to ${p.to} (${p.ticket})`);
    lines.push("");
  }

  if (weekday && !eodExists) {
    lines.push("## EOD");
    lines.push("- No EOD file for today yet — run `bun tools/EodSummary.ts --save` before close of business.");
    lines.push("");
  }

  // Marker: compact, single line, safe for a status bar.
  const markerParts = [`${overdue.length} overdue`, `${dueToday.length} due today`];
  if (weekday) markerParts.push(`EOD ${eodExists ? "done" : "pending"}`);
  const marker = markerParts.join(" · ");

  // Suppress the whole block when there is genuinely nothing to say.
  const nothingToSurface =
    overdue.length === 0 && dueToday.length === 0 && (!weekday || eodExists);
  const text = nothingToSurface ? "" : lines.join("\n").trimEnd();

  return { text, marker };
}

// ── Hook entrypoint ──

if (import.meta.main) {
  try {
    // Drain stdin (the SessionStart event payload); we don't need its fields.
    await Bun.stdin.text().catch(() => "");

    const workDir = resolveWorkDir();
    const { text, marker } = buildBrief(workDir, new Date());

    try {
      writeFileSync(join(workDir, ".pending"), marker + "\n");
    } catch {
      // Marker is best-effort — never block session start on it.
    }

    if (text) process.stdout.write(text + "\n");
  } catch {
    // A SessionStart hook must never break the session. Fail silent, exit 0.
  }
}
