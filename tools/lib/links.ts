/**
 * links — render commit references as clickable markdown links.
 */

/**
 * Render a `<sha> <message>` one-liner with the sha as a markdown link
 * when the repo's web base URL is known (from WORK_DIR/repos.json).
 * Falls back to the bare string when the sha doesn't parse or no URL is mapped.
 */
export function linkifyCommit(lastCommit: string, repoUrl?: string): string {
  const m = lastCommit.match(/^([0-9a-f]{7,40})\s+(.*)$/);
  if (!m || !repoUrl) return lastCommit;
  const [, sha, message] = m;
  return `[\`${sha}\`](${repoUrl}/commit/${sha}) ${message}`;
}
