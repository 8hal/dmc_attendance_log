#!/usr/bin/env bash
#
# Cursor Cloud Agent environment bootstrap for DMC Attendance Log.
#
# Runs as the environment `install` step after the repository is checked out.
# Must be idempotent: it may run on a fresh image or on top of a reused
# snapshot, and it must converge without rewriting lockfiles or leaving
# background processes behind.
#
# Responsibilities:
#   1. Pin a user-level npm global prefix and expose it on PATH (for the
#      Firebase CLI) — matches the AGENTS.md toolchain contract.
#   2. Ensure the Firebase CLI is available (installed only when missing so
#      reused snapshots stay fast).
#   3. Install project dependencies deterministically from lockfiles
#      (root + functions) via `npm ci`.
#
# The Firestore emulator's JDK (Java 21) is provided by the base image and is
# intentionally not installed here.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

NPM_GLOBAL_PREFIX="${HOME}/.npm-global"
NPM_GLOBAL_BIN="${NPM_GLOBAL_PREFIX}/bin"

echo ">>> [cloud-agent-setup] configuring user-level npm prefix"
npm config set prefix "${NPM_GLOBAL_PREFIX}"

# Expose the npm global bin dir on PATH for future shells (idempotent append).
PATH_LINE='export PATH=$HOME/.npm-global/bin:$PATH'
if ! grep -qxF "${PATH_LINE}" "${HOME}/.bashrc" 2>/dev/null; then
  echo "${PATH_LINE}" >>"${HOME}/.bashrc"
fi
export PATH="${NPM_GLOBAL_BIN}:${PATH}"

echo ">>> [cloud-agent-setup] ensuring Firebase CLI is present"
if command -v firebase >/dev/null 2>&1; then
  echo "    firebase already installed: $(firebase --version | head -1)"
else
  npm install -g firebase-tools
  echo "    firebase installed: $(firebase --version | head -1)"
fi

echo ">>> [cloud-agent-setup] installing root dependencies (npm ci)"
npm ci

echo ">>> [cloud-agent-setup] installing Cloud Functions dependencies (npm ci)"
(cd functions && npm ci)

echo "<<< [cloud-agent-setup] complete"
