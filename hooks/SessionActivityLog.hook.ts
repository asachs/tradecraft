#!/usr/bin/env bun
/**
 * SessionActivityLog — Claude Code Stop hook.
 *
 * Appends one JSONL line per session stop to ~/work/worklog/activity.jsonl:
 * timestamp, cwd, git branch, and files touched (uncommitted changes count).
 * Passive visibility — the EodSummary / WeeklyReport workflows read this.
 *
 * Install: copy to ~/.claude/hooks/ and merge settings-snippet.json into
 * ~/.claude/settings.json. Requires bun on PATH.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

async function git(args: string[], cwd: string): Promise<string> {
  try {
    const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "ignore" });
    const out = await new Response(proc.stdout).text();
    return (await proc.exited) === 0 ? out.trim() : "";
  } catch {
    return "";
  }
}

const input = await Bun.stdin.text();
let event: { cwd?: string; session_id?: string } = {};
try {
  event = JSON.parse(input);
} catch {
  // malformed input — still log the stop with what we have
}

const cwd = event.cwd ?? process.cwd();
const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
const dirty = await git(["status", "--porcelain"], cwd);
const lastCommit = await git(["log", "-1", "--format=%h %s"], cwd);

const entry = {
  ts: new Date().toISOString(),
  type: "session",
  cwd,
  session: event.session_id ?? "",
  branch,
  files_dirty: dirty ? dirty.split("\n").length : 0,
  last_commit: lastCommit,
};

const logDir = join(homedir(), "work", "worklog");
mkdirSync(logDir, { recursive: true });
appendFileSync(join(logDir, "activity.jsonl"), JSON.stringify(entry) + "\n");
