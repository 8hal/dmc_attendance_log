#!/usr/bin/env bash
# firebase-tools CLI 경로 확보 (npx 캐시·Node 24 회피)
# 사용: source "$(dirname "$0")/lib/firebase-cli.sh"
set -euo pipefail

FB_PROJECT="${FB_PROJECT:-dmc-attendance}"
FB_VERSION="${FB_VERSION:-13.29.1}"

if [[ -z "${REPO_ROOT:-}" ]]; then
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

_node_major() {
  node -e "process.stdout.write(String(process.versions.node.split('.')[0]))"
}

_check_node() {
  local major
  major="$(_node_major)"
  if [[ "$major" -gt 22 ]]; then
    echo "❌ Node $(node -v) — firebase-tools는 Node 18·20·22만 지원합니다."
    echo ""
    echo "Mac 예시:"
    echo "  nvm install 22 && nvm use 22"
    echo "  # 또는: brew install node@22 && export PATH=\"/opt/homebrew/opt/node@22/bin:\$PATH\""
    echo ""
    exit 1
  fi
}

_ensure_firebase_cli() {
  local fb="$REPO_ROOT/node_modules/.bin/firebase"
  if [[ -x "$fb" ]]; then
    FB="$fb"
    return 0
  fi
  echo "→ firebase-tools@${FB_VERSION} 로컬 설치 (루트 node_modules)..."
  (cd "$REPO_ROOT" && npm install --no-save "firebase-tools@${FB_VERSION}")
  if [[ ! -x "$fb" ]]; then
    echo "❌ firebase-tools 설치 실패. 수동:"
    echo "   cd $REPO_ROOT && npm install --save-dev firebase-tools@${FB_VERSION}"
    exit 1
  fi
  FB="$fb"
}

_check_node
_ensure_firebase_cli
