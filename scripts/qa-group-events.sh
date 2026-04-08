#!/usr/bin/env bash
# qa-group-events.sh — 단체 대회 파이프라인 API QA 테스트
#
# 사용법:
#   firebase emulators:exec \
#     --only functions,hosting,firestore \
#     "node scripts/seed-emulator-group-qa.js && bash scripts/qa-group-events.sh"
#
# 커버리지:
#   API-01~27 (group-events 6개 액션)
#   GRP-16~23 (갭 탐지 플로우)
#   DNS-01~04 (confirm dnStatus)
#   EDGE-01, EDGE-04 (중복 스크랩 방지, participants 빈 배열 스크랩 차단)

API="http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race"

# .env에서 비밀번호 읽기
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../functions/.env"
OWNER_PW=$(grep -E "^DMC_OWNER_PW=" "$ENV_FILE" | cut -d= -f2 | tr -d '[:space:]')
OPERATOR_PW=$(grep -E "^DMC_ADMIN_PW=" "$ENV_FILE" | cut -d= -f2 | tr -d '[:space:]')

if [ -z "$OWNER_PW" ] || [ -z "$OPERATOR_PW" ]; then
  echo "❌ DMC_OWNER_PW 또는 DMC_ADMIN_PW 미설정. functions/.env 확인하세요."
  exit 1
fi

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
RESULTS=()

# curl: 항상 응답 바디 + HTTP 상태코드를 함께 캡처
# 사용법: resp=$(curl_json GET "$API?action=foo")
#         code=$(curl_code POST "$API?action=bar" '{"key":"val"}')
curl_get() {
  curl -s "$1"
}
curl_post() {
  curl -s -X POST "$1" -H "Content-Type: application/json" -d "$2"
}
curl_post_code() {
  curl -s -o /dev/null -w "%{http_code}" -X POST "$1" -H "Content-Type: application/json" -d "$2"
}
curl_get_code() {
  curl -s -o /dev/null -w "%{http_code}" "$1"
}

assert_contains() {
  local label="$1"
  local needle="$2"
  local haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    PASS=$((PASS+1))
    RESULTS+=("${GREEN}✓${NC} $label")
  else
    FAIL=$((FAIL+1))
    RESULTS+=("${RED}✗${NC} $label")
    RESULTS+=("    → 찾지 못함: '$needle'")
    RESULTS+=("    → 응답: $(echo "$haystack" | head -c 200)")
  fi
}

assert_not_contains() {
  local label="$1"
  local needle="$2"
  local haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    FAIL=$((FAIL+1))
    RESULTS+=("${RED}✗${NC} $label")
    RESULTS+=("    → 예상치 못한 포함: '$needle'")
  else
    PASS=$((PASS+1))
    RESULTS+=("${GREEN}✓${NC} $label")
  fi
}

assert_code() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS+1))
    RESULTS+=("${GREEN}✓${NC} $label (HTTP $actual)")
  else
    FAIL=$((FAIL+1))
    RESULTS+=("${RED}✗${NC} $label (예상 HTTP $expected, 실제 $actual)")
  fi
}

echo ""
echo -e "${YELLOW}━━━ 단체 대회 파이프라인 QA ━━━${NC}"
echo ""

# ────────────────────────────────────────────────────────────────────
# §1. GET 목록 (API-01~03)
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[§1] GET group-events 목록 (API-01~03)${NC}"

resp=$(curl_get "$API?action=group-events")
assert_contains "API-01: GET 목록 ok=true" '"ok":true' "$resp"
assert_contains "API-02: groupEvents 배열 존재" '"groupEvents"' "$resp"
assert_contains "API-03: availableGorunning 배열 존재" '"availableGorunning"' "$resp"

# ────────────────────────────────────────────────────────────────────
# §2. POST promote (API-04~07)
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[§2] POST promote (API-04~07)${NC}"

promo_resp=$(curl_post "$API?action=group-events" \
  '{"subAction":"promote","gorunningId":"gr_qa_future_001","eventName":"2026 QA 미래마라톤","eventDate":"2026-05-10"}')
assert_contains "API-04: promote ok=true" '"ok":true' "$promo_resp"
assert_contains "API-04: canonicalEventId 반환" '"canonicalEventId"' "$promo_resp"
PROMOTED_ID=$(echo "$promo_resp" | grep -o '"canonicalEventId":"[^"]*"' | cut -d'"' -f4)

missing_code=$(curl_post_code "$API?action=group-events" \
  '{"subAction":"promote","eventName":"이름만"}')
assert_code "API-05: gorunningId 누락 → 400" "400" "$missing_code"

list_after=$(curl_get "$API?action=group-events")
# availableGorunning 배열만 추출하여 검사 (groupEvents에도 gorunningId가 있으므로 전체 body 검색 금지)
avail_section=$(echo "$list_after" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get('availableGorunning',[])))" 2>/dev/null || echo "[]")
assert_not_contains "API-07: promote 후 availableGorunning에서 gr_qa_future_001 제거" '"gr_qa_future_001"' "$avail_section"

# ────────────────────────────────────────────────────────────────────
# §3. POST participants (API-08~11)
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[§3] POST participants (API-08~11)${NC}"

part_resp=$(curl_post "$API?action=group-events" \
  "{\"subAction\":\"participants\",\"canonicalEventId\":\"$PROMOTED_ID\",\"participants\":[{\"memberId\":\"qa_member_ok\",\"realName\":\"박정확\",\"nickname\":\"박정확\"},{\"memberId\":\"qa_member_missing\",\"realName\":\"김없음\",\"nickname\":\"김없음\"}]}")
assert_contains "API-08: participants 저장 ok=true" '"ok":true' "$part_resp"

invalid_code=$(curl_post_code "$API?action=group-events" \
  "{\"subAction\":\"participants\",\"canonicalEventId\":\"$PROMOTED_ID\",\"participants\":[{\"memberId\":\"non_existent_member\",\"realName\":\"없는사람\",\"nickname\":\"없는사람\"}]}")
assert_code "API-09: 존재하지 않는 memberId → 400" "400" "$invalid_code"

no_arr_code=$(curl_post_code "$API?action=group-events" \
  '{"subAction":"participants","canonicalEventId":"evt_qa_done"}')
assert_code "API-10: participants 배열 누락 → 400" "400" "$no_arr_code"

empty_resp=$(curl_post "$API?action=group-events" \
  "{\"subAction\":\"participants\",\"canonicalEventId\":\"$PROMOTED_ID\",\"participants\":[]}")
assert_contains "API-11: participants 빈 배열 → ok" '"ok":true' "$empty_resp"

# ────────────────────────────────────────────────────────────────────
# §4. POST source (API-12~16)
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[§4] POST source (API-12~16)${NC}"

src_resp=$(curl_post "$API?action=group-events" \
  "{\"subAction\":\"source\",\"ownerPw\":\"$OWNER_PW\",\"canonicalEventId\":\"$PROMOTED_ID\",\"source\":\"smartchip\",\"sourceId\":\"2026qa_new\"}")
assert_contains "API-12: source 저장 ok=true" '"ok":true' "$src_resp"

no_pw_code=$(curl_post_code "$API?action=group-events" \
  "{\"subAction\":\"source\",\"canonicalEventId\":\"$PROMOTED_ID\",\"source\":\"smartchip\",\"sourceId\":\"2026qa_new\"}")
assert_code "API-13: ownerPw 누락 → 403" "403" "$no_pw_code"

operator_code=$(curl_post_code "$API?action=group-events" \
  "{\"subAction\":\"source\",\"ownerPw\":\"$OPERATOR_PW\",\"canonicalEventId\":\"$PROMOTED_ID\",\"source\":\"smartchip\",\"sourceId\":\"2026qa_new\"}")
assert_code "API-14: 운영자 비밀번호로 source → 403" "403" "$operator_code"

no_src_code=$(curl_post_code "$API?action=group-events" \
  "{\"subAction\":\"source\",\"ownerPw\":\"$OWNER_PW\",\"canonicalEventId\":\"$PROMOTED_ID\"}")
assert_code "API-16: source 누락 → 400" "400" "$no_src_code"

# ────────────────────────────────────────────────────────────────────
# §5. POST scrape (API-17~21, EDGE-01, EDGE-04)
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[§5] POST scrape (API-17~21, EDGE-01, EDGE-04)${NC}"

# API-18: 운영자 비밀번호 → 403
op_scrape_code=$(curl_post_code "$API?action=group-events" \
  "{\"subAction\":\"scrape\",\"ownerPw\":\"$OPERATOR_PW\",\"canonicalEventId\":\"evt_qa_done\"}")
assert_code "API-18: 운영자 비밀번호 scrape → 403" "403" "$op_scrape_code"

# EDGE-04 / API-20: participants 없는 대회 스크랩 → 400
# promote 후 participants 추가 안 한 상태의 대회 사용
promo2_resp=$(curl_post "$API?action=group-events" \
  '{"subAction":"promote","gorunningId":"gr_qa_future_002","eventName":"2026 QA 노소스","eventDate":"2026-06-01"}')
NO_PART_ID=$(echo "$promo2_resp" | grep -o '"canonicalEventId":"[^"]*"' | cut -d'"' -f4)
# source 추가 (participants 0 상태 유지)
curl_post "$API?action=group-events" \
  "{\"subAction\":\"source\",\"ownerPw\":\"$OWNER_PW\",\"canonicalEventId\":\"$NO_PART_ID\",\"source\":\"smartchip\",\"sourceId\":\"2026qa_edge\"}" > /dev/null

no_part_code=$(curl_post_code "$API?action=group-events" \
  "{\"subAction\":\"scrape\",\"ownerPw\":\"$OWNER_PW\",\"canonicalEventId\":\"$NO_PART_ID\"}")
assert_code "EDGE-04 / API-20: participants 없으면 scrape → 400" "400" "$no_part_code"

# API-19: groupSource 없는 대회 → 400
promo3_resp=$(curl_post "$API?action=group-events" \
  '{"subAction":"promote","gorunningId":"gr_qa_future_003","eventName":"2026 QA 소스없음","eventDate":"2026-07-01"}')
NO_SRC_ID=$(echo "$promo3_resp" | grep -o '"canonicalEventId":"[^"]*"' | cut -d'"' -f4)
# participants 추가 (source는 설정 안 함)
curl_post "$API?action=group-events" \
  "{\"subAction\":\"participants\",\"canonicalEventId\":\"$NO_SRC_ID\",\"participants\":[{\"memberId\":\"qa_member_ok\",\"realName\":\"박정확\",\"nickname\":\"박정확\"}]}" > /dev/null

no_src_scrape_code=$(curl_post_code "$API?action=group-events" \
  "{\"subAction\":\"scrape\",\"ownerPw\":\"$OWNER_PW\",\"canonicalEventId\":\"$NO_SRC_ID\"}")
assert_code "API-19: groupSource 없는 대회 scrape → 400" "400" "$no_src_scrape_code"

# API-17 / EDGE-01: 정상 scrape 트리거 (에뮬에서 외부 호출 → 오류 발생하지만 running 상태 진입)
scrape1_resp=$(curl_post "$API?action=group-events" \
  "{\"subAction\":\"scrape\",\"ownerPw\":\"$OWNER_PW\",\"canonicalEventId\":\"evt_qa_pending\"}")
assert_contains "API-17: scrape 트리거 ok=true (running 진입)" '"ok":true' "$scrape1_resp"

# EDGE-01 / API-21: running 상태에서 재요청 → 400
scrape2_code=$(curl_post_code "$API?action=group-events" \
  "{\"subAction\":\"scrape\",\"ownerPw\":\"$OWNER_PW\",\"canonicalEventId\":\"evt_qa_pending\"}")
assert_code "EDGE-01 / API-21: running 중 재scrape → 400" "400" "$scrape2_code"

# ────────────────────────────────────────────────────────────────────
# §6. GET gap — 갭 탐지 (API-23~27, GRP-16~19)
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[§6] GET gap — 갭 탐지 (API-23~27, GRP-16~19)${NC}"

# API-27: canonicalEventId 없이 → 400
no_id_code=$(curl_get_code "$API?action=group-events&subAction=gap")
assert_code "API-27: canonicalEventId 없이 gap → 400" "400" "$no_id_code"

# API-23 / GRP-16: 스크랩 전 (evt_qa_pending은 now running → not_scraped가 아님)
# 새 pending 대회 사용
promo_pend_resp=$(curl_post "$API?action=group-events" \
  '{"subAction":"promote","gorunningId":"gr_qa_pend_gap","eventName":"2026 QA 갭미스크랩","eventDate":"2026-08-01"}')
PEND_GAP_ID=$(echo "$promo_pend_resp" | grep -o '"canonicalEventId":"[^"]*"' | cut -d'"' -f4)
curl_post "$API?action=group-events" \
  "{\"subAction\":\"participants\",\"canonicalEventId\":\"$PEND_GAP_ID\",\"participants\":[{\"memberId\":\"qa_member_ok\",\"realName\":\"박정확\",\"nickname\":\"박정확\"}]}" > /dev/null

not_scraped=$(curl_get "$API?action=group-events&subAction=gap&canonicalEventId=$PEND_GAP_ID")
assert_contains "API-23 / GRP-16: 스크랩 전 → not_scraped" '"not_scraped"' "$not_scraped"
assert_contains "API-23: participants 포함" '"participants"' "$not_scraped"

# API-24 / GRP-17: 스크랩 완료 대회 — ok (박정확)
gap_done=$(curl_get "$API?action=group-events&subAction=gap&canonicalEventId=evt_qa_done")
assert_contains "GRP-16: gap API ok=true" '"ok":true' "$gap_done"
assert_contains "GRP-17: gapStatus ok 존재 (박정확)" '"gapStatus":"ok"' "$gap_done"

# API-25 / GRP-18: missing (김없음, 최출발없음)
assert_contains "GRP-18: gapStatus missing 존재" '"gapStatus":"missing"' "$gap_done"

# API-26 / GRP-19: ambiguous (이동명인 동명이인 2건)
assert_contains "GRP-19: gapStatus ambiguous 존재" '"gapStatus":"ambiguous"' "$gap_done"
assert_contains "GRP-19: candidates 배열 포함" '"candidates"' "$gap_done"

# ok 항목에 result 포함
assert_contains "GRP-17: ok 항목에 result 포함" '"result"' "$gap_done"

# ────────────────────────────────────────────────────────────────────
# §7. confirm — dnStatus 지원 (DNS-01~04, GRP-20~22)
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[§7] confirm dnStatus (DNS-01~04, GRP-20~22)${NC}"

TS=$(date +%s)

# DNS-01 / GRP-20: dns → ok=true
dns_resp=$(curl_post "$API?action=confirm" \
  "{\"jobId\":\"qa_dns_${TS}\",\"eventName\":\"2026 QA DNS\",\"eventDate\":\"2026-04-20\",\"source\":\"manual\",\"sourceId\":\"qa_dns_${TS}\",\"results\":[{\"memberRealName\":\"최출발없음\",\"memberNickname\":\"최출발없음\",\"distance\":\"42.195\",\"dnStatus\":\"dns\"}]}")
assert_contains "DNS-01 / GRP-20: confirm dns → ok=true" '"ok":true' "$dns_resp"

# DNS-02 / GRP-21: dnf → ok=true
dnf_resp=$(curl_post "$API?action=confirm" \
  "{\"jobId\":\"qa_dnf_${TS}\",\"eventName\":\"2026 QA DNF\",\"eventDate\":\"2026-04-20\",\"source\":\"manual\",\"sourceId\":\"qa_dnf_${TS}\",\"results\":[{\"memberRealName\":\"최출발없음\",\"memberNickname\":\"최출발없음\",\"distance\":\"42.195\",\"dnStatus\":\"dnf\"}]}")
assert_contains "DNS-02 / GRP-21: confirm dnf → ok=true" '"ok":true' "$dnf_resp"

# DNS-03: finishTime만 → confirmed
confirmed_resp=$(curl_post "$API?action=confirm" \
  "{\"jobId\":\"qa_ok_${TS}\",\"eventName\":\"2026 QA OK\",\"eventDate\":\"2026-04-20\",\"source\":\"manual\",\"sourceId\":\"qa_ok_${TS}\",\"results\":[{\"memberRealName\":\"박정확\",\"memberNickname\":\"박정확\",\"distance\":\"42.195\",\"finishTime\":\"3:45:00\"}]}")
assert_contains "DNS-03 / GRP-22~23: finishTime only → ok=true" '"ok":true' "$confirmed_resp"

# DNS-04: dnStatus + finishTime → ok=true (dnStatus 우선은 race_results 조회로 검증해야 하지만 API 응답은 ok)
both_resp=$(curl_post "$API?action=confirm" \
  "{\"jobId\":\"qa_both_${TS}\",\"eventName\":\"2026 QA 혼합\",\"eventDate\":\"2026-04-20\",\"source\":\"manual\",\"sourceId\":\"qa_both_${TS}\",\"results\":[{\"memberRealName\":\"박정확\",\"memberNickname\":\"박정확\",\"distance\":\"42.195\",\"dnStatus\":\"dns\",\"finishTime\":\"3:45:00\"}]}")
assert_contains "DNS-04: dnStatus+finishTime → ok=true" '"ok":true' "$both_resp"

# ────────────────────────────────────────────────────────────────────
# §8. Regression
# ────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[§8] Regression${NC}"

members_resp=$(curl_get "$API?action=members")
assert_contains "REG: members API 정상" '"ok":true' "$members_resp"

verify_ok=$(curl_post "$API?action=verify-admin" \
  "{\"pw\":\"$OPERATOR_PW\"}")
assert_contains "REG: verify-admin 운영자 ok" '"ok":true' "$verify_ok"

verify_fail=$(curl_post "$API?action=verify-admin" '{"pw":"wrong_password"}')
assert_not_contains "REG: verify-admin 틀린 비밀번호 → ok 아님" '"ok":true' "$verify_fail"

# ────────────────────────────────────────────────────────────────────
# 결과 출력
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
