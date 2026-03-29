#!/bin/bash
# 배포 전 필수 테스트 스크립트
# 사용법: bash scripts/pre-deploy-test.sh
#
# firebase emulators:exec 로 functions + hosting + firestore 를 한 번에 띄우고,
# Firestore 에뮬에 최소 시드 후 API·호스팅 검증. 종료 시 에뮬 자동 정리.
# 종료 코드 0 = 전부 통과, 1 = 실패
#
# 전제: firebase CLI, JDK(java), functions/npm ci

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}━━━ 배포 전 테스트 시작 ━━━${NC}"
echo ""

if ! command -v firebase >/dev/null 2>&1; then
  echo -e "${RED}firebase CLI 가 PATH 에 없습니다.${NC}"
  exit 1
fi

if ! command -v java >/dev/null 2>&1; then
  echo -e "${RED}Firestore 에뮬레이터에 JDK 가 필요합니다 (java 명령).${NC}"
  echo "  예: brew install openjdk   또는 Android Studio 번들 JDK 로 JAVA_HOME 설정"
  exit 1
fi

if [ ! -d "$ROOT_DIR/functions/node_modules/firebase-functions" ]; then
  echo -e "${RED}functions/node_modules/firebase-functions 없음.${NC}"
  echo "  에뮬레이터가 함수 소스를 로드하려면 의존성이 필요합니다: cd functions && npm ci"
  exit 1
fi

echo -e "${YELLOW}[1/4] 에뮬레이터 (emulators:exec) + 시드…${NC}"
echo "  (functions + hosting + firestore — 로컬 전용, 프로덕션 Firestore 미사용)"
echo ""

SEED="node \"${ROOT_DIR}/scripts/seed-emulator-pre-deploy.js\""
RUNNER="bash \"${ROOT_DIR}/scripts/pre-deploy-test-runner.sh\""
INNER_CMD="${SEED} && ${RUNNER}"

EMU_LOG="${TMPDIR:-/tmp}/dmc-emulators-exec-$$.log"
set +e
firebase emulators:exec \
  --only functions,hosting,firestore \
  --project dmc-attendance \
  "$INNER_CMD" 2>&1 | tee "$EMU_LOG"
EXIT_CODE=${PIPESTATUS[0]}
set -e

echo ""
if [ "$EXIT_CODE" -ne 0 ]; then
  echo -e "${RED}emulators:exec 실패 (exit $EXIT_CODE). 로그 tail:${NC}"
  tail -60 "$EMU_LOG" 2>/dev/null || true
  exit 1
fi

echo -e "${YELLOW}[4/4] 완료${NC}"
exit 0
