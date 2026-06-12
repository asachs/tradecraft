#!/usr/bin/env bun
/**
 * DailyBrief — yesterday's activity summary + today's promises.
 *
 * Usage: bun tools/DailyBrief.ts [--date YYYY-MM-DD] [--out <file>]
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveWorkDir } from "./lib/config.ts";
import { parseActivityLog, filterByDateWindow, groupByRepoBranch } from "./lib/activity.ts";
import { parseLedger, filterByDueWindow, filterOverdue } from "./lib/ledger.ts";
import { parseDate, formatDate, yesterdayWindow, todayWindow } from "./lib/dates.ts";

function parseArgs(): { date: Date; out?: string } {
  const args = process.argv.slice(2);
  let date = new Date();
  let out: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--date" && args[i + 1]) {
      date = parseDate(args[++i]);
    } else if (args[i] === "--out" && args[i + 1]) {
      out = args[++i];
    }
  }
  return { date, out };
}

const { date, out } = parseArgs();
const workDir = resolveWorkDir();

if (out) {
  const resolved = resolve(out);
  if (!resolved.startsWith(workDir)) {
    console.error(`error: --out path must be under WORK_DIR (${workDir})`);
    process.exit(1);
  }
}

const dateStr = formatDate(date);
const yw = yesterdayWindow(date);
const tw = todayWindow(date);

const allEntries = parseActivityLog(workDir);
const yesterdayEntries = filterByDateWindow(allEntries, yw.start, yw.end);
const groups = groupByRepoBranch(yesterdayEntries);

const promises = parseLedger(workDir, dateStr);
const dueToday = filterByDueWindow(promises, tw.start, tw.end).filter(
  (p) => p.status === "open"
);
const overdue = filterOverdue(promises);

const lines: string[] = [];
lines.push(`# Daily Brief — ${dateStr}`);
lines.push("");

// Yesterday's activity
lines.push(`## Yesterday (${yw.start})`);
lines.push("");
if (groups.length === 0) {
  lines.push("No captured activity yesterday.");
} else {
  const repoNames = [...new Set(groups.map((g) => g.repo))];
  const totalCommits = groups.reduce((sum, g) => {
    const commits = new Set(g.entries.filter((e) => e.last_commit).map((e) => e.last_commit));
    return sum + commits.size;
  }, 0);
  lines.push(`Repos touched: ${repoNames.join(", ")} | Commits seen: ${totalCommits}`);
  lines.push("");
  for (const g of groups) {
    const commits = [...new Set(g.entries.filter((e) => e.last_commit).map((e) => e.last_commit))];
    lines.push(`- **${g.repo}** (${g.branch}): ${commits.length > 0 ? commits.join("; ") : "no commits"}`);
  }
}
lines.push("");

// Promises due today
lines.push("## Due today");
lines.push("");
if (dueToday.length === 0) {
  lines.push("No promises due today.");
} else {
  for (const p of dueToday) {
    lines.push(`- ${p.promised} — to ${p.to} (${p.ticket})`);
  }
}
lines.push("");

// Overdue
lines.push("## Overdue");
lines.push("");
if (overdue.length === 0) {
  lines.push("Nothing overdue.");
} else {
  for (const p of overdue) {
    lines.push(`- ${p.promised} — was due ${p.due} to ${p.to} (${p.ticket})`);
  }
}
lines.push("");

const output = lines.join("\n");

if (out) {
  writeFileSync(resolve(out), output);
} else {
  process.stdout.write(output);
}
