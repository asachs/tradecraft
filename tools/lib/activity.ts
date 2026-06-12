/**
 * Activity log parser — reads activity.jsonl, filters, groups.
 */
import { readFileSync } from "node:fs";
import { join, basename } from "node:path";

export interface ActivityEntry {
  ts: string;
  type: string;
  cwd: string;
  session: string;
  branch: string;
  files_dirty: number;
  last_commit: string;
}

/**
 * Parse activity.jsonl from the given workDir.
 * Skips malformed JSON lines with a stderr warning. Never crashes.
 */
export function parseActivityLog(workDir: string): ActivityEntry[] {
  const filePath = join(workDir, "worklog", "activity.jsonl");
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }
  const entries: ActivityEntry[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      entries.push({
        ts: parsed.ts ?? "",
        type: parsed.type ?? "session",
        cwd: parsed.cwd ?? "",
        session: parsed.session ?? "",
        branch: parsed.branch ?? "",
        files_dirty: parsed.files_dirty ?? 0,
        last_commit: parsed.last_commit ?? "",
      });
    } catch {
      console.error(`warning: skipping malformed JSONL at line ${i + 1}`);
    }
  }
  return entries;
}

/**
 * Filter entries by [start, end) date window using the `ts` field.
 * Comparison is on the date portion (YYYY-MM-DD) of the ISO timestamp.
 */
export function filterByDateWindow(
  entries: ActivityEntry[],
  start: string,
  end: string
): ActivityEntry[] {
  return entries.filter((e) => {
    const date = e.ts.slice(0, 10); // YYYY-MM-DD
    return date >= start && date < end;
  });
}

/** Group key: repo basename + branch. */
export interface ActivityGroup {
  repo: string;
  branch: string;
  entries: ActivityEntry[];
}

/**
 * Group entries by repo (cwd basename) and branch.
 */
export function groupByRepoBranch(entries: ActivityEntry[]): ActivityGroup[] {
  const map = new Map<string, ActivityGroup>();
  for (const e of entries) {
    const repo = basename(e.cwd) || e.cwd;
    const key = `${repo}::${e.branch}`;
    let group = map.get(key);
    if (!group) {
      group = { repo, branch: e.branch, entries: [] };
      map.set(key, group);
    }
    group.entries.push(e);
  }
  return Array.from(map.values());
}
