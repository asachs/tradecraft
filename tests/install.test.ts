import { describe, test, expect, afterEach } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { mergeSettings, runInstall } from "../tools/install";

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
    const d = tmps.pop()!;
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

const SNIPPET = {
  hooks: {
    Stop: [
      {
        matcher: "",
        hooks: [{ type: "command", command: "bun ~/.claude/hooks/SessionActivityLog.hook.ts" }],
      },
    ],
  },
};

describe("mergeSettings", () => {
  test("empty existing → returns snippet hooks", () => {
    const merged = mergeSettings({}, SNIPPET) as any;
    expect(merged.hooks.Stop).toHaveLength(1);
  });

  test("preserves unrelated keys and other hook events", () => {
    const existing = { model: "opus", hooks: { PreToolUse: [{ matcher: "Bash", hooks: [] }] } };
    const merged = mergeSettings(existing, SNIPPET) as any;
    expect(merged.model).toBe("opus");
    expect(merged.hooks.PreToolUse).toHaveLength(1);
    expect(merged.hooks.Stop).toHaveLength(1);
  });

  test("idempotent — re-merging does not duplicate", () => {
    const once = mergeSettings({}, SNIPPET);
    const twice = mergeSettings(once, SNIPPET) as any;
    expect(twice.hooks.Stop).toHaveLength(1);
  });

  test("appends a distinct Stop entry without clobbering existing", () => {
    const existing = {
      hooks: { Stop: [{ matcher: "", hooks: [{ type: "command", command: "bun other.ts" }] }] },
    };
    const merged = mergeSettings(existing, SNIPPET) as any;
    expect(merged.hooks.Stop).toHaveLength(2);
  });
});

describe("runInstall", () => {
  test("fresh install lays down every artifact", () => {
    const claudeDir = tmp("tc-claude-");
    const workDir = tmp("tc-work-");
    runInstall({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: false, dryRun: false, log: quiet });

    expect(existsSync(join(workDir, "worklog/eod"))).toBe(true);
    expect(existsSync(join(workDir, "initiatives/org"))).toBe(true);
    expect(existsSync(join(workDir, "initiatives/personal"))).toBe(true);
    expect(existsSync(join(workDir, "reports"))).toBe(true);
    expect(existsSync(join(workDir, "WORK_LEDGER.md"))).toBe(true);
    expect(existsSync(join(workDir, "BRAG.md"))).toBe(true);
    expect(existsSync(join(claudeDir, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(claudeDir, "hooks/SessionActivityLog.hook.ts"))).toBe(true);

    const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
    expect(settings.hooks.Stop).toHaveLength(1);
  });

  test("dry-run writes nothing", () => {
    const claudeDir = tmp("tc-claude-");
    const workDir = tmp("tc-work-");
    runInstall({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: false, dryRun: true, log: quiet });

    expect(existsSync(join(workDir, "WORK_LEDGER.md"))).toBe(false);
    expect(existsSync(join(claudeDir, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(claudeDir, "settings.json"))).toBe(false);
  });

  test("copy-if-missing preserves existing files; --force overwrites", () => {
    const claudeDir = tmp("tc-claude-");
    const workDir = tmp("tc-work-");
    mkdirSync(workDir, { recursive: true });
    writeFileSync(join(workDir, "WORK_LEDGER.md"), "MY LEDGER");

    runInstall({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: false, dryRun: false, log: quiet });
    expect(readFileSync(join(workDir, "WORK_LEDGER.md"), "utf-8")).toBe("MY LEDGER");

    runInstall({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: true, dryRun: false, log: quiet });
    expect(readFileSync(join(workDir, "WORK_LEDGER.md"), "utf-8")).not.toBe("MY LEDGER");
  });

  test("merges into an existing settings.json and backs it up", () => {
    const claudeDir = tmp("tc-claude-");
    const workDir = tmp("tc-work-");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, "settings.json"), JSON.stringify({ model: "opus" }, null, 2));

    runInstall({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: false, dryRun: false, log: quiet });

    const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
    expect(settings.model).toBe("opus");
    expect(settings.hooks.Stop).toHaveLength(1);
    expect(existsSync(join(claudeDir, "settings.json.bak"))).toBe(true);
  });

  test("second run is idempotent on settings", () => {
    const claudeDir = tmp("tc-claude-");
    const workDir = tmp("tc-work-");
    runInstall({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: false, dryRun: false, log: quiet });
    runInstall({ scaffoldDir: SCAFFOLD, claudeDir, workDir, force: false, dryRun: false, log: quiet });

    const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"));
    expect(settings.hooks.Stop).toHaveLength(1);
  });
});
