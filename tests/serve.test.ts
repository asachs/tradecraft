import { describe, test, expect, afterAll, beforeAll } from "bun:test";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const toolsDir = resolve(import.meta.dir, "../tools");

// Create a temp work dir with some reports
const tmpWork = resolve(import.meta.dir, `_tmp_serve_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
const reportsDir = resolve(tmpWork, "reports");
const PORT = 3199 + Math.floor(Math.random() * 100); // avoid collisions

let server: ReturnType<typeof Bun.spawn>;

beforeAll(async () => {
  mkdirSync(resolve(reportsDir, "monday-plan"), { recursive: true });
  mkdirSync(resolve(reportsDir, "daily-brief"), { recursive: true });

  writeFileSync(
    resolve(reportsDir, "monday-plan/2026-06-15.md"),
    "# Monday Plan — W25\n\n## Promises due this week\n\nNone.\n",
  );
  writeFileSync(
    resolve(reportsDir, "daily-brief/2026-06-15.md"),
    "# Daily Brief — 2026-06-15\n\n## Yesterday\n\nNo captured activity yesterday.\n",
  );

  server = Bun.spawn(["bun", resolve(toolsDir, "serve.ts"), "--port", String(PORT)], {
    env: { ...process.env, WORK_DIR: tmpWork },
    stdout: "pipe",
    stderr: "pipe",
  });

  // Wait for server to start
  const maxWait = 5000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`);
      if (res.ok) break;
    } catch {}
    await Bun.sleep(100);
  }
});

afterAll(() => {
  server?.kill();
  rmSync(tmpWork, { recursive: true, force: true });
});

describe("serve.ts", () => {
  test("index page lists report categories", async () => {
    const res = await fetch(`http://localhost:${PORT}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("monday-plan");
    expect(html).toContain("daily-brief");
    expect(html).toContain("2026-06-15");
  });

  test("report page renders markdown as HTML", async () => {
    const res = await fetch(`http://localhost:${PORT}/monday-plan/2026-06-15`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<h1>");
    expect(html).toContain("<h2>Promises due this week</h2>");
    expect(html).toContain("All reports");
  });

  test("unknown report returns 404", async () => {
    const res = await fetch(`http://localhost:${PORT}/monday-plan/1999-01-01`);
    expect(res.status).toBe(404);
  });

  test("unknown category returns 404", async () => {
    const res = await fetch(`http://localhost:${PORT}/nonexistent/2026-06-15`);
    expect(res.status).toBe(404);
  });

  test("content-type is text/html", async () => {
    const res = await fetch(`http://localhost:${PORT}/`);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});
