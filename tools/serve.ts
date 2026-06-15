#!/usr/bin/env bun
/**
 * serve.ts — Localhost report dashboard.
 *
 * Serves $WORK_DIR/reports/ as a browsable dashboard on localhost.
 * No external dependencies — uses Bun.serve() built-in.
 *
 * Usage:
 *   bun tools/serve.ts [--port 3141]
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { resolveWorkDir } from "./lib/config.ts";

const WORK_DIR = resolveWorkDir();
const REPORTS_DIR = join(WORK_DIR, "reports");

function parsePort(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) return parseInt(args[++i], 10);
    if (args[i].startsWith("--port=")) return parseInt(args[i].split("=")[1], 10);
  }
  return parseInt(process.env.SERVE_PORT ?? "3141", 10);
}

// ── Minimal markdown → HTML ──

function mdToHtml(md: string): string {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Headings (must be before bold)
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Horizontal rule
    .replace(/^---+$/gm, "<hr>")
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // List items (unordered)
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/^  - (.+)$/gm, "<li class=\"nested\">$1</li>")
    // Wrap consecutive <li> blocks in <ul>
    .replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
    // Paragraphs: blank-line separated text
    .replace(/\n{2,}/g, "\n<br><br>\n")
    // Preserve single newlines within blocks
    .replace(/([^>\n])\n([^<\n])/g, "$1<br>\n$2");
}

// ── CSS ──

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 72ch; margin: 2rem auto; padding: 0 1rem;
    color: #1a1a1a; background: #fafafa; line-height: 1.6;
  }
  h1 { font-size: 1.5rem; margin-bottom: 1.5rem; border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
  h2 { font-size: 1.2rem; margin: 1.5rem 0 0.5rem; color: #333; }
  h3 { font-size: 1.05rem; margin: 1rem 0 0.3rem; color: #555; }
  h4 { font-size: 0.95rem; margin: 0.8rem 0 0.2rem; color: #666; }
  a { color: #0066cc; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { background: #e8e8e8; padding: 0.15em 0.3em; border-radius: 3px; font-size: 0.9em; }
  ul { padding-left: 1.5rem; margin: 0.5rem 0; }
  li { margin: 0.15rem 0; }
  li.nested { margin-left: 1.5rem; }
  hr { border: none; border-top: 1px solid #ddd; margin: 1.5rem 0; }
  strong { color: #111; }
  .report-list { list-style: none; padding: 0; }
  .report-list li { padding: 0.4rem 0; border-bottom: 1px solid #eee; }
  .report-list li:last-child { border-bottom: none; }
  .category { margin-bottom: 2rem; }
  .badge { display: inline-block; font-size: 0.75rem; padding: 0.1em 0.5em;
           background: #e0e7ff; color: #3730a3; border-radius: 4px; margin-left: 0.5rem; }
  .muted { color: #888; font-size: 0.85rem; }
  .back { display: inline-block; margin-bottom: 1rem; }
  .empty { color: #999; font-style: italic; padding: 2rem 0; }
  .nav { margin-bottom: 1rem; font-size: 0.85rem; color: #666; }
`;

// ── Route handlers ──

function indexPage(): string {
  const categories: Record<string, string[]> = {};

  if (existsSync(REPORTS_DIR)) {
    for (const dir of readdirSync(REPORTS_DIR)) {
      const full = join(REPORTS_DIR, dir);
      if (!statSync(full).isDirectory()) continue;
      const files = readdirSync(full)
        .filter((f) => f.endsWith(".md"))
        .sort()
        .reverse(); // newest first
      if (files.length > 0) categories[dir] = files;
    }
  }

  const categoryNames = Object.keys(categories).sort();
  if (categoryNames.length === 0) {
    return page("Work OS Reports", `<p class="empty">No reports yet. Run <code>bun tools/schedule.ts run-all</code> to generate.</p>`);
  }

  let body = "";
  for (const cat of categoryNames) {
    const files = categories[cat];
    const items = files
      .map((f) => {
        const name = f.replace(/\.md$/, "");
        return `<li><a href="/${cat}/${name}">${name}</a></li>`;
      })
      .join("\n");
    body += `<div class="category"><h2>${cat} <span class="badge">${files.length}</span></h2><ul class="report-list">${items}</ul></div>`;
  }

  return page("Work OS Reports", body);
}

function reportPage(category: string, name: string): string | null {
  const filePath = join(REPORTS_DIR, category, `${name}.md`);
  if (!existsSync(filePath)) return null;

  const raw = readFileSync(filePath, "utf-8");
  const html = mdToHtml(raw);

  return page(
    `${category} / ${name}`,
    `<a class="back" href="/">&larr; All reports</a>
     <div class="nav">${category} / ${name}</div>
     <div class="report">${html}</div>`,
  );
}

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>${CSS}</style></head>
<body><h1>${title}</h1>${body}</body>
</html>`;
}

// ── Server ──

const port = parsePort();

export const server = Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/" || path === "/index.html") {
      return new Response(indexPage(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // Route: /<category>/<name>
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 2) {
      const html = reportPage(parts[0], parts[1]);
      if (html) return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Work OS report server: http://localhost:${port}`);
console.log(`Serving reports from: ${REPORTS_DIR}`);
