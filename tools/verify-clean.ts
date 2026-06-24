#!/usr/bin/env bun
/**
 * verify-clean.ts — repo-wide person/employer-agnostic check (ISC-35).
 *
 * Scans every git-tracked file for identity/employer strings that must never
 * ship in this patterns-only methodology repo. This file is the single source
 * of truth for the forbidden patterns; ISA ISC-35 references it.
 *
 * Scope is the whole repo, not just tools/ + tests/ — the narrow original scope
 * is exactly why personal data once sat undetected in templates/. Two files are
 * excluded because they necessarily contain the patterns (they define/test them).
 * git ls-files lists tracked files only, so a real, gitignored
 * containment-patterns-work.local.json is never scanned.
 *
 * Usage: bun tools/verify-clean.ts        # exit 0 = clean, 1 = leaks found
 */
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

/** Identity/employer substrings (case-insensitive) that must not ship. */
export const FORBIDDEN: readonly string[] = [
  "payroc",
  "worldnet",
  "sachs",
  "asachs",
  "/Users/",
];

const SCAFFOLD_DIR = resolve(join(import.meta.dir, ".."));

/** Files that legitimately contain the patterns (they define or exercise them). */
const SELF_EXCLUDE = new Set(["tools/verify-clean.ts", "tests/verify-clean.test.ts"]);

export interface Offender {
  file: string;
  line: number;
  pattern: string;
}

/** Find forbidden patterns (case-insensitive) across the given repo-relative files. */
export function findLeaks(
  files: string[],
  patterns: readonly string[],
  read: (relPath: string) => string,
): Offender[] {
  const lowered = patterns.map((p) => p.toLowerCase());
  const offenders: Offender[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = read(file);
    } catch {
      continue; // unreadable/binary — skip
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const hay = lines[i].toLowerCase();
      for (let p = 0; p < lowered.length; p++) {
        if (hay.includes(lowered[p])) {
          offenders.push({ file, line: i + 1, pattern: patterns[p] });
        }
      }
    }
  }
  return offenders;
}

/** Tracked files to scan: `git ls-files` minus the self-exclusions. */
export function trackedFiles(scaffoldDir: string = SCAFFOLD_DIR): string[] {
  const out = Bun.spawnSync(["git", "ls-files"], { cwd: scaffoldDir }).stdout.toString();
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !SELF_EXCLUDE.has(l));
}

if (import.meta.main) {
  const files = trackedFiles();
  const offenders = findLeaks(files, FORBIDDEN, (rel) =>
    readFileSync(join(SCAFFOLD_DIR, rel), "utf-8"),
  );
  if (offenders.length === 0) {
    console.log(
      `verify-clean: ${files.length} tracked files scanned — no identity/employer strings found.`,
    );
    process.exit(0);
  }
  console.error(`verify-clean: ${offenders.length} forbidden match(es) found:`);
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line} — "${o.pattern}"`);
  }
  process.exit(1);
}
