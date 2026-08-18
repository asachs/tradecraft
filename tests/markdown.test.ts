import { describe, test, expect } from "bun:test";
import { renderMarkdown, escapeHtml, countCriteria } from "../tools/lib/markdown.ts";

describe("escapeHtml", () => {
  test("escapes the characters that could inject markup", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
  });
});

describe("renderMarkdown — tables", () => {
  const table = [
    "| Initiative | Score | Status |",
    "|------------|-------|--------|",
    "| api-gateway | 8 | active |",
    "| infra-migration | 5 | parked |",
  ].join("\n");

  test("renders a pipe table as a real HTML table", () => {
    const html = renderMarkdown(table);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Initiative</th>");
    expect(html).toContain("<td>api-gateway</td>");
    expect(html).toContain("<td>parked</td>");
    // Regression: the old renderer left these as raw pipe text.
    expect(html).not.toContain("|------------|");
  });

  test("wraps tables so wide ones scroll instead of breaking layout", () => {
    expect(renderMarkdown(table)).toContain('<div class="table-wrap">');
  });

  test("handles alignment markers in the divider row", () => {
    const aligned = "| A | B |\n|:--|--:|\n| 1 | 2 |";
    expect(renderMarkdown(aligned)).toContain("<th>A</th>");
    expect(renderMarkdown(aligned)).toContain("<td>2</td>");
  });

  test("formats inline markup inside cells", () => {
    const html = renderMarkdown("| Name | Ref |\n|---|---|\n| **bold** | `CODE-1` |");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>CODE-1</code>");
  });

  test("leaves a lone pipe line alone when no divider follows", () => {
    const html = renderMarkdown("| not | a table |\n\njust text");
    expect(html).not.toContain("<table>");
  });
});

describe("renderMarkdown — blocks", () => {
  test("renders headings at every level", () => {
    const html = renderMarkdown("# One\n\n## Two\n\n### Three");
    expect(html).toContain("<h1>One</h1>");
    expect(html).toContain("<h2>Two</h2>");
    expect(html).toContain("<h3>Three</h3>");
  });

  test("renders nested lists", () => {
    const html = renderMarkdown("- top\n  - nested\n- back");
    expect(html).toContain("<li>top</li>");
    expect(html).toContain("<li>nested</li>");
    expect((html.match(/<ul>/g) ?? []).length).toBe(2);
    expect((html.match(/<\/ul>/g) ?? []).length).toBe(2);
  });

  test("renders task list items with a status marker", () => {
    const html = renderMarkdown("- [x] ISC-1: done\n- [ ] ISC-2: pending");
    expect(html).toContain('class="task done"');
    expect(html).toContain('class="task todo"');
    expect(html).toContain("ISC-1: done");
  });

  test("renders fenced code without formatting its contents", () => {
    const html = renderMarkdown("```\nconst x = **not bold**;\n```");
    expect(html).toContain("<pre><code>");
    expect(html).not.toContain("<strong>");
  });

  test("renders blockquotes and horizontal rules", () => {
    const html = renderMarkdown("> quoted\n\n---");
    expect(html).toContain("<blockquote>quoted</blockquote>");
    expect(html).toContain("<hr>");
  });

  test("renders inline links, bold, italic, and code", () => {
    const html = renderMarkdown("See [docs](https://example.com) for **bold**, *italic*, `code`.");
    expect(html).toContain('<a href="https://example.com">docs</a>');
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<code>code</code>");
  });

  test("escapes HTML in the source before rendering", () => {
    const html = renderMarkdown("A <script>bad()</script> line");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  test("does not format markup inside inline code", () => {
    const html = renderMarkdown("Use `**literal asterisks**` here");
    expect(html).toContain("<code>**literal asterisks**</code>");
  });

  test("groups consecutive lines into a paragraph", () => {
    const html = renderMarkdown("line one\nline two\n\nsecond para");
    expect((html.match(/<p>/g) ?? []).length).toBe(2);
  });
});

describe("countCriteria", () => {
  test("counts done and total ISA criteria", () => {
    const md = "- [x] ISC-1\n- [x] ISC-2\n- [ ] ISC-3\n- not a criterion";
    expect(countCriteria(md)).toEqual({ done: 2, total: 3 });
  });

  test("returns zeroes for a document with no criteria", () => {
    expect(countCriteria("# Just a heading\n\nSome prose.")).toEqual({ done: 0, total: 0 });
  });

  test("accepts an uppercase X", () => {
    expect(countCriteria("- [X] done")).toEqual({ done: 1, total: 1 });
  });
});
