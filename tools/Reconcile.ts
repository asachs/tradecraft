#!/usr/bin/env bun
/**
 * Reconcile — periodic reconciliation of org-assigned vs personal initiatives.
 *
 * Answers: which personal (self-found) work is unfunded and where it should
 * fold into an org initiative, and which org-assigned initiatives have no work
 * behind them. Deterministic; reads ISA frontmatter only. Run monthly (matches
 * a typical strategy-review cadence) or on demand.
 *
 * Usage: bun tools/Reconcile.ts [--date YYYY-MM-DD] [--out <file>]
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveWorkDir, isUnderWorkDir } from "./lib/config.ts";
import { readInitiatives, reconcile, candidateOrg } from "./lib/initiatives.ts";
import { parseDate, formatDate } from "./lib/dates.ts";

function parseArgs(): { date: Date; out?: string } {
  const args = process.argv.slice(2);
  let date = new Date();
  let out: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--date" && args[i + 1]) date = parseDate(args[++i]);
    else if (args[i] === "--out" && args[i + 1]) out = args[++i];
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

const { org, personal } = readInitiatives(workDir);
const r = reconcile(org, personal);

function orgLabel(slug: string, fm: Record<string, string>): string {
  const bits = [slug];
  if (fm.label && fm.label !== slug) bits.push(fm.label);
  if (fm.role) bits.push(fm.role);
  return bits.join(" · ");
}

const lines: string[] = [];
lines.push(`# Project Reconciliation — ${formatDate(date)}`);
lines.push("");
lines.push(`Org-assigned: ${org.length} · Personal: ${personal.length}`);
lines.push("");

// Org-assigned + their personal feeders
lines.push("## Org-assigned — work feeding each");
lines.push("");
if (r.byOrg.length === 0) {
  lines.push("No org-assigned initiatives.");
} else {
  for (const g of r.byOrg) {
    lines.push(`### ${orgLabel(g.org.slug, g.org.fm)}`);
    if (g.feeders.length === 0) {
      lines.push("- ⚠ no personal work feeding this yet");
    } else {
      for (const f of g.feeders) {
        const fund = f.fm.funding_status ? ` [${f.fm.funding_status}]` : "";
        lines.push(`- ${f.slug}${fund}`);
      }
    }
    lines.push("");
  }
}

// Orphan org-assigned
lines.push("## ⚠ Org-assigned with nothing behind them");
lines.push("");
if (r.orphanOrg.length === 0) {
  lines.push("None — every org initiative has feeding work.");
} else {
  for (const o of r.orphanOrg) lines.push(`- ${orgLabel(o.slug, o.fm)}`);
}
lines.push("");

// Personal feeding external (owned elsewhere / not tracked here)
lines.push("## Personal → external org initiatives (align / hand off)");
lines.push("");
if (r.externalPersonal.length === 0) {
  lines.push("None.");
} else {
  for (const p of r.externalPersonal) lines.push(`- ${p.slug} → ${candidateOrg(p)}`);
}
lines.push("");

// Unmapped personal — needs a decision
lines.push("## ⚠ Unmapped personal — needs funding, a new org initiative, or dropping");
lines.push("");
if (r.unmappedPersonal.length === 0) {
  lines.push("None — every personal initiative names a candidate org.");
} else {
  for (const p of r.unmappedPersonal) {
    const why = p.fm.provenance ? ` (${p.fm.provenance})` : "";
    lines.push(`- ${p.slug}${why}`);
  }
}
lines.push("");

// Funding summary
lines.push("## Funding status (personal)");
lines.push("");
const statuses = Object.keys(r.fundingCounts).sort();
if (statuses.length === 0) lines.push("No personal initiatives.");
else for (const s of statuses) lines.push(`- ${s}: ${r.fundingCounts[s]}`);
lines.push("");

const output = lines.join("\n");
if (out) writeFileSync(resolve(out), output);
else process.stdout.write(output);
