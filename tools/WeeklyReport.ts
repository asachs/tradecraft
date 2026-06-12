#!/usr/bin/env bun
/**
 * WeeklyReport — draft a manager-ready weekly summary to stdout.
 *
 * Usage: bun tools/WeeklyReport.ts [--week YYYY-MM-DD] [--out <file>]
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveWorkDir, loadRepoLinks } from "./lib/config.ts";
import { parseActivityLog, filterByDateWindow, groupByRepoBranch } from "./lib/activity.ts";
import { parseLedger, filterByStatus, filterOverdue, filterByDueWindow } from "./lib/ledger.ts";
import { parseEodFiles, filterEodByWindow } from "./lib/eod.ts";
import { parseDate, formatDate, isoWeekWindow, isoWeekNumber, nextWeekWindow } from "./lib/dates.ts";
import { linkifyCommit } from "./lib/links.ts";

function parseArgs(): { week: Date; out?: string } {
  const args = process.argv.slice(2);
  let week = new Date();
  let out: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--week" && args[i + 1]) {
      week = parseDate(args[++i]);
    } else if (args[i] === "--out" && args[i + 1]) {
      out = args[++i];
    }
  }
  return { week, out };
}

/**
 * Extract a ticket reference from a branch name using /\b[A-Z][A-Z0-9]+-\d+\b/.
 * Returns the ticket string or undefined.
 */
function extractTicketFromBranch(branch: string): string | undefined {
  const m = branch.match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
  return m ? m[1] : undefined;
}

const { week, out } = parseArgs();
const workDir = resolveWorkDir();

// Validate --out is under WORK_DIR
if (out) {
  const resolved = resolve(out);
  if (!resolved.startsWith(workDir)) {
    console.error(`error: --out path must be under WORK_DIR (${workDir})`);
    process.exit(1);
  }
}

const { start, end } = isoWeekWindow(week);
const today = formatDate(new Date());

const allEntries = parseActivityLog(workDir);
const weekEntries = filterByDateWindow(allEntries, start, end);
const groups = groupByRepoBranch(weekEntries);

// Use end-of-week as the reference for overdue calculation
const promises = parseLedger(workDir, end);
// Promises closed (done) whose due date falls within the report week
const closedThisWeek = filterByStatus(promises, "done").filter(
  (p) => p.due >= start && p.due < end
);

const nw = nextWeekWindow(week);
const nextWeekDue = filterByDueWindow(
  filterByStatus(promises, "open"),
  nw.start,
  nw.end
);

// EOD lines for the week
const allEodLines = parseEodFiles(workDir);
const weekEodLines = filterEodByWindow(allEodLines, start, end);

const lines: string[] = [];
const endSunday = new Date(parseDate(end).getTime() - 86400000);
lines.push(`# Weekly Report — W${isoWeekNumber(parseDate(start))} (${start} to ${formatDate(endSunday)})`);
lines.push("");

// Shipped
lines.push("## Shipped");
lines.push("");

// (a) Human-authored done: lines from EOD files — FIRST
const doneLines = weekEodLines
  .filter((l) => l.prefix === "done")
  .map((l) => l.text);
// De-dupe: keep first occurrence of byte-identical text
const uniqueDoneLines = [...new Set(doneLines)];

for (const text of uniqueDoneLines) {
  lines.push(`- ${text}`);
}

// (b) Ledger promises done this week — SECOND
for (const p of closedThisWeek) {
  lines.push(`- ${p.promised} (${p.ticket}) — done`);
}

// (c) Evidence sub-block — LAST (activity log commits)
const repoLinks = loadRepoLinks(workDir);
const evidenceThemes: string[] = [];
for (const g of groups) {
  const commits = g.entries
    .filter((e) => e.last_commit)
    .map((e) => e.last_commit);
  const uniqueCommits = [...new Set(commits)];
  if (uniqueCommits.length > 0) {
    const ticket = extractTicketFromBranch(g.branch);
    const heading = ticket
      ? `**${ticket}** — ${g.repo}/${g.branch}`
      : `**${g.repo}** (${g.branch})`;
    evidenceThemes.push(`  - ${heading}`);
    for (const c of uniqueCommits) {
      evidenceThemes.push(`    - ${linkifyCommit(c, repoLinks[g.repo])}`);
    }
  }
}

if (evidenceThemes.length > 0) {
  lines.push(`- **Evidence** (activity log)`);
  for (const t of evidenceThemes) {
    lines.push(t);
  }
} else if (uniqueDoneLines.length === 0 && closedThisWeek.length === 0) {
  lines.push("No captured activity or completed promises this week.");
}

lines.push("");

// In flight
lines.push("## In flight");
lines.push("");
const openPromises = filterByStatus(promises, "open");
if (openPromises.length === 0) {
  lines.push("No open promises tracked.");
} else {
  for (const p of openPromises) {
    lines.push(`- ${p.promised} — due ${p.due} (${p.ticket})${p.overdue ? " **OVERDUE**" : ""}`);
  }
}
lines.push("");

// Decisions — populated from decided: EOD lines when present
lines.push("## Decisions");
lines.push("");
const decidedLines = weekEodLines
  .filter((l) => l.prefix === "decided")
  .map((l) => l.text);
const uniqueDecidedLines = [...new Set(decidedLines)];
if (uniqueDecidedLines.length > 0) {
  for (const text of uniqueDecidedLines) {
    lines.push(`- ${text}`);
  }
} else {
  lines.push("<!-- fill: consequential calls made this week, with the one-clause why -->");
}
lines.push("");

// Blocked — populated from blocked: EOD lines when present
lines.push("## Blocked");
lines.push("");
const blockedLines = weekEodLines
  .filter((l) => l.prefix === "blocked")
  .map((l) => l.text);
const uniqueBlockedLines = [...new Set(blockedLines)];
if (uniqueBlockedLines.length > 0) {
  for (const text of uniqueBlockedLines) {
    lines.push(`- ${text}`);
  }
} else {
  lines.push("<!-- fill: items that genuinely need someone else's input -->");
}
lines.push("");

// Next week
lines.push("## Next week");
lines.push("");
if (nextWeekDue.length === 0) {
  lines.push("No promises due next week.");
} else {
  for (const p of nextWeekDue) {
    lines.push(`- ${p.promised} — due ${p.due} to ${p.to} (${p.ticket})`);
  }
}
lines.push("");

const output = lines.join("\n");

if (out) {
  writeFileSync(resolve(out), output);
} else {
  process.stdout.write(output);
}
