#!/usr/bin/env bun
/**
 * setup-identity.ts — one-time setup of the strings that must never leave your
 * machine in anything this kit writes or ships.
 *
 * Writes templates/containment-patterns-work.local.json (gitignored). Two
 * consumers read it: verify-clean.ts (keeps the strings out of this repo) and
 * build-work-archive.ts (patches the containment guard for the work profile).
 *
 * Interactive:   bun tools/setup-identity.ts
 * Scripted:      bun tools/setup-identity.ts --add "Your Name" --add "yourhandle" --add "former-employer"
 * Review:        bun tools/setup-identity.ts --show
 * Elsewhere:     --file <path> (tests; or a second kit checkout)
 *
 * Nothing you type is printed back in full, written anywhere else, or sent anywhere.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";

const SCAFFOLD_DIR = resolve(join(import.meta.dir, ".."));
export const DEFAULT_PATH = join(SCAFFOLD_DIR, "templates", "containment-patterns-work.local.json");

/** The questions, in order. Each answer may hold several comma-separated strings. */
export const PROMPTS: readonly { key: string; question: string }[] = [
  { key: "names", question: "Your name(s), as they might appear in files (first, last, nicknames)" },
  { key: "handles", question: "Usernames and handles (GitHub, LinkedIn path, shell login)" },
  { key: "email", question: "Personal email addresses and domains" },
  { key: "employers", question: "Employer names, current and former, including trading names" },
  { key: "hosts", question: "Personal hostnames, project codenames, internal system names" },
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

/** Merge new strings into the file; case-insensitive de-duplication; sorted. */
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
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(patterns, null, 2) + "\n");
}

/** Mask a string for display: first character and length only. */
export function mask(s: string): string {
  return s.length <= 1 ? "*" : `${s[0]}${"*".repeat(Math.min(s.length - 1, 11))}`;
}

function parseArgs(argv: string[]): { file: string; add: string[]; show: boolean } {
  let file = DEFAULT_PATH;
  const add: string[] = [];
  let show = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file" && argv[i + 1]) file = resolve(argv[++i]);
    else if (argv[i] === "--add" && argv[i + 1]) add.push(argv[++i]);
    else if (argv[i] === "--show") show = true;
  }
  return { file, add, show };
}

if (import.meta.main) {
  const { file, add, show } = parseArgs(process.argv.slice(2));
  const existing = readPatterns(file);

  if (show) {
    console.log(`${file}: ${existing.length} pattern(s)`);
    for (const p of existing) console.log(`  ${mask(p)}`);
    process.exit(0);
  }

  let added: string[] = [...add];
  if (added.length === 0) {
    console.log("setup-identity: the strings below are kept out of this repo and out of work output.");
    console.log("Separate several with commas. Leave blank to skip. Nothing is echoed back in full.\n");
    for (const { question } of PROMPTS) {
      const answer = prompt(`${question}:`) ?? "";
      added.push(...splitAnswer(answer));
    }
  }

  const merged = mergePatterns(existing, added);
  if (merged.length === existing.length && added.length === 0) {
    console.log("setup-identity: nothing added.");
    process.exit(0);
  }
  writePatterns(file, merged);
  const isDefault = file === DEFAULT_PATH;
  console.log(
    `setup-identity: ${merged.length} pattern(s) written to ${file}` +
      (isDefault ? " (gitignored)." : "."),
  );
  console.log("Next: bun tools/verify-clean.ts --require-local");
}
