#!/usr/bin/env bun
/**
 * install.ts — Script the generic starter-kit install (the README "Bootstrap").
 *
 * Lays down the patterns-only work brain on a machine that already runs
 * Claude Code — no LifeOS required. Idempotent: re-runs skip what already exists,
 * and the settings merge backs up any file it touches.
 *
 * For the full LifeOS-on-work-machine path (LifeOS archive, identity files, memory
 * dirs), use bootstrap-work-profile.ts instead.
 *
 * Usage:
 *   bun tools/install.ts [--force] [--dry-run]
 *   WORK_DIR=~/work bun tools/install.ts
 */
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { resolveWorkDir } from "./lib/config";

export interface InstallOptions {
  /** Repo root (contains CLAUDE.md, templates/, hooks/). */
  scaffoldDir: string;
  /** Target ~/.claude directory. */
  claudeDir: string;
  /** Target work directory (WORK_DIR). */
  workDir: string;
  force: boolean;
  dryRun: boolean;
  /** Logger; defaults to console.log. Pass a no-op to silence (tests). */
  log?: (msg: string) => void;
}

export interface InstallResult {
  installed: string[];
  skipped: string[];
}

/**
 * Deep-merge a hooks settings snippet into existing settings, idempotently.
 * Unrelated top-level keys and other hook events are preserved; snippet
 * entries already present (by exact value) are not duplicated on re-run.
 */
export function mergeSettings(
  existing: Record<string, unknown>,
  snippet: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...existing };
  const snippetHooks = (snippet.hooks ?? {}) as Record<string, unknown[]>;
  const mergedHooks: Record<string, unknown[]> = {
    ...((existing.hooks as Record<string, unknown[]>) ?? {}),
  };

  for (const [event, entries] of Object.entries(snippetHooks)) {
    const current = Array.isArray(mergedHooks[event]) ? mergedHooks[event] : [];
    const seen = new Set(current.map((e) => JSON.stringify(e)));
    const merged = [...current];
    for (const entry of entries) {
      const key = JSON.stringify(entry);
      if (!seen.has(key)) {
        merged.push(entry);
        seen.add(key);
      }
    }
    mergedHooks[event] = merged;
  }

  result.hooks = mergedHooks;
  return result;
}

/** Run the install. Pure with respect to its options — all paths are injected. */
export function runInstall(opts: InstallOptions): InstallResult {
  const log = opts.log ?? console.log;
  const { scaffoldDir, claudeDir, workDir, force, dryRun } = opts;
  const tag = dryRun ? "[dry-run] " : "";
  const installed: string[] = [];
  const skipped: string[] = [];

  function ensureDir(path: string) {
    if (!existsSync(path)) {
      if (!dryRun) mkdirSync(path, { recursive: true });
      log(`  ${tag}created dir: ${path}`);
    }
  }

  function copyIfMissing(src: string, dest: string, desc: string) {
    if (existsSync(dest) && !force) {
      log(`  skipped (exists): ${desc}`);
      skipped.push(desc);
      return;
    }
    if (!dryRun) {
      ensureDir(dirname(dest));
      copyFileSync(src, dest);
    }
    log(`  ${tag}installed: ${desc}`);
    installed.push(desc);
  }

  // [1/5] Work directories — decisions live per-initiative, not top-level.
  log("\n[1/5] Creating work directories...");
  for (const sub of ["worklog/eod", "initiatives/org", "initiatives/personal", "reports"]) {
    ensureDir(join(workDir, sub));
  }

  // [2/5] Seed the promise ledger and brag doc.
  log("\n[2/5] Seeding work files...");
  copyIfMissing(
    join(scaffoldDir, "templates", "WORK_LEDGER.md"),
    join(workDir, "WORK_LEDGER.md"),
    "WORK_LEDGER.md → WORK_DIR",
  );
  copyIfMissing(
    join(scaffoldDir, "templates", "BRAG.md"),
    join(workDir, "BRAG.md"),
    "BRAG.md → WORK_DIR",
  );

  // [3/5] Work-profile CLAUDE.md — never clobber an existing one silently.
  log("\n[3/5] Installing work profile (CLAUDE.md)...");
  const claudeMdDest = join(claudeDir, "CLAUDE.md");
  if (existsSync(claudeMdDest) && !force) {
    log("  skipped (exists): ~/.claude/CLAUDE.md already present.");
    log("    → merge the work profile by hand, or re-run with --force to overwrite.");
    skipped.push("CLAUDE.md");
  } else {
    copyIfMissing(join(scaffoldDir, "CLAUDE.md"), claudeMdDest, "CLAUDE.md → ~/.claude/");
  }

  // [4/5] Activity-log hook.
  log("\n[4/5] Installing SessionActivityLog hook...");
  copyIfMissing(
    join(scaffoldDir, "hooks", "SessionActivityLog.hook.ts"),
    join(claudeDir, "hooks", "SessionActivityLog.hook.ts"),
    "SessionActivityLog.hook.ts → ~/.claude/hooks/",
  );

  // [5/5] Wire the hook into settings.json (merge, with backup).
  log("\n[5/5] Wiring hook into settings.json...");
  const settingsDest = join(claudeDir, "settings.json");
  const snippet = JSON.parse(
    readFileSync(join(scaffoldDir, "hooks", "settings-snippet.json"), "utf-8"),
  );
  if (!existsSync(settingsDest)) {
    if (!dryRun) {
      ensureDir(dirname(settingsDest));
      writeFileSync(settingsDest, JSON.stringify(snippet, null, 2) + "\n");
    }
    log(`  ${tag}installed: settings.json (new)`);
    installed.push("settings.json");
  } else {
    const existing = JSON.parse(readFileSync(settingsDest, "utf-8"));
    const merged = mergeSettings(existing, snippet);
    if (JSON.stringify(merged) === JSON.stringify(existing)) {
      log("  skipped (already wired): settings.json");
      skipped.push("settings.json");
    } else {
      if (!dryRun) {
        writeFileSync(settingsDest + ".bak", JSON.stringify(existing, null, 2) + "\n");
        writeFileSync(settingsDest, JSON.stringify(merged, null, 2) + "\n");
      }
      log(`  ${tag}merged: hook into settings.json (backup: settings.json.bak)`);
      installed.push("settings.json hook");
    }
  }

  return { installed, skipped };
}

// ── CLI ──

if (import.meta.main) {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");
  const scaffoldDir = resolve(dirname(import.meta.path), "..");
  const claudeDir = join(homedir(), ".claude");
  const workDir = resolveWorkDir();

  console.log(`Tradecraft install${dryRun ? " (dry run)" : ""}`);
  console.log(`  scaffold : ${scaffoldDir}`);
  console.log(`  ~/.claude: ${claudeDir}`);
  console.log(`  WORK_DIR : ${workDir}`);

  const { installed, skipped } = runInstall({
    scaffoldDir,
    claudeDir,
    workDir,
    force,
    dryRun,
  });

  console.log("\n--- Install complete ---");
  console.log(`  installed: ${installed.length}   skipped: ${skipped.length}`);
  console.log("Next steps:");
  console.log("  1. Restart Claude Code so the activity hook loads.");
  console.log("  2. Work normally — activity accumulates in WORK_DIR/worklog/activity.jsonl.");
  console.log("  3. Run the report tools (see README) on your Friday cadence.");
}
