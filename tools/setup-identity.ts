#!/usr/bin/env bun
/**
 * setup-identity.ts — one-time setup of the strings that must never leave your
 * machine in anything this kit writes or ships.
 *
 * Writes two gitignored files under templates/:
 *
 *   repo-forbidden.local.json          names, handles, email, employers
 *                                      → read by verify-clean.ts (keeps them out of THIS repo)
 *   containment-patterns-work.local.json   all of the above plus personal hosts,
 *                                      codenames and services
 *                                      → read by build-work-archive.ts (work-profile guard)
 *
 * They differ on purpose: the repo names services and ports in its own deny
 * lists, so those belong in containment but would make verify-clean fail on
 * the repo's own content.
 *
 * Interactive:   bun tools/setup-identity.ts
 * Scripted:      bun tools/setup-identity.ts --add "Your Name" --add "yourhandle" [--containment-only "voice-service"]
 * Review:        bun tools/setup-identity.ts --show
 * Elsewhere:     --dir <templates dir> (tests; or a second kit checkout)
 *
 * Before writing, every repo-forbidden string is checked against the tracked
 * files: a string the repo already contains (a vendor name such as a calendar
 * product, say) would fail the clean check immediately, so you are told where
 * it occurs and asked whether to keep it. Nothing you type is printed back in
 * full, written anywhere else, or sent anywhere.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { findLeaks, trackedFiles } from "./verify-clean.ts";

const SCAFFOLD_DIR = resolve(join(import.meta.dir, ".."));
export const DEFAULT_DIR = join(SCAFFOLD_DIR, "templates");
export const REPO_FILE = "repo-forbidden.local.json";
export const CONTAINMENT_FILE = "containment-patterns-work.local.json";

/** The questions, in order. Each answer may hold several comma-separated strings. */
export const PROMPTS: readonly { key: string; question: string; repo: boolean }[] = [
  { key: "names", question: "Your name(s), as they might appear in files (first, last, nicknames)", repo: true },
  { key: "handles", question: "Usernames and handles (GitHub, LinkedIn path, shell login)", repo: true },
  { key: "email", question: "Personal email addresses and domains", repo: true },
  {
    key: "employers",
    question:
      "Employer names, current and former, including trading names (skip vendors whose products this kit names, e.g. a calendar provider)",
    repo: true,
  },
  { key: "hosts", question: "Personal hostnames, project codenames, services (voice, chat), ports", repo: false },
];

export function splitAnswer(answer: string): string[] {
  return answer
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function readPatterns(path: string): string[] {
  if (!existsSync(path)) return [];
  const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
  if (!Array.isArray(parsed) || !parsed.every((p) => typeof p === "string")) {
    throw new Error(`${path}: expected a JSON array of strings`);
  }
  return parsed as string[];
}

/** Merge new strings into the existing list; case-insensitive de-duplication; sorted. */
export function mergePatterns(existing: string[], added: string[]): string[] {
  const seen = new Map<string, string>();
  for (const p of [...existing, ...added]) {
    const t = p.trim();
    if (t.length === 0) continue;
    const k = t.toLowerCase();
    if (!seen.has(k)) seen.set(k, t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function writePatterns(path: string, patterns: string[]): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(patterns, null, 2) + "\n");
}

/** Mask a string for display: first character and length only. */
export function mask(s: string): string {
  return s.length <= 1 ? "*" : `${s[0]}${"*".repeat(Math.min(s.length - 1, 11))}`;
}

/** Where each candidate string already occurs in the tracked repo files. */
export function collisions(
  candidates: string[],
  scaffoldDir: string = SCAFFOLD_DIR,
): Map<string, { count: number; first: string }> {
  const files = trackedFiles(scaffoldDir);
  const out = new Map<string, { count: number; first: string }>();
  for (const c of candidates) {
    const hits = findLeaks(files, [c], (rel) => readFileSync(join(scaffoldDir, rel), "utf-8"));
    if (hits.length > 0) out.set(c, { count: hits.length, first: `${hits[0].file}:${hits[0].line}` });
  }
  return out;
}

function parseArgs(argv: string[]): {
  dir: string;
  add: string[];
  containmentOnly: string[];
  show: boolean;
  skipCollisionCheck: boolean;
} {
  let dir = DEFAULT_DIR;
  const add: string[] = [];
  const containmentOnly: string[] = [];
  let show = false;
  let skipCollisionCheck = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir" && argv[i + 1]) dir = resolve(argv[++i]);
    else if (argv[i] === "--add" && argv[i + 1]) add.push(argv[++i]);
    else if (argv[i] === "--containment-only" && argv[i + 1]) containmentOnly.push(argv[++i]);
    else if (argv[i] === "--show") show = true;
    else if (argv[i] === "--no-collision-check") skipCollisionCheck = true;
  }
  return { dir, add, containmentOnly, show, skipCollisionCheck };
}

if (import.meta.main) {
  const { dir, add, containmentOnly, show, skipCollisionCheck } = parseArgs(process.argv.slice(2));
  const repoPath = join(dir, REPO_FILE);
  const containmentPath = join(dir, CONTAINMENT_FILE);
  const repoExisting = readPatterns(repoPath);
  const containmentExisting = readPatterns(containmentPath);

  if (show) {
    console.log(`${repoPath}: ${repoExisting.length} pattern(s)`);
    for (const p of repoExisting) console.log(`  ${mask(p)}`);
    console.log(`${containmentPath}: ${containmentExisting.length} pattern(s)`);
    for (const p of containmentExisting) console.log(`  ${mask(p)}`);
    process.exit(0);
  }

  const interactive = add.length === 0 && containmentOnly.length === 0;
  let repoAdd: string[] = [...add];
  let containmentAdd: string[] = [...add, ...containmentOnly];

  if (interactive) {
    console.log("setup-identity: the strings below are kept out of this repo and out of work output.");
    console.log("Separate several with commas. Leave blank to skip. Nothing is echoed back in full.\n");
    for (const { question, repo } of PROMPTS) {
      const answer = splitAnswer(prompt(`${question}:`) ?? "");
      containmentAdd.push(...answer);
      if (repo) repoAdd.push(...answer);
    }
  }

  // Collision check: a repo-forbidden string the repo already contains fails verify-clean at once.
  if (!skipCollisionCheck && repoAdd.length > 0) {
    const hits = collisions(repoAdd);
    if (hits.size > 0) {
      console.log("");
      for (const [s, h] of hits) {
        const where = `already occurs in ${h.count} place(s) in tracked files (first: ${h.first})`;
        if (interactive) {
          const keep = (prompt(`"${mask(s)}" ${where}. Keep it in the repo check? [y/N]`) ?? "").trim().toLowerCase();
          if (keep !== "y" && keep !== "yes") {
            repoAdd = repoAdd.filter((x) => x.toLowerCase() !== s.toLowerCase());
            console.log(`  dropped from the repo check (kept for containment).`);
          } else {
            console.log(`  kept: verify-clean will fail until those occurrences are edited.`);
          }
        } else {
          console.error(`setup-identity: warning: "${mask(s)}" ${where}; verify-clean will fail until edited.`);
        }
      }
    }
  }

  const repoMerged = mergePatterns(repoExisting, repoAdd);
  const containmentMerged = mergePatterns(containmentExisting, containmentAdd);
  if (repoMerged.length === repoExisting.length && containmentMerged.length === containmentExisting.length) {
    console.log("setup-identity: nothing added.");
    process.exit(0);
  }
  writePatterns(repoPath, repoMerged);
  writePatterns(containmentPath, containmentMerged);
  const note = dir === DEFAULT_DIR ? " (gitignored)" : "";
  console.log(`setup-identity: ${repoMerged.length} pattern(s) in ${REPO_FILE}, ${containmentMerged.length} in ${CONTAINMENT_FILE}${note}.`);
  console.log("Next: bun tools/verify-clean.ts --require-local");
}
