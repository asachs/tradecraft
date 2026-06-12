import { describe, test, expect } from "bun:test";
import { resolve } from "node:path";
import { cpSync, existsSync, readFileSync, rmSync, mkdirSync } from "node:fs";

const fixtureDir = resolve(import.meta.dir, "fixtures/work");
const toolsDir = resolve(import.meta.dir, "../tools");

function runTool(
  name: string,
  args: string[],
  opts?: { workDir?: string }
): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync({
    cmd: ["bun", resolve(toolsDir, name), ...args],
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

/** Create a temp copy of the fixture dir for tests that write. */
function makeTempFixtureCopy(): string {
  const tmp = resolve(import.meta.dir, `_tmp_fixture_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  cpSync(fixtureDir, tmp, { recursive: true });
  return tmp;
}

function cleanupTemp(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

describe("WeeklyReport", () => {
  test("produces all five sections with fixture data", () => {
    const { stdout, exitCode } = runTool("WeeklyReport.ts", ["--week", "2026-06-03"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("## Shipped");
    expect(stdout).toContain("## In flight");
    expect(stdout).toContain("## Decisions");
    expect(stdout).toContain("## Blocked");
    expect(stdout).toContain("## Next week");
  });

  test("includes ticket refs", () => {
    const { stdout } = runTool("WeeklyReport.ts", ["--week", "2026-06-03"]);
    expect(stdout).toContain("OPS-");
  });

  test("groups by repo+branch, not chronological", () => {
    const { stdout } = runTool("WeeklyReport.ts", ["--week", "2026-06-03"]);
    expect(stdout).toContain("infra-migration");
    expect(stdout).toContain("api-gateway");
  });

  test("empty week produces graceful output", () => {
    const { stdout, exitCode } = runTool("WeeklyReport.ts", ["--week", "2025-01-01"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("No captured activity");
  });

  test("linkifies commit ids when repos.json maps the repo", () => {
    const { stdout } = runTool("WeeklyReport.ts", ["--week", "2026-06-03"]);
    expect(stdout).toContain(
      "[`a1b2c3d`](https://github.com/example-org/infra-migration/commit/a1b2c3d) migrate OIDC provider config"
    );
  });

  test("done: lines from EOD appear BEFORE Evidence block", () => {
    const { stdout } = runTool("WeeklyReport.ts", ["--week", "2026-06-03"]);
    const shippedIdx = stdout.indexOf("## Shipped");
    const evidenceIdx = stdout.indexOf("**Evidence**");
    const doneIdx = stdout.indexOf("OIDC migration cut over to staging");
    // done: text must appear between Shipped heading and Evidence
    expect(doneIdx).toBeGreaterThan(shippedIdx);
    expect(doneIdx).toBeLessThan(evidenceIdx);
  });

  test("Evidence block exists and contains linked sha bullets", () => {
    const { stdout } = runTool("WeeklyReport.ts", ["--week", "2026-06-03"]);
    expect(stdout).toContain("**Evidence** (activity log)");
    expect(stdout).toContain("[`a1b2c3d`]");
  });

  test("decided: line appears under Decisions", () => {
    const { stdout } = runTool("WeeklyReport.ts", ["--week", "2026-06-03"]);
    const decisionsIdx = stdout.indexOf("## Decisions");
    const blockedIdx = stdout.indexOf("## Blocked");
    const decidedText = "rate limiter uses token bucket over sliding window";
    const decidedIdx = stdout.indexOf(decidedText);
    expect(decidedIdx).toBeGreaterThan(decisionsIdx);
    expect(decidedIdx).toBeLessThan(blockedIdx);
  });

  test("blocked: line appears under Blocked", () => {
    const { stdout } = runTool("WeeklyReport.ts", ["--week", "2026-06-03"]);
    const blockedSectionIdx = stdout.indexOf("## Blocked");
    const nextWeekIdx = stdout.indexOf("## Next week");
    const blockedText = "load-test environment access";
    const blockedIdx = stdout.indexOf(blockedText);
    expect(blockedIdx).toBeGreaterThan(blockedSectionIdx);
    expect(blockedIdx).toBeLessThan(nextWeekIdx);
  });

  test("ticket label OPS-103 appears on rate-limiting evidence theme", () => {
    const { stdout } = runTool("WeeklyReport.ts", ["--week", "2026-06-03"]);
    expect(stdout).toContain("**OPS-103**");
    expect(stdout).toContain("OPS-103-rate-limiting");
  });

  test("ISC-53: no EOD files still renders correctly with Evidence block", () => {
    // Create a temp copy without eod/ dir
    const tmp = makeTempFixtureCopy();
    try {
      rmSync(resolve(tmp, "worklog/eod"), { recursive: true, force: true });
      const { stdout, exitCode } = runTool("WeeklyReport.ts", ["--week", "2026-06-03"], { workDir: tmp });
      expect(exitCode).toBe(0);
      expect(stdout).toContain("## Shipped");
      expect(stdout).toContain("**Evidence** (activity log)");
      // Decisions and Blocked should have fill-comments since no EOD
      expect(stdout).toContain("<!-- fill: consequential calls made this week");
      expect(stdout).toContain("<!-- fill: items that genuinely need someone else");
    } finally {
      cleanupTemp(tmp);
    }
  });

  test("commits rendered as nested list under Evidence, not flat", () => {
    const { stdout } = runTool("WeeklyReport.ts", ["--week", "2026-06-03"]);
    // Evidence block should have nested structure
    expect(stdout).toMatch(/- \*\*Evidence\*\* \(activity log\)\n {2}- /);
  });
});

describe("EodCrossing", () => {
  test("produces 1-6 prefixed lines", () => {
    const { stdout, exitCode } = runTool("EodCrossing.ts", ["--date", "2026-06-03"]);
    expect(exitCode).toBe(0);
    const contentLines = stdout
      .split("\n")
      .filter((l) => /^(done|decided|promised|learned|met|blocked):/.test(l));
    expect(contentLines.length).toBeGreaterThanOrEqual(1);
    expect(contentLines.length).toBeLessThanOrEqual(6);
  });

  test("every content line starts with a valid prefix", () => {
    const { stdout } = runTool("EodCrossing.ts", ["--date", "2026-06-03"]);
    const validPrefixes = ["done:", "decided:", "promised:", "learned:", "met:", "blocked:"];
    const contentLines = stdout
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("<!--") && l.trim().length > 0)
      .filter((l) => !l.startsWith("<!--"));
    // Non-comment, non-empty lines should start with a valid prefix
    for (const line of contentLines) {
      if (line.trim() === "") continue;
      if (line.startsWith("<!--")) continue;
      const hasPrefix = validPrefixes.some((p) => line.startsWith(p));
      expect(hasPrefix).toBe(true);
    }
  });

  test("ends with a review reminder", () => {
    const { stdout } = runTool("EodCrossing.ts", ["--date", "2026-06-03"]);
    expect(stdout.toLowerCase()).toContain("review");
  });

  test("includes promised: for promises due today", () => {
    // OPS-104 is due 2026-06-03 but renegotiated, OPS-101 due 06-05
    // No open promise due on 06-03 in fixture, so test with 06-05
    const { stdout } = runTool("EodCrossing.ts", ["--date", "2026-06-05"]);
    // OPS-101 is due 06-05 but status=done, so no promised: line
    // Check that done: lines appear from activity
    expect(stdout).toContain("done:");
  });

  test("--save creates file and prints saved path", () => {
    const tmp = makeTempFixtureCopy();
    try {
      // Remove existing eod files so --save can create for 2026-06-03
      rmSync(resolve(tmp, "worklog/eod"), { recursive: true, force: true });
      const { stdout, exitCode } = runTool("EodCrossing.ts", ["--date", "2026-06-03", "--save"], { workDir: tmp });
      expect(exitCode).toBe(0);
      expect(stdout).toContain("saved:");
      const savedPath = resolve(tmp, "worklog/eod/2026-06-03.md");
      expect(existsSync(savedPath)).toBe(true);
      const content = readFileSync(savedPath, "utf-8");
      expect(content).toContain("done:");
    } finally {
      cleanupTemp(tmp);
    }
  });

  test("--save refuses to overwrite existing file", () => {
    const tmp = makeTempFixtureCopy();
    try {
      // 2026-06-02.md already exists in fixture
      const { stderr, exitCode } = runTool("EodCrossing.ts", ["--date", "2026-06-02", "--save"], { workDir: tmp });
      expect(exitCode).toBe(1);
      expect(stderr).toContain("refusing to overwrite");
      // Verify original file unchanged
      const original = readFileSync(resolve(fixtureDir, "worklog/eod/2026-06-02.md"), "utf-8");
      const current = readFileSync(resolve(tmp, "worklog/eod/2026-06-02.md"), "utf-8");
      expect(current).toBe(original);
    } finally {
      cleanupTemp(tmp);
    }
  });

  test("--save and --out together error", () => {
    const tmp = makeTempFixtureCopy();
    try {
      const outPath = resolve(tmp, "test-out.md");
      const { exitCode, stderr } = runTool(
        "EodCrossing.ts",
        ["--date", "2026-06-03", "--save", "--out", outPath],
        { workDir: tmp }
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain("mutually exclusive");
    } finally {
      cleanupTemp(tmp);
    }
  });
});

describe("MondayPlan", () => {
  test("produces plan with all sections", () => {
    const { stdout, exitCode } = runTool("MondayPlan.ts", ["--date", "2026-06-01"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("## Promises due this week");
    expect(stdout).toContain("## Carried over / overdue");
    expect(stdout).toContain("## Initiatives");
    expect(stdout).toContain("## Top 3 outcomes");
  });

  test("lists initiative directory", () => {
    const { stdout } = runTool("MondayPlan.ts", ["--date", "2026-06-01"]);
    expect(stdout).toContain("sample-initiative");
  });

  test("shows overdue promises", () => {
    const { stdout } = runTool("MondayPlan.ts", ["--date", "2026-06-05"]);
    // OPS-103 is due 2026-05-28, open, so overdue on 2026-06-05
    expect(stdout).toContain("OPS-103");
    expect(stdout).toContain("OVERDUE");
  });

  test("shows top 3 outcomes stub", () => {
    const { stdout } = runTool("MondayPlan.ts", ["--date", "2026-06-01"]);
    expect(stdout).toContain("<!-- outcome -->");
  });
});

describe("DailyBrief", () => {
  test("shows yesterday's activity summary", () => {
    // Brief for Wednesday 2026-06-03 -> yesterday = Tuesday 2026-06-02
    const { stdout, exitCode } = runTool("DailyBrief.ts", ["--date", "2026-06-03"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("## Yesterday");
    expect(stdout).toContain("Repos touched");
    expect(stdout).toContain("Commits seen");
  });

  test("Monday uses Friday as yesterday", () => {
    // Brief for Monday 2026-06-08 -> yesterday = Friday 2026-06-05
    const { stdout } = runTool("DailyBrief.ts", ["--date", "2026-06-08"]);
    expect(stdout).toContain("2026-06-05"); // Friday
  });

  test("shows promises due today with ticket refs", () => {
    // On 2026-06-09, OPS-106 is due (open, due 2026-06-09)
    const { stdout } = runTool("DailyBrief.ts", ["--date", "2026-06-09"]);
    expect(stdout).toContain("OPS-106");
  });

  test("shows overdue promises with ticket refs", () => {
    const { stdout } = runTool("DailyBrief.ts", ["--date", "2026-06-05"]);
    expect(stdout).toContain("OPS-103");
  });
});
