#!/usr/bin/env bash
# openapi.yaml 의 RaceAction enum 과 functions/index.js race 핸들러 분기 문자열 동기화 검증
# (사람용 전체 HTTP 명세: _docs/api/http-api-actions.md)
# 사용: bash scripts/verify-api-spec-race-actions.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INDEX="$ROOT_DIR/functions/index.js"
YAML="$ROOT_DIR/_docs/api/openapi.yaml"

# race 핸들러 본문: 첫 action 분기 ~ exports.scrapeProxy 직전
START=$(grep -n 'const action = req.query.action ||' "$INDEX" | head -1 | cut -d: -f1)
END=$(grep -n '^exports\.scrapeProxy' "$INDEX" | head -1 | cut -d: -f1)
if [[ -z "$START" || -z "$END" ]]; then
  echo "verify-api-spec-race-actions: index.js 에서 race/scrapeProxy 경계를 찾지 못함"
  exit 1
fi
END=$((END - 1))

CODE_TMP=$(mktemp)
SPEC_TMP=$(mktemp)
trap 'rm -f "$CODE_TMP" "$SPEC_TMP"' EXIT

sed -n "${START},${END}p" "$INDEX" |
  grep -oE 'action === "([^"]+)"' |
  sed 's/action === "//;s/"$//' |
  sort -u >"$CODE_TMP"

# components.schemas.RaceAction enum 블록 (파일 내 두 번째 RaceAction 섹션)
RA_LINE=$(grep -n '^    RaceAction:$' "$YAML" | tail -1 | cut -d: -f1)
sed -n "${RA_LINE},/^    AttendanceGetAction:/p" "$YAML" |
  grep '^        - ' |
  sed 's/^        - //' |
  sort -u >"$SPEC_TMP"

OK=1
while read -r a; do
  if ! grep -qxF "$a" "$SPEC_TMP"; then
    echo "SPEC에 없음 (코드에만 있음): $a"
    OK=0
  fi
done <"$CODE_TMP"

while read -r a; do
  if ! grep -qxF "$a" "$CODE_TMP"; then
    echo "코드에 없음 (SPEC에만 있음): $a"
    OK=0
  fi
done <"$SPEC_TMP"

if [[ "$OK" -ne 1 ]]; then
  echo "verify-api-spec-race-actions: 실패 — _docs/api/openapi.yaml RaceAction enum 과 동기화하세요."
  exit 1
fi

echo "verify-api-spec-race-actions: OK (race action 문자열 $(wc -l <"$CODE_TMP" | tr -d ' ')개 일치)"
exit 0
