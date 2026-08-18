import { describe, test, expect, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, lstatSync, readlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import {
  buildLiteSnippet,
  checkLiteInstall,
  mergePermissions,
  injectImport,
  runInstallLite,
} from "../tools/install-lite.ts";

const SCAFFOLD = resolve(dirname(import.meta.path), "..");
const quiet = () => {};

const tmps: string[] = [];
function tmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
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

describe("buildLiteSnippet", () => {
  test("hook commands reference the repo path, an absolute bun, and self-guard", () => {
    const snip = buildLiteSnippet("/repo", "/opt/homebrew/bin/bun") as any;
    const cmd = snip.hooks.SessionStart[0].hooks[0].command;
    expect(cmd).toBe('[ -f "/repo/hooks/WorkBrief.hook.ts" ] && "/opt/homebrew/bin/bun" "/repo/hooks/WorkBrief.hook.ts" || true');
    // Must NOT use bare `bun` — hooks run under a minimal PATH without Homebrew.
    expect(cmd).not.toMatch(/&& bun /);
  });

  test("grants scoped Bash, never a blanket allow, and denies osascript", () => {
    const snip = buildLiteSnippet("/repo", "/opt/homebrew/bin/bun") as any;
    expect(snip.permissions.allow).toEqual(["Bash(git *)", "Bash(bun *)"]);
    expect(snip.permissions.allow).not.toContain("Bash");
    expect(snip.permissions.deny).toContain("Bash(osascript *)");
  });
});

describe("mergePermissions", () => {
  test("unions allow/deny, de-duplicates, preserves existing order", () => {
    const existing = { permissions: { allow: ["Bash(git *)", "Read(**)"] } };
    const snip = buildLiteSnippet("/repo");
    const merged = mergePermissions(existing, snip) as any;
    expect(merged.permissions.allow).toEqual(["Bash(git *)", "Read(**)", "Bash(bun *)"]);
    expect(merged.permissions.deny).toContain("Bash(osascript *)");
  });

  test("no permissions in snippet → existing untouched", () => {
    const existing = { permissions: { allow: ["X"] } };
    const merged = mergePermissions(existing, { hooks: {} }) as any;
    expect(merged.permissions.allow).toEqual(["X"]);
  });
});

describe("injectImport", () => {
  test("absent file → returns just the import block", () => {
    const out = injectImport(null, "/repo")!;
    expect(out).toContain("@/repo/CLAUDE.md");
  });

  test("already present → returns null (idempotent)", () => {
    const existing = "# Policy\n@/repo/CLAUDE.md\n";
    expect(injectImport(existing, "/repo")).toBeNull();
  });

  test("existing content preserved, import appended", () => {
    const out = injectImport("# Org policy\nSSH blocked.\n", "/repo")!;
    expect(out).toContain("# Org policy");
    expect(out).toContain("SSH blocked.");
    expect(out.trimEnd().endsWith("@/repo/CLAUDE.md")).toBe(true);
  });
});

describe("runInstallLite", () => {
  test("fresh machine: creates dirs, seeds files, writes settings + CLAUDE.md", () => {
    const claudeDir = tmp("tc-c-");
    const workDir = tmp("tc-w-");
    runInstallLite({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: false, dryRun: false, log: quiet });

    expect(existsSync(join(workDir, "worklog/eod"))).toBe(true);
    expect(existsSync(join(workDir, "initiatives/org"))).toBe(true);
    expect(existsSync(join(workDir, "initiatives/personal"))).toBe(true);
    expect(existsSync(join(workDir, "WORK_LEDGER.md"))).toBe(true);

    const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(settings.permissions.allow).toContain("Bash(bun *)");

    const md = readFileSync(join(claudeDir, "CLAUDE.md"), "utf-8");
    expect(md).toContain(`@${join(SCAFFOLD, "CLAUDE.md")}`);
  });

  test("preserves an existing SSH-warning PreToolUse hook and unrelated keys", () => {
    const claudeDir = tmp("tc-c-");
    const workDir = tmp("tc-w-");
    mkdirSync(claudeDir, { recursive: true });
    const existing = {
      model: "opus[1m]",
      theme: "dark",
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "grep ssh" }] }],
      },
    };
    writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(existing, null, 2));

    runInstallLite({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: false, dryRun: false, log: quiet });

    const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
    expect(settings.model).toBe("opus[1m]");
    expect(settings.theme).toBe("dark");
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe("grep ssh");
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(existsSync(join(claudeDir, "settings.json.bak"))).toBe(true);
  });

  test("appends import to an existing CLAUDE.md and backs it up (never clobbers)", () => {
    const claudeDir = tmp("tc-c-");
    const workDir = tmp("tc-w-");
    mkdirSync(claudeDir, { recursive: true });
    const policy = "# Managed policy\nSSH commands are blocked.\n";
    writeFileSync(join(claudeDir, "CLAUDE.md"), policy);

    runInstallLite({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: false, dryRun: false, log: quiet });

    const md = readFileSync(join(claudeDir, "CLAUDE.md"), "utf-8");
    expect(md).toContain("# Managed policy");
    expect(md).toContain("SSH commands are blocked.");
    expect(md).toContain(`@${join(SCAFFOLD, "CLAUDE.md")}`);
    expect(readFileSync(join(claudeDir, "CLAUDE.md.bak"), "utf-8")).toBe(policy);
  });

  test("second run is idempotent (settings + CLAUDE.md)", () => {
    const claudeDir = tmp("tc-c-");
    const workDir = tmp("tc-w-");
    runInstallLite({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: false, dryRun: false, log: quiet });
    const r2 = runInstallLite({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: false, dryRun: false, log: quiet });

    expect(r2.installed).toHaveLength(0);
    const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(settings.permissions.allow.filter((a: string) => a === "Bash(bun *)")).toHaveLength(1);
    const md = readFileSync(join(claudeDir, "CLAUDE.md"), "utf-8");
    expect(md.match(/@.*CLAUDE\.md/g) ?? []).toHaveLength(1);
  });

  test("dry-run writes nothing", () => {
    const claudeDir = tmp("tc-c-");
    const workDir = tmp("tc-w-");
    runInstallLite({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: false, dryRun: true, log: quiet });
    expect(existsSync(join(claudeDir, "settings.json"))).toBe(false);
    expect(existsSync(join(claudeDir, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(workDir, "WORK_LEDGER.md"))).toBe(false);
    expect(existsSync(join(claudeDir, "skills", "eod"))).toBe(false);
  });

  test("symlinks repo skills into ~/.claude/skills (references the repo, idempotent)", () => {
    const claudeDir = tmp("tc-c-");
    const workDir = tmp("tc-w-");
    runInstallLite({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: false, dryRun: false, log: quiet });

    const link = join(claudeDir, "skills", "eod");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toBe(join(SCAFFOLD, "skills", "eod"));
    // The linked skill resolves to the repo's real SKILL.md.
    expect(existsSync(join(link, "SKILL.md"))).toBe(true);

    // Second run re-links nothing.
    const r2 = runInstallLite({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: false, dryRun: false, log: quiet });
    expect(r2.installed.filter((x) => x.startsWith("skill "))).toHaveLength(0);
  });

  test("never clobbers a pre-existing non-symlink skill of the same name", () => {
    const claudeDir = tmp("tc-c-");
    const workDir = tmp("tc-w-");
    const realSkill = join(claudeDir, "skills", "eod");
    mkdirSync(realSkill, { recursive: true });
    writeFileSync(join(realSkill, "SKILL.md"), "# hand-authored, do not touch\n");

    runInstallLite({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: false, dryRun: false, log: quiet });

    // Left untouched: still a real dir, not a symlink, with original content.
    expect(lstatSync(realSkill).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(realSkill, "SKILL.md"), "utf-8")).toContain("hand-authored");
  });

  test("anti: never writes a plist or references launchctl/osascript", () => {
    const claudeDir = tmp("tc-c-");
    const workDir = tmp("tc-w-");
    runInstallLite({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: false, dryRun: false, log: quiet });
    const settings = readFileSync(join(claudeDir, "settings.json"), "utf-8");
    expect(settings).not.toContain("launchctl");
    expect(settings.toLowerCase()).not.toContain(".plist");
    // osascript appears only inside a deny rule, never as an invocation.
    const parsed = JSON.parse(settings);
    for (const cmd of parsed.hooks.SessionStart.concat(parsed.hooks.Stop).flatMap((e: any) => e.hooks.map((h: any) => h.command))) {
      expect(cmd).not.toContain("osascript");
      expect(cmd).not.toContain("launchctl");
    }
  });
});

describe("checkLiteInstall", () => {
  /** Install for real, then report what the checker sees. */
  function installed() {
    const claudeDir = tmp("tc-claude-");
    const workDir = tmp("tc-work-");
    runInstallLite({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: false, dryRun: false, log: quiet });
    writeFileSync(join(workDir, "worklog", "activity.jsonl"), "{}\n");
    return { claudeDir, workDir };
  }

  const byName = (checks: ReturnType<typeof checkLiteInstall>, name: string) =>
    checks.find((c) => c.name === name)!;

  test("reports intact wiring after a fresh install", () => {
    const { claudeDir, workDir } = installed();
    const checks = checkLiteInstall({ scaffoldDir: SCAFFOLD, claudeDir, workDir });
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  test("detects settings.json being overwritten wholesale", () => {
    // Exactly the enterprise-Claude failure in #7: the file is valid, the
    // merged hooks are simply gone.
    const { claudeDir, workDir } = installed();
    writeFileSync(join(claudeDir, "settings.json"), JSON.stringify({ hooks: {} }, null, 2));

    const checks = checkLiteInstall({ scaffoldDir: SCAFFOLD, claudeDir, workDir });
    expect(byName(checks, "SessionStart brief hook").ok).toBe(false);
    expect(byName(checks, "Stop activity hook").ok).toBe(false);
    expect(byName(checks, "settings.json readable").ok).toBe(true);
  });

  test("points at the re-run command when wiring has drifted", () => {
    const { claudeDir, workDir } = installed();
    writeFileSync(join(claudeDir, "settings.json"), "{}");

    const checks = checkLiteInstall({ scaffoldDir: SCAFFOLD, claudeDir, workDir });
    expect(byName(checks, "Stop activity hook").detail).toContain("install-lite.ts");
  });

  test("detects a missing or unparseable settings.json", () => {
    const { claudeDir, workDir } = installed();
    writeFileSync(join(claudeDir, "settings.json"), "{ not json");

    const checks = checkLiteInstall({ scaffoldDir: SCAFFOLD, claudeDir, workDir });
    expect(byName(checks, "settings.json readable").ok).toBe(false);
  });

  test("detects the CLAUDE.md import being stripped", () => {
    const { claudeDir, workDir } = installed();
    writeFileSync(join(claudeDir, "CLAUDE.md"), "# org policy only\n");

    const checks = checkLiteInstall({ scaffoldDir: SCAFFOLD, claudeDir, workDir });
    expect(byName(checks, "CLAUDE.md import").ok).toBe(false);
  });

  test("flags an activity log that has stopped being written", () => {
    const { claudeDir, workDir } = installed();
    const future = new Date(Date.now() + 30 * 86_400_000);

    const checks = checkLiteInstall({ scaffoldDir: SCAFFOLD, claudeDir, workDir, now: future });
    const log = byName(checks, "activity log");
    expect(log.ok).toBe(false);
    expect(log.detail).toContain("may have been unwired");
  });

  test("flags an activity log that never appeared", () => {
    const claudeDir = tmp("tc-claude-");
    const workDir = tmp("tc-work-");
    runInstallLite({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: false, dryRun: false, log: quiet });

    const checks = checkLiteInstall({ scaffoldDir: SCAFFOLD, claudeDir, workDir });
    expect(byName(checks, "activity log").detail).toContain("never fired");
  });

  test("writes nothing", () => {
    const { claudeDir, workDir } = installed();
    const before = readFileSync(join(claudeDir, "settings.json"), "utf-8");
    checkLiteInstall({ scaffoldDir: SCAFFOLD, claudeDir, workDir });
    expect(readFileSync(join(claudeDir, "settings.json"), "utf-8")).toBe(before);
    expect(existsSync(join(claudeDir, "settings.json.check"))).toBe(false);
  });
});
