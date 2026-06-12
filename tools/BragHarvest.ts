#!/usr/bin/env bun
/**
 * BragHarvest — sweep [BRAG?]-tagged EOD lines into BRAG.md stub entries.
 *
 * Usage: bun tools/BragHarvest.ts [--week YYYY-MM-DD]
 *
 * For each tagged line in the week's EOD files, appends a template-format
 * stub to WORK_DIR/BRAG.md with What and Evidence pre-filled. The
 * "Why it mattered" line is always a fill-comment — impact sentences are
 * human-authored, never machine-authored. Idempotent: entries whose heading
 * already exists in BRAG.md are skipped.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveWorkDir } from "./lib/config.ts";
import { parseEodFiles, filterEodByWindow } from "./lib/eod.ts";
import { parseDate, isoWeekWindow } from "./lib/dates.ts";

const TICKET_RE = /\b[A-Z][A-Z0-9]+-\d+\b/g;
const NEWEST_FIRST_MARKER = "<!-- newest first -->";

const BRAG_TEMPLATE_HEADER = `# Brag Document

> Evidence file. Written as things happen, read at review time. Every entry carries a pointer a reviewer could follow — a ticket, a PR, a named person who said it.

## Entries

${NEWEST_FIRST_MARKER}
`;

function parseArgs(): { week: Date } {
  const args = process.argv.slice(2);
  let week = new Date();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--week" && args[i + 1]) {
      week = parseDate(args[++i]);
    }
  }
  return { week };
}

function renderStub(date: string, text: string): { heading: string; block: string } {
  const tickets = [...new Set(text.match(TICKET_RE) ?? [])];
  const evidence = tickets.length > 0 ? tickets.join(", ") : "none captured";
  const heading = `## ${date} — ${text}`;
  const block = [
    heading,
    `- What: ${text}`,
    `- Evidence: ${evidence}`,
    `- Why it mattered: <!-- fill: impact in one sentence — time saved, risk removed, person unblocked -->`,
    "",
  ].join("\n");
  return { heading, block };
}

const { week } = parseArgs();
const workDir = resolveWorkDir();
const { start, end } = isoWeekWindow(week);

const tagged = filterEodByWindow(parseEodFiles(workDir), start, end).filter(
  (l) => l.brag
);

if (tagged.length === 0) {
  process.stdout.write("nothing to harvest — no [BRAG?] lines in week starting " + start + "\n");
  process.exit(0);
}

const bragPath = join(workDir, "BRAG.md");
let content = existsSync(bragPath)
  ? readFileSync(bragPath, "utf-8")
  : BRAG_TEMPLATE_HEADER;

const appended: string[] = [];
const skipped: string[] = [];

for (const line of tagged) {
  const { heading, block } = renderStub(line.date, line.text);
  if (content.includes(heading)) {
    skipped.push(heading);
    continue;
  }
  // Newest first: insert after the marker when present, else append.
  const markerIdx = content.indexOf(NEWEST_FIRST_MARKER);
  if (markerIdx >= 0) {
    const insertAt = markerIdx + NEWEST_FIRST_MARKER.length;
    content = content.slice(0, insertAt) + "\n\n" + block + content.slice(insertAt);
  } else {
    content = content.trimEnd() + "\n\n" + block;
  }
  appended.push(heading);
}

if (appended.length > 0) {
  writeFileSync(bragPath, content);
}

for (const h of appended) {
  process.stdout.write(`appended: ${h}\n`);
}
for (const h of skipped) {
  process.stdout.write(`skipped (already present): ${h}\n`);
}
if (appended.length > 0) {
  process.stdout.write(
    `\n${appended.length} stub(s) added to ${bragPath} — fill in "Why it mattered" in your own words.\n`
  );
}
