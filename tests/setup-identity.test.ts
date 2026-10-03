import { describe, test, expect, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { splitAnswer, mergePatterns, mask, readPatterns } from "../tools/setup-identity.ts";

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
});

describe("--add writes the gitignored file at --file", () => {
  const file = join(sandbox, "nested", "patterns.local.json");

  test("creates the file with the given strings", () => {
    const { out, code } = run(["--file", file, "--add", "Pat Example", "--add", "patexample"]);
    expect(code).toBe(0);
    expect(existsSync(file)).toBe(true);
    expect(readPatterns(file)).toEqual(["Pat Example", "patexample"]);
    expect(out).toContain("2 pattern(s) written");
    expect(out).not.toContain("gitignored"); // only claimed for the default path
  });

  test("re-running merges instead of overwriting", () => {
    run(["--file", file, "--add", "Former Employer Ltd", "--add", "PATEXAMPLE"]);
    expect(readPatterns(file)).toEqual(["Former Employer Ltd", "Pat Example", "patexample"]);
  });

  test("--show masks the strings", () => {
    const { out } = run(["--file", file, "--show"]);
    expect(out).toContain("3 pattern(s)");
    expect(out).not.toContain("Pat Example");
    expect(out).toContain("P**********");
  });

  test("the written file is plain JSON an archive tool can read", () => {
    const parsed = JSON.parse(readFileSync(file, "utf-8"));
    expect(Array.isArray(parsed)).toBe(true);
  });
});
