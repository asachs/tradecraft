/**
 * Configuration — WORK_DIR resolution with tilde expansion.
 */
import { homedir } from "node:os";
import { resolve } from "node:path";

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
