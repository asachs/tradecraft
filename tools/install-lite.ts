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
 *   bun tools/install-lite.ts --check    # is the wiring still in place?
 *   WORK_DIR=~/work bun tools/install-lite.ts
 */
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  symlinkSync,
  lstatSync,
  readlinkSync,
  statSync,
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
  /** Absolute path to the bun binary baked into hook commands. Defaults to the
   *  bun running this installer (process.execPath). Hooks run under a minimal
   *  PATH (GUI-launched Claude has no Homebrew dir), so bare `bun` is not found. */
  bunPath?: string;
  log?: (msg: string) => void;
}

export interface LiteInstallResult {
  installed: string[];
  skipped: string[];
}

/**
 * Build the settings snippet for the lite profile. Hook commands point at the
 * repo (scaffoldDir) and self-guard so a missing file is a no-op, not an error.
 * `bunPath` must be ABSOLUTE — hooks run under a minimal PATH where bare `bun`
 * is not resolvable (same reason the statusLine uses an absolute bun path).
 */
export function buildLiteSnippet(scaffoldDir: string, bunPath = "bun"): Record<string, unknown> {
  const guard = (rel: string) => {
    const p = join(scaffoldDir, rel);
    return `[ -f "${p}" ] && "${bunPath}" "${p}" || true`;
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

// ── Drift check ──

export interface WiringCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/** Every hook command string in a settings object, across all events. */
function hookCommands(settings: Record<string, unknown>): string[] {
  const out: string[] = [];
  const hooks = settings.hooks;
  if (!hooks || typeof hooks !== "object") return out;
  for (const groups of Object.values(hooks as Record<string, unknown>)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      const inner = (group as { hooks?: unknown }).hooks;
      if (!Array.isArray(inner)) continue;
      for (const h of inner) {
        const cmd = (h as { command?: unknown }).command;
        if (typeof cmd === "string") out.push(cmd);
      }
    }
  }
  return out;
}

/**
 * Report whether the lite wiring is still in place.
 *
 * Enterprise-managed Claude has been observed rewriting ~/.claude/settings.json,
 * silently dropping the merged hooks (issue #7). The install is additive and
 * idempotent, so recovery is just a re-run — the hard part is noticing, since an
 * unwired hook cannot report its own absence. This makes that a question you can
 * ask. Read-only: it never writes.
 */
export function checkLiteInstall(opts: {
  scaffoldDir: string;
  claudeDir: string;
  workDir: string;
  /** Days before a stale activity log counts as drift. */
  staleDays?: number;
  now?: Date;
}): WiringCheck[] {
  const { scaffoldDir, claudeDir, workDir } = opts;
  const staleDays = opts.staleDays ?? 7;
  const now = opts.now ?? new Date();
  const checks: WiringCheck[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  const settingsPath = join(claudeDir, "settings.json");
  let settings: Record<string, unknown> | null = null;
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
  } catch {
    settings = null;
  }

  if (settings === null) {
    add("settings.json readable", false, `missing or unparseable: ${settingsPath}`);
  } else {
    add("settings.json readable", true, settingsPath);
  }

  const commands = settings ? hookCommands(settings) : [];
  for (const [label, rel] of [
    ["SessionStart brief hook", "hooks/WorkBrief.hook.ts"],
    ["Stop activity hook", "hooks/SessionActivityLog.hook.ts"],
  ] as const) {
    const wanted = join(scaffoldDir, rel);
    const wired = commands.some((c) => c.includes(wanted));
    add(
      label,
      wired,
      wired ? wanted : `not wired in settings.json — re-run: bun ${join(scaffoldDir, "tools/install-lite.ts")}`
    );
  }

  const importLine = `@${join(scaffoldDir, "CLAUDE.md")}`;
  let md = "";
  try {
    md = readFileSync(join(claudeDir, "CLAUDE.md"), "utf-8");
  } catch {
    md = "";
  }
  const hasImport = md.includes(importLine);
  add("CLAUDE.md import", hasImport, hasImport ? importLine : "import line absent from ~/.claude/CLAUDE.md");

  // The strongest signal: is the activity hook actually firing? This catches a
  // clobber regardless of cause, including one that leaves settings.json valid.
  const activity = join(workDir, "worklog", "activity.jsonl");
  if (!existsSync(activity)) {
    add("activity log", false, `no ${activity} yet — the Stop hook has never fired`);
  } else {
    const ageDays = (now.getTime() - statSync(activity).mtime.getTime()) / 86_400_000;
    const fresh = ageDays <= staleDays;
    add(
      "activity log",
      fresh,
      fresh
        ? `last written ${Math.floor(ageDays)}d ago`
        : `last written ${Math.floor(ageDays)}d ago — hook may have been unwired`
    );
  }

  return checks;
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

  // [1/5] Work directories (the report tools + WorkBrief read these).
  log("\n[1/5] Ensuring work directories...");
  for (const sub of ["worklog/eod", "initiatives/org", "initiatives/personal", "reports"]) {
    ensureDir(join(workDir, sub));
  }

  // [2/5] Seed the ledger + brag doc if absent (WorkBrief reads the ledger).
  log("\n[2/5] Seeding work files (if missing)...");
  seedIfMissing(join(scaffoldDir, "templates", "WORK_LEDGER.md"), join(workDir, "WORK_LEDGER.md"), "WORK_LEDGER.md");
  seedIfMissing(join(scaffoldDir, "templates", "BRAG.md"), join(workDir, "BRAG.md"), "BRAG.md");

  // [3/5] Merge the lite snippet into settings.json (hooks + scoped perms).
  log("\n[3/5] Merging settings.json (hooks reference the repo; scoped Bash)...");
  const snippet = buildLiteSnippet(scaffoldDir, opts.bunPath ?? process.execPath);
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

  // [4/5] Append the scaffold @import to CLAUDE.md — never overwrite.
  log("\n[4/5] Layering CLAUDE.md via @import (append, never overwrite)...");
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

  // [5/5] Symlink repo skills into ~/.claude/skills — reference the repo, never copy.
  // Additive: skips a skill that already exists and isn't our symlink (no clobbering).
  log("\n[5/5] Linking skills into ~/.claude/skills...");
  const skillsSrcDir = join(scaffoldDir, "skills");
  if (!existsSync(skillsSrcDir)) {
    log("  skipped (no skills/ in repo)");
  } else {
    const skillsDestDir = join(claudeDir, "skills");
    ensureDir(skillsDestDir);
    for (const entry of readdirSync(skillsSrcDir)) {
      const src = join(skillsSrcDir, entry);
      const dest = join(skillsDestDir, entry);
      let status: "linked" | "exists" | "absent";
      try {
        const st = lstatSync(dest);
        status = st.isSymbolicLink() && readlinkSync(dest) === src ? "linked" : "exists";
      } catch {
        status = "absent";
      }
      if (status === "linked") {
        log(`  skipped (already linked): skills/${entry}`);
        skipped.push(`skill ${entry}`);
      } else if (status === "exists") {
        log(`  skipped (exists, not clobbering): skills/${entry}`);
        skipped.push(`skill ${entry}`);
      } else {
        if (!dryRun) symlinkSync(src, dest);
        log(`  ${tag}linked: skills/${entry}`);
        installed.push(`skill ${entry}`);
      }
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

  if (args.includes("--check")) {
    const checks = checkLiteInstall({ scaffoldDir, claudeDir, workDir });
    console.log("Tradecraft lite wiring check\n");
    let failures = 0;
    for (const c of checks) {
      if (!c.ok) failures++;
      console.log(`  [${c.ok ? "OK  " : "DRIFT"}] ${c.name}`);
      console.log(`          ${c.detail}`);
    }
    console.log(
      failures === 0
        ? "\nWiring intact."
        : `\n${failures} of ${checks.length} checks drifted. The install is additive and idempotent — re-run it:\n  bun ${join(scaffoldDir, "tools/install-lite.ts")}`
    );
    process.exit(failures > 0 ? 1 : 0);
  }

  console.log(`Tradecraft lite install${dryRun ? " (dry run)" : ""}`);
  console.log(`  scaffold : ${scaffoldDir}`);
  console.log(`  ~/.claude: ${claudeDir}`);
  console.log(`  WORK_DIR : ${workDir}`);
  console.log("  mode     : additive — no launchd, no osascript, no file clobbering");

  const { installed, skipped } = runInstallLite({ scaffoldDir, claudeDir, workDir, force, dryRun });

  console.log("\n--- Lite install complete ---");
  console.log(`  installed: ${installed.length}   skipped: ${skipped.length}`);
  console.log("Next steps:");
  console.log("  1. Restart Claude Code so the SessionStart brief + activity hook load, and skills register.");
  console.log("  2. Work normally — the brief surfaces overdue/EOD state each session; type /eod to wrap up.");
  console.log("  3. Run report tools on demand (see README); schedule.ts stays uninstalled here.");
}
