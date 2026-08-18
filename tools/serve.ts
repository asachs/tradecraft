#!/usr/bin/env bun
/**
 * serve.ts — Localhost dashboard over the whole work record.
 *
 * Serves $WORK_DIR — initiatives, meetings, observations, briefs, reports, the
 * promise ledger — not just rolled-up reports. Read-only; no external
 * dependencies, uses Bun.serve().
 *
 * Usage:
 *   bun tools/serve.ts [--port 3141]
 */

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, extname, sep } from "node:path";
import { resolveWorkDir, isUnderWorkDir } from "./lib/config.ts";
import { renderMarkdown, escapeHtml, countCriteria } from "./lib/markdown.ts";

const WORK_DIR = resolveWorkDir();

/** Readable extensions. Anything else is not linked and not served. */
const VIEWABLE = new Set([".md", ".markdown", ".txt", ".json", ".jsonl", ".yaml", ".yml"]);

/** Never listed or served, at any depth. */
const HIDDEN_DIRS = new Set(["node_modules", ".git", ".cache", "logs"]);

/** Sections shown on the home page, in the order the working day uses them. */
const SECTIONS: { path: string; label: string; blurb: string }[] = [
  { path: "initiatives", label: "Initiatives", blurb: "Definition of done per piece of work" },
  { path: "meetings", label: "Meetings", blurb: "Who you met and what came of it" },
  { path: "briefs", label: "Briefs", blurb: "Cross-initiative evidence" },
  { path: "observations", label: "Observations", blurb: "Captured as noticed" },
  { path: "worklog", label: "Worklog", blurb: "Daily EOD summaries and raw activity" },
  { path: "reports", label: "Reports", blurb: "Generated plans, briefs, and weeklies" },
];

/** Top-level files worth surfacing on the home page. */
const PINNED = ["WORK_LEDGER.md", "BRAG.md", "SESSION-CONTEXT.md", "initiatives/REGISTRY.md"];

function parsePort(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) return parseInt(args[++i]!, 10);
    if (args[i]!.startsWith("--port=")) return parseInt(args[i]!.split("=")[1]!, 10);
  }
  return parseInt(process.env.SERVE_PORT ?? "3141", 10);
}

// ── Path safety ──

/**
 * Map a URL path to a file inside WORK_DIR, or null if it escapes.
 *
 * The server hands out whatever the URL names, so containment is the whole
 * security story here: reject traversal, absolute paths, and hidden dirs
 * before touching the filesystem.
 */
function safeResolve(urlPath: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  rel = rel.replace(/^\/+/, "");
  if (rel === "") return WORK_DIR;
  if (rel.split("/").some((seg) => HIDDEN_DIRS.has(seg) || seg === "..")) return null;

  const full = join(WORK_DIR, rel);
  if (!isUnderWorkDir(WORK_DIR, full)) return null;

  // Resolve symlinks too: a link inside the tree could otherwise point out of
  // it, which the textual check above cannot see.
  try {
    const real = realpathSync(full);
    if (real !== full && !isUnderWorkDir(realpathSync(WORK_DIR), real)) return null;
  } catch {
    // Does not exist yet — the caller's existsSync check handles it.
  }
  return full;
}

const relPath = (full: string) => relative(WORK_DIR, full).split(sep).join("/");
const href = (full: string) => `/browse/${relPath(full).split("/").map(encodeURIComponent).join("/")}`;

// ── Filesystem helpers ──

interface Entry {
  name: string;
  full: string;
  isDir: boolean;
}

function listDir(dir: string): Entry[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const entries: Entry[] = [];
  for (const name of names) {
    if (name.startsWith(".") || HIDDEN_DIRS.has(name)) continue;
    const full = join(dir, name);
    let isDir: boolean;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (!isDir && !VIEWABLE.has(extname(name).toLowerCase())) continue;
    entries.push({ name, full, isDir });
  }
  // Directories first, then newest-looking names first (dated files sort well).
  return entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return b.name.localeCompare(a.name);
  });
}

/** Count viewable files under a directory, for the home-page section counts. */
function countFiles(dir: string, depth = 0): number {
  if (depth > 4) return 0;
  let n = 0;
  for (const e of listDir(dir)) n += e.isDir ? countFiles(e.full, depth + 1) : 1;
  return n;
}

/** ISA progress for an initiative directory, when it has one. */
function isaProgress(dir: string): { done: number; total: number } | null {
  const isa = join(dir, "ISA.md");
  if (!existsSync(isa)) return null;
  try {
    const c = countCriteria(readFileSync(isa, "utf-8"));
    return c.total > 0 ? c : null;
  } catch {
    return null;
  }
}

function progressBadge(p: { done: number; total: number }): string {
  const pct = Math.round((p.done / p.total) * 100);
  const state = pct === 100 ? "full" : pct > 0 ? "part" : "none";
  return (
    `<span class="progress ${state}" title="${p.done} of ${p.total} criteria met">` +
    `<span class="bar"><span class="fill" style="width:${pct}%"></span></span>` +
    `<span class="pct">${p.done}/${p.total}</span></span>`
  );
}

// ── Pages ──

function homePage(): string {
  let body = "";

  const pinned = PINNED.map((p) => join(WORK_DIR, p)).filter((f) => existsSync(f));
  if (pinned.length) {
    body +=
      `<div class="pinned">` +
      pinned
        .map((f) => `<a class="pin" href="${href(f)}">${escapeHtml(relPath(f))}</a>`)
        .join("") +
      `</div>`;
  }

  const cards = SECTIONS.filter((s) => existsSync(join(WORK_DIR, s.path)))
    .map((s) => {
      const dir = join(WORK_DIR, s.path);
      const n = countFiles(dir);
      return (
        `<a class="card" href="${href(dir)}">` +
        `<span class="card-title">${s.label}<span class="badge">${n}</span></span>` +
        `<span class="muted">${s.blurb}</span></a>`
      );
    })
    .join("");

  body += cards
    ? `<div class="cards">${cards}</div>`
    : `<p class="empty">Nothing in <code>${escapeHtml(WORK_DIR)}</code> yet. Run <code>bun tools/install.ts</code> to scaffold it.</p>`;

  return page("Work record", body, []);
}

function dirPage(dir: string): string {
  const entries = listDir(dir);
  const rel = relPath(dir);

  if (entries.length === 0) {
    return page(rel || "Work record", `<p class="empty">Empty.</p>`, crumbs(dir));
  }

  const items = entries
    .map((e) => {
      const progress = e.isDir ? isaProgress(e.full) : null;
      const label = escapeHtml(e.name) + (e.isDir ? "/" : "");
      return (
        `<li class="${e.isDir ? "dir" : "file"}">` +
        `<a href="${href(e.full)}">${label}</a>` +
        (progress ? progressBadge(progress) : "") +
        `</li>`
      );
    })
    .join("\n");

  return page(rel || "Work record", `<ul class="entries">${items}</ul>`, crumbs(dir));
}

function filePage(file: string): string {
  const raw = readFileSync(file, "utf-8");
  const ext = extname(file).toLowerCase();
  const rel = relPath(file);

  const isMarkdown = ext === ".md" || ext === ".markdown";
  const rendered = isMarkdown
    ? renderMarkdown(raw)
    : `<pre><code>${escapeHtml(raw)}</code></pre>`;

  let header = "";
  if (isMarkdown) {
    const c = countCriteria(raw);
    if (c.total > 0) header = `<div class="doc-progress">${progressBadge(c)} criteria met</div>`;
  }

  return page(rel, `${header}<article class="doc">${rendered}</article>`, crumbs(file));
}

/** Breadcrumb trail from WORK_DIR down to `full`. */
function crumbs(full: string): { label: string; url: string }[] {
  const rel = relPath(full);
  const trail = [{ label: "work", url: "/" }];
  if (!rel) return trail;
  let acc = WORK_DIR;
  for (const seg of rel.split("/")) {
    acc = join(acc, seg);
    trail.push({ label: seg, url: href(acc) });
  }
  return trail;
}

function page(title: string, body: string, trail: { label: string; url: string }[]): string {
  const nav = trail.length
    ? `<nav class="crumbs">` +
      trail
        .map((c, i) =>
          i === trail.length - 1
            ? `<span>${escapeHtml(c.label)}</span>`
            : `<a href="${c.url}">${escapeHtml(c.label)}</a>`
        )
        .join('<span class="sep">/</span>') +
      `</nav>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${CSS}</style></head>
<body>${nav}<h1>${escapeHtml(title)}</h1>${body}</body>
</html>`;
}

// ── CSS ──

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 82ch; margin: 2rem auto; padding: 0 1rem;
    color: #1a1a1a; background: #fafafa; line-height: 1.6;
  }
  h1 { font-size: 1.5rem; margin-bottom: 1.2rem; border-bottom: 2px solid #333; padding-bottom: 0.4rem; word-break: break-word; }
  h2 { font-size: 1.2rem; margin: 1.5rem 0 0.5rem; color: #333; }
  h3 { font-size: 1.05rem; margin: 1rem 0 0.3rem; color: #555; }
  h4, h5, h6 { font-size: 0.95rem; margin: 0.8rem 0 0.2rem; color: #666; }
  p { margin: 0.6rem 0; }
  a { color: #0066cc; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { background: #e8e8e8; padding: 0.15em 0.3em; border-radius: 3px; font-size: 0.9em; }
  pre { background: #f0f0f0; padding: 0.8rem; border-radius: 5px; overflow-x: auto; margin: 0.8rem 0; }
  pre code { background: none; padding: 0; font-size: 0.85em; }
  blockquote { border-left: 3px solid #ccc; padding-left: 0.8rem; color: #555; margin: 0.6rem 0; }
  ul, ol { padding-left: 1.5rem; margin: 0.4rem 0; }
  li { margin: 0.15rem 0; }
  hr { border: none; border-top: 1px solid #ddd; margin: 1.5rem 0; }
  strong { color: #111; }
  .muted { color: #888; font-size: 0.85rem; }
  .empty { color: #999; font-style: italic; padding: 2rem 0; }
  .badge { display: inline-block; font-size: 0.75rem; padding: 0.1em 0.5em;
           background: #e0e7ff; color: #3730a3; border-radius: 4px; margin-left: 0.5rem; }

  .crumbs { font-size: 0.85rem; color: #666; margin-bottom: 0.8rem; }
  .crumbs .sep { margin: 0 0.4rem; color: #bbb; }

  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 0.8rem; }
  .card { display: block; padding: 0.9rem; background: #fff; border: 1px solid #e5e5e5;
          border-radius: 6px; color: inherit; }
  .card:hover { border-color: #0066cc; text-decoration: none; }
  .card-title { display: block; font-weight: 600; color: #111; margin-bottom: 0.2rem; }

  .pinned { margin-bottom: 1rem; display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .pin { font-size: 0.8rem; padding: 0.2em 0.6em; background: #fff;
         border: 1px solid #ddd; border-radius: 999px; }

  .entries { list-style: none; padding: 0; }
  .entries li { padding: 0.4rem 0; border-bottom: 1px solid #eee; display: flex;
                align-items: center; justify-content: space-between; gap: 1rem; }
  .entries li:last-child { border-bottom: none; }
  .entries .dir a { font-weight: 600; }

  .table-wrap { overflow-x: auto; margin: 0.8rem 0; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
  th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-weight: 600; }
  tbody tr:nth-child(even) { background: #f6f6f6; }

  .task { font-weight: 700; }
  .task.done { color: #15803d; }
  .task.todo { color: #bbb; }
  .task-done { color: #666; }

  .progress { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: #555; }
  .progress .bar { display: inline-block; width: 4rem; height: 6px; background: #e5e5e5; border-radius: 3px; overflow: hidden; }
  .progress .fill { display: block; height: 100%; background: #94a3b8; }
  .progress.full .fill { background: #15803d; }
  .progress.part .fill { background: #d97706; }
  .doc-progress { margin-bottom: 1rem; }
`;

// ── Server ──

const port = parsePort();

export const server = Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const html = (s: string, status = 200) =>
      new Response(s, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

    if (path === "/" || path === "/index.html") return html(homePage());

    if (path === "/browse" || path === "/browse/") {
      return html(dirPage(WORK_DIR));
    }

    if (path.startsWith("/browse/")) {
      const target = safeResolve(path.slice("/browse".length));
      if (!target || !existsSync(target)) return html(notFound(), 404);
      const stat = statSync(target);
      if (stat.isDirectory()) return html(dirPage(target));
      if (!VIEWABLE.has(extname(target).toLowerCase())) return html(notFound(), 404);
      return html(filePage(target));
    }

    return html(notFound(), 404);
  },
});

function notFound(): string {
  return page("Not found", `<p class="empty">No such file in the work record.</p>`, [
    { label: "work", url: "/" },
  ]);
}

console.log(`Work record dashboard: http://localhost:${port}`);
console.log(`Serving: ${WORK_DIR}`);
