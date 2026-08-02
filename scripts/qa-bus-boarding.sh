#!/usr/bin/env bash
# qa-bus-boarding.sh — 버스 탑승 API QA (스펙 §10 / Phase1 Task 7)
#
# 전제: Functions + Firestore 에뮬 기동 + 시드 완료
#   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator-bus-boarding.js
#   bash scripts/qa-bus-boarding.sh
#
# 커버: settings enable, import(왕복/편도/개별/dup), self-board,
#       outbound_only return 거부, admin-board, guest upsert,
#       merge boarded 유지, public/admin note, 401, disable→403→재활성화

set -u

API="${API:-http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race}"
ADMIN_PW="${ADMIN_PW:-dmc2008}"
EVENT_ID="${EVENT_ID:-evt_bus_qa}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
RESULTS=()

curl_get() {
  curl -s "$1"
}
curl_post() {
  curl -s -X POST "$1" -H "Content-Type: application/json" -d "$2"
}
curl_post_code() {
  curl -s -o /dev/null -w "%{http_code}" -X POST "$1" -H "Content-Type: application/json" -d "$2"
}
# body + HTTP code (last line = code)
curl_post_full() {
  curl -s -w "\n%{http_code}" -X POST "$1" -H "Content-Type: application/json" -d "$2"
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

assert_not_contains() {
  local label="$1"
  local needle="$2"
  local haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    FAIL=$((FAIL+1))
    RESULTS+=("${RED}FAIL${NC} $label")
    RESULTS+=("    → 예상치 못한 포함: '$needle'")
  else
    PASS=$((PASS+1))
    RESULTS+=("${GREEN}PASS${NC} $label")
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
  # usage: json_get "$json" 'python expr printing value'
  local json="$1"
  local expr="$2"
  echo "$json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
$expr
" 2>/dev/null
}

echo ""
echo -e "${YELLOW}━━━ 버스 탑승 QA (eventId=$EVENT_ID) ━━━${NC}"
echo ""

# ────────────────────────────────────────────────────────────────────
# 1. settings enable
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[1] settings enable${NC}"

settings_resp=$(curl_post "$API?action=bus-boarding" \
  "{\"subAction\":\"settings\",\"pw\":\"$ADMIN_PW\",\"eventId\":\"$EVENT_ID\",\"enabled\":true,\"legs\":[\"outbound\",\"return\"]}")
assert_contains "1a: settings enable ok" '"ok":true' "$settings_resp"
assert_contains "1b: enabled true" '"enabled":true' "$settings_resp"

# ────────────────────────────────────────────────────────────────────
# 2. import 왕복+편도+개별(제외) + CSV 내 닉네임 중복 → errors
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[2] import (왕복/편도/개별/dup)${NC}"

import_body=$(cat <<EOF
{
  "subAction": "import",
  "pw": "$ADMIN_PW",
  "eventId": "$EVENT_ID",
  "sourceLabel": "qa-seed-csv",
  "rows": [
    {"nickname": "라우펜더만", "realName": "라우펜더만", "rideTypeLabel": "왕복", "note": "왕복비고"},
    {"nickname": "테스터", "realName": "테스터", "rideTypeLabel": "동탄→철원", "note": null},
    {"nickname": "개별자", "realName": "개별자", "rideTypeLabel": "개별 이동"},
    {"nickname": "중복닉", "realName": "A", "rideTypeLabel": "왕복"},
    {"nickname": "중복닉", "realName": "B", "rideTypeLabel": "왕복"}
  ]
}
EOF
)
import_resp=$(curl_post "$API?action=bus-boarding" "$import_body")
assert_contains "2a: import ok" '"ok":true' "$import_resp"

added=$(json_get "$import_resp" 'print(d.get("report",{}).get("added",""))')
excluded=$(json_get "$import_resp" 'print(d.get("report",{}).get("excluded",""))')
err_dup=$(json_get "$import_resp" 'errs=d.get("report",{}).get("errors",[]); print(any(e.get("reason")=="duplicate nickname in batch" for e in errs))')
assert_eq "2b: report.added == 2 (왕복+편도)" "2" "$added"
assert_eq "2c: report.excluded == 1 (개별 이동)" "1" "$excluded"
assert_eq "2d: duplicate nickname in errors" "True" "$err_dup"

admin_status=$(curl_post "$API?action=bus-boarding" \
  "{\"subAction\":\"status\",\"pw\":\"$ADMIN_PW\",\"eventId\":\"$EVENT_ID\"}")
roster_nicks=$(json_get "$admin_status" 'print(",".join(sorted(r.get("nickname","") for r in d.get("roster",[]))))')
assert_eq "2e: roster has 라우펜더만,테스터 only" "라우펜더만,테스터" "$roster_nicks"

LAUFEN_ID=$(json_get "$admin_status" '
r=next(x for x in d["roster"] if x["nickname"]=="라우펜더만"); print(r["rosterId"])')
TESTER_ID=$(json_get "$admin_status" '
r=next(x for x in d["roster"] if x["nickname"]=="테스터"); print(r["rosterId"])')
LAUFEN_RIDE=$(json_get "$admin_status" '
r=next(x for x in d["roster"] if x["nickname"]=="라우펜더만"); print(r.get("rideType"))')
TESTER_RIDE=$(json_get "$admin_status" '
r=next(x for x in d["roster"] if x["nickname"]=="테스터"); print(r.get("rideType"))')
assert_eq "2f: 라우펜더만 rideType=roundtrip" "roundtrip" "$LAUFEN_RIDE"
assert_eq "2g: 테스터 rideType=outbound_only" "outbound_only" "$TESTER_RIDE"

# ────────────────────────────────────────────────────────────────────
# 3. self-board outbound
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[3] self-board outbound${NC}"

sb_out=$(curl_post "$API?action=bus-boarding" \
  "{\"subAction\":\"self-board\",\"eventId\":\"$EVENT_ID\",\"nickname\":\"라우펜더만\",\"leg\":\"outbound\"}")
assert_contains "3: self-board outbound ok" '"ok":true' "$sb_out"

# ────────────────────────────────────────────────────────────────────
# 4. roundtrip return self-board 성공
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[4] roundtrip return self-board${NC}"

sb_ret=$(curl_post "$API?action=bus-boarding" \
  "{\"subAction\":\"self-board\",\"eventId\":\"$EVENT_ID\",\"nickname\":\"라우펜더만\",\"leg\":\"return\"}")
assert_contains "4: roundtrip return self-board ok" '"ok":true' "$sb_ret"

# ────────────────────────────────────────────────────────────────────
# 5. outbound_only가 return self-board 거부
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[5] outbound_only return reject${NC}"

sb_reject_full=$(curl_post_full "$API?action=bus-boarding" \
  "{\"subAction\":\"self-board\",\"eventId\":\"$EVENT_ID\",\"nickname\":\"테스터\",\"leg\":\"return\"}")
sb_reject_code=$(echo "$sb_reject_full" | tail -n1)
sb_reject_body=$(echo "$sb_reject_full" | sed '$d')
assert_code "5a: outbound_only return → 400" "400" "$sb_reject_code"
assert_contains "5b: leg not required" 'leg not required' "$sb_reject_body"

# ────────────────────────────────────────────────────────────────────
# 6. admin-board toggle
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[6] admin-board toggle${NC}"

# 테스터 outbound 대리 탑승
ab_on=$(curl_post "$API?action=bus-boarding" \
  "{\"subAction\":\"admin-board\",\"pw\":\"$ADMIN_PW\",\"eventId\":\"$EVENT_ID\",\"rosterId\":\"$TESTER_ID\",\"leg\":\"outbound\",\"boarded\":true}")
assert_contains "6a: admin-board boarded=true ok" '"ok":true' "$ab_on"

st_after_on=$(curl_post "$API?action=bus-boarding" \
  "{\"subAction\":\"status\",\"pw\":\"$ADMIN_PW\",\"eventId\":\"$EVENT_ID\"}")
tester_boarded=$(json_get "$st_after_on" '
r=next(x for x in d["roster"] if x["nickname"]=="테스터"); print(r["legs"]["outbound"]["boarded"])')
assert_eq "6b: 테스터 outbound boarded=true" "True" "$tester_boarded"

ab_off=$(curl_post "$API?action=bus-boarding" \
  "{\"subAction\":\"admin-board\",\"pw\":\"$ADMIN_PW\",\"eventId\":\"$EVENT_ID\",\"rosterId\":\"$TESTER_ID\",\"leg\":\"outbound\",\"boarded\":false}")
assert_contains "6c: admin-board boarded=false ok" '"ok":true' "$ab_off"

st_after_off=$(curl_post "$API?action=bus-boarding" \
  "{\"subAction\":\"status\",\"pw\":\"$ADMIN_PW\",\"eventId\":\"$EVENT_ID\"}")
tester_boarded2=$(json_get "$st_after_off" '
r=next(x for x in d["roster"] if x["nickname"]=="테스터"); print(r["legs"]["outbound"]["boarded"])')
assert_eq "6d: 테스터 outbound boarded=false" "False" "$tester_boarded2"

# ────────────────────────────────────────────────────────────────────
# 7. roster-upsert 지인 → 그 닉네임 self-board 성공
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[7] roster-upsert guest + self-board${NC}"

guest_resp=$(curl_post "$API?action=bus-boarding" \
  "{\"subAction\":\"roster-upsert\",\"pw\":\"$ADMIN_PW\",\"eventId\":\"$EVENT_ID\",\"nickname\":\"지인게스트\",\"realName\":\"지인실명\",\"rideType\":\"roundtrip\",\"note\":\"지인비고\",\"isGuest\":true}")
assert_contains "7a: roster-upsert guest ok" '"ok":true' "$guest_resp"
GUEST_ID=$(json_get "$guest_resp" 'print(d.get("rosterId",""))')
assert_contains "7b: rosterId returned" 'r_' "$GUEST_ID"

guest_sb=$(curl_post "$API?action=bus-boarding" \
  "{\"subAction\":\"self-board\",\"eventId\":\"$EVENT_ID\",\"nickname\":\"지인게스트\",\"leg\":\"outbound\"}")
assert_contains "7c: guest self-board ok" '"ok":true' "$guest_sb"

# ────────────────────────────────────────────────────────────────────
# 8. import 머지 시 boarded 유지
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[8] import merge keeps boarded${NC}"

# 라우펜더만은 outbound+return boarded=true 상태. 재import 해도 유지
merge_body=$(cat <<EOF
{
  "subAction": "import",
  "pw": "$ADMIN_PW",
  "eventId": "$EVENT_ID",
  "sourceLabel": "qa-merge",
  "rows": [
    {"nickname": "라우펜더만", "realName": "라우펜더만", "rideTypeLabel": "왕복", "note": "머지후비고"}
  ]
}
EOF
)
merge_resp=$(curl_post "$API?action=bus-boarding" "$merge_body")
assert_contains "8a: merge import ok" '"ok":true' "$merge_resp"
merged=$(json_get "$merge_resp" 'print(d.get("report",{}).get("merged",""))')
assert_eq "8b: report.merged == 1" "1" "$merged"

st_merge=$(curl_post "$API?action=bus-boarding" \
  "{\"subAction\":\"status\",\"pw\":\"$ADMIN_PW\",\"eventId\":\"$EVENT_ID\"}")
laufen_out=$(json_get "$st_merge" '
r=next(x for x in d["roster"] if x["nickname"]=="라우펜더만"); print(r["legs"]["outbound"]["boarded"])')
laufen_ret=$(json_get "$st_merge" '
r=next(x for x in d["roster"] if x["nickname"]=="라우펜더만"); print(r["legs"]["return"]["boarded"])')
assert_eq "8c: 라우펜더만 outbound boarded 유지" "True" "$laufen_out"
assert_eq "8d: 라우펜더만 return boarded 유지" "True" "$laufen_ret"

# ────────────────────────────────────────────────────────────────────
# 9. public status에 note 없음 / admin status에 note 있음
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[9] public vs admin note${NC}"

public_st=$(curl_get "$API?action=bus-boarding&subAction=status&eventId=$EVENT_ID")
assert_contains "9a: public status ok" '"ok":true' "$public_st"
public_has_note_key=$(json_get "$public_st" '
print(any("note" in r for r in d.get("roster",[])))')
assert_eq "9b: public roster has no note field" "False" "$public_has_note_key"

admin_st=$(curl_post "$API?action=bus-boarding" \
  "{\"subAction\":\"status\",\"pw\":\"$ADMIN_PW\",\"eventId\":\"$EVENT_ID\"}")
admin_note=$(json_get "$admin_st" '
r=next(x for x in d["roster"] if x["nickname"]=="라우펜더만"); print(r.get("note"))')
assert_eq "9c: admin status has note" "머지후비고" "$admin_note"

# ────────────────────────────────────────────────────────────────────
# 10. pw 없이 admin-board → 401
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[10] admin-board without pw → 401${NC}"

no_pw_code=$(curl_post_code "$API?action=bus-boarding" \
  "{\"subAction\":\"admin-board\",\"eventId\":\"$EVENT_ID\",\"rosterId\":\"$TESTER_ID\",\"leg\":\"outbound\",\"boarded\":true}")
assert_code "10: pw 없이 admin-board → 401" "401" "$no_pw_code"

# ────────────────────────────────────────────────────────────────────
# 11. enabled false → 403; roster 유지; 재활성화 후 boarded 유지
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[11] disable → 403 → re-enable keeps boarded${NC}"

# snapshot boarded before disable
before_disable=$(curl_post "$API?action=bus-boarding" \
  "{\"subAction\":\"status\",\"pw\":\"$ADMIN_PW\",\"eventId\":\"$EVENT_ID\"}")
before_count=$(json_get "$before_disable" 'print(len(d.get("roster",[])))')
before_laufen=$(json_get "$before_disable" '
r=next(x for x in d["roster"] if x["nickname"]=="라우펜더만"); print(r["legs"]["outbound"]["boarded"], r["legs"]["return"]["boarded"])')

disable_resp=$(curl_post "$API?action=bus-boarding" \
  "{\"subAction\":\"settings\",\"pw\":\"$ADMIN_PW\",\"eventId\":\"$EVENT_ID\",\"enabled\":false}")
assert_contains "11a: settings disable ok" '"ok":true' "$disable_resp"
assert_contains "11b: enabled false" '"enabled":false' "$disable_resp"

sb_403=$(curl_post_code "$API?action=bus-boarding" \
  "{\"subAction\":\"self-board\",\"eventId\":\"$EVENT_ID\",\"nickname\":\"테스터\",\"leg\":\"outbound\"}")
assert_code "11c: disabled self-board → 403" "403" "$sb_403"

ab_403=$(curl_post_code "$API?action=bus-boarding" \
  "{\"subAction\":\"admin-board\",\"pw\":\"$ADMIN_PW\",\"eventId\":\"$EVENT_ID\",\"rosterId\":\"$TESTER_ID\",\"leg\":\"outbound\",\"boarded\":true}")
assert_code "11d: disabled admin-board → 403" "403" "$ab_403"

imp_403=$(curl_post_code "$API?action=bus-boarding" \
  "{\"subAction\":\"import\",\"pw\":\"$ADMIN_PW\",\"eventId\":\"$EVENT_ID\",\"rows\":[]}")
assert_code "11e: disabled import → 403" "403" "$imp_403"

# admin status still shows roster while disabled
disabled_st=$(curl_post "$API?action=bus-boarding" \
  "{\"subAction\":\"status\",\"pw\":\"$ADMIN_PW\",\"eventId\":\"$EVENT_ID\"}")
disabled_count=$(json_get "$disabled_st" 'print(len(d.get("roster",[])))')
assert_eq "11f: disabled admin status roster 유지" "$before_count" "$disabled_count"
disabled_laufen=$(json_get "$disabled_st" '
r=next(x for x in d["roster"] if x["nickname"]=="라우펜더만"); print(r["legs"]["outbound"]["boarded"], r["legs"]["return"]["boarded"])')
assert_eq "11g: disabled boarded 유지" "$before_laufen" "$disabled_laufen"

re_enable=$(curl_post "$API?action=bus-boarding" \
  "{\"subAction\":\"settings\",\"pw\":\"$ADMIN_PW\",\"eventId\":\"$EVENT_ID\",\"enabled\":true}")
assert_contains "11h: re-enable ok" '"ok":true' "$re_enable"

after_st=$(curl_post "$API?action=bus-boarding" \
  "{\"subAction\":\"status\",\"pw\":\"$ADMIN_PW\",\"eventId\":\"$EVENT_ID\"}")
after_count=$(json_get "$after_st" 'print(len(d.get("roster",[])))')
after_laufen=$(json_get "$after_st" '
r=next(x for x in d["roster"] if x["nickname"]=="라우펜더만"); print(r["legs"]["outbound"]["boarded"], r["legs"]["return"]["boarded"])')
assert_eq "11i: re-enable roster count 유지" "$before_count" "$after_count"
assert_eq "11j: re-enable boarded 유지" "$before_laufen" "$after_laufen"

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
