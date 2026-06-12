import { describe, test, expect } from "bun:test";
import { resolve } from "node:path";
import {
  parseLedger,
  filterByStatus,
  filterOverdue,
  filterByDueWindow,
} from "../tools/lib/ledger.ts";

const fixtureDir = resolve(import.meta.dir, "fixtures/work");

describe("parseLedger", () => {
  test("parses all promise rows from fixture", () => {
    const promises = parseLedger(fixtureDir, "2026-06-05");
    expect(promises.length).toBe(6);
  });

  test("correctly classifies statuses", () => {
    const promises = parseLedger(fixtureDir, "2026-06-05");
    const done = filterByStatus(promises, "done");
    const open = filterByStatus(promises, "open");
    const renegotiated = filterByStatus(promises, "renegotiated");
    expect(done.length).toBe(2);
    expect(open.length).toBe(3);
    expect(renegotiated.length).toBe(1);
  });

  test("detects overdue promises", () => {
    // On 2026-06-05, OPS-103 (due 2026-05-28, open) is overdue
    const promises = parseLedger(fixtureDir, "2026-06-05");
    const overdue = filterOverdue(promises);
    expect(overdue.length).toBe(1);
    expect(overdue[0].ticket).toBe("OPS-103");
  });

  test("tolerates missing ledger file", () => {
    const promises = parseLedger("/nonexistent/path", "2026-06-05");
    expect(promises).toEqual([]);
  });

  test("tolerates empty ledger", () => {
    // Use a directory with no WORK_LEDGER.md (any non-existent works)
    const promises = parseLedger("/tmp", "2026-06-05");
    expect(promises).toEqual([]);
  });
});

describe("filterByDueWindow", () => {
  test("filters promises due within a date range", () => {
    const promises = parseLedger(fixtureDir, "2026-06-05");
    // Promises due in the fixture week 2026-06-01..2026-06-08
    const thisWeek = filterByDueWindow(promises, "2026-06-01", "2026-06-08");
    // OPS-101 (due 06-05), OPS-104 (due 06-03), OPS-105 (due 06-04)
    expect(thisWeek.length).toBe(3);
  });
});
