import { describe, test, expect, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { parseEodFiles, filterEodByWindow } from "../tools/lib/eod.ts";

const fixtureDir = resolve(import.meta.dir, "fixtures/work");

describe("parseEodFiles", () => {
  test("parses valid EOD files from fixture", () => {
    const lines = parseEodFiles(fixtureDir);
    // 2026-06-02.md: done + decided = 2 lines
    // 2026-06-05.md: done + blocked = 2 lines
    expect(lines.length).toBe(4);
  });

  test("extracts correct prefixes and text", () => {
    const lines = parseEodFiles(fixtureDir);
    const done = lines.filter((l) => l.prefix === "done");
    expect(done.length).toBe(2);
    expect(done[0].text).toContain("OIDC migration");
    expect(done[1].text).toContain("production cutover");
  });

  test("extracts dates from filenames", () => {
    const lines = parseEodFiles(fixtureDir);
    const dates = new Set(lines.map((l) => l.date));
    expect(dates.has("2026-06-02")).toBe(true);
    expect(dates.has("2026-06-05")).toBe(true);
  });

  test("strips [BRAG?] tag and sets brag flag", () => {
    const lines = parseEodFiles(fixtureDir);
    const tagged = lines.filter((l) => l.brag);
    expect(tagged.length).toBe(1);
    expect(tagged[0].text).toBe(
      "production cutover complete — migration initiative closed with zero rollback events (OPS-101)"
    );
    expect(tagged[0].text).not.toContain("[BRAG?]");
  });

  test("untagged lines have brag false and unchanged text", () => {
    const lines = parseEodFiles(fixtureDir);
    const untagged = lines.filter((l) => !l.brag);
    expect(untagged.length).toBe(3);
    for (const l of untagged) {
      expect(l.text).not.toContain("[BRAG?]");
    }
  });

  test("skips HTML comments", () => {
    const lines = parseEodFiles(fixtureDir);
    const hasComment = lines.some((l) => l.text.includes("Review:") || l.text.includes("<!--"));
    expect(hasComment).toBe(false);
  });

  test("returns empty array for missing directory", () => {
    const lines = parseEodFiles("/nonexistent/path");
    expect(lines).toEqual([]);
  });

  test("returns empty array for directory with no EOD files", () => {
    // /tmp should exist but have no worklog/eod/ dir
    const lines = parseEodFiles("/tmp");
    expect(lines).toEqual([]);
  });
});

describe("filterEodByWindow", () => {
  test("filters lines within [start, end)", () => {
    const lines = parseEodFiles(fixtureDir);
    const filtered = filterEodByWindow(lines, "2026-06-02", "2026-06-03");
    // Only 2026-06-02 lines (done + decided)
    expect(filtered.length).toBe(2);
    expect(filtered.every((l) => l.date === "2026-06-02")).toBe(true);
  });

  test("full week includes all fixture EOD lines", () => {
    const lines = parseEodFiles(fixtureDir);
    const filtered = filterEodByWindow(lines, "2026-06-01", "2026-06-08");
    expect(filtered.length).toBe(4);
  });

  test("window before any files returns empty", () => {
    const lines = parseEodFiles(fixtureDir);
    const filtered = filterEodByWindow(lines, "2025-01-01", "2025-01-08");
    expect(filtered).toEqual([]);
  });

  test("returns files in sorted date order regardless of filesystem order", () => {
    const lines = parseEodFiles(fixtureDir);
    // Fixture has 2026-06-02.md and 2026-06-05.md
    // .sort() ensures 06-02 lines come before 06-05 lines
    const dates = lines.map((l) => l.date);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] >= dates[i - 1]).toBe(true);
    }
  });
});

describe("markdown bullet format", () => {
  const tmps: string[] = [];
  afterEach(() => {
    while (tmps.length) {
      try {
        rmSync(tmps.pop()!, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  });

  test("parses '- prefix: text' bullets (renderable + parseable) and strips [BRAG?]", () => {
    const d = mkdtempSync(join(tmpdir(), "tc-eodmd-"));
    tmps.push(d);
    const eod = join(d, "worklog", "eod");
    mkdirSync(eod, { recursive: true });
    writeFileSync(
      join(eod, "2026-07-27.md"),
      "# End of Day — 2026-07-27\n\n- done: shipped the thing [BRAG?]\n- decided: went with X\n\n<!-- Review -->\n"
    );
    const lines = parseEodFiles(d);
    expect(lines.length).toBe(2);
    const done = lines.find((l) => l.prefix === "done")!;
    expect(done.text).toBe("shipped the thing");
    expect(done.brag).toBe(true);
    expect(lines.find((l) => l.prefix === "decided")!.text).toBe("went with X");
  });
});
