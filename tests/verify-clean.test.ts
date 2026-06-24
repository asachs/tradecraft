import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { findLeaks, trackedFiles, FORBIDDEN } from "../tools/verify-clean.ts";

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

describe("repo is person/employer-agnostic (ISC-35)", () => {
  test("no tracked file contains a forbidden identity string", () => {
    const scaffold = resolve(import.meta.dir, "..");
    const files = trackedFiles(scaffold);
    const offenders = findLeaks(files, FORBIDDEN, (rel) =>
      readFileSync(join(scaffold, rel), "utf-8"),
    );
    if (offenders.length > 0) console.error("leaks found:", offenders);
    expect(offenders).toHaveLength(0);
  });
});
