#!/usr/bin/env bash
# Updates this server to the latest code: backup → git pull → npm ci → migrate → build → restart.
#
# Usage (from the app folder, e.g. ~/thd-compliance):
#   ./scripts/deploy.sh                 update the branch that is checked out
#   ./scripts/deploy.sh --branch main   switch to another branch first (e.g. once the PR is merged)
#   ./scripts/deploy.sh --force         rebuild and restart even when there are no new commits
#   ./scripts/deploy.sh --skip-backup   don't take the pre-deploy backup
#   ./scripts/deploy.sh --no-restart    build only; restart the service yourself
#
# Settings (environment variables): SERVICE_NAME (default thd-compliance), PORT (default 8014),
# BACKUP_KEEP (pre-deploy backups to keep, default 10).
#
# If the build or the health check fails, the code is put back to the previous commit, rebuilt and
# restarted. Database migrations are not undone; the pre-deploy backup is there for that.

set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-thd-compliance}"
PORT="${PORT:-8014}"
BACKUP_KEEP="${BACKUP_KEEP:-10}"
BRANCH=""
FORCE=0
BACKUP=1
RESTART=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch) BRANCH="${2:?--branch needs a name}"; shift 2 ;;
    --force) FORCE=1; shift ;;
    --skip-backup) BACKUP=0; shift ;;
    --no-restart) RESTART=0; shift ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*" >&2; }
fail() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

# Only one deploy at a time. The lock holds the deploy's process ID, so a lock left behind by a
# deploy that was killed (closed terminal, kill -9) is noticed and cleared on the next run.
LOCK="$APP_DIR/.deploy.lock"
RUNNING=""
other_deploy_running() {
  local pid own_group group
  if [[ -f "$LOCK/pid" ]]; then
    pid="$(cat "$LOCK/pid")"
    if [[ -n "$pid" && "$pid" != "$$" ]] && kill -0 "$pid" 2>/dev/null; then RUNNING="$pid"; return 0; fi
    return 1
  fi
  # Locks from older versions of this script have no process ID: look for another deploy instead
  # (bash running this script), skipping this one's own subshells, which share its process group
  own_group="$(ps -o pgid= -p $$ | tr -d ' ')"
  for pid in $(pgrep -f '^(\S*/)?bash \S*scripts/deploy\.sh( |$)' || true); do
    group="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
    # Gone already (such as the subshell that ran pgrep), or one of this deploy's own
    [[ -z "$group" || "$group" == "$own_group" ]] && continue
    RUNNING="$pid"
    return 0
  done
  return 1
}
if ! mkdir "$LOCK" 2>/dev/null; then
  if other_deploy_running; then
    fail "Another deploy is running (process $RUNNING). Wait for it to finish."
  fi
  warn "Clearing a lock left by a deploy that was stopped before it finished."
  rm -rf "$LOCK"
  mkdir "$LOCK" || fail "Could not create $LOCK."
fi
echo "$$" > "$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT
# Ctrl+C, a closed SSH session or kill still runs the cleanup above
trap 'exit 130' INT TERM HUP

step "Checking $APP_DIR"
command -v git >/dev/null || fail "git is not installed."
command -v npm >/dev/null || fail "npm is not installed."
[[ -f .env ]] || fail "No .env file here. Is this the app folder?"
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  git status --short --untracked-files=no
  fail "Files above were changed on the server. Undo them with 'git checkout -- .' (or keep them with 'git stash'), then run this again."
fi

PREVIOUS="$(git rev-parse HEAD)"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
BRANCH="${BRANCH:-$CURRENT_BRANCH}"
[[ "$BRANCH" != "HEAD" ]] || fail "No branch is checked out. Pass --branch <name>."

step "Fetching $BRANCH"
git fetch --prune origin "$BRANCH" || fail "Could not fetch '$BRANCH' from GitHub."
TARGET="$(git rev-parse "origin/$BRANCH")"

if [[ "$PREVIOUS" == "$TARGET" && "$BRANCH" == "$CURRENT_BRANCH" && $FORCE -eq 0 ]]; then
  echo "Already up to date at $(git log -1 --format='%h %s')."
  echo "Use --force to rebuild and restart anyway."
  exit 0
fi
if [[ "$PREVIOUS" != "$TARGET" ]]; then
  echo "New commits:"
  git log --oneline "$PREVIOUS..$TARGET" 2>/dev/null | head -20 || true
fi

# Back up with the code that matches the current database, before anything changes
if [[ $BACKUP -eq 1 ]]; then
  step "Backing up the database"
  npm run --silent backup -- --label pre-deploy --keep "$BACKUP_KEEP" || fail "Backup failed; nothing was changed. Use --skip-backup to deploy without one."
fi

step "Updating code"
if [[ "$BRANCH" != "$CURRENT_BRANCH" ]]; then
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git checkout "$BRANCH"
  else
    git checkout -b "$BRANCH" --track "origin/$BRANCH"
  fi
fi
git merge --ff-only "origin/$BRANCH" || fail "The server's copy of '$BRANCH' has diverged from GitHub. Nothing was changed after the backup."

restart() {
  if [[ $RESTART -eq 0 ]]; then
    warn "Skipping restart (--no-restart). Run: sudo systemctl restart $SERVICE_NAME"
    return 0
  fi
  step "Restarting $SERVICE_NAME"
  sudo systemctl restart "$SERVICE_NAME"
}

healthy() {
  [[ $RESTART -eq 1 ]] || return 0
  if ! command -v curl >/dev/null; then
    warn "curl is not installed; check http://localhost:$PORT yourself."
    return 0
  fi
  step "Waiting for http://localhost:$PORT"
  for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null --max-time 5 "http://localhost:$PORT/login"; then
      echo "The site is responding."
      return 0
    fi
    sleep 2
  done
  return 1
}

rollback() {
  warn "$1"
  warn "Rolling the code back to ${PREVIOUS:0:7}…"
  git checkout -q "$CURRENT_BRANCH"
  git reset -q --hard "$PREVIOUS"
  if npm ci && npm run build && restart && healthy; then
    warn "Rolled back: the site is running the previous version."
  else
    warn "The rollback did not come up either. Check: sudo journalctl -u $SERVICE_NAME -n 100"
  fi
  warn "Database migrations from the failed version (if any) were kept. To undo them, restore the pre-deploy backup under Admin › Backup & Restore."
  exit 1
}

step "Installing packages"
npm ci || rollback "npm ci failed."

step "Applying database migrations"
npx prisma migrate deploy || rollback "Migrations failed."

step "Building"
npm run build || rollback "The build failed."

restart || rollback "Restarting $SERVICE_NAME failed."
healthy || rollback "The site did not respond on port $PORT after the restart."

step "Done"
echo "Now running $(git log -1 --format='%h %s') on $BRANCH."
