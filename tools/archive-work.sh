#!/usr/bin/env bash
# Weekly point-in-time archive of the work-notes repo.
#
# Complements the continuous git push to the OneDrive bare repo: this writes a
# standalone tarball snapshot of HEAD at the weekly boundary, in two places
# (a local sibling dir, and alongside the OneDrive backup remote), and keeps
# only the newest N (default 7 = ~7 weeks at weekly cadence).
#
# Env overrides:
#   WORK_DIR                (default $HOME/work)          the repo to archive
#   ARCHIVE_REMOTE          (default onedrive-backup)     git remote to derive the OneDrive dir from
#   WORK_ARCHIVE_DIR        (default $HOME/work-archives) local archive dir (outside the repo)
#   WORK_ARCHIVE_REMOTE_DIR (default <remote>/../work-archives)
#   ARCHIVE_KEEP            (default 7)                   how many snapshots to retain per location
set -euo pipefail

WORK_DIR="${WORK_DIR:-$HOME/work}"
REMOTE_NAME="${ARCHIVE_REMOTE:-onedrive-backup}"
KEEP="${ARCHIVE_KEEP:-7}"
LOCAL_DIR="${WORK_ARCHIVE_DIR:-$HOME/work-archives}"

cd "$WORK_DIR"

STAMP="$(date +%F)"
SHA="$(git rev-parse --short HEAD)"
NAME="work-${STAMP}-${SHA}.tar.gz"

# Resolve the OneDrive archive dir from the backup remote's path unless overridden.
REMOTE_ARCHIVE_DIR="${WORK_ARCHIVE_REMOTE_DIR:-}"
if [ -z "$REMOTE_ARCHIVE_DIR" ]; then
  REMOTE_GIT="$(git remote get-url "$REMOTE_NAME" 2>/dev/null || true)"
  [ -n "$REMOTE_GIT" ] && REMOTE_ARCHIVE_DIR="$(dirname "$REMOTE_GIT")/work-archives"
fi

# Build the snapshot once, locally.
mkdir -p "$LOCAL_DIR"
git archive --format=tar.gz -o "$LOCAL_DIR/$NAME" HEAD
echo "archived: $LOCAL_DIR/$NAME"

# Copy to the OneDrive archive dir if resolved.
if [ -n "$REMOTE_ARCHIVE_DIR" ]; then
  mkdir -p "$REMOTE_ARCHIVE_DIR"
  cp "$LOCAL_DIR/$NAME" "$REMOTE_ARCHIVE_DIR/$NAME"
  echo "archived: $REMOTE_ARCHIVE_DIR/$NAME"
else
  echo "WARN: could not resolve remote archive dir (remote '$REMOTE_NAME'); local snapshot only" >&2
fi

# Keep only the newest $KEEP snapshots per location (BSD-safe: no negative head).
prune() {
  local dir="$1"
  [ -d "$dir" ] || return 0
  local files=() f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    files+=("$f")
  done < <(find "$dir" -maxdepth 1 -name 'work-*.tar.gz' | sort)
  local n=${#files[@]}
  local remove=$(( n - KEEP ))
  (( remove > 0 )) || return 0
  local i
  for ((i=0; i<remove; i++)); do
    rm -f "${files[$i]}" && echo "pruned: ${files[$i]}"
  done
}
prune "$LOCAL_DIR"
[ -n "$REMOTE_ARCHIVE_DIR" ] && prune "$REMOTE_ARCHIVE_DIR"
