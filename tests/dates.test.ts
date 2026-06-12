import { describe, test, expect } from "bun:test";
import {
  parseDate,
  formatDate,
  isoDayOfWeek,
  isoWeekWindow,
  todayWindow,
  yesterdayWindow,
  nextWeekWindow,
} from "../tools/lib/dates.ts";

describe("parseDate / formatDate", () => {
  test("round-trips a date string", () => {
    expect(formatDate(parseDate("2026-06-01"))).toBe("2026-06-01");
  });
  test("handles end of month", () => {
    expect(formatDate(parseDate("2026-01-31"))).toBe("2026-01-31");
  });
});

describe("isoDayOfWeek", () => {
  test("Monday = 1", () => {
    expect(isoDayOfWeek(parseDate("2026-06-01"))).toBe(1); // Monday
  });
  test("Sunday = 7", () => {
    expect(isoDayOfWeek(parseDate("2026-05-31"))).toBe(7); // Sunday
  });
  test("Friday = 5", () => {
    expect(isoDayOfWeek(parseDate("2026-06-05"))).toBe(5);
  });
});

describe("isoWeekWindow", () => {
  test("Monday returns Mon-Sun window", () => {
    const w = isoWeekWindow(parseDate("2026-06-01"));
    expect(w.start).toBe("2026-06-01");
    expect(w.end).toBe("2026-06-08");
  });
  test("Friday returns same week window", () => {
    const w = isoWeekWindow(parseDate("2026-06-05"));
    expect(w.start).toBe("2026-06-01");
    expect(w.end).toBe("2026-06-08");
  });
  test("Sunday returns the week starting from the preceding Monday", () => {
    // 2026-05-31 is Sunday — should be part of Mon 2026-05-25 week
    const w = isoWeekWindow(parseDate("2026-05-31"));
    expect(w.start).toBe("2026-05-25");
    expect(w.end).toBe("2026-06-01");
  });
  test("Sunday entry is excluded from the following week", () => {
    // The week of 2026-06-01 (Mon) should NOT include Sunday 2026-05-31
    const w = isoWeekWindow(parseDate("2026-06-01"));
    expect(w.start).toBe("2026-06-01");
    // 2026-05-31 < "2026-06-01" so it would be excluded from [start, end)
    expect("2026-05-31" < w.start).toBe(true);
  });
});

describe("todayWindow", () => {
  test("returns a 1-day window", () => {
    const tw = todayWindow(parseDate("2026-06-03"));
    expect(tw.start).toBe("2026-06-03");
    expect(tw.end).toBe("2026-06-04");
  });
});

describe("yesterdayWindow", () => {
  test("normal day: Wednesday yesterday = Tuesday", () => {
    const yw = yesterdayWindow(parseDate("2026-06-03")); // Wednesday
    expect(yw.start).toBe("2026-06-02");
    expect(yw.end).toBe("2026-06-03");
  });
  test("Monday yesterday = Friday (working-day logic)", () => {
    const yw = yesterdayWindow(parseDate("2026-06-01")); // Monday
    expect(yw.start).toBe("2026-05-29"); // Friday
    expect(yw.end).toBe("2026-05-30");
  });
});

describe("nextWeekWindow", () => {
  test("next week from 2026-06-01 week", () => {
    const nw = nextWeekWindow(parseDate("2026-06-03"));
    expect(nw.start).toBe("2026-06-08");
    expect(nw.end).toBe("2026-06-15");
  });
});
