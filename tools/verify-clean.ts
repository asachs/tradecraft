#!/usr/bin/env bun
/**
 * verify-clean.ts — repo-wide person/employer-agnostic check (ISC-35).
 *
 * Scans every git-tracked file for strings that must never ship in this
 * patterns-only methodology repo. The strings themselves are personal by
 * nature (your name, handles, employers), so they do NOT live in this file:
 * committing them here would publish the very things the check protects.
 *
 * Pattern sources, combined:
 *   1. GENERIC — shapes that leak regardless of who you are (macOS home paths).
 *   2. templates/repo-forbidden.local.json — your names, handles, email
 *      addresses and employers, gitignored, created by `bun tools/setup-identity.ts`.
 *
 * This is deliberately NOT the containment file (containment-patterns-work.local.json):
 * that one feeds the work-profile guard and legitimately lists services and ports
 * the repo itself names in its deny lists. Mixing the two makes the repo fail on
 * its own content.
 *
 * Without the local file the check runs on GENERIC only, says so, and exits 0,
 * so a fresh clone still passes `bun test`. Pass --require-local to make a
 * missing file a failure (use this on the machine where you author the repo).
 *
 * Usage: bun tools/verify-clean.ts [--require-local]   # exit 0 = clean, 1 = leaks
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const SCAFFOLD_DIR = resolve(join(import.meta.dir, ".."));

/** Patterns that are leaks for anyone (case-insensitive substrings). */
export const GENERIC: readonly string[] = ["/Users/"];

/** Where the user's own strings live. Gitignored (*.local.json). */
export const LOCAL_PATTERNS_PATH = join(SCAFFOLD_DIR, "templates", "repo-forbidden.local.json");

/** Files that legitimately mention the mechanism (they define or exercise it). */
const SELF_EXCLUDE = new Set(["tools/verify-clean.ts", "tests/verify-clean.test.ts"]);

export interface Offender {
  file: string;
  line: number;
  pattern: string;
}

/**
 * Read the user's patterns from a JSON array file. Missing file → []. A file
 * that is not a JSON array of non-empty strings is an error, not a silent pass.
 */
export function loadLocalPatterns(path: string = LOCAL_PATTERNS_PATH): string[] {
  if (!existsSync(path)) return [];
  const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
  if (!Array.isArray(parsed) || !parsed.every((p) => typeof p === "string")) {
    throw new Error(`${path}: expected a JSON array of strings`);
  }
  return (parsed as string[]).map((p) => p.trim()).filter((p) => p.length > 0);
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
  const requireLocal = process.argv.includes("--require-local");
  const local = loadLocalPatterns();
  if (local.length === 0) {
    const msg =
      "verify-clean: no personal patterns configured — scanning generic patterns only. " +
      "Run `bun tools/setup-identity.ts` to record your names, handles, email and employers (gitignored).";
    if (requireLocal) {
      console.error(msg);
      process.exit(1);
    }
    console.error(msg);
  }
  const patterns = [...GENERIC, ...local];
  const files = trackedFiles();
  const offenders = findLeaks(files, patterns, (rel) =>
    readFileSync(join(SCAFFOLD_DIR, rel), "utf-8"),
  );
  if (offenders.length === 0) {
    console.log(
      `verify-clean: ${files.length} tracked files scanned against ${patterns.length} pattern(s) — clean.`,
    );
    process.exit(0);
  }
  console.error(`verify-clean: ${offenders.length} forbidden match(es) found:`);
  for (const o of offenders) {
    // Print the pattern masked: the report must not become the leak.
    console.error(`  ${o.file}:${o.line} — pattern #${patterns.indexOf(o.pattern) + 1}`);
  }
  process.exit(1);
}
