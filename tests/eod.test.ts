import { describe, test, expect } from "bun:test";
import { resolve } from "node:path";
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

  test("skips HTML comments", () => {
    const lines = parseEodFiles(fixtureDir);
    const hasComment = lines.some((l) => l.text.includes("Review:") || l.text.includes("Membrane"));
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
});
