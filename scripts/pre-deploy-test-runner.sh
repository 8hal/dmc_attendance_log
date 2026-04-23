#!/bin/bash
# firebase emulators:exec 가 에뮬레이터 준비 후 호출하는 본 테스트 (에뮬 시작/종료 없음)
set -u

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PASS=0
FAIL=0
RESULTS=()

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

API="http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race"
HOST="http://127.0.0.1:5000"

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

echo -e "${YELLOW}[2/4] API 테스트...${NC}"

resp=$(curl -s "$API?action=members")
ok=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok',''))" 2>/dev/null)
cnt=$(echo "$resp" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('members',[])))" 2>/dev/null)
assert "members: ok=true" "True" "$ok"
assert "members: count>0" "1" "$([ "${cnt:-0}" -gt 0 ] && echo 1 || echo 0)"

resp=$(curl -s "$API?action=confirmed-races")
ok=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok',''))" 2>/dev/null)
has_docid=$(echo "$resp" | python3 -c "
import json,sys
d=json.load(sys.stdin)
races=d.get('races',[])
rows=[r for race in races for r in race.get('results',[])]
if not rows:
    print(True)
else:
    print(all('docId' in r and r.get('docId') for r in rows))
" 2>/dev/null)
assert "confirmed-races: ok=true" "True" "$ok"
assert "confirmed-races: docId(행 있을 때)" "True" "$has_docid"

resp=$(curl -s -X POST "$API?action=log" -H "Content-Type: application/json" \
  -d '{"event":"pre_deploy_test","data":{"test":true}}')
ok=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok',''))" 2>/dev/null)
assert "log: 정상 호출" "True" "$ok"

status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API?action=log" \
  -H "Content-Type: application/json" -d '{"data":{}}')
assert "log: event 누락 → 400" "400" "$status"

# Firestore 에뮬/백엔드는 docId "__*" 예약 → 존재하지 않는 일반 id 사용
status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API?action=delete-record" \
  -H "Content-Type: application/json" -d '{"docId":"zz_pre_deploy_no_such_doc","requesterName":"test"}')
if [ "$status" = "404" ] || [ "$status" = "500" ]; then
  PASS=$((PASS+1))
  RESULTS+=("${GREEN}✓${NC} delete-record: 없는 문서 → $status")
else
  FAIL=$((FAIL+1))
  RESULTS+=("${RED}✗${NC} delete-record: 없는 문서 (expected=404|500, actual=$status)")
fi

status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API?action=delete-record" \
  -H "Content-Type: application/json" -d '{"docId":"test"}')
assert "delete-record: requesterName 누락 → 400" "400" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" "$API?action=nonexistent")
assert "unknown action → 400" "400" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API?action=verify-admin" \
  -H "Content-Type: application/json" -d '{"pw":"wrong"}')
assert "verify-admin: 잘못된 비밀번호 → 401" "401" "$status"

resp=$(curl -s -X POST "$API?action=verify-admin" \
  -H "Content-Type: application/json" -d '{"pw":"dmc2008"}')
ok=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok',''))" 2>/dev/null)
assert "verify-admin: 올바른 비밀번호 → ok" "True" "$ok"

resp=$(curl -s "$API?action=event-logs&limit=5")
ok=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok',''))" 2>/dev/null)
assert "event-logs: ok=true" "True" "$ok"

resp=$(curl -s "$API?action=data-integrity")
ok=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok',''))" 2>/dev/null)
assert "data-integrity: ok=true" "True" "$ok"

resp=$(curl -s "$API?action=member-stats")
ok=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok',''))" 2>/dev/null)
assert "member-stats: ok=true" "True" "$ok"
has_fields=$(echo "$resp" | python3 -c "
import json,sys
d=json.load(sys.stdin)
required=['totalMembers','confirmedMembers','postLaunchMembers','confirmSource','funnel']
print(all(k in d for k in required))
" 2>/dev/null)
assert "member-stats: 필수 필드 포함" "True" "$has_fields"

PROXY="http://127.0.0.1:5001/dmc-attendance/asia-northeast3/scrapeProxy"
status=$(curl -s -o /dev/null -w "%{http_code}" "$PROXY?source=smartchip&sourceId=123&name=test")
assert "scrapeProxy: secret 없으면 403" "403" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" "$PROXY?secret=dmc-proxy-2026&source=smartchip")
assert "scrapeProxy: 파라미터 누락 → 400" "400" "$status"

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
assert_contains "my.html: calcPace 함수" "calcPace" "$TMP_DIR/my.html"
assert_contains "my.html: confirmSource" "confirmSource" "$TMP_DIR/my.html"

assert_contains "races.html: BETA 태그" "BETA" "$TMP_DIR/races.html"
assert_contains "races.html: calcPace 함수" "calcPace" "$TMP_DIR/races.html"
assert_contains "races.html: gender 우선순위" "member?.gender" "$TMP_DIR/races.html"
assert_contains "races.html: confirmSource" "confirmSource" "$TMP_DIR/races.html"
assert_contains "report.html: BETA 태그" "BETA" "$TMP_DIR/report.html"
assert_contains "report.html: verify-admin" "verify-admin" "$TMP_DIR/report.html"
assert_contains "report.html: 대회 예정 탭" 'data-tab="scheduled"' "$TMP_DIR/report.html"
assert_contains "report.html: 수집/예정 구분 KST" "Asia/Seoul" "$TMP_DIR/report.html"

curl -s "$HOST/admin.html" > "$TMP_DIR/admin.html"
assert_contains "admin.html: verify-admin" "verify-admin" "$TMP_DIR/admin.html"

curl -s "$HOST/index.html" > "$TMP_DIR/index.html"
assert_contains "index.html: my.html 링크" "my.html" "$TMP_DIR/index.html"

curl -s "$HOST/attendance-v2.html" > "$TMP_DIR/attendance-v2.html"
curl -s "$HOST/attendance-v2.js" > "$TMP_DIR/attendance-v2.js"
assert_contains "attendance-v2.html: 외부 스크립트" "attendance-v2.js" "$TMP_DIR/attendance-v2.html"
assert_contains "attendance-v2.js: 완료 화면 보조" "showSuccessAfterCheckin" "$TMP_DIR/attendance-v2.js"
assert_contains "attendance-v2.js: KST 달력 패딩" "firstOfMonthSundayPadKst" "$TMP_DIR/attendance-v2.js"

curl -s "$HOST/ops.html" > "$TMP_DIR/ops.html"
assert_contains "ops.html: Ops Console" "Ops Console" "$TMP_DIR/ops.html"
assert_contains "ops.html: ops-scrape-health 연동" "ops-scrape-health" "$TMP_DIR/ops.html"
assert_contains "ops.html: 시스템 건강도" "systemHealth" "$TMP_DIR/ops.html"

curl -s "$HOST/group.html" > "$TMP_DIR/group.html"
assert_contains "group.html: 단체 대회 관리" "group-events" "$TMP_DIR/group.html"
assert_contains "group.html: verify-admin" "verify-admin" "$TMP_DIR/group.html"
assert_contains "group.html: gap 탐지" "subAction=gap" "$TMP_DIR/group.html"

curl -s "$HOST/race-distance-client.js" > "$TMP_DIR/race-distance-client.js"
assert_contains "race-distance-client.js: 32K 정규화" '"32K"' "$TMP_DIR/race-distance-client.js"

! grep -q "dmc2008" "$TMP_DIR/report.html" 2>/dev/null
if [ $? -eq 0 ]; then
  PASS=$((PASS+1))
  RESULTS+=("${GREEN}✓${NC} report.html: 비밀번호 평문 없음")
else
  FAIL=$((FAIL+1))
  RESULTS+=("${RED}✗${NC} report.html: 비밀번호 평문 노출됨!")
fi

rm -rf "$TMP_DIR"

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
fi
echo -e "${GREEN}✅ 전체 통과 — 배포 가능${NC}"
exit 0
