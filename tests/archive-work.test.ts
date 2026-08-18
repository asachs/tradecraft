import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../tools/archive-work.sh");

let tmpDir: string;
let repoDir: string;
let localArchive: string;
let remoteArchive: string;

/** Create a one-commit git repo to archive. */
function makeRepo(dir: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "note.md"), "# work note\n");
  for (const cmd of [
    ["git", "init", "-q"],
    ["git", "add", "-A"],
    ["git", "-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "init"],
  ]) {
    const r = Bun.spawnSync({ cmd, cwd: dir, stdout: "pipe", stderr: "pipe" });
    if (r.exitCode !== 0) throw new Error(`setup failed: ${cmd.join(" ")}`);
  }
}

function headSha(): string {
  return Bun.spawnSync({
    cmd: ["git", "rev-parse", "--short", "HEAD"],
    cwd: repoDir,
    stdout: "pipe",
  })
    .stdout.toString()
    .trim();
}

function runArchive(env: Record<string, string> = {}) {
  const result = Bun.spawnSync({
    cmd: ["bash", script],
    env: {
      ...process.env,
      WORK_DIR: repoDir,
      WORK_ARCHIVE_DIR: localArchive,
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  };
}

const tarballs = (dir: string) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".tar.gz")).sort() : [];

beforeEach(() => {
  tmpDir = resolve(
    import.meta.dir,
    `_tmp_archive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  repoDir = join(tmpDir, "work");
  localArchive = join(tmpDir, "work-archives");
  remoteArchive = join(tmpDir, "remote-archives");
  makeRepo(repoDir);
});

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

describe("archive-work.sh", () => {
  test("exits 0 and warns when no archive remote resolves", () => {
    // Regression: the trailing `[ -n "$DIR" ] && prune` made this exit 1,
    // so a successful local-only snapshot looked like a failed archive.
    const { stderr, exitCode } = runArchive();
    expect(exitCode).toBe(0);
    expect(stderr).toContain("could not resolve remote archive dir");
    expect(tarballs(localArchive)).toHaveLength(1);
  });

  test("names the snapshot work-<date>-<sha> matching HEAD", () => {
    runArchive();
    const [name] = tarballs(localArchive);
    expect(name).toMatch(/^work-\d{4}-\d{2}-\d{2}-[0-9a-f]+\.tar\.gz$/);
    expect(name).toContain(headSha());
  });

  test("archives the repo contents at HEAD", () => {
    runArchive();
    const [name] = tarballs(localArchive);
    const listed = Bun.spawnSync({
      cmd: ["tar", "tzf", join(localArchive, name)],
      stdout: "pipe",
    }).stdout.toString();
    expect(listed).toContain("note.md");
    // git archive ships tracked files only, never the repo internals.
    expect(listed).not.toContain(".git/");
  });

  test("copies the snapshot to the remote archive dir when set", () => {
    const { exitCode } = runArchive({ WORK_ARCHIVE_REMOTE_DIR: remoteArchive });
    expect(exitCode).toBe(0);
    expect(tarballs(remoteArchive)).toEqual(tarballs(localArchive));
  });

  test("prunes to ARCHIVE_KEEP, retaining the newest per location", () => {
    for (const dir of [localArchive, remoteArchive]) {
      mkdirSync(dir, { recursive: true });
      for (const d of ["01", "02", "03"]) {
        writeFileSync(join(dir, `work-2026-01-${d}-old${d}.tar.gz`), "stale");
      }
    }

    const { exitCode } = runArchive({
      WORK_ARCHIVE_REMOTE_DIR: remoteArchive,
      ARCHIVE_KEEP: "2",
    });
    expect(exitCode).toBe(0);

    for (const dir of [localArchive, remoteArchive]) {
      const kept = tarballs(dir);
      expect(kept).toHaveLength(2);
      // Newest by name: the third stale file and today's fresh snapshot.
      expect(kept[0]).toBe("work-2026-01-03-old03.tar.gz");
      expect(kept[1]).toContain(headSha());
    }
  });

  test("leaves files alone when under the keep threshold", () => {
    runArchive({ ARCHIVE_KEEP: "7" });
    runArchive({ ARCHIVE_KEEP: "7" });
    expect(tarballs(localArchive)).toHaveLength(1); // same date+sha overwrites
  });

  test("fails when WORK_DIR is not a directory", () => {
    const { exitCode } = runArchive({ WORK_DIR: join(tmpDir, "does-not-exist") });
    expect(exitCode).not.toBe(0);
  });
});
