import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";

const toolsDir = resolve(import.meta.dir, "../tools");

/** Create a fake PAI directory structure for testing. */
function createFakePAI(base: string) {
  const claude = join(base, ".claude");
  const pai = join(claude, "PAI");

  // PAI dirs
  for (const dir of ["ALGORITHM", "DOCUMENTATION", "TOOLS"]) {
    mkdirSync(join(pai, dir), { recursive: true });
    writeFileSync(join(pai, dir, "test.md"), `# ${dir}`);
  }
  // Nested DOCUMENTATION subdir
  mkdirSync(join(pai, "DOCUMENTATION", "sub"), { recursive: true });
  writeFileSync(join(pai, "DOCUMENTATION", "sub", "nested.md"), "nested");

  // Hooks
  const hooksDir = join(claude, "hooks");
  mkdirSync(hooksDir, { recursive: true });
  for (const hook of [
    "SecurityPipeline.hook.ts",
    "PromptGuard.hook.ts",
    "RepeatDetection.hook.ts",
    "ISASync.hook.ts",
    "ToolActivityTracker.hook.ts",
    "ContentScanner.hook.ts",
    "PreCompact.hook.ts",
    "PromptProcessing.hook.ts",
    "ContainmentGuard.hook.ts",
  ]) {
    writeFileSync(join(hooksDir, hook), `// ${hook}`);
  }

  // Hook lib/
  mkdirSync(join(hooksDir, "lib"), { recursive: true });
  writeFileSync(join(hooksDir, "lib", "paths.ts"), "export const p = 1;");

  // Hook security/ with inspectors/
  mkdirSync(join(hooksDir, "security", "inspectors"), { recursive: true });
  writeFileSync(join(hooksDir, "security", "pipeline.ts"), "export const p = 1;");
  writeFileSync(join(hooksDir, "security", "types.ts"), "export type T = {};");
  writeFileSync(
    join(hooksDir, "security", "inspectors", "PatternInspector.ts"),
    "export const i = 1;"
  );

  // Skills (with nested dirs)
  const skillsDir = join(claude, "skills");
  mkdirSync(join(skillsDir, "ISA", "Workflows"), { recursive: true });
  writeFileSync(join(skillsDir, "ISA", "SKILL.md"), "# ISA");
  writeFileSync(join(skillsDir, "ISA", "Workflows", "Scaffold.md"), "scaffold");

  mkdirSync(join(skillsDir, "Research", "Workflows"), { recursive: true });
  writeFileSync(join(skillsDir, "Research", "SKILL.md"), "# Research");
  writeFileSync(join(skillsDir, "Research", "Workflows", "Quick.md"), "quick");

  // A skill that's just a .md file
  writeFileSync(join(skillsDir, "Council.md"), "# Council");

  return claude;
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = resolve(
    import.meta.dir,
    `_tmp_archive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

function runArchiveBuilder(
  args: string[],
  homeDir: string
): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync({
    cmd: ["bun", resolve(toolsDir, "build-work-archive.ts"), ...args],
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

describe("build-work-archive", () => {
  test("--dry-run produces manifest without creating archive", () => {
    const fakeHome = join(tmpDir, "home");
    mkdirSync(fakeHome);
    createFakePAI(fakeHome);

    const { stdout, exitCode } = runArchiveBuilder(
      ["--dry-run", "--out", join(tmpDir, "out")],
      fakeHome
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("--dry-run: no archive created");
    expect(stdout).toContain("hooks/SecurityPipeline.hook.ts");
    expect(stdout).toContain("hooks/security/pipeline.ts");
    expect(stdout).toContain("hooks/security/inspectors/PatternInspector.ts");
    expect(stdout).toContain("hooks/lib/paths.ts");
    expect(stdout).toContain("skills/ISA/SKILL.md");
    expect(stdout).toContain("skills/ISA/Workflows/Scaffold.md");
    expect(stdout).toContain("skills/Research/Workflows/Quick.md");
    expect(stdout).toContain("PAI/ALGORITHM/test.md");
    expect(stdout).toContain("PAI/DOCUMENTATION/sub/nested.md");
  });

  test("includes skill .md files (non-directory skills)", () => {
    const fakeHome = join(tmpDir, "home");
    mkdirSync(fakeHome);
    createFakePAI(fakeHome);

    const { stdout } = runArchiveBuilder(["--dry-run"], fakeHome);
    expect(stdout).toContain("skills/Council.md");
  });

  test("warns about missing hooks but does not fail", () => {
    const fakeHome = join(tmpDir, "home");
    mkdirSync(fakeHome);
    const claude = createFakePAI(fakeHome);

    // Remove one hook
    rmSync(join(claude, "hooks", "PreCompact.hook.ts"));

    const { stdout, stderr, exitCode } = runArchiveBuilder(["--dry-run"], fakeHome);
    expect(exitCode).toBe(0);
    expect(stderr).toContain("hooks/PreCompact.hook.ts");
  });

  test("warns about missing skills but does not fail", () => {
    const fakeHome = join(tmpDir, "home");
    mkdirSync(fakeHome);
    createFakePAI(fakeHome);
    // Fabric skill doesn't exist in our fake setup

    const { stderr, exitCode } = runArchiveBuilder(["--dry-run"], fakeHome);
    expect(exitCode).toBe(0);
    expect(stderr).toContain("skills/Fabric");
  });

  test("fails when PAI root does not exist", () => {
    const fakeHome = join(tmpDir, "empty-home");
    mkdirSync(fakeHome);

    const { stderr, exitCode } = runArchiveBuilder(["--dry-run"], fakeHome);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("PAI root not found");
  });

  test("creates a valid tar.gz archive", () => {
    const fakeHome = join(tmpDir, "home");
    mkdirSync(fakeHome);
    createFakePAI(fakeHome);
    const outDir = join(tmpDir, "out");

    const { exitCode } = runArchiveBuilder(["--out", outDir], fakeHome);
    expect(exitCode).toBe(0);

    // Archive should exist
    const files = readdirSync(outDir).filter((f) => f.endsWith(".tar.gz"));
    expect(files.length).toBe(1);

    // Extract and verify contents
    const extractDir = join(tmpDir, "extracted");
    mkdirSync(extractDir);
    const tar = Bun.spawnSync({
      cmd: ["tar", "xzf", join(outDir, files[0]), "-C", extractDir],
    });
    expect(tar.exitCode).toBe(0);

    // Check key files exist in extracted archive
    expect(existsSync(join(extractDir, "hooks", "SecurityPipeline.hook.ts"))).toBe(true);
    expect(existsSync(join(extractDir, "hooks", "security", "pipeline.ts"))).toBe(true);
    expect(
      existsSync(join(extractDir, "hooks", "security", "inspectors", "PatternInspector.ts"))
    ).toBe(true);
    expect(existsSync(join(extractDir, "hooks", "lib", "paths.ts"))).toBe(true);
    expect(existsSync(join(extractDir, "skills", "ISA", "Workflows", "Scaffold.md"))).toBe(true);
    expect(existsSync(join(extractDir, "PAI", "DOCUMENTATION", "sub", "nested.md"))).toBe(true);
  });

  test("cleans up staging directory after build", () => {
    const fakeHome = join(tmpDir, "home");
    mkdirSync(fakeHome);
    createFakePAI(fakeHome);
    const outDir = join(tmpDir, "out");

    runArchiveBuilder(["--out", outDir], fakeHome);

    // No .staging-* dirs should remain
    const leftover = readdirSync(outDir).filter((f) => f.startsWith(".staging-"));
    expect(leftover.length).toBe(0);
  });
});
