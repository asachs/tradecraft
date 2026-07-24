import { describe, test, expect, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBrief } from "../hooks/WorkBrief.hook.ts";

const tmps: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "tc-wb-"));
  tmps.push(d);
  return d;
}
afterEach(() => {
  while (tmps.length) {
    try {
      rmSync(tmps.pop()!, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

// A Wednesday, for deterministic weekday behaviour.
const WED = new Date(Date.UTC(2026, 6, 22)); // 2026-07-22
const SAT = new Date(Date.UTC(2026, 6, 25)); // 2026-07-25

function ledger(workDir: string, rows: string): void {
  writeFileSync(
    join(workDir, "WORK_LEDGER.md"),
    `# Ledger\n\n| Promise | To | Due | Ticket | Status |\n|---|---|---|---|---|\n${rows}\n`,
  );
}

describe("buildBrief", () => {
  test("empty work dir on a weekday surfaces only the EOD nudge", () => {
    const wd = tmp();
    const { text, marker } = buildBrief(wd, WED);
    expect(text).toContain("No EOD file for today");
    expect(text).not.toContain("Overdue");
    expect(text).not.toContain("Due today");
    expect(marker).toBe("0 overdue · 0 due today · EOD pending");
  });

  test("surfaces overdue and due-today promises", () => {
    const wd = tmp();
    ledger(
      wd,
      "| ship cost report | platform lead | 2026-07-01 | OPS-9 | open |\n" +
        "| review PR | teammate | 2026-07-22 | OPS-10 | open |",
    );
    const { text, marker } = buildBrief(wd, WED);
    expect(text).toContain("## Overdue (1)");
    expect(text).toContain("OPS-9");
    expect(text).toContain("## Due today (1)");
    expect(text).toContain("OPS-10");
    expect(marker).toBe("1 overdue · 1 due today · EOD pending");
  });

  test("EOD present on a weekday suppresses the nudge", () => {
    const wd = tmp();
    mkdirSync(join(wd, "worklog", "eod"), { recursive: true });
    writeFileSync(join(wd, "worklog", "eod", "2026-07-22.md"), "done: shipped\n");
    const { text, marker } = buildBrief(wd, WED);
    expect(text).toBe(""); // nothing overdue/due + EOD done → silent
    expect(marker).toBe("0 overdue · 0 due today · EOD done");
  });

  test("weekend omits EOD from text and marker", () => {
    const wd = tmp();
    const { text, marker } = buildBrief(wd, SAT);
    expect(text).toBe("");
    expect(marker).toBe("0 overdue · 0 due today");
  });

  test("done promises are never surfaced as overdue", () => {
    const wd = tmp();
    ledger(wd, "| old thing | lead | 2026-01-01 | OPS-1 | done |");
    const { text, marker } = buildBrief(wd, WED);
    expect(text).not.toContain("OPS-1");
    expect(marker).toContain("0 overdue");
  });
});
