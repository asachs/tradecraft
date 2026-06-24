#!/usr/bin/env bun
/**
 * schedule.ts — Work OS report scheduling and delivery (standalone Mac).
 *
 * Runs scaffold tools on a schedule via launchd, saves reports to
 * $WORK_DIR/reports/<type>/<date>.md, and fires native macOS notifications.
 * No network, no external dependencies, no external services required.
 *
 * Usage:
 *   bun tools/schedule.ts install          Install launchd plists
 *   bun tools/schedule.ts uninstall        Remove launchd plists
 *   bun tools/schedule.ts status           Show installed jobs
 *   bun tools/schedule.ts run <job>        Run a job (called by launchd)
 *   bun tools/schedule.ts run-all          Run all jobs once (dry-run)
 *
 * Jobs: monday-plan, daily-brief, eod-nudge, weekly-report, brag-harvest
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { resolveWorkDir } from "./lib/config.ts";
import { formatDate, isoDayOfWeek } from "./lib/dates.ts";

const WORK_DIR = resolveWorkDir();
const SCAFFOLD_DIR = resolve(dirname(import.meta.path), "..");
const TOOLS_DIR = join(SCAFFOLD_DIR, "tools");
const REPORTS_DIR = join(WORK_DIR, "reports");
const LAUNCH_AGENTS = join(homedir(), "Library", "LaunchAgents");
const PLIST_PREFIX = "com.tradecraft.";
const SERVE_PORT = process.env.SERVE_PORT ?? "3141";

// ── Job definitions ──

interface Job {
  name: string;
  /** cron-style for reference / display only; launchd uses calendar intervals */
  schedule: string;
  /** Human description */
  description: string;
  /** launchd CalendarInterval entries */
  calendar: CalendarInterval[];
  /** The tool to run, or null for custom logic */
  tool?: string;
  /** Extra CLI flags */
  flags?: string[];
  /** Subdirectory under reports/ */
  reportDir: string;
}

interface CalendarInterval {
  Weekday?: number | number[];
  Hour: number;
  Minute: number;
}

const JOBS: Record<string, Job> = {
  "monday-plan": {
    name: "monday-plan",
    schedule: "Mon 08:30",
    description: "Weekly plan from ledger + initiatives",
    calendar: [{ Weekday: 1, Hour: 8, Minute: 30 }],
    tool: "MondayPlan.ts",
    reportDir: "monday-plan",
  },
  "daily-brief": {
    name: "daily-brief",
    schedule: "Tue–Fri 07:45",
    description: "Yesterday's activity + today's promises",
    calendar: [
      { Weekday: 2, Hour: 7, Minute: 45 },
      { Weekday: 3, Hour: 7, Minute: 45 },
      { Weekday: 4, Hour: 7, Minute: 45 },
      { Weekday: 5, Hour: 7, Minute: 45 },
    ],
    tool: "DailyBrief.ts",
    reportDir: "daily-brief",
  },
  "eod-nudge": {
    name: "eod-nudge",
    schedule: "Mon–Fri 17:00",
    description: "Reminder if EOD summary not done",
    calendar: [
      { Weekday: 1, Hour: 17, Minute: 0 },
      { Weekday: 2, Hour: 17, Minute: 0 },
      { Weekday: 3, Hour: 17, Minute: 0 },
      { Weekday: 4, Hour: 17, Minute: 0 },
      { Weekday: 5, Hour: 17, Minute: 0 },
    ],
    reportDir: "", // no report file
  },
  "weekly-report": {
    name: "weekly-report",
    schedule: "Fri 16:00",
    description: "Manager-ready weekly summary draft",
    calendar: [{ Weekday: 5, Hour: 16, Minute: 0 }],
    tool: "WeeklyReport.ts",
    reportDir: "weekly-report",
  },
  "brag-harvest": {
    name: "brag-harvest",
    schedule: "Fri 16:30",
    description: "Sweep [BRAG?] EOD lines into BRAG.md",
    calendar: [{ Weekday: 5, Hour: 16, Minute: 30 }],
    tool: "BragHarvest.ts",
    reportDir: "", // writes directly to BRAG.md
  },
};

// ── Date helpers ──

function todayDublin(now?: Date): string {
  const d = now ?? new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Dublin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function weekdayDublin(now?: Date): string {
  const d = now ?? new Date();
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Dublin",
    weekday: "short",
  }).format(d);
}

// ── Notification ──

export function notify(title: string, message: string): void {
  console.log(`[${title}] ${message}`);
  if (process.platform === "darwin") {
    try {
      // Use AppleScript via stdin to avoid shell-escaping issues with
      // special characters (en-dashes, quotes, etc.)
      const script = `display notification "${message.replace(/["\\]/g, " ")}" with title "Work OS: ${title.replace(/["\\]/g, " ")}"`;
      execSync("osascript", {
        input: script,
        timeout: 5000,
      });
    } catch {
      // Non-fatal — notification is best-effort
    }
  }
}

// ── Job runner ──

export function runJob(jobName: string, dateOverride?: string): { wrote?: string; notified: string } | null {
  const job = JOBS[jobName];
  if (!job) {
    console.error(`Unknown job: ${jobName}. Available: ${Object.keys(JOBS).join(", ")}`);
    process.exit(1);
  }

  const today = dateOverride ?? todayDublin();

  // Special case: eod-nudge
  if (jobName === "eod-nudge") {
    return runEodNudge(today);
  }

  // Special case: brag-harvest (no --out, writes BRAG.md directly)
  if (jobName === "brag-harvest") {
    const toolPath = join(TOOLS_DIR, job.tool!);
    try {
      const output = execSync(`bun run "${toolPath}"`, {
        env: { ...process.env, WORK_DIR },
        encoding: "utf-8",
        timeout: 30000,
      }).trim();
      const msg = output || "No [BRAG?] entries to harvest";
      notify(job.description, msg);
      return { notified: msg };
    } catch (err: any) {
      const msg = `Failed: ${err.message?.split("\n")[0] ?? "unknown error"}`;
      notify(job.description, msg);
      return { notified: msg };
    }
  }

  // Standard tool: run with --out
  const outDir = join(REPORTS_DIR, job.reportDir);
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${today}.md`);

  const toolPath = join(TOOLS_DIR, job.tool!);
  const flags = job.flags ? job.flags.join(" ") : "";
  try {
    execSync(`bun run "${toolPath}" --out "${outFile}" ${flags}`.trim(), {
      env: { ...process.env, WORK_DIR },
      encoding: "utf-8",
      timeout: 30000,
    });
  } catch (err: any) {
    const msg = `Failed: ${err.message?.split("\n")[0] ?? "unknown error"}`;
    notify(job.description, msg);
    return { notified: msg };
  }

  const relPath = `reports/${job.reportDir}/${today}.md`;
  const msg = `${today} — saved to ${relPath}`;
  notify(job.description, msg);
  return { wrote: outFile, notified: msg };
}

function runEodNudge(today: string): { notified: string } | null {
  // Weekend guard — if today is a date override, derive weekday from it
  const ref = today !== todayDublin() ? new Date(`${today}T12:00:00Z`) : undefined;
  const wd = weekdayDublin(ref);
  if (wd === "Sat" || wd === "Sun") return null;

  const eodFile = join(WORK_DIR, "worklog", "eod", `${today}.md`);
  if (existsSync(eodFile)) return null; // Already done — no notification

  const msg = `No EOD file for ${today} — run: bun tools/EodSummary.ts --save`;
  notify("EOD Summary", msg);
  return { notified: msg };
}

// ── Plist generation ──

function plistLabel(jobName: string): string {
  return `${PLIST_PREFIX}${jobName}`;
}

function plistPath(jobName: string): string {
  return join(LAUNCH_AGENTS, `${plistLabel(jobName)}.plist`);
}

function calendarIntervalXml(intervals: CalendarInterval[]): string {
  return intervals
    .map((ci) => {
      // launchd needs one dict per weekday if Weekday is an array
      const lines = ["    <dict>"];
      if (ci.Weekday !== undefined) {
        lines.push(`      <key>Weekday</key><integer>${ci.Weekday}</integer>`);
      }
      lines.push(`      <key>Hour</key><integer>${ci.Hour}</integer>`);
      lines.push(`      <key>Minute</key><integer>${ci.Minute}</integer>`);
      lines.push("    </dict>");
      return lines.join("\n");
    })
    .join("\n");
}

function generatePlist(jobName: string): string {
  const job = JOBS[jobName];
  const label = plistLabel(jobName);
  const logDir = join(WORK_DIR, "logs");
  const bunPath = process.env.BUN_PATH ?? execSync("which bun", { encoding: "utf-8" }).trim();
  const scheduleTs = join(TOOLS_DIR, "schedule.ts");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${bunPath}</string>
    <string>run</string>
    <string>${scheduleTs}</string>
    <string>run</string>
    <string>${jobName}</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
${calendarIntervalXml(job.calendar)}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>WORK_DIR</key><string>${WORK_DIR}</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StandardOutPath</key><string>${join(logDir, `${jobName}-stdout.log`)}</string>
  <key>StandardErrorPath</key><string>${join(logDir, `${jobName}-stderr.log`)}</string>
  <key>WorkingDirectory</key><string>${SCAFFOLD_DIR}</string>
</dict>
</plist>`;
}

// ── Commands ──

function install(): void {
  mkdirSync(LAUNCH_AGENTS, { recursive: true });
  mkdirSync(join(WORK_DIR, "logs"), { recursive: true });

  for (const jobName of Object.keys(JOBS)) {
    const path = plistPath(jobName);
    const xml = generatePlist(jobName);
    writeFileSync(path, xml);
    try {
      execSync(`launchctl bootout gui/$(id -u) "${path}" 2>/dev/null || true`, { encoding: "utf-8" });
    } catch {}
    execSync(`launchctl bootstrap gui/$(id -u) "${path}"`, { encoding: "utf-8" });
    console.log(`  installed ${jobName} → ${path}`);
  }
  console.log(`\n${Object.keys(JOBS).length} jobs installed. Logs: ${join(WORK_DIR, "logs")}/`);
}

function uninstall(): void {
  for (const jobName of Object.keys(JOBS)) {
    const path = plistPath(jobName);
    if (!existsSync(path)) continue;
    try {
      execSync(`launchctl bootout gui/$(id -u) "${path}" 2>/dev/null || true`, { encoding: "utf-8" });
    } catch {}
    unlinkSync(path);
    console.log(`  removed ${jobName}`);
  }
  console.log("\nAll tradecraft jobs uninstalled.");
}

function status(): void {
  console.log("Work OS scheduled jobs:\n");
  for (const [name, job] of Object.entries(JOBS)) {
    const path = plistPath(name);
    const installed = existsSync(path);
    const marker = installed ? "✓" : "·";
    console.log(`  ${marker} ${name.padEnd(16)} ${job.schedule.padEnd(16)} ${job.description}`);
  }
  console.log(`\nReports: ${REPORTS_DIR}`);
}

// ── Main ──

const command = process.argv[2];

switch (command) {
  case "run": {
    const jobName = process.argv[3];
    if (!jobName) {
      console.error("Usage: bun tools/schedule.ts run <job>");
      console.error(`Jobs: ${Object.keys(JOBS).join(", ")}`);
      process.exit(1);
    }
    runJob(jobName, process.argv[4]); // optional date override for testing
    break;
  }
  case "run-all": {
    console.log("Running all jobs once (dry-run):\n");
    for (const jobName of Object.keys(JOBS)) {
      console.log(`── ${jobName} ──`);
      runJob(jobName);
      console.log();
    }
    break;
  }
  case "install":
    install();
    break;
  case "uninstall":
    uninstall();
    break;
  case "status":
    status();
    break;
  default:
    console.log(`Usage: bun tools/schedule.ts <install|uninstall|status|run <job>|run-all>`);
    process.exit(command ? 1 : 0);
}
