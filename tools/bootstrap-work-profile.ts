#!/usr/bin/env bun
/**
 * bootstrap-work-profile.ts — Set up the PAI work profile on a fresh work machine.
 *
 * Takes a PAI work archive (from build-work-archive.ts) and this scaffold repo's
 * templates/ directory, then creates the full ~/.claude/ work profile.
 *
 * Usage:
 *   bun tools/bootstrap-work-profile.ts <archive.tar.gz> [--force]
 *   bun tools/bootstrap-work-profile.ts --skip-archive [--force]
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

const SCAFFOLD_DIR = resolve(dirname(import.meta.path), "..");
const TEMPLATES_DIR = join(SCAFFOLD_DIR, "templates");
const CLAUDE_DIR = join(homedir(), ".claude");
const PAI_DIR = join(CLAUDE_DIR, "PAI");
const WORK_DIR = process.env.WORK_DIR ?? join(homedir(), "work");

const MEMORY_DIRS = [
  "MEMORY/WORK",
  "MEMORY/OBSERVABILITY",
  "MEMORY/STATE",
  "MEMORY/LEARNING",
];

// ── Args ──

function parseArgs(): { archive?: string; force: boolean; skipArchive: boolean } {
  const args = process.argv.slice(2);
  let archive: string | undefined;
  let force = false;
  let skipArchive = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--force") force = true;
    else if (args[i] === "--skip-archive") skipArchive = true;
    else if (!args[i].startsWith("-")) archive = resolve(args[i]);
  }
  return { archive, force, skipArchive };
}

const { archive, force, skipArchive } = parseArgs();

if (!skipArchive && !archive) {
  console.error("usage: bun tools/bootstrap-work-profile.ts <archive.tar.gz> [--force]");
  console.error("       bun tools/bootstrap-work-profile.ts --skip-archive [--force]");
  process.exit(1);
}

if (archive && !existsSync(archive)) {
  console.error(`error: archive not found: ${archive}`);
  process.exit(1);
}

// ── Helpers ──

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
    console.log(`  created: ${path}`);
  }
}

function copyIfMissing(src: string, dest: string, description: string) {
  if (existsSync(dest) && !force) {
    console.log(`  skipped (exists): ${description}`);
    return;
  }
  ensureDir(dirname(dest));
  copyFileSync(src, dest);
  console.log(`  installed: ${description}`);
}

// ── Step 1: Extract archive ──

if (archive) {
  console.log("\n[1/8] Extracting archive to ~/.claude/PAI/...");
  ensureDir(PAI_DIR);

  const proc = Bun.spawn(["tar", "xzf", archive, "-C", CLAUDE_DIR], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    console.error(`  error: tar extraction failed: ${stderr}`);
    process.exit(1);
  }
  console.log("  done.");
} else {
  console.log("\n[1/8] Skipping archive extraction (--skip-archive).");
}

// ── Step 2: Create memory directories ──

console.log("\n[2/8] Creating memory directories...");
for (const dir of MEMORY_DIRS) {
  ensureDir(join(PAI_DIR, dir));
}

// ── Step 3: Install identity files ──

console.log("\n[3/8] Installing identity files...");
ensureDir(join(PAI_DIR, "USER"));

copyIfMissing(
  join(TEMPLATES_DIR, "WORK_IDENTITY.md"),
  join(PAI_DIR, "USER", "WORK_IDENTITY.md"),
  "WORK_IDENTITY.md"
);

copyIfMissing(
  join(TEMPLATES_DIR, "DA_IDENTITY_WORK.md"),
  join(PAI_DIR, "USER", "DA_IDENTITY_WORK.md"),
  "DA_IDENTITY_WORK.md"
);

// ── Step 4: Install settings.json ──

console.log("\n[4/8] Installing settings.json...");
const settingsDest = join(CLAUDE_DIR, "settings.json");
if (existsSync(settingsDest) && !force) {
  console.log("  skipped (exists): settings.json — use --force to overwrite");
} else {
  copyFileSync(join(TEMPLATES_DIR, "work-settings.json"), settingsDest);
  console.log("  installed: settings.json");
}

// ── Step 5: Install global CLAUDE.md ──

console.log("\n[5/8] Installing global CLAUDE.md...");
const claudeMdDest = join(CLAUDE_DIR, "CLAUDE.md");
if (existsSync(claudeMdDest) && !force) {
  console.log("  skipped (exists): CLAUDE.md — use --force to overwrite");
} else {
  copyFileSync(join(TEMPLATES_DIR, "work-claude.md"), claudeMdDest);
  console.log("  installed: CLAUDE.md");
}

// ── Step 6: Create work directories ──

console.log("\n[6/8] Creating work directories...");
const workDirs = [
  join(WORK_DIR, "worklog", "eod"),
  join(WORK_DIR, "initiatives"),
  join(WORK_DIR, "reports"),
];
for (const dir of workDirs) {
  ensureDir(dir);
}

// ── Step 6b: Install lead-measures template ──

console.log("\n[6b/8] Installing lead-measures template...");
copyIfMissing(
  join(TEMPLATES_DIR, "lead-measures.md"),
  join(WORK_DIR, "lead-measures.md"),
  "lead-measures.md → ~/work/"
);

// ── Step 7: Install scaffold hook ──

console.log("\n[7/8] Installing SessionActivityLog hook...");
const hooksSrcDir = join(SCAFFOLD_DIR, "hooks");
const hooksDestDir = join(CLAUDE_DIR, "hooks");
ensureDir(hooksDestDir);

copyIfMissing(
  join(hooksSrcDir, "SessionActivityLog.hook.ts"),
  join(hooksDestDir, "SessionActivityLog.hook.ts"),
  "SessionActivityLog.hook.ts"
);

// ── Step 8: Run verification ──

console.log("\n[8/8] Running isolation verification...");
const verifyScript = join(SCAFFOLD_DIR, "tools", "verify-isolation.ts");
if (existsSync(verifyScript)) {
  const verifyProc = Bun.spawn(["bun", verifyScript], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const verifyExit = await verifyProc.exited;
  if (verifyExit !== 0) {
    console.error("\n  WARNING: Isolation verification found issues. Review above.");
  } else {
    console.log("  All checks passed.");
  }
} else {
  console.log("  skipped: verify-isolation.ts not found");
}

console.log("\n--- Bootstrap complete ---");
console.log("Next steps:");
console.log("  1. Edit ~/.claude/PAI/USER/WORK_IDENTITY.md with your details");
console.log("  2. Populate ~/src/tradecraft/company.md after weeks 1-2");
console.log("  3. Start claude and verify with: 'What do you know about my personal life?'");
