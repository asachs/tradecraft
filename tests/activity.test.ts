import { describe, test, expect } from "bun:test";
import { resolve } from "node:path";
import {
  parseActivityLog,
  filterByDateWindow,
  groupByRepoBranch,
} from "../tools/lib/activity.ts";

const fixtureDir = resolve(import.meta.dir, "fixtures/work");

describe("parseActivityLog", () => {
  test("parses valid entries from fixture", () => {
    const entries = parseActivityLog(fixtureDir);
    // 11 valid lines, 1 malformed
    expect(entries.length).toBe(11);
  });

  test("skips malformed JSONL lines without crashing", () => {
    // The fixture has 1 malformed line — we should get 11 valid entries
    const entries = parseActivityLog(fixtureDir);
    expect(entries.length).toBe(11);
  });

  test("returns empty array for missing file", () => {
    const entries = parseActivityLog("/nonexistent/path");
    expect(entries).toEqual([]);
  });
});

describe("filterByDateWindow", () => {
  test("filters entries within [start, end)", () => {
    const entries = parseActivityLog(fixtureDir);
    const monday = filterByDateWindow(entries, "2026-06-01", "2026-06-02");
    expect(monday.length).toBe(2); // two Monday entries
  });

  test("excludes Sunday entry from Mon-Sun week starting Monday", () => {
    const entries = parseActivityLog(fixtureDir);
    const weekEntries = filterByDateWindow(entries, "2026-06-01", "2026-06-08");
    // Sunday 2026-05-31 should NOT be included
    const hasSunday = weekEntries.some((e) => e.ts.startsWith("2026-05-31"));
    expect(hasSunday).toBe(false);
    // Should have 10 entries from Mon-Fri
    expect(weekEntries.length).toBe(10);
  });
});

describe("groupByRepoBranch", () => {
  test("groups by repo basename and branch", () => {
    const entries = parseActivityLog(fixtureDir);
    const weekEntries = filterByDateWindow(entries, "2026-06-01", "2026-06-08");
    const groups = groupByRepoBranch(weekEntries);
    // infra-migration/main, infra-migration/fix/rollback-timeout,
    // api-gateway/feature/rate-limiting, api-gateway/main, api-gateway/feature/auth-headers
    expect(groups.length).toBe(5);
    const repoNames = new Set(groups.map((g) => g.repo));
    expect(repoNames.has("infra-migration")).toBe(true);
    expect(repoNames.has("api-gateway")).toBe(true);
  });
});
