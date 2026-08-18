#!/usr/bin/env bun
/**
 * MondayPlan — draft a week plan to stdout.
 *
 * Usage: bun tools/MondayPlan.ts [--date YYYY-MM-DD] [--out <file>]
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { resolveWorkDir, isUnderWorkDir } from "./lib/config.ts";
import { parseLedger, filterByStatus, filterOverdue, filterByDueWindow } from "./lib/ledger.ts";
import { parseDate, formatDate, isoWeekWindow, isoWeekNumber } from "./lib/dates.ts";
import { readInitiatives, candidateOrg } from "./lib/initiatives.ts";

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
  if (!isUnderWorkDir(workDir, out)) {
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

// Discover initiatives — org-assigned (initiatives/) vs personal-provenance (personal/)
const { org: orgInitiatives, personal: personalInitiatives } = readInitiatives(workDir);

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

// Initiatives — split org-assigned vs personal (provenance)
lines.push("## Initiatives");
lines.push("");
lines.push("### Org-assigned");
if (orgInitiatives.length === 0) {
  lines.push("None.");
} else {
  for (const it of orgInitiatives) {
    const meta = it.fm.label
      ? ` (${it.fm.label}${it.fm.role ? `, ${it.fm.role}` : ""})`
      : "";
    lines.push(`- ${it.slug}${meta} — <!-- status: update here -->`);
  }
}
lines.push("");
lines.push("### Personal — pending funding / reclassification");
if (personalInitiatives.length === 0) {
  lines.push("None.");
} else {
  for (const it of personalInitiatives) {
    const cand = candidateOrg(it);
    const home = cand ? `→ ${cand}` : "→ unmapped";
    const fund = it.fm.funding_status ? ` [${it.fm.funding_status}]` : "";
    lines.push(`- ${it.slug} ${home}${fund}`);
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

// Lead measures (optional — skip if file doesn't exist)
const leadMeasuresPath = join(workDir, "lead-measures.md");
if (existsSync(leadMeasuresPath)) {
  const content = readFileSync(leadMeasuresPath, "utf-8");
  const measureLines = content
    .split("\n")
    .filter((l) => l.startsWith("- ["));
  if (measureLines.length > 0) {
    lines.push("## Lead measures");
    lines.push("");
    for (const m of measureLines) {
      lines.push(m);
    }
    lines.push("");
  }
}

const output = lines.join("\n");

if (out) {
  writeFileSync(resolve(out), output);
} else {
  process.stdout.write(output);
}
