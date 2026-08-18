/**
 * Minimal markdown → HTML renderer for the local dashboard.
 *
 * Line-based block parser rather than a regex chain: tables and fenced code
 * need real block state, and the old chained-replace approach could not
 * express it (a table rendered as raw pipe text). Deliberately small — it
 * covers what the work record actually contains, not all of CommonMark.
 *
 * Everything is escaped before any tag is inserted, so file content can never
 * inject markup into the page.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ESCAPES[c]!);
}

/** Inline spans. Code is extracted first so its contents are not reformatted. */
function inline(text: string): string {
  const code: string[] = [];
  let s = escapeHtml(text).replace(/`([^`]+)`/g, (_m, c) => {
    code.push(c);
    return `@@CODE${code.length - 1}@@`;
  });

  s = s
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");

  return s.replace(/@@CODE(\d+)@@/g, (_m, i) => `<code>${code[Number(i)]}</code>`);
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableDivider = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l) && l.includes("-");

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

/** A `- [x]` / `- [ ]` task line becomes a status marker plus its text. */
function renderListItem(text: string): string {
  const task = /^\[([ xX])\]\s*(.*)$/.exec(text);
  if (!task) return inline(text);
  const done = task[1]!.toLowerCase() === "x";
  return (
    `<span class="task ${done ? "done" : "todo"}">${done ? "✓" : "○"}</span> ` +
    `<span class="${done ? "task-done" : ""}">${inline(task[2]!)}</span>`
  );
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  const listStack: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.map(inline).join("<br>\n")}</p>`);
      para = [];
    }
  };
  const closeLists = (toDepth = 0) => {
    while (listStack.length > toDepth) out.push(`</${listStack.pop()}>`);
  };
  const flush = () => {
    flushPara();
    closeLists();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Fenced code
    if (/^\s*```/.test(line)) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]!)) body.push(lines[i++]!);
      out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    // Table: a header row followed by a divider row
    if (isTableRow(line) && i + 1 < lines.length && isTableDivider(lines[i + 1]!)) {
      flush();
      const head = splitRow(line);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && isTableRow(lines[i]!)) body.push(splitRow(lines[i++]!));
      i--;
      const th = head.map((c) => `<th>${inline(c)}</th>`).join("");
      const rows = body
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
        .join("\n");
      out.push(
        `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`
      );
      continue;
    }

    // Headings
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1]!.length;
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      out.push("<hr>");
      continue;
    }

    // Blockquote
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flush();
      out.push(`<blockquote>${inline(quote[1]!)}</blockquote>`);
      continue;
    }

    // List items, nested by leading whitespace (2 spaces per level)
    const item = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      flushPara();
      const depth = Math.floor(item[1]!.length / 2) + 1;
      const tag = /^\d+\./.test(item[2]!) ? "ol" : "ul";
      while (listStack.length > depth) out.push(`</${listStack.pop()}>`);
      while (listStack.length < depth) {
        out.push(`<${tag}>`);
        listStack.push(tag);
      }
      out.push(`<li>${renderListItem(item[3]!)}</li>`);
      continue;
    }

    if (line.trim() === "") {
      flush();
      continue;
    }

    closeLists();
    para.push(line.trim());
  }

  flush();
  return out.join("\n");
}

/** Count `- [x]` / `- [ ]` criteria in an ISA-style document. */
export function countCriteria(md: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const line of md.split("\n")) {
    const m = /^\s*[-*+]\s+\[([ xX])\]/.exec(line);
    if (!m) continue;
    total++;
    if (m[1]!.toLowerCase() === "x") done++;
  }
  return { done, total };
}
