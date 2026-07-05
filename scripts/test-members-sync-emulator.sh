#!/usr/bin/env bash
# 6/30 정회원 명단 sync — Firestore 에뮬레이터 통합 테스트 (프로덕션·키 불필요)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v java >/dev/null 2>&1; then
  echo "JDK(java) 필요"
  exit 1
fi
if [ ! -d "$ROOT/functions/node_modules/firebase-admin" ]; then
  echo "cd functions && npm ci"
  exit 1
fi

echo "━━━ members sync 에뮬레이터 테스트 ━━━"
CMD="node scripts/seed-emulator-members-2026-03-31.js && node scripts/verify-members-sync-emulator.js"

npx -y firebase-tools@latest emulators:exec \
  --only firestore \
  --project dmc-attendance \
  "$CMD"

echo "✅ 에뮬레이터 통합 테스트 통과"
