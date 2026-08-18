import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const toolsDir = resolve(import.meta.dir, "../tools");

let tmpDir: string;
let workDir: string;

beforeEach(() => {
  tmpDir = resolve(
    import.meta.dir,
    `_tmp_reconcile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  workDir = join(tmpDir, "work");
  mkdirSync(workDir, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

/** Write an initiative with the given frontmatter into org/ or personal/. */
function initiative(
  bucket: "org" | "personal",
  slug: string,
  fm: Record<string, string> = {}
) {
  const dir = join(workDir, "initiatives", bucket, slug);
  mkdirSync(dir, { recursive: true });
  const front = Object.entries(fm)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const body = front ? `---\n${front}\n---\n\n# ISA — ${slug}\n` : `# ISA — ${slug}\n`;
  writeFileSync(join(dir, "ISA.md"), body);
}

function runReconcile(args: string[] = []) {
  const result = Bun.spawnSync({
    cmd: ["bun", resolve(toolsDir, "Reconcile.ts"), ...args],
    env: { ...process.env, WORK_DIR: workDir },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  };
}

describe("Reconcile", () => {
  test("reports an empty work dir without crashing", () => {
    const { stdout, exitCode } = runReconcile(["--date", "2026-06-03"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Org-assigned: 0 · Personal: 0");
    expect(stdout).toContain("No org-assigned initiatives.");
    expect(stdout).toContain("None — every personal initiative names a candidate org.");
    expect(stdout).toContain("No personal initiatives.");
  });

  test("dates the report from --date", () => {
    const { stdout } = runReconcile(["--date", "2026-06-03"]);
    expect(stdout).toContain("# Project Reconciliation — 2026-06-03");
  });

  test("groups personal feeders under the org initiative they name", () => {
    initiative("org", "api-gateway");
    initiative("personal", "rate-limit-audit", {
      candidate_org: "api-gateway",
      funding_status: "funded",
    });

    const { stdout } = runReconcile(["--date", "2026-06-03"]);
    expect(stdout).toContain("Org-assigned: 1 · Personal: 1");
    expect(stdout).toContain("### api-gateway");
    expect(stdout).toContain("- rate-limit-audit [funded]");
  });

  test("renders an org initiative's label and role alongside its slug", () => {
    initiative("org", "api-gateway", { label: "API Gateway", role: "owner" });

    const { stdout } = runReconcile();
    expect(stdout).toContain("### api-gateway · API Gateway · owner");
  });

  test("matches a feeder that names the org initiative by label", () => {
    initiative("org", "api-gateway", { label: "API Gateway" });
    initiative("personal", "rate-limit-audit", { candidate_org: "API Gateway" });

    const { stdout } = runReconcile();
    expect(stdout).toContain("- rate-limit-audit");
    expect(stdout).toContain("None — every org initiative has feeding work.");
  });

  test("flags org initiatives with nothing feeding them", () => {
    initiative("org", "api-gateway");
    initiative("org", "infra-migration");
    initiative("personal", "rate-limit-audit", { candidate_org: "api-gateway" });

    const { stdout } = runReconcile();
    expect(stdout).toContain("⚠ no personal work feeding this yet");
    const orphans = stdout.split("## ⚠ Org-assigned with nothing behind them")[1];
    expect(orphans).toContain("infra-migration");
    expect(orphans).not.toContain("- api-gateway");
  });

  test("lists personal work aimed at an org initiative tracked elsewhere", () => {
    initiative("personal", "cost-review", { candidate_org: "finops-programme" });

    const { stdout } = runReconcile();
    const section = stdout.split("## Personal → external org initiatives")[1];
    expect(section).toContain("- cost-review → finops-programme");
  });

  test("flags unmapped personal work and shows its provenance", () => {
    initiative("personal", "flaky-test-hunt", { provenance: "found during CI triage" });

    const { stdout } = runReconcile();
    const section = stdout.split("## ⚠ Unmapped personal")[1];
    expect(section).toContain("- flaky-test-hunt (found during CI triage)");
  });

  test("treats candidate_org: none as unmapped", () => {
    initiative("personal", "side-quest", { candidate_org: "none" });

    const { stdout } = runReconcile();
    const section = stdout.split("## ⚠ Unmapped personal")[1];
    expect(section).toContain("- side-quest");
  });

  test("counts personal initiatives by funding status, defaulting to unset", () => {
    initiative("personal", "a", { funding_status: "funded" });
    initiative("personal", "b", { funding_status: "funded" });
    initiative("personal", "c", { funding_status: "seeking" });
    initiative("personal", "d");

    const { stdout } = runReconcile();
    const section = stdout.split("## Funding status (personal)")[1];
    expect(section).toContain("- funded: 2");
    expect(section).toContain("- seeking: 1");
    expect(section).toContain("- unset: 1");
  });

  test("writes to --out under WORK_DIR", () => {
    initiative("org", "api-gateway");
    const out = join(workDir, "reconciliation.md");

    const { exitCode } = runReconcile(["--out", out]);
    expect(exitCode).toBe(0);
    expect(readFileSync(out, "utf-8")).toContain("### api-gateway");
  });
});
