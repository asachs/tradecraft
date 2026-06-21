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
  const pai = join(claude, "PAI");

  // Only work-safe memory dirs
  for (const dir of ["WORK", "OBSERVABILITY", "STATE", "LEARNING"]) {
    mkdirSync(join(pai, "MEMORY", dir), { recursive: true });
  }

  // Only work-safe identity files
  mkdirSync(join(pai, "USER"), { recursive: true });
  writeFileSync(join(pai, "USER", "WORK_IDENTITY.md"), "# Work Identity");
  writeFileSync(join(pai, "USER", "DA_IDENTITY_WORK.md"), "# DA Work");

  // Clean settings.json (no forbidden patterns)
  writeFileSync(
    join(claude, "settings.json"),
    JSON.stringify({ hooks: {}, permissions: {} })
  );

  // Clean CLAUDE.md
  writeFileSync(join(claude, "CLAUDE.md"), "# PAI Work Profile\n");

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
    mkdirSync(join(home, ".claude", "PAI", "MEMORY", "RELATIONSHIP"), { recursive: true });

    const { stdout, exitCode } = runVerify(home);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("FAIL");
    expect(stdout).toContain("RELATIONSHIP");
  });

  test("detects forbidden USER directories", () => {
    const home = join(tmpDir, "telos");
    mkdirSync(home);
    createCleanProfile(home);

    mkdirSync(join(home, ".claude", "PAI", "USER", "TELOS"), { recursive: true });

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
      join(home, ".claude", "PAI", "USER", "PRINCIPAL_IDENTITY.md"),
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
    mkdirSync(join(home, ".claude", "PAI", "USER"), { recursive: true });
    writeFileSync(join(home, ".claude", "settings.json"), "{}");
    writeFileSync(join(home, ".claude", "CLAUDE.md"), "# Work");

    const { stdout, exitCode } = runVerify(home);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("0 failures");
  });
});
