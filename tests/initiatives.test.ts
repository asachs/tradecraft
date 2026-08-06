import { describe, test, expect, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFrontmatter, readInitiatives, reconcile, candidateOrg } from "../tools/lib/initiatives.ts";

const tmps: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "tc-init-"));
  tmps.push(d);
  return d;
}
afterEach(() => {
  while (tmps.length) {
    try {
      rmSync(tmps.pop()!, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

function mkInit(work: string, bucket: string, slug: string, fm: string): void {
  const d = join(work, bucket, slug);
  mkdirSync(d, { recursive: true });
  const body = fm ? `---\n${fm}\n---\n\n# ISA — ${slug}\n` : `# ISA — ${slug}\n`;
  writeFileSync(join(d, "ISA.md"), body);
}

describe("parseFrontmatter", () => {
  test("parses key:value pairs between fences", () => {
    const fm = parseFrontmatter("---\nkind: personal\ncandidate_org: plat-x\n---\n# hi");
    expect(fm.kind).toBe("personal");
    expect(fm.candidate_org).toBe("plat-x");
  });
  test("no frontmatter → empty object", () => {
    expect(parseFrontmatter("# just a heading")).toEqual({});
  });
  test("strips surrounding quotes", () => {
    expect(parseFrontmatter('---\nlabel: "plat-cd"\n---').label).toBe("plat-cd");
  });
});

describe("readInitiatives", () => {
  test("reads org and personal buckets with frontmatter", () => {
    const w = tmp();
    mkInit(w, "initiatives/org", "plat-cd", "kind: org-assigned\nlabel: plat-cd\nrole: Primary");
    mkInit(w, "initiatives/personal", "finding-a", "kind: personal\ncandidate_org: plat-cd\nfunding_status: unfunded");
    const { org, personal } = readInitiatives(w);
    expect(org.map((o) => o.slug)).toEqual(["plat-cd"]);
    expect(org[0].fm.role).toBe("Primary");
    expect(personal[0].fm.candidate_org).toBe("plat-cd");
  });
  test("missing dirs → empty arrays, no crash", () => {
    const { org, personal } = readInitiatives(tmp());
    expect(org).toEqual([]);
    expect(personal).toEqual([]);
  });
});

describe("reconcile", () => {
  test("groups feeders, flags orphans / external / unmapped, counts funding", () => {
    const w = tmp();
    mkInit(w, "initiatives/org", "plat-cd", "kind: org-assigned\nlabel: plat-cd");
    mkInit(w, "initiatives/org", "plat-iac", "kind: org-assigned\nlabel: plat-iac");
    mkInit(w, "initiatives/personal", "feeds-iac", "kind: personal\ncandidate_org: plat-iac\nfunding_status: unfunded");
    mkInit(w, "initiatives/personal", "feeds-external", "kind: personal\ncandidate_org: plat-sched\nfunding_status: unfunded");
    mkInit(w, "initiatives/personal", "pure", "kind: personal\ncandidate_org: none");
    mkInit(w, "initiatives/personal", "noscheme", ""); // no frontmatter at all

    const { org, personal } = readInitiatives(w);
    const r = reconcile(org, personal);

    const iac = r.byOrg.find((g) => g.org.slug === "plat-iac")!;
    expect(iac.feeders.map((f) => f.slug)).toEqual(["feeds-iac"]);
    expect(r.orphanOrg.map((o) => o.slug)).toContain("plat-cd");
    expect(r.externalPersonal.map((p) => p.slug)).toEqual(["feeds-external"]);
    expect(r.unmappedPersonal.map((p) => p.slug).sort()).toEqual(["noscheme", "pure"]);
    expect(r.fundingCounts["unfunded"]).toBe(2);
  });

  test("candidateOrg treats 'none' and missing as unmapped", () => {
    expect(candidateOrg({ slug: "x", bucket: "personal", fm: { candidate_org: "none" } })).toBe("");
    expect(candidateOrg({ slug: "x", bucket: "personal", fm: {} })).toBe("");
    expect(candidateOrg({ slug: "x", bucket: "personal", fm: { candidate_org: "plat-y" } })).toBe("plat-y");
  });
});
