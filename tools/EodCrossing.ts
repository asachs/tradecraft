#!/usr/bin/env bun
/**
 * EodCrossing — draft membrane-safe end-of-day one-liners to stdout.
 *
 * Usage: bun tools/EodCrossing.ts [--date YYYY-MM-DD] [--out <file>] [--save]
 *
 * --save writes the draft to WORK_DIR/worklog/eod/<date>.md for human editing.
 * --save and --out are mutually exclusive.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveWorkDir } from "./lib/config.ts";
import { parseActivityLog, filterByDateWindow, groupByRepoBranch } from "./lib/activity.ts";
import { parseLedger, filterByDueWindow } from "./lib/ledger.ts";
import { parseDate, formatDate, todayWindow } from "./lib/dates.ts";

function parseArgs(): { date: Date; out?: string; save: boolean } {
  const args = process.argv.slice(2);
  let date = new Date();
  let out: string | undefined;
  let save = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--date" && args[i + 1]) {
      date = parseDate(args[++i]);
    } else if (args[i] === "--out" && args[i + 1]) {
      out = args[++i];
    } else if (args[i] === "--save") {
      save = true;
    }
  }
  return { date, out, save };
}

const { date, out, save } = parseArgs();
const workDir = resolveWorkDir();

// --save and --out are mutually exclusive
if (save && out) {
  console.error("error: --save and --out are mutually exclusive");
  process.exit(1);
}

if (out) {
  const resolved = resolve(out);
  if (!resolved.startsWith(workDir)) {
    console.error(`error: --out path must be under WORK_DIR (${workDir})`);
    process.exit(1);
  }
}

const dateStr = formatDate(date);
const { start, end } = todayWindow(date);

const allEntries = parseActivityLog(workDir);
const todayEntries = filterByDateWindow(allEntries, start, end);
const groups = groupByRepoBranch(todayEntries);

const promises = parseLedger(workDir, dateStr);
// Promises created or due today
const promisesDueToday = filterByDueWindow(promises, start, end);

const outputLines: string[] = [];

// done: lines from activity
for (const g of groups) {
  const commits = g.entries
    .filter((e) => e.last_commit)
    .map((e) => e.last_commit);
  const uniqueCommits = [...new Set(commits)];
  if (uniqueCommits.length > 0) {
    outputLines.push(`done: ${g.repo}/${g.branch} — ${uniqueCommits[uniqueCommits.length - 1]}`);
  } else {
    outputLines.push(`done: ${g.repo}/${g.branch} — work in progress`);
  }
}

// promised: lines from ledger
for (const p of promisesDueToday) {
  if (p.status === "open") {
    outputLines.push(`promised: ${p.promised} — to ${p.to} by ${p.due} (${p.ticket})`);
  }
}

// If nothing, emit a single line
if (outputLines.length === 0) {
  outputLines.push("done: no captured activity today");
}

// Cap at 6 lines
const capped = outputLines.slice(0, 6);

// Add review reminder
capped.push("");
capped.push("<!-- Review: edit these lines before carrying anything off-machine. Membrane applies. -->");

const output = capped.join("\n") + "\n";

if (save) {
  const eodDir = join(workDir, "worklog", "eod");
  const savePath = join(eodDir, `${dateStr}.md`);

  if (existsSync(savePath)) {
    console.error(
      `refusing to overwrite ${savePath} — human edits are sacred; edit the existing file or delete it first`
    );
    process.exit(1);
  }

  mkdirSync(eodDir, { recursive: true });
  writeFileSync(savePath, output);
  console.log(`saved: ${savePath}`);
  console.log("Edit the file in place before end of day — those lines become your weekly headline.");
} else if (out) {
  writeFileSync(resolve(out), output);
} else {
  process.stdout.write(output);
}
