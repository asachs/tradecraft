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
import {
  existsSync,
  readdirSync,
  statSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
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
  "PromptProcessing.hook.ts",
  "ContainmentGuard.hook.ts",
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

/** PAI subdirectories to copy in full (recursively). */
const PAI_COPY_DIRS = ["ALGORITHM", "DOCUMENTATION", "TOOLS"];

/** Hook subdirectories to copy in full (recursively). */
const HOOK_COPY_DIRS = ["lib", "security"];

/**
 * Work-mode identity patterns for ContainmentGuard.
 * These replace the upstream patterns (which are the open-source maintainer's)
 * so the guard protects the actual user's identity on the work machine.
 * Loaded from templates/containment-patterns-work.json if it exists.
 */
const SCAFFOLD_DIR = resolve(join(import.meta.dir, ".."));
const WORK_PATTERNS_PATH = join(SCAFFOLD_DIR, "templates", "containment-patterns-work.json");

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

// ── Helpers ──

/** Recursively walk a directory and return all file paths relative to `base`. */
function walk(base: string, rel = ""): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(base);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(base, entry);
    const entryRel = rel ? `${rel}/${entry}` : entry;
    try {
      if (statSync(full).isDirectory()) {
        results.push(...walk(full, entryRel));
      } else {
        results.push(entryRel);
      }
    } catch {
      // skip unreadable entries
    }
  }
  return results;
}

/** Copy a file, creating parent directories as needed. */
function stageCopy(src: string, dest: string) {
  mkdirSync(join(dest, "..").replace(/\/\.\.$/, ""), { recursive: true });
  const destDir = dest.substring(0, dest.lastIndexOf("/"));
  if (destDir) mkdirSync(destDir, { recursive: true });
  copyFileSync(src, dest);
}

// ── Collect manifest ──

interface ManifestEntry {
  /** Path relative to the archive root (e.g. "hooks/SecurityPipeline.hook.ts") */
  archivePath: string;
  /** Absolute source path on disk */
  sourcePath: string;
}

const manifest: ManifestEntry[] = [];
const missing: string[] = [];

// Individual hook files
for (const hook of WORK_SAFE_HOOKS) {
  const src = join(hooksDir, hook);
  if (existsSync(src)) {
    manifest.push({ archivePath: `hooks/${hook}`, sourcePath: src });
  } else {
    missing.push(`hooks/${hook}`);
  }
}

// Hook subdirectories (lib/, security/) — recursive
for (const subdir of HOOK_COPY_DIRS) {
  const subdirPath = join(hooksDir, subdir);
  if (existsSync(subdirPath) && statSync(subdirPath).isDirectory()) {
    for (const relFile of walk(subdirPath)) {
      manifest.push({
        archivePath: `hooks/${subdir}/${relFile}`,
        sourcePath: join(subdirPath, relFile),
      });
    }
  } else {
    missing.push(`hooks/${subdir}/`);
  }
}

// Skills — recursive (includes Workflows/, Patterns/, Tools/ subdirs)
for (const skill of WORK_SAFE_SKILLS) {
  const skillDir = join(skillsDir, skill);
  if (existsSync(skillDir) && statSync(skillDir).isDirectory()) {
    for (const relFile of walk(skillDir)) {
      manifest.push({
        archivePath: `skills/${skill}/${relFile}`,
        sourcePath: join(skillDir, relFile),
      });
    }
  } else if (existsSync(`${skillDir}.md`)) {
    manifest.push({
      archivePath: `skills/${skill}.md`,
      sourcePath: `${skillDir}.md`,
    });
  } else {
    missing.push(`skills/${skill}`);
  }
}

// PAI directories (ALGORITHM, DOCUMENTATION, TOOLS) — recursive
for (const dir of PAI_COPY_DIRS) {
  const dirPath = join(paiRoot, dir);
  if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
    for (const relFile of walk(dirPath)) {
      manifest.push({
        archivePath: `PAI/${dir}/${relFile}`,
        sourcePath: join(dirPath, relFile),
      });
    }
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
for (const entry of manifest) {
  console.log(`  ${entry.archivePath}`);
}

if (dryRun) {
  console.log("\n--dry-run: no archive created.");
  process.exit(0);
}

// ── Build tarball via staging directory (BSD tar compatible) ──

const dateStr = formatDate(new Date());
const archiveName = `pai-work-profile-${dateStr}.tar.gz`;

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

const stagingDir = join(outDir, `.staging-${Date.now()}`);
mkdirSync(stagingDir, { recursive: true });

try {
  // Copy all files into staging with correct relative paths
  for (const entry of manifest) {
    const dest = join(stagingDir, entry.archivePath);
    stageCopy(entry.sourcePath, dest);
  }

  // Patch ContainmentGuard with work-mode identity patterns
  const guardPath = join(stagingDir, "hooks", "ContainmentGuard.hook.ts");
  if (existsSync(guardPath) && existsSync(WORK_PATTERNS_PATH)) {
    try {
      const patterns: string[] = JSON.parse(readFileSync(WORK_PATTERNS_PATH, "utf-8"));
      let guardContent = readFileSync(guardPath, "utf-8");

      // Replace the IDENTITY_PATTERNS array
      const patternArrayStr = patterns.map((p) => `  '${p}',`).join("\n");
      guardContent = guardContent.replace(
        /const IDENTITY_PATTERNS: readonly string\[\] = \[[\s\S]*?\];/,
        `const IDENTITY_PATTERNS: readonly string[] = [\n${patternArrayStr}\n];`
      );
      writeFileSync(guardPath, guardContent);
      console.log("  patched: ContainmentGuard.hook.ts with work-mode identity patterns");
    } catch (err) {
      console.error(`  warning: failed to patch ContainmentGuard: ${err}`);
    }
  } else if (!existsSync(WORK_PATTERNS_PATH)) {
    console.error(
      "  warning: templates/containment-patterns-work.json not found — " +
      "ContainmentGuard will use upstream identity patterns"
    );
  }

  // Create tarball from staging directory
  const archivePath = join(outDir, archiveName);
  const proc = Bun.spawn(
    ["tar", "czf", archivePath, "-C", stagingDir, "."],
    { stdout: "pipe", stderr: "pipe" }
  );

  const exitCode = await proc.exited;
  const stderr = await new Response(proc.stderr).text();

  if (exitCode !== 0) {
    console.error(`error: tar failed (exit ${exitCode}): ${stderr}`);
    process.exit(1);
  }

  console.log(`\nArchive created: ${archivePath}`);
  console.log(`Contains ${manifest.length} files from the work-safe whitelist.`);
} finally {
  // Clean up staging directory
  try {
    rmSync(stagingDir, { recursive: true, force: true });
  } catch {}
}
