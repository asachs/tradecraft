#!/usr/bin/env bun
/**
 * verify-isolation.ts — Confirm no personal PAI leakage on the work machine.
 *
 * Runnable anytime. Checks that personal-only directories, files, and patterns
 * are absent from ~/.claude/. Exit 0 = all clear, exit 1 = issues found.
 *
 * Usage:
 *   bun tools/verify-isolation.ts [--verbose]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CLAUDE_DIR = join(homedir(), ".claude");
const PAI_DIR = join(CLAUDE_DIR, "PAI");

const verbose = process.argv.includes("--verbose");

// ── Check definitions ──

const FORBIDDEN_DIRS = [
  "PAI/MEMORY/RELATIONSHIP",
  "PAI/MEMORY/KNOWLEDGE",
  "PAI/MEMORY/BOOKMARKS",
  "PAI/MEMORY/DATA",
  "PAI/MEMORY/WISDOM",
  "PAI/MEMORY/VOICE",
  "PAI/MEMORY/AUTO",
  "PAI/MEMORY/SCRATCHPAD",
  "PAI/USER/TELOS",
  "PAI/USER/HEALTH",
  "PAI/USER/FINANCES",
  "PAI/USER/BUSINESS",
];

const FORBIDDEN_FILES = [
  "PAI/USER/OUR_STORY.md",
  "PAI/USER/OPINIONS.md",
  "PAI/USER/PRINCIPAL_IDENTITY.md",
  "PAI/USER/RESUME.md",
  "PAI/USER/CORECONTENT.md",
  "PAI/USER/WRITINGSTYLE.md",
  "PAI/USER/RHETORICALSTYLE.md",
  "PAI/USER/AI_WRITING_PATTERNS.md",
];

const FORBIDDEN_PATTERNS = [
  /elevenlabs/i,
  /telegram.*token/i,
  /t\.me\//i,
  /pulse.*url/i,
  /telos/i,
  /relationship.*memory/i,
];

const ALLOWED_HOOKS = [
  "SecurityPipeline.hook.ts",
  "PromptGuard.hook.ts",
  "RepeatDetection.hook.ts",
  "ISASync.hook.ts",
  "ToolActivityTracker.hook.ts",
  "ContentScanner.hook.ts",
  "PreCompact.hook.ts",
  "SessionActivityLog.hook.ts",
  "PromptProcessing.hook.ts",
  "ContainmentGuard.hook.ts",
];

const ALLOWED_SKILLS = [
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

// ── Runner ──

interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string;
}

const results: CheckResult[] = [];

function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
}

// Check 1: Forbidden directories must not exist
for (const dir of FORBIDDEN_DIRS) {
  const path = join(CLAUDE_DIR, dir);
  check(
    `no ${dir}`,
    !existsSync(path),
    existsSync(path) ? `found: ${path}` : undefined
  );
}

// Check 1b: Forbidden personal files must not exist
for (const file of FORBIDDEN_FILES) {
  const path = join(CLAUDE_DIR, file);
  check(
    `no ${file}`,
    !existsSync(path),
    existsSync(path) ? `found: ${path}` : undefined
  );
}

// Check 2: Scan config files for forbidden patterns
function scanFile(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, "utf-8");
    const hits: string[] = [];
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        hits.push(`${pattern} matched in ${filePath}`);
      }
    }
    return hits;
  } catch {
    return [];
  }
}

const filesToScan = [
  join(CLAUDE_DIR, "settings.json"),
  join(CLAUDE_DIR, "CLAUDE.md"),
];

// Also scan PAI/USER/ if it exists
const userDir = join(PAI_DIR, "USER");
if (existsSync(userDir)) {
  try {
    for (const f of readdirSync(userDir)) {
      filesToScan.push(join(userDir, f));
    }
  } catch {}
}

const contentHits: string[] = [];
for (const file of filesToScan) {
  if (existsSync(file)) {
    contentHits.push(...scanFile(file));
  }
}
check(
  "no forbidden patterns in config",
  contentHits.length === 0,
  contentHits.length > 0 ? contentHits.join("; ") : undefined
);

// Check 3: Only whitelisted hooks present
const hooksDir = join(CLAUDE_DIR, "hooks");
if (existsSync(hooksDir)) {
  const installedHooks = readdirSync(hooksDir).filter(
    (f) => f.endsWith(".hook.ts") && statSync(join(hooksDir, f)).isFile()
  );
  const unexpected = installedHooks.filter((h) => !ALLOWED_HOOKS.includes(h));
  check(
    "only whitelisted hooks",
    unexpected.length === 0,
    unexpected.length > 0 ? `unexpected: ${unexpected.join(", ")}` : undefined
  );
} else {
  check("only whitelisted hooks", true, "no hooks dir (ok — not yet bootstrapped)");
}

// Check 4: Only whitelisted skills present
const skillsDir = join(CLAUDE_DIR, "skills");
if (existsSync(skillsDir)) {
  const installedSkills = readdirSync(skillsDir).filter((f) => {
    const path = join(skillsDir, f);
    return statSync(path).isDirectory() || f.endsWith(".md");
  });
  const skillNames = installedSkills.map((f) => f.replace(/\.md$/, ""));
  const unexpected = skillNames.filter((s) => !ALLOWED_SKILLS.includes(s));
  check(
    "only whitelisted skills",
    unexpected.length === 0,
    unexpected.length > 0 ? `unexpected: ${unexpected.join(", ")}` : undefined
  );
} else {
  check("only whitelisted skills", true, "no skills dir (ok — not yet bootstrapped)");
}

// Check 5: settings.json doesn't reference disabled services
const settingsPath = join(CLAUDE_DIR, "settings.json");
if (existsSync(settingsPath)) {
  const settingsContent = readFileSync(settingsPath, "utf-8");
  const hasVoice = /elevenlabs|tts|voice.*synth/i.test(settingsContent);
  const hasTelegram = /telegram|t\.me/i.test(settingsContent);
  const hasPulse = /pulse.*url|pulse.*endpoint/i.test(settingsContent);
  check("no voice in settings", !hasVoice, hasVoice ? "voice reference found" : undefined);
  check("no telegram in settings", !hasTelegram, hasTelegram ? "telegram reference found" : undefined);
  check("no pulse in settings", !hasPulse, hasPulse ? "pulse reference found" : undefined);
} else {
  check("no voice in settings", true, "no settings.json (not yet bootstrapped)");
  check("no telegram in settings", true);
  check("no pulse in settings", true);
}

// ── Report ──

console.log("\n=== PAI Work Profile — Isolation Verification ===\n");

let failures = 0;
for (const r of results) {
  const icon = r.pass ? "PASS" : "FAIL";
  const line = `  [${icon}] ${r.name}`;
  console.log(line);
  if (!r.pass) {
    failures++;
    if (r.detail) console.log(`         ${r.detail}`);
  } else if (verbose && r.detail) {
    console.log(`         ${r.detail}`);
  }
}

console.log(`\n  ${results.length} checks, ${failures} failures.\n`);
process.exit(failures > 0 ? 1 : 0);
