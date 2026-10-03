import { describe, test, expect, afterAll } from "bun:test";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { findLeaks, trackedFiles, loadLocalPatterns, GENERIC, LOCAL_PATTERNS_PATH } from "../tools/verify-clean.ts";

const sandbox = resolve(import.meta.dir, `_tmp_verify_clean_${Date.now()}`);
mkdirSync(sandbox, { recursive: true });
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

describe("findLeaks", () => {
  test("flags a forbidden token with file and line", () => {
    const offenders = findLeaks(
      ["a.txt", "b.txt"],
      ["secret-token"],
      (f) => (f === "a.txt" ? "clean line\nhas secret-token here\n" : "all clean\n"),
    );
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toEqual({ file: "a.txt", line: 2, pattern: "secret-token" });
  });

  test("is case-insensitive", () => {
    const offenders = findLeaks(["x"], ["FooBar"], () => "we use FOOBAR here");
    expect(offenders).toHaveLength(1);
  });

  test("clean content yields no offenders", () => {
    const offenders = findLeaks(["x"], ["secret"], () => "nothing to see\n");
    expect(offenders).toHaveLength(0);
  });

  test("skips unreadable files without crashing", () => {
    const offenders = findLeaks(["missing"], ["secret"], () => {
      throw new Error("nope");
    });
    expect(offenders).toHaveLength(0);
  });
});

describe("loadLocalPatterns", () => {
  test("missing file yields no patterns (fresh clone must pass)", () => {
    expect(loadLocalPatterns(join(sandbox, "absent.json"))).toEqual([]);
  });

  test("reads a JSON array, trimming blanks", () => {
    const p = join(sandbox, "ok.json");
    writeFileSync(p, JSON.stringify(["Alpha Person", " alphahandle ", ""]));
    expect(loadLocalPatterns(p)).toEqual(["Alpha Person", "alphahandle"]);
  });

  test("rejects a file that is not an array of strings", () => {
    const p = join(sandbox, "bad.json");
    writeFileSync(p, JSON.stringify({ patterns: ["x"] }));
    expect(() => loadLocalPatterns(p)).toThrow();
  });
});

describe("the tool ships no personal strings of its own", () => {
  test("GENERIC holds only path shapes, nothing that names a person or employer", () => {
    for (const g of GENERIC) expect(g.startsWith("/")).toBe(true);
  });

  test("the local patterns file is gitignored", () => {
    const scaffold = resolve(import.meta.dir, "..");
    const rel = LOCAL_PATTERNS_PATH.slice(scaffold.length + 1);
    const r = Bun.spawnSync(["git", "check-ignore", "-q", rel], { cwd: scaffold });
    expect(r.exitCode).toBe(0);
  });
});

describe("repo is person/employer-agnostic (ISC-35)", () => {
  test("no tracked file contains a generic or locally configured forbidden string", () => {
    const scaffold = resolve(import.meta.dir, "..");
    const files = trackedFiles(scaffold);
    const patterns = [...GENERIC, ...loadLocalPatterns()];
    const offenders = findLeaks(files, patterns, (rel) =>
      readFileSync(join(scaffold, rel), "utf-8"),
    );
    // Report positions only: the test output must not become the leak either.
    if (offenders.length > 0) {
      console.error("leaks found:", offenders.map((o) => `${o.file}:${o.line}`));
    }
    expect(offenders).toHaveLength(0);
  });
});
