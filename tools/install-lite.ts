#!/usr/bin/env bun
/**
 * install-lite.ts — MDM-safe, additive install for a managed machine.
 *
 * Unlike install.ts / bootstrap-work-profile.ts, this path:
 *   - installs NO launchd jobs and calls NO osascript (both MDM-governed)
 *   - never copies hooks into ~/.claude/ — it references them at their repo
 *     path and self-guards each command ([ -f x ] && bun x || true)
 *   - never overwrites CLAUDE.md — it APPENDS an @import line (with backup)
 *   - grants least-privilege Bash (git, bun) instead of a blanket allow
 *   - merges into settings.json, preserving every existing key and hook
 *
 * Idempotent. Backs up any file it edits. Safe to run on a machine whose
 * ~/.claude/CLAUDE.md documents managed org policy.
 *
 * Usage:
 *   bun tools/install-lite.ts [--force] [--dry-run]
 *   WORK_DIR=~/work bun tools/install-lite.ts
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
import { resolveWorkDir } from "./lib/config.ts";
import { mergeSettings } from "./install.ts";

const IMPORT_MARKER = "<!-- tradecraft: work profile (managed-safe, additive) -->";

export interface LiteInstallOptions {
  scaffoldDir: string;
  claudeDir: string;
  workDir: string;
  force: boolean;
  dryRun: boolean;
  log?: (msg: string) => void;
}

export interface LiteInstallResult {
  installed: string[];
  skipped: string[];
}

/**
 * Build the settings snippet for the lite profile. Hook commands point at the
 * repo (scaffoldDir) and self-guard so a missing file is a no-op, not an error.
 */
export function buildLiteSnippet(scaffoldDir: string): Record<string, unknown> {
  const guard = (rel: string) => {
    const p = join(scaffoldDir, rel);
    return `[ -f "${p}" ] && bun "${p}" || true`;
  };
  return {
    hooks: {
      SessionStart: [
        { matcher: "", hooks: [{ type: "command", command: guard("hooks/WorkBrief.hook.ts") }] },
      ],
      Stop: [
        { matcher: "", hooks: [{ type: "command", command: guard("hooks/SessionActivityLog.hook.ts") }] },
      ],
    },
    permissions: {
      allow: ["Bash(git *)", "Bash(bun *)"],
      deny: ["Bash(*elevenlabs*)", "Bash(*telegram*)", "Bash(*t.me/*)", "Bash(osascript *)"],
    },
  };
}

/**
 * Union-merge snippet permissions into existing, de-duplicating by exact
 * string. Existing entries are preserved and never reordered.
 */
export function mergePermissions(
  existing: Record<string, unknown>,
  snippet: Record<string, unknown>,
): Record<string, unknown> {
  const snippetPerms = (snippet.permissions ?? {}) as Record<string, string[]>;
  if (!snippetPerms.allow && !snippetPerms.deny) return existing;

  const result = { ...existing };
  const existingPerms = (existing.permissions as Record<string, unknown>) ?? {};
  const merged: Record<string, unknown> = { ...existingPerms };

  for (const key of ["allow", "deny"] as const) {
    const add = snippetPerms[key];
    if (!add) continue;
    const current = Array.isArray(existingPerms[key]) ? (existingPerms[key] as string[]) : [];
    const seen = new Set(current);
    const list = [...current];
    for (const entry of add) {
      if (!seen.has(entry)) {
        list.push(entry);
        seen.add(entry);
      }
    }
    merged[key] = list;
  }

  result.permissions = merged;
  return result;
}

/**
 * Compute the CLAUDE.md content after ensuring the scaffold @import is present.
 * Returns null when the import is already present (nothing to write).
 */
export function injectImport(existing: string | null, scaffoldDir: string): string | null {
  const importLine = `@${join(scaffoldDir, "CLAUDE.md")}`;
  if (existing !== null && existing.includes(importLine)) return null;

  const block = `${IMPORT_MARKER}\n${importLine}\n`;
  if (existing === null || existing.trim() === "") return block;
  const sep = existing.endsWith("\n") ? "\n" : "\n\n";
  return existing + sep + block;
}

export function runInstallLite(opts: LiteInstallOptions): LiteInstallResult {
  const log = opts.log ?? console.log;
  const { scaffoldDir, claudeDir, workDir, dryRun } = opts;
  const tag = dryRun ? "[dry-run] " : "";
  const installed: string[] = [];
  const skipped: string[] = [];

  function ensureDir(path: string) {
    if (!existsSync(path)) {
      if (!dryRun) mkdirSync(path, { recursive: true });
      log(`  ${tag}created dir: ${path}`);
    }
  }

  function seedIfMissing(src: string, dest: string, desc: string) {
    if (existsSync(dest)) {
      log(`  skipped (exists): ${desc}`);
      skipped.push(desc);
      return;
    }
    if (!dryRun) {
      ensureDir(dirname(dest));
      copyFileSync(src, dest);
    }
    log(`  ${tag}seeded: ${desc}`);
    installed.push(desc);
  }

  // [1/4] Work directories (the report tools + WorkBrief read these).
  log("\n[1/4] Ensuring work directories...");
  for (const sub of ["worklog/eod", "initiatives", "reports"]) {
    ensureDir(join(workDir, sub));
  }

  // [2/4] Seed the ledger + brag doc if absent (WorkBrief reads the ledger).
  log("\n[2/4] Seeding work files (if missing)...");
  seedIfMissing(join(scaffoldDir, "templates", "WORK_LEDGER.md"), join(workDir, "WORK_LEDGER.md"), "WORK_LEDGER.md");
  seedIfMissing(join(scaffoldDir, "templates", "BRAG.md"), join(workDir, "BRAG.md"), "BRAG.md");

  // [3/4] Merge the lite snippet into settings.json (hooks + scoped perms).
  log("\n[3/4] Merging settings.json (hooks reference the repo; scoped Bash)...");
  const snippet = buildLiteSnippet(scaffoldDir);
  const settingsDest = join(claudeDir, "settings.json");
  if (!existsSync(settingsDest)) {
    if (!dryRun) {
      ensureDir(dirname(settingsDest));
      writeFileSync(settingsDest, JSON.stringify(snippet, null, 2) + "\n");
    }
    log(`  ${tag}installed: settings.json (new)`);
    installed.push("settings.json");
  } else {
    const existing = JSON.parse(readFileSync(settingsDest, "utf-8"));
    const merged = mergePermissions(mergeSettings(existing, snippet), snippet);
    if (JSON.stringify(merged) === JSON.stringify(existing)) {
      log("  skipped (already wired): settings.json");
      skipped.push("settings.json");
    } else {
      if (!dryRun) {
        writeFileSync(settingsDest + ".bak", JSON.stringify(existing, null, 2) + "\n");
        writeFileSync(settingsDest, JSON.stringify(merged, null, 2) + "\n");
      }
      log(`  ${tag}merged: settings.json (backup: settings.json.bak)`);
      installed.push("settings.json merge");
    }
  }

  // [4/4] Append the scaffold @import to CLAUDE.md — never overwrite.
  log("\n[4/4] Layering CLAUDE.md via @import (append, never overwrite)...");
  const claudeMdDest = join(claudeDir, "CLAUDE.md");
  const existingMd = existsSync(claudeMdDest) ? readFileSync(claudeMdDest, "utf-8") : null;
  const nextMd = injectImport(existingMd, scaffoldDir);
  if (nextMd === null) {
    log("  skipped (import already present): CLAUDE.md");
    skipped.push("CLAUDE.md import");
  } else {
    if (!dryRun) {
      ensureDir(dirname(claudeMdDest));
      if (existingMd !== null) writeFileSync(claudeMdDest + ".bak", existingMd);
      writeFileSync(claudeMdDest, nextMd);
    }
    log(`  ${tag}${existingMd === null ? "created" : "appended import to"}: CLAUDE.md${existingMd !== null ? " (backup: CLAUDE.md.bak)" : ""}`);
    installed.push("CLAUDE.md import");
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

  console.log(`Tradecraft lite install${dryRun ? " (dry run)" : ""}`);
  console.log(`  scaffold : ${scaffoldDir}`);
  console.log(`  ~/.claude: ${claudeDir}`);
  console.log(`  WORK_DIR : ${workDir}`);
  console.log("  mode     : additive — no launchd, no osascript, no file clobbering");

  const { installed, skipped } = runInstallLite({ scaffoldDir, claudeDir, workDir, force, dryRun });

  console.log("\n--- Lite install complete ---");
  console.log(`  installed: ${installed.length}   skipped: ${skipped.length}`);
  console.log("Next steps:");
  console.log("  1. Restart Claude Code so the SessionStart brief + activity hook load.");
  console.log("  2. Work normally — the brief surfaces overdue/EOD state each session.");
  console.log("  3. Run report tools on demand (see README); schedule.ts stays uninstalled here.");
}
