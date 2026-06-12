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
import { parseDate, formatDate, isoWeekWindow, isoWeekNumber, nextWeekWindow } from "./lib/dates.ts";

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
 * Render a `<sha> <message>` one-liner with the sha as a markdown link
 * when the repo's web base URL is known (from WORK_DIR/repos.json).
 */
function linkifyCommit(lastCommit: string, repoUrl?: string): string {
  const m = lastCommit.match(/^([0-9a-f]{7,40})\s+(.*)$/);
  if (!m || !repoUrl) return lastCommit;
  const [, sha, message] = m;
  return `[\`${sha}\`](${repoUrl}/commit/${sha}) ${message}`;
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

const lines: string[] = [];
const endSunday = new Date(parseDate(end).getTime() - 86400000);
lines.push(`# Weekly Report — W${isoWeekNumber(parseDate(start))} (${start} to ${formatDate(endSunday)})`);
lines.push("");

// Shipped
lines.push("## Shipped");
lines.push("");
if (groups.length === 0 && closedThisWeek.length === 0) {
  lines.push("No captured activity or completed promises this week.");
} else {
  const repoLinks = loadRepoLinks(workDir);
  for (const g of groups) {
    const commits = g.entries
      .filter((e) => e.last_commit)
      .map((e) => e.last_commit);
    const uniqueCommits = [...new Set(commits)];
    if (uniqueCommits.length > 0) {
      lines.push(`- **${g.repo}** (${g.branch})`);
      for (const c of uniqueCommits) {
        lines.push(`  - ${linkifyCommit(c, repoLinks[g.repo])}`);
      }
    }
  }
  for (const p of closedThisWeek) {
    lines.push(`- ${p.promised} (${p.ticket}) — done`);
  }
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

// Decisions
lines.push("## Decisions");
lines.push("");
lines.push("<!-- fill: consequential calls made this week, with the one-clause why -->");
lines.push("");

// Blocked
lines.push("## Blocked");
lines.push("");
lines.push("<!-- fill: items that genuinely need someone else's input -->");
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
