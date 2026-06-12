#!/usr/bin/env bun
/**
 * MondayPlan — draft a week plan to stdout.
 *
 * Usage: bun tools/MondayPlan.ts [--date YYYY-MM-DD] [--out <file>]
 */
import { writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { resolveWorkDir } from "./lib/config.ts";
import { parseLedger, filterByStatus, filterOverdue, filterByDueWindow } from "./lib/ledger.ts";
import { parseDate, formatDate, isoWeekWindow, isoWeekNumber } from "./lib/dates.ts";

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
const { start, end } = isoWeekWindow(date);

const promises = parseLedger(workDir, dateStr);
const openPromises = filterByStatus(promises, "open");
const thisWeekDue = filterByDueWindow(openPromises, start, end);
const overdue = filterOverdue(promises);

// Discover initiatives
let initiatives: string[] = [];
const initDir = join(workDir, "initiatives");
try {
  initiatives = readdirSync(initDir).filter((name) => {
    try {
      return statSync(join(initDir, name)).isDirectory();
    } catch {
      return false;
    }
  });
} catch {
  // no initiatives dir — fine
}

const lines: string[] = [];
lines.push(`# Monday Plan — W${isoWeekNumber(parseDate(start))} (week of ${start})`);
lines.push("");

// Promises due this week
lines.push("## Promises due this week");
lines.push("");
if (thisWeekDue.length === 0) {
  lines.push("No promises due this week.");
} else {
  for (const p of thisWeekDue) {
    lines.push(`- ${p.promised} — to ${p.to}, due ${p.due} (${p.ticket})`);
  }
}
lines.push("");

// Carried over / overdue
lines.push("## Carried over / overdue");
lines.push("");
if (overdue.length === 0) {
  lines.push("Nothing overdue.");
} else {
  for (const p of overdue) {
    lines.push(`- **OVERDUE**: ${p.promised} — to ${p.to}, was due ${p.due} (${p.ticket})`);
  }
}
lines.push("");

// Initiatives
lines.push("## Initiatives");
lines.push("");
if (initiatives.length === 0) {
  lines.push("No initiative directories found.");
} else {
  for (const name of initiatives) {
    lines.push(`- ${name} — <!-- status: update here -->`);
  }
}
lines.push("");

// Top 3 outcomes
lines.push("## Top 3 outcomes this week");
lines.push("");
lines.push("1. <!-- outcome -->");
lines.push("2. <!-- outcome -->");
lines.push("3. <!-- outcome -->");
lines.push("");

const output = lines.join("\n");

if (out) {
  writeFileSync(resolve(out), output);
} else {
  process.stdout.write(output);
}
