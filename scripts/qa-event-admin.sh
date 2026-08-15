#!/usr/bin/env bash
# qa-event-admin.sh — event-admin / bib scrape / self-confirm API QA
#
# 전제: Functions + Firestore 에뮬 기동 + 시드 완료
#   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator-event-admin.js
#   bash scripts/qa-event-admin.sh
#
# 또는:
#   firebase emulators:exec --only functions,hosting,firestore \
#     "node scripts/seed-emulator-event-admin.js && bash scripts/qa-event-admin.sh"
#
# 커버:
#   detail 배번 有/無 수, bus roster, my-pending-result,
#   무배번 scrape 거부(OWNER_PW 있을 때), self-confirm → race_results 1건

set -u

API="${API:-http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race}"
ADMIN_PW="${ADMIN_PW:-dmc2008}"
EVENT_ID="${EVENT_ID:-evt_event_admin_qa}"
EVENT_ID_NOBIB="${EVENT_ID_NOBIB:-evt_event_admin_qa_nobib}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../functions/.env"
OWNER_PW="${OWNER_PW:-${DMC_OWNER_PW:-}}"
if [ -z "$OWNER_PW" ] && [ -f "$ENV_FILE" ]; then
  OWNER_PW=$(grep -E "^DMC_OWNER_PW=" "$ENV_FILE" | cut -d= -f2 | tr -d '[:space:]' || true)
fi

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
RESULTS=()

CURL_MAX="${CURL_MAX:-20}"

curl_get() {
  curl -s --max-time "$CURL_MAX" "$1"
}
curl_post() {
  curl -s --max-time "$CURL_MAX" -X POST "$1" -H "Content-Type: application/json" -d "$2"
}
curl_post_code() {
  curl -s --max-time "$CURL_MAX" -o /dev/null -w "%{http_code}" -X POST "$1" -H "Content-Type: application/json" -d "$2"
}
curl_post_full() {
  curl -s --max-time "$CURL_MAX" -w "\n%{http_code}" -X POST "$1" -H "Content-Type: application/json" -d "$2"
}

assert_contains() {
  local label="$1"
  local needle="$2"
  local haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    PASS=$((PASS+1))
    RESULTS+=("${GREEN}PASS${NC} $label")
  else
    FAIL=$((FAIL+1))
    RESULTS+=("${RED}FAIL${NC} $label")
    RESULTS+=("    → 찾지 못함: '$needle'")
    RESULTS+=("    → 응답: $(echo "$haystack" | head -c 300)")
  fi
}

assert_code() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS+1))
    RESULTS+=("${GREEN}PASS${NC} $label (HTTP $actual)")
  else
    FAIL=$((FAIL+1))
    RESULTS+=("${RED}FAIL${NC} $label (예상 HTTP $expected, 실제 $actual)")
  fi
}

assert_eq() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS+1))
    RESULTS+=("${GREEN}PASS${NC} $label")
  else
    FAIL=$((FAIL+1))
    RESULTS+=("${RED}FAIL${NC} $label (예상='$expected', 실제='$actual')")
  fi
}

json_get() {
  local json="$1"
  local expr="$2"
  echo "$json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
$expr
" 2>/dev/null
}

echo ""
echo -e "${YELLOW}━━━ event-admin QA (eventId=$EVENT_ID) ━━━${NC}"
echo ""

# ────────────────────────────────────────────────────────────────────
# 1. detail — 배번 있는 참가자 2 / 없는 1
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[1] detail bib counts${NC}"

detail=$(curl_get "$API?action=group-events&subAction=detail&eventId=$EVENT_ID")
assert_contains "1a: detail ok" '"ok":true' "$detail"

with_bib=$(json_get "$detail" '
parts=(d.get("event") or {}).get("participants") or []
print(sum(1 for p in parts if str(p.get("bib") or "").strip()))')
no_bib=$(json_get "$detail" '
parts=(d.get("event") or {}).get("participants") or []
print(sum(1 for p in parts if not str(p.get("bib") or "").strip()))')
total=$(json_get "$detail" '
print(len((d.get("event") or {}).get("participants") or []))')

assert_eq "1b: scrape 대상(bib 有) == 2" "2" "$with_bib"
assert_eq "1c: 무배번 == 1" "1" "$no_bib"
assert_eq "1d: participants 총 3" "3" "$total"

gs=$(json_get "$detail" 'print(((d.get("event") or {}).get("groupSource") or {}).get("source",""))')
assert_eq "1e: groupSource smartchip" "smartchip" "$gs"

# ────────────────────────────────────────────────────────────────────
# 2. bus-boarding public status
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[2] bus boarding roster${NC}"

bus=$(curl_get "$API?action=bus-boarding&subAction=status&eventId=$EVENT_ID")
assert_contains "2a: bus status ok" '"ok":true' "$bus"
enabled=$(json_get "$bus" 'print(d.get("enabled"))')
roster_n=$(json_get "$bus" 'print(len(d.get("roster") or []))')
assert_eq "2b: bus enabled" "True" "$enabled"
assert_eq "2c: roster length >= 2" "True" "$(json_get "$bus" 'print(len(d.get("roster") or []) >= 2)')"

# ────────────────────────────────────────────────────────────────────
# 3. my-pending-result — bib 有 → pending / bib 無 → none
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[3] my-pending-result${NC}"

pend=$(curl_get "$API?action=group-events&subAction=my-pending-result&eventId=$EVENT_ID&nickname=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("배번있음"))')")
assert_contains "3a: pending ok" '"ok":true' "$pend"
state=$(json_get "$pend" 'print(d.get("state",""))')
assert_eq "3b: 배번있음 state=pending" "pending" "$state"
assert_contains "3c: pending bib 4821" '"bib":"4821"' "$pend"

none=$(curl_get "$API?action=group-events&subAction=my-pending-result&eventId=$EVENT_ID&nickname=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("배번없음"))')")
none_state=$(json_get "$none" 'print(d.get("state",""))')
assert_eq "3d: 배번없음 state=none" "none" "$none_state"

# ────────────────────────────────────────────────────────────────────
# 4. scrape — 무배번만 대회 → 400 (OWNER_PW 있을 때)
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[4] scrape no-bib reject${NC}"

if [ -n "$OWNER_PW" ]; then
  nobib_full=$(curl_post_full "$API?action=group-events" \
    "{\"subAction\":\"scrape\",\"ownerPw\":\"$OWNER_PW\",\"canonicalEventId\":\"$EVENT_ID_NOBIB\"}")
  nobib_code=$(echo "$nobib_full" | tail -n1)
  nobib_body=$(echo "$nobib_full" | sed '$d')
  assert_code "4a: 무배번 scrape → 400" "400" "$nobib_code"
  assert_contains "4b: 배번 등록 참가자 없음" '배번 등록 참가자 없음' "$nobib_body"
else
  RESULTS+=("${YELLOW}SKIP${NC} 4a/4b: OWNER_PW/DMC_OWNER_PW 없음 — scrape 거부 스킵")
fi

# ────────────────────────────────────────────────────────────────────
# 5. self-confirm — 성공 1건 + 무배번 거부
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[5] self-confirm${NC}"

sc_full=$(curl_post_full "$API?action=group-events" \
  "{\"subAction\":\"self-confirm\",\"eventId\":\"$EVENT_ID\",\"nickname\":\"배번있음\"}")
sc_code=$(echo "$sc_full" | tail -n1)
sc_body=$(echo "$sc_full" | sed '$d')
assert_code "5a: self-confirm HTTP 200" "200" "$sc_code"
assert_contains "5a2: self-confirm ok" '"ok":true' "$sc_body"
doc_id=$(json_get "$sc_body" 'print(d.get("docId",""))')
assert_contains "5b: docId returned" '김배번' "$doc_id"

after=$(curl_get "$API?action=group-events&subAction=my-pending-result&eventId=$EVENT_ID&nickname=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("배번있음"))')")
after_state=$(json_get "$after" 'print(d.get("state",""))')
assert_eq "5c: after confirm state=confirmed" "confirmed" "$after_state"
cs=$(json_get "$after" 'print((d.get("result") or {}).get("confirmSource",""))')
assert_eq "5d: confirmSource=personal" "personal" "$cs"

# race_results 1건 (이 이벤트 기준, detail confirmedCount)
detail2=$(curl_get "$API?action=group-events&subAction=detail&eventId=$EVENT_ID")
confirmed_n=$(json_get "$detail2" 'print(d.get("confirmedCount",0))')
assert_eq "5e: race_results / confirmedCount == 1" "1" "$confirmed_n"

nobib_sc=$(curl_post_code "$API?action=group-events" \
  "{\"subAction\":\"self-confirm\",\"eventId\":\"$EVENT_ID\",\"nickname\":\"배번없음\"}")
assert_code "5f: 무배번 self-confirm → 400" "400" "$nobib_sc"

# ────────────────────────────────────────────────────────────────────
# 결과
# ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}━━━ QA 결과 ━━━${NC}"
for r in "${RESULTS[@]}"; do
  echo -e "  $r"
done
echo ""
TOTAL=$((PASS+FAIL))
echo -e "  ${GREEN}통과: $PASS${NC} / ${RED}실패: $FAIL${NC} / 전체: $TOTAL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}❌ QA 실패 항목 있음${NC}"
  exit 1
fi
echo -e "${GREEN}✅ QA 전체 통과${NC}"
exit 0
