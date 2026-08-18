/**
 * Configuration — WORK_DIR resolution with tilde expansion.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";

/** Expand leading ~ to the user's home directory. */
function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  return p;
}

/**
 * Resolve WORK_DIR from the environment.
 * Precedence: WORK_DIR env var → ~/work default.
 */
export function resolveWorkDir(): string {
  const raw = process.env.WORK_DIR ?? "~/work";
  return resolve(expandTilde(raw));
}

/**
 * True when `candidate` resolves to a path strictly inside `workDir`.
 *
 * Used to contain `--out` writes. A plain `startsWith` prefix test is wrong:
 * `resolve()` strips trailing separators, so `/home/u/work-archives` shares a
 * prefix with `/home/u/work` and would pass. Compare via path segments instead.
 * `candidate === workDir` is rejected — `--out` names a file, not the dir.
 *
 * Note: comparison is case-sensitive and does not resolve symlinks; this guards
 * against mistakes, not a determined caller (who could just redirect stdout).
 */
export function isUnderWorkDir(workDir: string, candidate: string): boolean {
  const rel = relative(resolve(workDir), resolve(candidate));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Load the optional repo-link map from WORK_DIR/repos.json.
 * Maps repo basename → web base URL (e.g. "https://github.com/org/repo").
 * Commit links are rendered as `${base}/commit/${sha}`.
 * Missing or malformed file → empty map (links degrade to bare commit ids).
 */
export function loadRepoLinks(workDir: string): Record<string, string> {
  const path = resolve(workDir, "repos.json");
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const links: Record<string, string> = {};
    for (const [repo, url] of Object.entries(parsed)) {
      if (typeof url === "string") links[repo] = url.replace(/\/+$/, "");
    }
    return links;
  } catch {
    console.error(`warning: could not parse ${path}; commit ids will not be linked`);
    return {};
  }
}
