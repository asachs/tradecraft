#!/usr/bin/env bun
/**
 * build-work-archive.ts — Extract work-safe PAI files into a portable tarball.
 *
 * Runs on the PERSONAL machine. Produces an archive that bootstrap-work-profile.ts
 * consumes on the work machine.
 *
 * Usage:
 *   bun tools/build-work-archive.ts [--dry-run] [--out <dir>]
 */
import { existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, basename } from "node:path";
import { formatDate } from "./lib/dates.ts";

// ── Whitelist configuration ──

const WORK_SAFE_HOOKS = [
  "SecurityPipeline.hook.ts",
  "PromptGuard.hook.ts",
  "RepeatDetection.hook.ts",
  "ISASync.hook.ts",
  "ToolActivityTracker.hook.ts",
  "ContentScanner.hook.ts",
  "PreCompact.hook.ts",
  "SessionActivityLog.hook.ts",
  "PromptProcessing-work.hook.ts",
  "ContainmentGuard-work.hook.ts",
];

const WORK_SAFE_SKILLS = [
  "ISA",
  "Research",
  "Fabric",
  "Council",
  "FirstPrinciples",
  "Science",
  "RootCauseAnalysis",
  "SystemsThinking",
  "IterativeDepth",
  "ApertureOscillation",
  "RedTeam",
  "Delegation",
  "CreateCLI",
  "Evals",
  "Prompting",
  "BitterPillEngineering",
  "ContextSearch",
  "ExtractWisdom",
  "BeCreative",
];

const COPY_DIRS = ["ALGORITHM", "DOCUMENTATION", "TOOLS"];

// ── Args ──

function parseArgs(): { dryRun: boolean; outDir: string } {
  const args = process.argv.slice(2);
  let dryRun = false;
  let outDir = ".";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") dryRun = true;
    else if (args[i] === "--out" && args[i + 1]) outDir = args[++i];
  }
  return { dryRun, outDir: resolve(outDir) };
}

const { dryRun, outDir } = parseArgs();
const paiRoot = join(homedir(), ".claude", "PAI");
const hooksDir = join(homedir(), ".claude", "hooks");
const skillsDir = join(homedir(), ".claude", "skills");

if (!existsSync(paiRoot)) {
  console.error(`error: PAI root not found at ${paiRoot}`);
  console.error("This script must run on the personal machine where PAI is installed.");
  process.exit(1);
}

// ── Collect files ──

const manifest: string[] = [];
const missing: string[] = [];

// Hooks
for (const hook of WORK_SAFE_HOOKS) {
  const path = join(hooksDir, hook);
  if (existsSync(path)) {
    manifest.push(`hooks/${hook}`);
  } else {
    missing.push(`hooks/${hook}`);
  }
}

// Hook lib (if exists)
const hookLibDir = join(hooksDir, "lib");
if (existsSync(hookLibDir)) {
  const libFiles = readdirSync(hookLibDir).filter((f) => f.endsWith(".ts"));
  for (const f of libFiles) {
    manifest.push(`hooks/lib/${f}`);
  }
}

// Skills
for (const skill of WORK_SAFE_SKILLS) {
  const path = join(skillsDir, skill);
  if (existsSync(path) && statSync(path).isDirectory()) {
    const files = readdirSync(path);
    for (const f of files) {
      manifest.push(`skills/${skill}/${f}`);
    }
  } else if (existsSync(`${path}.md`)) {
    manifest.push(`skills/${skill}.md`);
  } else {
    missing.push(`skills/${skill}`);
  }
}

// Whole directories
for (const dir of COPY_DIRS) {
  const path = join(paiRoot, dir);
  if (existsSync(path) && statSync(path).isDirectory()) {
    function walk(base: string, rel: string) {
      for (const entry of readdirSync(base)) {
        const full = join(base, entry);
        const entryRel = rel ? `${rel}/${entry}` : entry;
        if (statSync(full).isDirectory()) {
          walk(full, entryRel);
        } else {
          manifest.push(`PAI/${dir}/${entryRel}`);
        }
      }
    }
    walk(path, "");
  } else {
    missing.push(`PAI/${dir}`);
  }
}

// ── Report ──

if (missing.length > 0) {
  console.error("warning: missing items (skipped):");
  for (const m of missing) {
    console.error(`  - ${m}`);
  }
}

console.log(`\nManifest (${manifest.length} files):`);
for (const f of manifest) {
  console.log(`  ${f}`);
}

if (dryRun) {
  console.log("\n--dry-run: no archive created.");
  process.exit(0);
}

// ── Build tarball ──

const dateStr = formatDate(new Date());
const archiveName = `pai-work-profile-${dateStr}.tar.gz`;
const archivePath = join(outDir, archiveName);

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

// Build tar arguments: we need to specify each file path relative to its source
const tarArgs = ["tar", "czf", archivePath];

// Create a temp manifest file for tar to read
const manifestContent = manifest
  .map((f) => {
    if (f.startsWith("hooks/")) return join(hooksDir, f.slice(6));
    if (f.startsWith("skills/")) return join(skillsDir, f.slice(7));
    if (f.startsWith("PAI/")) return join(paiRoot, f.slice(4));
    return f;
  })
  .join("\n");

const manifestFile = join(outDir, ".archive-manifest.tmp");
await Bun.write(manifestFile, manifestContent);

// Use tar with transform to maintain the desired archive structure
const homeBase = homedir();
const proc = Bun.spawn(
  [
    "tar",
    "czf",
    archivePath,
    `--transform=s|${hooksDir.slice(1)}/|hooks/|`,
    `--transform=s|${skillsDir.slice(1)}/|skills/|`,
    `--transform=s|${paiRoot.slice(1)}/|PAI/|`,
    "-T",
    manifestFile,
  ],
  { stdout: "pipe", stderr: "pipe" }
);

const exitCode = await proc.exited;
const stderr = await new Response(proc.stderr).text();

// Clean up manifest file
try {
  const { unlinkSync } = await import("node:fs");
  unlinkSync(manifestFile);
} catch {}

if (exitCode !== 0) {
  console.error(`error: tar failed (exit ${exitCode}): ${stderr}`);
  process.exit(1);
}

console.log(`\nArchive created: ${archivePath}`);
console.log(`Contains ${manifest.length} files from the work-safe whitelist.`);
