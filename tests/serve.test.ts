import { describe, test, expect, afterAll, beforeAll } from "bun:test";
import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";

const toolsDir = resolve(import.meta.dir, "../tools");

const tmpWork = resolve(
  import.meta.dir,
  `_tmp_serve_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
);
const PORT = 3199 + Math.floor(Math.random() * 100);
const base = `http://localhost:${PORT}`;

let server: ReturnType<typeof Bun.spawn>;

const get = (path: string) => fetch(`${base}${path}`);
const text = async (path: string) => (await get(path)).text();

/**
 * Request a path exactly as written, with no client-side normalisation.
 *
 * fetch() collapses ".." before the request leaves, so it cannot test the
 * server's containment at all — a traversal test built on fetch passes even
 * with the guard deleted. curl --path-as-is sends the raw path.
 */
function rawGet(path: string): { status: number; body: string } {
  const r = Bun.spawnSync({
    cmd: ["curl", "-s", "--path-as-is", "-w", "\n%{http_code}", `${base}${path}`],
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = r.stdout.toString();
  const cut = out.lastIndexOf("\n");
  return { status: parseInt(out.slice(cut + 1), 10), body: out.slice(0, cut) };
}

function write(rel: string, body: string) {
  const full = join(tmpWork, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, body);
}

beforeAll(async () => {
  mkdirSync(tmpWork, { recursive: true });
  // A real file outside the served tree, and a sibling dir sharing its prefix.
  writeFileSync(join(tmpWork, "..", "OUTSIDE-SECRET.md"), "# TOPSECRET-OUTSIDE\n");
  mkdirSync(`${tmpWork}-evil`, { recursive: true });
  writeFileSync(join(`${tmpWork}-evil`, "sibling.md"), "# TOPSECRET-SIBLING\n");

  write("reports/monday-plan/2026-06-15.md", "# Monday Plan — W25\n\n## Promises\n\nNone.\n");
  write("reports/daily-brief/2026-06-15.md", "# Daily Brief\n\n## Yesterday\n\nNothing.\n");
  write("WORK_LEDGER.md", "# Promises\n\n| Who | What | Due |\n|---|---|---|\n| Sam | spec | Fri |\n");
  write("BRAG.md", "# Brag\n\n- Shipped the thing\n");
  write(
    "initiatives/REGISTRY.md",
    "# Registry\n\n| Initiative | Score |\n|---|---|\n| api-gateway | 8 |\n"
  );
  write(
    "initiatives/org/api-gateway/ISA.md",
    "# ISA — api-gateway\n\n## Criteria\n\n- [x] ISC-1: done\n- [x] ISC-2: also done\n- [ ] ISC-3: pending\n"
  );
  write("initiatives/personal/flaky-tests/ISA.md", "# ISA — flaky-tests\n\n- [ ] ISC-1: open\n");
  write("meetings/2026-06-15-sam.md", "# Sam 1:1\n\n- Discussed the roadmap\n");
  write("observations/ci-slow.md", "# CI is slow\n\nNoticed during triage.\n");
  write("briefs/pain-map.md", "# Pain map\n\n| Area | Pain |\n|---|---|\n| CI | slow |\n");
  write("worklog/eod/2026-06-15.md", "# EOD\n\ndone: shipped it\n");
  write("repos.json", '{"my-repo":"https://github.com/org/my-repo"}');
  write("secret.bin", "not viewable");
  // A symlink inside the tree pointing out of it — the textual guard cannot see this.
  symlinkSync(join(tmpWork, "..", "OUTSIDE-SECRET.md"), join(tmpWork, "escape-link.md"));

  server = Bun.spawn(["bun", resolve(toolsDir, "serve.ts"), "--port", String(PORT)], {
    env: { ...process.env, WORK_DIR: tmpWork },
    stdout: "pipe",
    stderr: "pipe",
  });

  const start = Date.now();
  while (Date.now() - start < 5000) {
    try {
      if ((await get("/")).ok) break;
    } catch {}
    await Bun.sleep(100);
  }
});

afterAll(() => {
  server?.kill();
  rmSync(tmpWork, { recursive: true, force: true });
  rmSync(`${tmpWork}-evil`, { recursive: true, force: true });
  rmSync(join(tmpWork, "..", "OUTSIDE-SECRET.md"), { force: true });
});

describe("serve.ts — home", () => {
  test("lists every major section, not just reports", async () => {
    const html = await text("/");
    for (const section of [
      "Initiatives",
      "Meetings",
      "Briefs",
      "Observations",
      "Worklog",
      "Reports",
    ]) {
      expect(html).toContain(section);
    }
  });

  test("pins the ledger, brag doc, and registry", async () => {
    const html = await text("/");
    expect(html).toContain("WORK_LEDGER.md");
    expect(html).toContain("BRAG.md");
    expect(html).toContain("initiatives/REGISTRY.md");
  });

  test("counts the files in each section", async () => {
    const html = await text("/");
    // reports/ holds two files across two subdirectories.
    expect(html).toMatch(/Reports<span class="badge">2<\/span>/);
  });
});

describe("serve.ts — browsing", () => {
  test("lists a directory's contents", async () => {
    const html = await text("/browse/reports");
    expect(html).toContain("monday-plan/");
    expect(html).toContain("daily-brief/");
  });

  test("descends into nested directories", async () => {
    const html = await text("/browse/initiatives/org/api-gateway");
    expect(html).toContain("ISA.md");
  });

  test("shows breadcrumbs back to the root", async () => {
    const html = await text("/browse/initiatives/org/api-gateway");
    expect(html).toContain('class="crumbs"');
    expect(html).toContain('href="/"');
    expect(html).toContain("initiatives");
  });

  test("renders a report page", async () => {
    const html = await text("/browse/reports/monday-plan/2026-06-15.md");
    expect(html).toContain("<h1>Monday Plan");
    expect(html).toContain("<h2>Promises</h2>");
  });

  test("serves files outside reports/", async () => {
    const html = await text("/browse/meetings/2026-06-15-sam.md");
    expect(html).toContain("Sam 1:1");
    expect(html).toContain("Discussed the roadmap");
  });

  test("renders non-markdown text files as preformatted text", async () => {
    const html = await text("/browse/repos.json");
    expect(html).toContain("<pre><code>");
    expect(html).toContain("my-repo");
  });
});

describe("serve.ts — tables", () => {
  test("renders the promise ledger's table as HTML", async () => {
    const html = await text("/browse/WORK_LEDGER.md");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Who</th>");
    expect(html).toContain("<td>Sam</td>");
    expect(html).not.toContain("|---|");
  });

  test("renders the registry's table as HTML", async () => {
    const html = await text("/browse/initiatives/REGISTRY.md");
    expect(html).toContain("<th>Score</th>");
    expect(html).toContain("<td>8</td>");
  });
});

describe("serve.ts — initiative progress", () => {
  test("shows ISA criteria progress beside an initiative directory", async () => {
    const html = await text("/browse/initiatives/org");
    expect(html).toContain("api-gateway");
    expect(html).toContain("2/3");
    expect(html).toContain('class="progress');
  });

  test("shows progress at the top of an ISA document", async () => {
    const html = await text("/browse/initiatives/org/api-gateway/ISA.md");
    expect(html).toContain("2/3");
    expect(html).toContain("criteria met");
  });

  test("marks a fully-unmet ISA as zero progress", async () => {
    const html = await text("/browse/initiatives/personal");
    expect(html).toContain("0/1");
  });

  test("renders criteria as task markers, not raw brackets", async () => {
    const html = await text("/browse/initiatives/org/api-gateway/ISA.md");
    expect(html).toContain('class="task done"');
    expect(html).toContain('class="task todo"');
  });
});

describe("serve.ts — safety and errors", () => {
  test("refuses raw path traversal out of WORK_DIR", () => {
    // Each of these resolves to a real file holding a known marker, so a leak
    // shows up as content rather than only as a status code.
    const attempts = [
      "/browse/../OUTSIDE-SECRET.md",
      "/browse/initiatives/../../OUTSIDE-SECRET.md",
      "/browse/%2e%2e/OUTSIDE-SECRET.md",
      "/browse/..%2fOUTSIDE-SECRET.md",
    ];
    for (const attempt of attempts) {
      const { status, body } = rawGet(attempt);
      expect(status).toBe(404);
      expect(body).not.toContain("TOPSECRET-OUTSIDE");
    }
  });

  test("refuses a sibling directory sharing the WORK_DIR prefix", () => {
    const { status, body } = rawGet("/browse/../" + tmpWork.split("/").pop() + "-evil/sibling.md");
    expect(status).toBe(404);
    expect(body).not.toContain("TOPSECRET-SIBLING");
  });

  test("refuses a symlink pointing out of WORK_DIR", () => {
    const { status, body } = rawGet("/browse/escape-link.md");
    expect(status).toBe(404);
    expect(body).not.toContain("TOPSECRET-OUTSIDE");
  });

  test("refuses absolute paths", () => {
    const { status, body } = rawGet("/browse//etc/passwd");
    expect(status).toBe(404);
    expect(body).not.toContain("root:");
  });

  test("refuses file types that are not viewable", async () => {
    expect((await get("/browse/secret.bin")).status).toBe(404);
  });

  test("unknown paths return 404", async () => {
    expect((await get("/browse/nope/missing.md")).status).toBe(404);
    expect((await get("/wat")).status).toBe(404);
  });

  test("serves HTML with the right content type", async () => {
    const res = await get("/");
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});
