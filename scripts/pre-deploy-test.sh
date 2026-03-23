#!/bin/bash
# 배포 전 필수 테스트 스크립트
# 사용법: bash scripts/pre-deploy-test.sh
#
# Firebase 에뮬레이터를 띄우고 API + 호스팅 테스트 후 자동 종료
# 종료 코드 0 = 전부 통과, 1 = 실패 있음

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

EMU_PID=""
PASS=0
FAIL=0
RESULTS=()

cleanup() {
  if [ -n "$EMU_PID" ]; then
    kill "$EMU_PID" 2>/dev/null || true
    wait "$EMU_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ─── 색상 ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

assert() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS+1))
    RESULTS+=("${GREEN}✓${NC} $name")
  else
    FAIL=$((FAIL+1))
    RESULTS+=("${RED}✗${NC} $name (expected=$expected, actual=$actual)")
  fi
}

assert_contains() {
  local name="$1" needle="$2" file="$3"
  if grep -q "$needle" "$file" 2>/dev/null; then
    PASS=$((PASS+1))
    RESULTS+=("${GREEN}✓${NC} $name")
  else
    FAIL=$((FAIL+1))
    RESULTS+=("${RED}✗${NC} $name (missing: $needle)")
  fi
}

API="http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race"
HOST="http://127.0.0.1:5000"

echo -e "${YELLOW}━━━ 배포 전 테스트 시작 ━━━${NC}"
echo ""

# ─── 1. 에뮬레이터 시작 ───
echo -e "${YELLOW}[1/4] 에뮬레이터 시작...${NC}"
firebase emulators:start --only functions,hosting > /tmp/emu.log 2>&1 &
EMU_PID=$!

for i in $(seq 1 30); do
  if curl -s "$API?action=members" > /dev/null 2>&1; then
    echo "  에뮬레이터 준비 완료 (${i}s)"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo -e "${RED}에뮬레이터 시작 실패${NC}"
    cat /tmp/emu.log
    exit 1
  fi
  sleep 1
done

# ─── 2. API 테스트 ───
echo -e "${YELLOW}[2/4] API 테스트...${NC}"

# members
resp=$(curl -s "$API?action=members")
ok=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok',''))" 2>/dev/null)
cnt=$(echo "$resp" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('members',[])))" 2>/dev/null)
assert "members: ok=true" "True" "$ok"
assert "members: count>0" "1" "$([ "$cnt" -gt 0 ] && echo 1 || echo 0)"

# confirmed-races
resp=$(curl -s "$API?action=confirmed-races")
ok=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok',''))" 2>/dev/null)
has_docid=$(echo "$resp" | python3 -c "
import json,sys
d=json.load(sys.stdin)
races=d.get('races',[])
print(any('docId' in r for race in races for r in race.get('results',[])))
" 2>/dev/null)
assert "confirmed-races: ok=true" "True" "$ok"
assert "confirmed-races: docId 포함" "True" "$has_docid"

# log - 정상
resp=$(curl -s -X POST "$API?action=log" -H "Content-Type: application/json" \
  -d '{"event":"pre_deploy_test","data":{"test":true}}')
ok=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok',''))" 2>/dev/null)
assert "log: 정상 호출" "True" "$ok"

# log - 파라미터 누락
status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API?action=log" \
  -H "Content-Type: application/json" -d '{"data":{}}')
assert "log: event 누락 → 400" "400" "$status"

# delete-record - 존재하지 않는 문서 (Firestore 에뮬레이터 없으면 500 가능)
status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API?action=delete-record" \
  -H "Content-Type: application/json" -d '{"docId":"__test__","requesterName":"test"}')
if [ "$status" = "404" ] || [ "$status" = "500" ]; then
  PASS=$((PASS+1))
  RESULTS+=("${GREEN}✓${NC} delete-record: 없는 문서 → $status")
else
  FAIL=$((FAIL+1))
  RESULTS+=("${RED}✗${NC} delete-record: 없는 문서 (expected=404|500, actual=$status)")
fi

# delete-record - 파라미터 누락
status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API?action=delete-record" \
  -H "Content-Type: application/json" -d '{"docId":"test"}')
assert "delete-record: requesterName 누락 → 400" "400" "$status"

# unknown action
status=$(curl -s -o /dev/null -w "%{http_code}" "$API?action=nonexistent")
assert "unknown action → 400" "400" "$status"

# verify-admin
status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API?action=verify-admin" \
  -H "Content-Type: application/json" -d '{"pw":"wrong"}')
assert "verify-admin: 잘못된 비밀번호 → 401" "401" "$status"

resp=$(curl -s -X POST "$API?action=verify-admin" \
  -H "Content-Type: application/json" -d '{"pw":"dmc2008"}')
ok=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok',''))" 2>/dev/null)
assert "verify-admin: 올바른 비밀번호 → ok" "True" "$ok"

# event-logs
resp=$(curl -s "$API?action=event-logs&limit=5")
ok=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok',''))" 2>/dev/null)
assert "event-logs: ok=true" "True" "$ok"

# data-integrity
resp=$(curl -s "$API?action=data-integrity")
ok=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok',''))" 2>/dev/null)
assert "data-integrity: ok=true" "True" "$ok"

# ─── 3. 호스팅 테스트 ───
echo -e "${YELLOW}[3/4] 호스팅 테스트...${NC}"

TMP_DIR=$(mktemp -d)
curl -s "$HOST/my.html" > "$TMP_DIR/my.html"
curl -s "$HOST/races.html" > "$TMP_DIR/races.html"
curl -s "$HOST/report.html" > "$TMP_DIR/report.html"

assert_contains "my.html: BETA 태그" "BETA" "$TMP_DIR/my.html"
assert_contains "my.html: logEvent 함수" "logEvent" "$TMP_DIR/my.html"
assert_contains "my.html: deleteRecord 함수" "deleteRecord" "$TMP_DIR/my.html"
assert_contains "my.html: _alreadyConfirmed" "_alreadyConfirmed" "$TMP_DIR/my.html"
assert_contains "my.html: toggleDetail 함수" "toggleDetail" "$TMP_DIR/my.html"

assert_contains "races.html: BETA 태그" "BETA" "$TMP_DIR/races.html"
assert_contains "report.html: BETA 태그" "BETA" "$TMP_DIR/report.html"

curl -s "$HOST/index.html" > "$TMP_DIR/index.html"
assert_contains "index.html: my.html 링크" "my.html" "$TMP_DIR/index.html"

# 비밀번호 평문 노출 없음 확인
! grep -q "dmc2008" "$TMP_DIR/report.html" 2>/dev/null
if [ $? -eq 0 ]; then
  PASS=$((PASS+1))
  RESULTS+=("${GREEN}✓${NC} report.html: 비밀번호 평문 없음")
else
  FAIL=$((FAIL+1))
  RESULTS+=("${RED}✗${NC} report.html: 비밀번호 평문 노출됨!")
fi

rm -rf "$TMP_DIR"

# ─── 4. 결과 출력 ───
echo ""
echo -e "${YELLOW}━━━ 테스트 결과 ━━━${NC}"
for r in "${RESULTS[@]}"; do
  echo -e "  $r"
done
echo ""
TOTAL=$((PASS+FAIL))
echo -e "  ${GREEN}통과: $PASS${NC} / ${RED}실패: $FAIL${NC} / 전체: $TOTAL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}❌ 테스트 실패 — 배포를 진행하지 마세요${NC}"
  exit 1
else
  echo -e "${GREEN}✅ 전체 통과 — 배포 가능${NC}"
  exit 0
fi
