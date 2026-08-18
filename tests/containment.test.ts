import { describe, test, expect, afterAll } from "bun:test";
import { resolve, join } from "node:path";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { isUnderWorkDir } from "../tools/lib/config.ts";

const toolsDir = resolve(import.meta.dir, "../tools");

/** Tools that accept --out and must contain writes to WORK_DIR. */
const OUT_TOOLS = [
  "EodSummary.ts",
  "WeeklyReport.ts",
  "DailyBrief.ts",
  "MondayPlan.ts",
  "Reconcile.ts",
];

const sandbox = resolve(import.meta.dir, `_tmp_containment_${Date.now()}`);
const workDir = join(sandbox, "work");
// Sibling sharing the "work" prefix — the exact shape the old startsWith check let through.
const siblingDir = join(sandbox, "work-archives");

mkdirSync(join(workDir, "reports"), { recursive: true });
mkdirSync(siblingDir, { recursive: true });

afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

function runTool(name: string, args: string[]) {
  const result = Bun.spawnSync({
    cmd: ["bun", resolve(toolsDir, name), ...args],
    env: { ...process.env, WORK_DIR: workDir },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { stderr: result.stderr.toString(), exitCode: result.exitCode };
}

describe("isUnderWorkDir", () => {
  test("accepts a path inside the work dir", () => {
    expect(isUnderWorkDir("/home/u/work", "/home/u/work/reports/x.md")).toBe(true);
  });

  test("accepts a nested path", () => {
    expect(isUnderWorkDir("/home/u/work", "/home/u/work/a/b/c.md")).toBe(true);
  });

  test("rejects a sibling dir sharing the prefix", () => {
    // Regression: startsWith() returned true here, letting writes escape WORK_DIR.
    expect(isUnderWorkDir("/home/u/work", "/home/u/work-archives/x.md")).toBe(false);
    expect(isUnderWorkDir("/home/u/work", "/home/u/workstuff.md")).toBe(false);
  });

  test("rejects a path outside entirely", () => {
    expect(isUnderWorkDir("/home/u/work", "/tmp/x.md")).toBe(false);
  });

  test("rejects traversal back out of the work dir", () => {
    expect(isUnderWorkDir("/home/u/work", "/home/u/work/../escaped.md")).toBe(false);
  });

  test("rejects the work dir itself (--out names a file)", () => {
    expect(isUnderWorkDir("/home/u/work", "/home/u/work")).toBe(false);
  });

  test("normalises a trailing separator on the work dir", () => {
    expect(isUnderWorkDir("/home/u/work/", "/home/u/work/x.md")).toBe(true);
    expect(isUnderWorkDir("/home/u/work/", "/home/u/work-archives/x.md")).toBe(false);
  });
});

describe("--out containment (all report tools)", () => {
  for (const tool of OUT_TOOLS) {
    test(`${tool} refuses a sibling dir sharing the WORK_DIR prefix`, () => {
      const escaped = join(siblingDir, `escaped-${tool}.md`);
      const { stderr, exitCode } = runTool(tool, ["--out", escaped]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("must be under WORK_DIR");
      expect(existsSync(escaped)).toBe(false);
    });

    test(`${tool} still accepts a path inside WORK_DIR`, () => {
      const ok = join(workDir, "reports", `ok-${tool}.md`);
      const { exitCode } = runTool(tool, ["--out", ok]);
      expect(exitCode).toBe(0);
      expect(existsSync(ok)).toBe(true);
    });
  }
});
