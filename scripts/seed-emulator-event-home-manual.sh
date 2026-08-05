#!/usr/bin/env bash
# 회원 event-home / event-list 에뮬 QA 시드 (Firestore 에뮬 실행 중이어야 함)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${HOME}/.npm-global/bin:${PATH}"
export FIRESTORE_EMULATOR_HOST="${FIRESTORE_EMULATOR_HOST:-127.0.0.1:8080}"

echo "FIRESTORE_EMULATOR_HOST=${FIRESTORE_EMULATOR_HOST}"
node "${ROOT}/scripts/seed-emulator-event-home.js"

echo ""
echo "열기 (Hosting :5000):"
echo "  http://localhost:5000/event-list.html"
echo "  http://localhost:5000/event-home.html?eventId=evt_event_home_seed"
echo "  http://localhost:5000/attendance-v2.html  → 더보기 → 단체 대회"
echo ""
echo "사전 닉(선택) — DevTools Console:"
echo "  localStorage.setItem('dmc_attendance_v2_profile', JSON.stringify({nickname:'시드원',memberId:'seed_eh_member_1',team:'T1'}))"
echo "  그다음 my-bib / event-home 새로고침"
