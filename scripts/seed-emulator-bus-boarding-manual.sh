#!/usr/bin/env bash
# 에뮬 수동 확인용 시드 헬퍼
#
# 전제: firebase emulators (functions + firestore + hosting) 기동 중
#
#   bash scripts/seed-emulator-bus-boarding-manual.sh
#
# 기본: 데모 시드(버스 ON + sample CSV 명단)
# QA용(버스 OFF): MODE=qa bash scripts/seed-emulator-bus-boarding-manual.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export FIRESTORE_EMULATOR_HOST="${FIRESTORE_EMULATOR_HOST:-127.0.0.1:8080}"
MODE="${MODE:-demo}"

if [ ! -d "functions/node_modules/firebase-admin" ]; then
  echo "functions/node_modules 없음 → cd functions && npm ci"
  exit 1
fi

echo "FIRESTORE_EMULATOR_HOST=$FIRESTORE_EMULATOR_HOST MODE=$MODE"
echo ""

if [ "$MODE" = "qa" ]; then
  node scripts/seed-emulator-bus-boarding.js
  echo ""
  echo "QA 시드 완료 (busBoarding 없음). 자동화: bash scripts/qa-bus-boarding.sh"
else
  # 단체 대회 gap UI까지 보려면 group-qa도 함께
  if [ "${WITH_GROUP_QA:-1}" = "1" ]; then
    node scripts/seed-emulator-group-qa.js || true
  fi
  node scripts/seed-emulator-bus-boarding-demo.js
  echo ""
  echo "테스트 CSV: scripts/fixtures/bus-boarding-sample.csv"
  echo "  (총무 화면에서 재import 연습용 — 중복닉/개별이동 행 포함)"
fi
