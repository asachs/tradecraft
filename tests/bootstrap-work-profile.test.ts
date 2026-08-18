import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const toolsDir = resolve(import.meta.dir, "../tools");
const scaffoldDir = resolve(import.meta.dir, "..");

let tmpDir: string;

beforeEach(() => {
  tmpDir = resolve(
    import.meta.dir,
    `_tmp_bootstrap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

function runBootstrap(
  homeDir: string,
  args: string[]
): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync({
    cmd: ["bun", resolve(toolsDir, "bootstrap-work-profile.ts"), ...args],
    env: {
      ...process.env,
      HOME: homeDir,
      WORK_DIR: join(homeDir, "work"),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  };
}

describe("bootstrap-work-profile", () => {
  test("--skip-archive creates directory structure", () => {
    const home = join(tmpDir, "home");
    mkdirSync(join(home, ".claude"), { recursive: true });

    const { stdout, exitCode } = runBootstrap(home, ["--skip-archive"]);
    expect(exitCode).toBe(0);

    // Memory dirs created
    expect(existsSync(join(home, ".claude", "LIFEOS", "MEMORY", "WORK"))).toBe(true);
    expect(existsSync(join(home, ".claude", "LIFEOS", "MEMORY", "OBSERVABILITY"))).toBe(true);
    expect(existsSync(join(home, ".claude", "LIFEOS", "MEMORY", "STATE"))).toBe(true);
    expect(existsSync(join(home, ".claude", "LIFEOS", "MEMORY", "LEARNING"))).toBe(true);

    // Identity files installed
    expect(existsSync(join(home, ".claude", "LIFEOS", "USER", "WORK_IDENTITY.md"))).toBe(true);
    expect(existsSync(join(home, ".claude", "LIFEOS", "USER", "DA_IDENTITY_WORK.md"))).toBe(true);

    // Work dirs created
    expect(existsSync(join(home, "work", "worklog", "eod"))).toBe(true);
    expect(existsSync(join(home, "work", "initiatives"))).toBe(true);
    expect(existsSync(join(home, "work", "reports"))).toBe(true);
  });

  test("installs lead-measures.md to work dir", () => {
    const home = join(tmpDir, "home");
    mkdirSync(join(home, ".claude"), { recursive: true });

    runBootstrap(home, ["--skip-archive"]);

    const leadMeasures = join(home, "work", "lead-measures.md");
    expect(existsSync(leadMeasures)).toBe(true);
    const content = readFileSync(leadMeasures, "utf-8");
    expect(content).toContain("Lead Measures");
  });

  test("does not overwrite existing files without --force", () => {
    const home = join(tmpDir, "home");
    mkdirSync(join(home, ".claude", "LIFEOS", "USER"), { recursive: true });

    // Pre-populate identity file
    const identityPath = join(home, ".claude", "LIFEOS", "USER", "WORK_IDENTITY.md");
    writeFileSync(identityPath, "# My Custom Identity");

    runBootstrap(home, ["--skip-archive"]);

    // Should NOT have been overwritten
    const content = readFileSync(identityPath, "utf-8");
    expect(content).toBe("# My Custom Identity");
  });

  test("--force overwrites existing files", () => {
    const home = join(tmpDir, "home");
    mkdirSync(join(home, ".claude", "LIFEOS", "USER"), { recursive: true });

    // Pre-populate identity file
    const identityPath = join(home, ".claude", "LIFEOS", "USER", "WORK_IDENTITY.md");
    writeFileSync(identityPath, "# My Custom Identity");

    runBootstrap(home, ["--skip-archive", "--force"]);

    // Should have been overwritten with template
    const content = readFileSync(identityPath, "utf-8");
    expect(content).toContain("Work Identity");
    expect(content).not.toBe("# My Custom Identity");
  });

  test("fails without archive argument or --skip-archive", () => {
    const home = join(tmpDir, "home");
    mkdirSync(home);

    const { exitCode, stderr } = runBootstrap(home, []);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("usage:");
  });
});
