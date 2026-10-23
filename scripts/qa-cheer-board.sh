#!/usr/bin/env bash
# qa-cheer-board.sh — 응원 보드 에뮬 리허설 (춘천 주말 플랜 §3)
#
# 전제: Functions + Firestore 에뮬 기동 + 회원 시드
#   firebase emulators:start --only functions,hosting,firestore,storage --project dmc-attendance
#   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator-members-2026-03-31.js
#   bash scripts/qa-cheer-board.sh
#
# 오늘(KST) 날짜로 버릴 대회를 만들고, 조 출발을 실행 10분 전으로 둔다.
# 프로덕션 API를 가리키면 중단한다.

set -u

API="${API:-http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race}"
ADMIN_PW="${ADMIN_PW:-dmc2008}"

case "$API" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "에뮬 API만 허용: $API" >&2; exit 2 ;;
esac

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'
PASS=0
FAIL=0

check() {
  if [ "$2" = "$3" ]; then
    echo -e "${GREEN}PASS${NC} $1"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}FAIL${NC} $1 (기대 $3, 실제 $2)"
    FAIL=$((FAIL + 1))
  fi
}

post() {
  curl -s -X POST "$API?action=group-events" -H "Content-Type: application/json" -d "$1"
}

get() {
  curl -s --get "$API" --data-urlencode action=group-events "$@"
}

TODAY=$(TZ=Asia/Seoul date +%F)
START=$(TZ=Asia/Seoul date -d '-10 minutes' +%Y-%m-%dT%H:%M:00+09:00)
LATER="${TODAY}T23:59:00+09:00"

EVENT_ID=$(post "$(jq -n --arg d "$TODAY" \
  '{subAction:"promote",gorunningId:"qa-cheer-board",eventName:"응원 리허설",eventDate:$d}')" \
  | jq -r '.canonicalEventId // empty')
if [ -z "$EVENT_ID" ]; then
  echo "promote 실패 — 에뮬이 떠 있는지 확인" >&2
  exit 1
fi
echo "EVENT_ID=$EVENT_ID  eventDate=$TODAY  start=$START"

PART_FILE=$(mktemp)
curl -s "$API?action=all-members" | jq --arg id "$EVENT_ID" '{
  subAction:"participants", canonicalEventId:$id,
  participants:[.members[:4][] | {memberId:.id, nickname, realName}]}' > "$PART_FILE"
mapfile -t NICK < <(jq -r '.participants[].nickname' "$PART_FILE")
if [ "${#NICK[@]}" -lt 4 ]; then
  echo "회원 4명 이상 필요 — 회원 시드를 먼저 실행" >&2
  exit 1
fi
check "participants 저장" "$(curl -s -X POST "$API?action=group-events" \
  -H 'Content-Type: application/json' --data-binary @"$PART_FILE" | jq -r .ok)" "true"
rm -f "$PART_FILE"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
page_body() {
  node -e '
    const { buildBibBody } = require(process.argv[1] + "/assets/event-bib-form.js");
    console.log(JSON.stringify(buildBibBody(JSON.parse(process.argv[2]))));
  ' "$REPO_ROOT" "$1"
}
BUS_NICK="${NICK[3]}"
check "버스: 조 등록 전 풀 배번+목표 저장 (event-bib 본문)" "$(post "$(page_body "$(jq -n \
  --arg id "$EVENT_ID" --arg n "$BUS_NICK" \
  '{eventId:$id,nickname:$n,bib:"3001",distance:"full",waveId:"",goalH:"4",goalM:"0",goalS:"0"}')")" \
  | jq -r .ok)" "true"
check "조 등록 전에는 목표가 있어도 보드 0명" "$(get --data-urlencode subAction=cheer-board --data-urlencode "eventId=$EVENT_ID" \
  | jq '.runners | length')" "0"

WAVE_ID=$(post "$(jq -n --arg id "$EVENT_ID" --arg pw "$ADMIN_PW" --arg s "$START" \
  '{subAction:"waves",ownerPw:$pw,eventId:$id,waves:[{id:"",name:"출발",startAt:$s}]}')" \
  | jq -r '.waves[0].id // empty')
check "조 저장" "$([ -n "$WAVE_ID" ] && echo ok)" "ok"

check "다른 날짜 조는 400" "$(post "$(jq -n --arg id "$EVENT_ID" --arg pw "$ADMIN_PW" --arg w "$WAVE_ID" \
  '{subAction:"waves",ownerPw:$pw,eventId:$id,waves:[{id:$w,name:"출발",startAt:"1999-01-01T09:00:00+09:00"}]}')" \
  | jq -r .error)" "startAt date must match eventDate"

bib() {
  local nick="$1"
  shift
  post "$(jq -n --arg id "$EVENT_ID" --arg n "$nick" "$@" \
    '{subAction:"update-bib",eventId:$id,nickname:$n} + $ARGS.named')"
}

check "풀 3:30:00 저장" "$(bib "${NICK[0]}" --arg bib 1001 --arg distance full \
  --arg waveId "$WAVE_ID" --argjson goalFinishSec 12600 | jq -r .ok)" "true"
check "풀 5:00:00 저장" "$(bib "${NICK[1]}" --arg bib 1002 --arg distance full \
  --arg waveId "$WAVE_ID" --argjson goalFinishSec 18000 | jq -r .ok)" "true"
check "10K에 조를 보내면 400" "$(bib "${NICK[2]}" --arg bib 2001 --arg distance 10K \
  --arg waveId "$WAVE_ID" | jq -r .error)" "wave and goal are full marathon only"
check "10K 배번만 저장" "$(bib "${NICK[2]}" --arg bib 2001 --arg distance 10K | jq -r .ok)" "true"
check "풀 목표 0초는 400" "$(bib "${NICK[3]}" --arg bib 3001 --arg distance full \
  --arg waveId "$WAVE_ID" --argjson goalFinishSec 0 | jq -r .error)" "goal out of range"
check "버스: 목표 칸을 비우고 다시 저장해도 목표 유지" "$(post "$(page_body "$(jq -n \
  --arg id "$EVENT_ID" --arg n "$BUS_NICK" --arg w "$WAVE_ID" \
  '{eventId:$id,nickname:$n,bib:"3001",distance:"full",waveId:$w,goalH:"",goalM:"",goalS:""}')")" \
  | jq -r .ok)" "true"
check "옛 my-bib(배번만)이 조·목표를 지우지 않음" "$(bib "${NICK[0]}" --arg bib 1009 | jq -r .ok)" "true"

BOARD=$(get --data-urlencode subAction=cheer-board --data-urlencode "eventId=$EVENT_ID")
check "보드 3명 (목표 있는 풀 전원, 10K 제외)" "$(echo "$BOARD" | jq '.runners | length')" "3"
check "버스 인원 목표 4:00:00 유지" "$(echo "$BOARD" | jq -r --arg n "$BUS_NICK" \
  '.runners[] | select(.nickname==$n) | .goalFinishSec')" "14400"

check "버스 인원이 조 없이 목표를 3:55:00으로 바꿈" "$(post "$(page_body "$(jq -n \
  --arg id "$EVENT_ID" --arg n "$BUS_NICK" \
  '{eventId:$id,nickname:$n,bib:"3001",distance:"full",waveId:"",goalH:"3",goalM:"55",goalS:"0"}')")" \
  | jq -r .ok)" "true"
BOARD=$(get --data-urlencode subAction=cheer-board --data-urlencode "eventId=$EVENT_ID")
check "조 없이도 첫 출발로 보드에" "$(echo "$BOARD" | jq -r --arg n "$BUS_NICK" --arg w "$WAVE_ID" \
  '.runners[] | select(.nickname==$n) | "\(.waveId==$w) \(.goalFinishSec)"')" "true 14100"
bib "$BUS_NICK" --arg bib 3001 --arg distance 10K > /dev/null
BEFORE=$(get --data-urlencode subAction=cheer-board --data-urlencode "eventId=$EVENT_ID" | jq '.runners | length')
check "group.html 참가자 편집 재저장 (조·목표 없이 전송)" "$(post "$(get --data-urlencode subAction=detail \
  --data-urlencode "eventId=$EVENT_ID" | jq --arg id "$EVENT_ID" '{subAction:"participants", canonicalEventId:$id,
    participants:[.event.participants[] | {memberId, realName, nickname, bib, distance}]}')" | jq -r .ok)" "true"
BOARD=$(get --data-urlencode subAction=cheer-board --data-urlencode "eventId=$EVENT_ID")
check "재저장 후에도 보드 인원 유지" "$(echo "$BOARD" | jq '.runners | length')" "$BEFORE"
check "옛 저장 후에도 목표 유지" "$(echo "$BOARD" | jq -r --arg n "${NICK[0]}" \
  '.runners[] | select(.nickname==$n) | "\(.bib) \(.goalFinishSec)"')" "1009 12600"
check "km = 경과 × 42.195 / 목표 (±0.05)" "$(echo "$BOARD" | jq '[.runners[] |
  ((.km - .elapsedSec * 42.195 / .goalFinishSec) | fabs) <= 0.05] | all')" "true"
check "빠른 목표가 앞" "$(echo "$BOARD" | jq -r '.runners[0].goalFinishSec')" "12600"
check "칩 없음" "$(echo "$BOARD" | jq '[.runners[].chip] | any')" "false"
check "보드에 실명 키 없음" "$(echo "$BOARD" | jq '[.. | objects | has("realName")] | any')" "false"
echo "$BOARD" | jq -r '.runners[] | "  \(.nickname)  \(.km * 1000 | round / 1000) km  경과 \(.elapsedSec)s"'

RUNNER=$(get --data-urlencode subAction=cheer-runner --data-urlencode "eventId=$EVENT_ID" \
  --data-urlencode "runnerNickname=${NICK[0]}")
check "상세 배번·목표" "$(echo "$RUNNER" | jq -r '"\(.runner.bib) \(.runner.goalFinishSec)"')" "1009 12600"
check "상세 실명 키 없음" "$(echo "$RUNNER" | jq '[.. | objects | has("realName")] | any')" "false"
check "10K 상세는 404" "$(curl -s -o /dev/null -w '%{http_code}' --get "$API" \
  --data-urlencode action=group-events --data-urlencode subAction=cheer-runner \
  --data-urlencode "eventId=$EVENT_ID" --data-urlencode "runnerNickname=${NICK[2]}")" "404"

post "$(jq -n --arg id "$EVENT_ID" --arg pw "$ADMIN_PW" --arg w "$WAVE_ID" --arg s "$LATER" \
  '{subAction:"waves",ownerPw:$pw,eventId:$id,waves:[{id:$w,name:"출발",startAt:$s}]}')" > /dev/null
check "출발 전이면 전원 0 km" "$(get --data-urlencode subAction=cheer-board --data-urlencode "eventId=$EVENT_ID" \
  | jq '[.runners[] | .km == 0 and .elapsedSec == 0] | all')" "true"
post "$(jq -n --arg id "$EVENT_ID" --arg pw "$ADMIN_PW" --arg w "$WAVE_ID" --arg s "$START" \
  '{subAction:"waves",ownerPw:$pw,eventId:$id,waves:[{id:$w,name:"출발",startAt:$s}]}')" > /dev/null

participant_bibs() {
  get --data-urlencode subAction=detail --data-urlencode "eventId=$EVENT_ID" \
    | jq -r '[.event.participants[] | .bib] | sort | join(",")'
}
LOST=0
for round in 1 2 3 4 5; do
  for k in 0 1 3; do
    bib "${NICK[$k]}" --arg bib "8${k}0${round}" > /dev/null &
  done
  wait
  [ "$(participant_bibs)" = "$(printf '%s\n' "800$round" "810$round" 2001 "830$round" | sort | paste -sd,)" ] \
    || LOST=$((LOST + 1))
done
check "버스: 3명 동시 배번 저장 5회 모두 유실 없음" "$LOST" "0"
bib "${NICK[0]}" --arg bib 1009 > /dev/null
bib "${NICK[1]}" --arg bib 1002 > /dev/null
bib "$BUS_NICK" --arg bib 3001 --arg distance full --argjson goalFinishSec 14100 > /dev/null
BEFORE=$(get --data-urlencode subAction=cheer-board --data-urlencode "eventId=$EVENT_ID" | jq '.runners | length')
check "버스 인원 풀로 되돌리면 보드 3명" "$BEFORE" "3"

NEW_WAVE=$(post "$(jq -n --arg id "$EVENT_ID" --arg pw "$ADMIN_PW" --arg s "$START" \
  '{subAction:"waves",ownerPw:$pw,eventId:$id,waves:[{id:"",name:"새 출발",startAt:$s}]}')" \
  | jq -r '.waves[0].id // empty')
BOARD=$(get --data-urlencode subAction=cheer-board --data-urlencode "eventId=$EVENT_ID")
check "조를 지우고 새로 만들어도 보드 인원 유지" "$(echo "$BOARD" | jq '.runners | length')" "$BEFORE"
check "지워진 조를 고른 인원은 새 첫 출발로" "$(echo "$BOARD" | jq -r --arg n "${NICK[0]}" --arg w "$NEW_WAVE" \
  '.runners[] | select(.nickname==$n) | .waveId==$w')" "true"

(cd "$REPO_ROOT/functions" && FIRESTORE_EMULATOR_HOST="${FIRESTORE_EMULATOR_HOST:-127.0.0.1:8080}" node -e '
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId: "dmc-attendance" });
  const db = admin.firestore();
  const [eventId] = process.argv.slice(1);
  const jobId = "qa-cheer-job-" + eventId;
  Promise.all([
    db.collection("scrape_jobs").doc(jobId).set({ results: [
      { bib: "1009", distance: "full", netTime: "03:29:10", splits: [] },
      { bib: "1002", distance: "full", netTime: "", splits: [{ label: "10K", time: "00:20:00" }] },
    ] }),
    db.collection("race_events").doc(eventId).update({ groupScrapeJobId: jobId }),
  ]).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
' "$EVENT_ID")
BOARD=$(get --data-urlencode subAction=cheer-board --data-urlencode "eventId=$EVENT_ID")
check "기록(netTime)이 오면 완주 42.195 km·칩" "$(echo "$BOARD" | jq -r --arg n "${NICK[0]}" \
  '.runners[] | select(.nickname==$n) | "\(.km) \(.chip)"')" "42.195 true"
check "구간 기록(10K)이 오면 칩 기준으로 10 km 이상" "$(echo "$BOARD" | jq -r --arg n "${NICK[1]}" \
  '.runners[] | select(.nickname==$n) | "\(.km >= 10) \(.chip)"')" "true true"
check "기록 없는 인원은 추정 유지" "$(echo "$BOARD" | jq -r --arg n "$BUS_NICK" \
  '.runners[] | select(.nickname==$n) | .chip')" "false"
check "완주 상세 기록" "$(get --data-urlencode subAction=cheer-runner --data-urlencode "eventId=$EVENT_ID" \
  --data-urlencode "runnerNickname=${NICK[0]}" | jq -r '.runner.km')" "42.195"

echo
echo "통과 $PASS / 실패 $FAIL"
echo "화면: http://127.0.0.1:5000/lab/cheer/index.html?eventId=$EVENT_ID"
echo "조:   http://127.0.0.1:5000/lab/cheer/waves.html?eventId=$EVENT_ID"
[ "$FAIL" -eq 0 ]
