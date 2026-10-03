import { describe, test, expect, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { splitAnswer, mergePatterns, mask, readPatterns, collisions, REPO_FILE, CONTAINMENT_FILE } from "../tools/setup-identity.ts";

const sandbox = resolve(import.meta.dir, `_tmp_setup_identity_${Date.now()}`);
mkdirSync(sandbox, { recursive: true });
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

const tool = resolve(import.meta.dir, "../tools/setup-identity.ts");
function run(args: string[]) {
  const r = Bun.spawnSync({ cmd: ["bun", tool, ...args], stdout: "pipe", stderr: "pipe" });
  return { out: r.stdout.toString() + r.stderr.toString(), code: r.exitCode };
}

describe("helpers", () => {
  test("splitAnswer trims and drops blanks", () => {
    expect(splitAnswer(" a, b ,, c ")).toEqual(["a", "b", "c"]);
    expect(splitAnswer("")).toEqual([]);
  });

  test("mergePatterns de-duplicates case-insensitively and sorts", () => {
    expect(mergePatterns(["Beta", "alpha"], ["ALPHA", "gamma", " "])).toEqual(["alpha", "Beta", "gamma"]);
  });

  test("mask never reveals more than the first character", () => {
    expect(mask("Someone")).toBe("S******");
    expect(mask("x")).toBe("*");
  });

  test("collisions finds a string the repo already contains, and not one it does not", () => {
    // Built at runtime so this file (which is itself tracked) never contains the probe literally.
    const absent = ["zz", "no-such", "string", "zz"].join("-");
    const hits = collisions(["Review before sharing", absent]);
    expect(hits.has("Review before sharing")).toBe(true);
    expect(hits.get("Review before sharing")!.first).toMatch(/\.md:\d+$/);
    expect(hits.has(absent)).toBe(false);
  });
});

describe("--add writes both gitignored files under --dir", () => {
  const dir = join(sandbox, "templates");
  const repo = join(dir, REPO_FILE);
  const containment = join(dir, CONTAINMENT_FILE);

  test("identity strings go to both files; containment-only strings to one", () => {
    const { out, code } = run([
      "--dir", dir,
      "--add", "Pat Example", "--add", "patexample",
      "--containment-only", "my-voice-service",
    ]);
    expect(code).toBe(0);
    expect(existsSync(repo)).toBe(true);
    expect(readPatterns(repo)).toEqual(["Pat Example", "patexample"]);
    expect(readPatterns(containment)).toEqual(["my-voice-service", "Pat Example", "patexample"]);
    expect(out).toContain("2 pattern(s) in");
    expect(out).not.toContain("gitignored"); // only claimed for the default dir
  });

  test("re-running merges instead of overwriting", () => {
    run(["--dir", dir, "--add", "Former Employer Ltd", "--add", "PATEXAMPLE"]);
    expect(readPatterns(repo)).toEqual(["Former Employer Ltd", "Pat Example", "patexample"]);
    expect(readPatterns(containment)).toContain("my-voice-service");
  });

  test("a string the repo already contains is warned about in scripted mode, but still written", () => {
    const { out } = run(["--dir", dir, "--add", "Review before sharing"]);
    expect(out).toContain("warning");
    expect(out).toContain("already occurs");
    expect(out).not.toContain("Review before sharing"); // masked
    expect(readPatterns(repo)).toContain("Review before sharing");
  });

  test("--show masks the strings", () => {
    const { out } = run(["--dir", dir, "--show"]);
    expect(out).toContain(REPO_FILE);
    expect(out).toContain(CONTAINMENT_FILE);
    expect(out).not.toContain("Pat Example");
    expect(out).toContain("P**********");
  });

  test("the written files are plain JSON arrays", () => {
    expect(Array.isArray(JSON.parse(readFileSync(repo, "utf-8")))).toBe(true);
    expect(Array.isArray(JSON.parse(readFileSync(containment, "utf-8")))).toBe(true);
  });
});
