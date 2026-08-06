/**
 * Initiative discovery + reconciliation.
 *
 * Two buckets under WORK_DIR:
 *   initiatives/org/       — ORG-ASSIGNED (formally owned, e.g. from a strategy page)
 *   initiatives/personal/  — SELF-PROVENANCE (found while reviewing; an unfunded
 *                            pipeline that later needs funding or folding into an
 *                            org initiative)
 *
 * Each initiative is a dir with an ISA.md carrying optional YAML frontmatter.
 * Reconciliation is deterministic and employer-agnostic — it only reads the
 * frontmatter values the human wrote; no labels are hardcoded here.
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Initiative {
  slug: string;
  bucket: "org" | "personal";
  /** Parsed ISA.md frontmatter (empty if none). */
  fm: Record<string, string>;
}

/** Parse a leading `---`-fenced YAML frontmatter block into flat key/value pairs. */
export function parseFrontmatter(content: string): Record<string, string> {
  const fm: Record<string, string> = {};
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return fm;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") break;
    const idx = lines[i].indexOf(":");
    if (idx < 0) continue;
    const key = lines[i].slice(0, idx).trim();
    const val = lines[i].slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key) fm[key] = val;
  }
  return fm;
}

function readDir(workDir: string, sub: string, bucket: "org" | "personal"): Initiative[] {
  let names: string[];
  try {
    names = readdirSync(join(workDir, sub));
  } catch {
    return [];
  }
  const out: Initiative[] = [];
  for (const slug of names) {
    const dir = join(workDir, sub, slug);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    let fm: Record<string, string> = {};
    try {
      fm = parseFrontmatter(readFileSync(join(dir, "ISA.md"), "utf-8"));
    } catch {
      /* no ISA.md — still list the dir */
    }
    out.push({ slug, bucket, fm });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

export function readInitiatives(workDir: string): { org: Initiative[]; personal: Initiative[] } {
  return {
    org: readDir(workDir, join("initiatives", "org"), "org"),
    personal: readDir(workDir, join("initiatives", "personal"), "personal"),
  };
}

/** The candidate org initiative a personal one should fund into (supports two key spellings). */
export function candidateOrg(it: Initiative): string {
  const c = it.fm.candidate_org || it.fm.candidate_org_initiative || "";
  return c && c !== "none" ? c : "";
}

export interface OrgGroup {
  org: Initiative;
  feeders: Initiative[];
}
export interface Reconciliation {
  byOrg: OrgGroup[];
  /** Org-assigned initiatives with no personal work feeding them. */
  orphanOrg: Initiative[];
  /** Personal whose candidate_org names an initiative not tracked locally (owned elsewhere). */
  externalPersonal: Initiative[];
  /** Personal with no candidate_org — needs classification, a new org initiative, or dropping. */
  unmappedPersonal: Initiative[];
  /** Count of personal initiatives by funding_status. */
  fundingCounts: Record<string, number>;
}

export function reconcile(org: Initiative[], personal: Initiative[]): Reconciliation {
  const orgByKey = new Map<string, Initiative>();
  for (const o of org) {
    orgByKey.set(o.slug, o);
    if (o.fm.label) orgByKey.set(o.fm.label, o);
  }

  const feedersBySlug = new Map<string, Initiative[]>();
  for (const o of org) feedersBySlug.set(o.slug, []);
  const externalPersonal: Initiative[] = [];
  const unmappedPersonal: Initiative[] = [];

  for (const p of personal) {
    const cand = candidateOrg(p);
    if (!cand) {
      unmappedPersonal.push(p);
      continue;
    }
    const match = orgByKey.get(cand);
    if (match) feedersBySlug.get(match.slug)!.push(p);
    else externalPersonal.push(p);
  }

  const byOrg: OrgGroup[] = org.map((o) => ({ org: o, feeders: feedersBySlug.get(o.slug)! }));
  const orphanOrg = byOrg.filter((g) => g.feeders.length === 0).map((g) => g.org);

  const fundingCounts: Record<string, number> = {};
  for (const p of personal) {
    const s = p.fm.funding_status || "unset";
    fundingCounts[s] = (fundingCounts[s] || 0) + 1;
  }

  return { byOrg, orphanOrg, externalPersonal, unmappedPersonal, fundingCounts };
}
