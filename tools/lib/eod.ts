/**
 * EOD file parser — reads human-authored end-of-day files from WORK_DIR/worklog/eod/.
 * Each file is YYYY-MM-DD.md containing prefixed one-liners (done, decided, promised, etc.).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface EodLine {
  date: string;
  prefix: string;
  text: string;
  /** True when the line carried a trailing [BRAG?] tag (stripped from text). */
  brag: boolean;
}

const BRAG_TAG_RE = /\s*\[BRAG\?\]\s*$/;

const VALID_PREFIXES = ["done", "decided", "promised", "learned", "met", "blocked"];
const DATE_FILENAME_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;

/**
 * Parse all EOD files from WORK_DIR/worklog/eod/.
 * Each file must be named YYYY-MM-DD.md. Lines have the form `prefix: text`
 * where prefix is one of done|decided|promised|learned|met|blocked.
 * Blank lines, HTML comments, and unparseable lines are silently skipped.
 * Missing dir or no files returns [].
 */
export function parseEodFiles(workDir: string): EodLine[] {
  const eodDir = join(workDir, "worklog", "eod");
  let filenames: string[];
  try {
    filenames = readdirSync(eodDir).sort();
  } catch {
    return [];
  }

  const results: EodLine[] = [];

  for (const filename of filenames) {
    const match = DATE_FILENAME_RE.exec(filename);
    if (!match) continue;
    const date = match[1];

    let content: string;
    try {
      content = readFileSync(join(eodDir, filename), "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("<!--") || line.endsWith("-->")) continue;

      const colonIdx = line.indexOf(":");
      if (colonIdx < 0) continue;

      const prefix = line.slice(0, colonIdx).trim().toLowerCase();
      if (!VALID_PREFIXES.includes(prefix)) continue;

      let text = line.slice(colonIdx + 1).trim();
      if (!text) continue;

      const brag = BRAG_TAG_RE.test(text);
      if (brag) {
        text = text.replace(BRAG_TAG_RE, "").trim();
        if (!text) continue;
      }

      results.push({ date, prefix, text, brag });
    }
  }

  return results;
}

/**
 * Filter EOD lines by [start, end) on the date field.
 */
export function filterEodByWindow(
  lines: EodLine[],
  start: string,
  end: string
): EodLine[] {
  return lines.filter((l) => l.date >= start && l.date < end);
}
