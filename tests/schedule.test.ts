import { describe, test, expect, afterAll } from "bun:test";
import { resolve } from "node:path";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";

const toolsDir = resolve(import.meta.dir, "../tools");
const fixtureDir = resolve(import.meta.dir, "fixtures/work");

function runSchedule(
  args: string[],
  opts?: { workDir?: string },
): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync({
    cmd: ["bun", resolve(toolsDir, "schedule.ts"), ...args],
    env: { ...process.env, WORK_DIR: opts?.workDir ?? fixtureDir },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  };
}

// Temp dirs to clean up
const tempDirs: string[] = [];
function makeTempDir(): string {
  const tmp = resolve(import.meta.dir, `_tmp_sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(tmp, { recursive: true });
  tempDirs.push(tmp);
  return tmp;
}
afterAll(() => tempDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("schedule.ts status", () => {
  test("lists all five jobs", () => {
    const { stdout, exitCode } = runSchedule(["status"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("monday-plan");
    expect(stdout).toContain("daily-brief");
    expect(stdout).toContain("eod-nudge");
    expect(stdout).toContain("weekly-report");
    expect(stdout).toContain("brag-harvest");
  });
});

describe("schedule.ts run monday-plan", () => {
  test("creates report file in reports/monday-plan/", () => {
    const tmp = makeTempDir();
    const { stdout, exitCode } = runSchedule(["run", "monday-plan"], { workDir: tmp });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("saved to reports/monday-plan/");
    // Find the created file
    const reportDir = resolve(tmp, "reports/monday-plan");
    expect(existsSync(reportDir)).toBe(true);
    const files = Bun.spawnSync({ cmd: ["ls", reportDir], stdout: "pipe" }).stdout.toString().trim().split("\n");
    expect(files.length).toBeGreaterThanOrEqual(1);
    const content = readFileSync(resolve(reportDir, files[0]), "utf-8");
    expect(content).toContain("# Monday Plan");
  });
});

describe("schedule.ts run daily-brief", () => {
  test("creates report file in reports/daily-brief/", () => {
    const tmp = makeTempDir();
    const { stdout, exitCode } = runSchedule(["run", "daily-brief"], { workDir: tmp });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("saved to reports/daily-brief/");
    const reportDir = resolve(tmp, "reports/daily-brief");
    expect(existsSync(reportDir)).toBe(true);
  });
});

describe("schedule.ts run weekly-report", () => {
  test("creates report file in reports/weekly-report/", () => {
    const tmp = makeTempDir();
    const { stdout, exitCode } = runSchedule(["run", "weekly-report"], { workDir: tmp });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("saved to reports/weekly-report/");
    const reportDir = resolve(tmp, "reports/weekly-report");
    expect(existsSync(reportDir)).toBe(true);
  });
});

describe("schedule.ts run eod-nudge", () => {
  test("nudges when no EOD file for a weekday", () => {
    const tmp = makeTempDir();
    // 2026-06-12 is a Friday
    const { stdout, exitCode } = runSchedule(["run", "eod-nudge", "2026-06-12"], { workDir: tmp });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("No EOD file for 2026-06-12");
    expect(stdout).toContain("bun tools/EodCrossing.ts --save");
  });

  test("silent when EOD file exists", () => {
    const tmp = makeTempDir();
    mkdirSync(resolve(tmp, "worklog/eod"), { recursive: true });
    writeFileSync(resolve(tmp, "worklog/eod/2026-06-12.md"), "done: tested\n");
    const { stdout, exitCode } = runSchedule(["run", "eod-nudge", "2026-06-12"], { workDir: tmp });
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
  });

  test("silent on weekends", () => {
    const tmp = makeTempDir();
    // 2026-06-14 is a Sunday
    const { stdout, exitCode } = runSchedule(["run", "eod-nudge", "2026-06-14"], { workDir: tmp });
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
  });
});

describe("schedule.ts run brag-harvest", () => {
  test("reports nothing to harvest for empty workdir", () => {
    const tmp = makeTempDir();
    const { stdout, exitCode } = runSchedule(["run", "brag-harvest"], { workDir: tmp });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("nothing to harvest");
  });
});

describe("schedule.ts run-all", () => {
  test("runs all jobs without error", () => {
    const tmp = makeTempDir();
    const { stdout, exitCode } = runSchedule(["run-all"], { workDir: tmp });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("monday-plan");
    expect(stdout).toContain("daily-brief");
    expect(stdout).toContain("eod-nudge");
    expect(stdout).toContain("weekly-report");
    expect(stdout).toContain("brag-harvest");
  });
});

describe("schedule.ts unknown job", () => {
  test("rejects unknown job name", () => {
    const { exitCode, stderr } = runSchedule(["run", "nonexistent"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unknown job");
  });
});
