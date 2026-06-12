/**
 * Ledger parser — reads WORK_LEDGER.md markdown table.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Promise {
  promised: string;
  to: string;
  due: string;
  ticket: string;
  status: "open" | "done" | "renegotiated";
  overdue: boolean;
}

/**
 * Parse WORK_LEDGER.md from the given workDir.
 * Tolerates empty files, template-only tables, and missing files.
 */
export function parseLedger(workDir: string, today: string): Promise[] {
  const filePath = join(workDir, "WORK_LEDGER.md");
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const lines = content.split("\n");
  const promises: Promise[] = [];

  // Find the table: look for the header separator line (|---|...)
  let dataStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^\|[\s-|]+\|$/.test(line) && line.includes("---")) {
      dataStart = i + 1;
      break;
    }
  }
  if (dataStart < 0) return [];

  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("|")) continue;

    const cells = line
      .split("|")
      .slice(1, -1) // remove leading/trailing empty from split
      .map((c) => c.trim());

    if (cells.length < 5) continue;

    const [promised, to, due, ticket, rawStatus] = cells;

    // Skip template placeholder rows
    if (promised.startsWith("<") || !promised) continue;

    const statusLower = rawStatus.toLowerCase().trim();
    let status: "open" | "done" | "renegotiated";
    if (statusLower === "done") {
      status = "done";
    } else if (statusLower === "renegotiated") {
      status = "renegotiated";
    } else {
      status = "open";
    }

    const overdue = status === "open" && due < today;

    promises.push({ promised, to, due, ticket, status, overdue });
  }

  return promises;
}

/** Filter promises by status. */
export function filterByStatus(
  promises: Promise[],
  status: "open" | "done" | "renegotiated"
): Promise[] {
  return promises.filter((p) => p.status === status);
}

/** Filter promises that are overdue. */
export function filterOverdue(promises: Promise[]): Promise[] {
  return promises.filter((p) => p.overdue);
}

/** Filter promises due within a [start, end) window. */
export function filterByDueWindow(
  promises: Promise[],
  start: string,
  end: string
): Promise[] {
  return promises.filter((p) => p.due >= start && p.due < end);
}
