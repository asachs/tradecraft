import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";

const toolsDir = resolve(import.meta.dir, "../tools");

let tmpDir: string;

beforeEach(() => {
  tmpDir = resolve(
    import.meta.dir,
    `_tmp_verify_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

function runVerify(
  homeDir: string,
  args: string[] = []
): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync({
    cmd: ["bun", resolve(toolsDir, "verify-isolation.ts"), ...args],
    env: { ...process.env, HOME: homeDir },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  };
}

/** Create a clean work-profile ~/.claude/ that should pass all checks. */
function createCleanProfile(homeDir: string) {
  const claude = join(homeDir, ".claude");
  const profile = join(claude, "LIFEOS");

  // Only work-safe memory dirs
  for (const dir of ["WORK", "OBSERVABILITY", "STATE", "LEARNING"]) {
    mkdirSync(join(profile, "MEMORY", dir), { recursive: true });
  }

  // Only work-safe identity files
  mkdirSync(join(profile, "USER"), { recursive: true });
  writeFileSync(join(profile, "USER", "WORK_IDENTITY.md"), "# Work Identity");
  writeFileSync(join(profile, "USER", "DA_IDENTITY_WORK.md"), "# DA Work");

  // Clean settings.json (no forbidden patterns)
  writeFileSync(
    join(claude, "settings.json"),
    JSON.stringify({ hooks: {}, permissions: {} })
  );

  // Clean CLAUDE.md
  writeFileSync(join(claude, "CLAUDE.md"), "# LifeOS Work Profile\n");

  // Only whitelisted hooks
  mkdirSync(join(claude, "hooks"), { recursive: true });
  for (const hook of [
    "SecurityPipeline.hook.ts",
    "PromptGuard.hook.ts",
    "PromptProcessing.hook.ts",
    "ContainmentGuard.hook.ts",
  ]) {
    writeFileSync(join(claude, "hooks", hook), `// ${hook}`);
  }

  // Only whitelisted skills
  mkdirSync(join(claude, "skills", "ISA"), { recursive: true });
  writeFileSync(join(claude, "skills", "ISA", "SKILL.md"), "# ISA");

  return claude;
}

describe("verify-isolation", () => {
  test("passes on a clean work profile", () => {
    const home = join(tmpDir, "clean");
    mkdirSync(home);
    createCleanProfile(home);

    const { stdout, exitCode } = runVerify(home);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("0 failures");
  });

  test("detects forbidden MEMORY directories", () => {
    const home = join(tmpDir, "dirty");
    mkdirSync(home);
    createCleanProfile(home);

    // Add a forbidden dir
    mkdirSync(join(home, ".claude", "LIFEOS", "MEMORY", "RELATIONSHIP"), { recursive: true });

    const { stdout, exitCode } = runVerify(home);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("FAIL");
    expect(stdout).toContain("RELATIONSHIP");
  });

  test("detects forbidden USER directories", () => {
    const home = join(tmpDir, "telos");
    mkdirSync(home);
    createCleanProfile(home);

    mkdirSync(join(home, ".claude", "LIFEOS", "USER", "TELOS"), { recursive: true });

    const { stdout, exitCode } = runVerify(home);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("FAIL");
    expect(stdout).toContain("TELOS");
  });

  test("detects forbidden USER files", () => {
    const home = join(tmpDir, "personal-files");
    mkdirSync(home);
    createCleanProfile(home);

    writeFileSync(
      join(home, ".claude", "LIFEOS", "USER", "PRINCIPAL_IDENTITY.md"),
      "# Personal"
    );

    const { stdout, exitCode } = runVerify(home);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("FAIL");
    expect(stdout).toContain("PRINCIPAL_IDENTITY");
  });

  test("detects forbidden patterns in settings.json", () => {
    const home = join(tmpDir, "patterns");
    mkdirSync(home);
    createCleanProfile(home);

    // Write settings with a forbidden pattern
    writeFileSync(
      join(home, ".claude", "settings.json"),
      JSON.stringify({ voice: "elevenlabs-api-key-here" })
    );

    const { stdout, exitCode } = runVerify(home);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("FAIL");
  });

  test("detects unexpected hooks", () => {
    const home = join(tmpDir, "bad-hooks");
    mkdirSync(home);
    createCleanProfile(home);

    // Add a non-whitelisted hook
    writeFileSync(
      join(home, ".claude", "hooks", "RelationshipMemory.hook.ts"),
      "// personal"
    );

    const { stdout, exitCode } = runVerify(home);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("FAIL");
    expect(stdout).toContain("RelationshipMemory");
  });

  test("detects unexpected skills", () => {
    const home = join(tmpDir, "bad-skills");
    mkdirSync(home);
    createCleanProfile(home);

    // Add a non-whitelisted skill
    mkdirSync(join(home, ".claude", "skills", "Telos"), { recursive: true });
    writeFileSync(
      join(home, ".claude", "skills", "Telos", "SKILL.md"),
      "# Telos"
    );

    const { stdout, exitCode } = runVerify(home);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("FAIL");
    expect(stdout).toContain("Telos");
  });

  test("passes when no hooks or skills dir exists (pre-bootstrap)", () => {
    const home = join(tmpDir, "bare");
    mkdirSync(home);
    mkdirSync(join(home, ".claude", "LIFEOS", "USER"), { recursive: true });
    writeFileSync(join(home, ".claude", "settings.json"), "{}");
    writeFileSync(join(home, ".claude", "CLAUDE.md"), "# LifeOS Work Profile");

    const { stdout, exitCode } = runVerify(home);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("0 failures");
  });
  test("exits 2 when ~/.claude has no work-profile marker", () => {
    const home = join(tmpDir, "personal");
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude", "CLAUDE.md"), "# My personal assistant\n");

    const { stderr, exitCode } = runVerify(home);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("does not look like a work profile");
    expect(stderr).toContain("--force");
  });

  test("exits 2 when ~/.claude has no CLAUDE.md at all", () => {
    const home = join(tmpDir, "empty");
    mkdirSync(join(home, ".claude"), { recursive: true });

    const { exitCode } = runVerify(home);
    expect(exitCode).toBe(2);
  });

  test("--force audits anyway on a non-work-profile machine", () => {
    const home = join(tmpDir, "forced");
    mkdirSync(join(home, ".claude", "LIFEOS", "USER"), { recursive: true });
    writeFileSync(join(home, ".claude", "CLAUDE.md"), "# My personal assistant\n");
    writeFileSync(join(home, ".claude", "settings.json"), "{}");

    const { stdout, exitCode } = runVerify(home, ["--force"]);
    expect(exitCode).not.toBe(2);
    expect(stdout).toContain("checks,");
  });

  test("truncates long unexpected lists instead of dumping every name", () => {
    const home = join(tmpDir, "many");
    mkdirSync(join(home, ".claude", "LIFEOS", "USER"), { recursive: true });
    writeFileSync(join(home, ".claude", "CLAUDE.md"), "# LifeOS Work Profile");
    writeFileSync(join(home, ".claude", "settings.json"), "{}");
    for (let i = 0; i < 25; i++) {
      const skill = join(home, ".claude", "skills", `Bogus${i}`);
      mkdirSync(skill, { recursive: true });
      writeFileSync(join(skill, "SKILL.md"), "# Bogus");
    }

    const { stdout, exitCode } = runVerify(home);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("25 unexpected:");
    expect(stdout).toContain("and 15 more");
  });
});
