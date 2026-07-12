#!/usr/bin/env bash
# 춘백 API Functions 배포 (chunbaek 단일 함수)
set -euo pipefail
cd "$(dirname "$0")/.."

FB="npx --yes firebase-tools@13.29.1"
PROJECT="dmc-attendance"

echo "=== 춘백 Functions 배포 (chunbaek) ==="
echo "경로: $(pwd)"
echo ""

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ git 저장소가 아닙니다."
  exit 1
fi

if [[ ! -f functions/index.js ]]; then
  echo "❌ functions/index.js 없음"
  exit 1
fi

if [[ ! -d functions/node_modules/firebase-functions ]]; then
  echo "⚠️  functions 의존성 미설치 — npm ci 실행 중..."
  (cd functions && npm ci)
fi

echo "✓ 필수 파일 확인"
echo ""

if ! $FB login:list 2>&1 | grep -q "@"; then
  echo "Firebase 로그인이 필요합니다."
  echo "아래 명령을 실행하고, 나오는 URL을 브라우저에서 열어 인증하세요:"
  echo ""
  echo "  $FB login --no-localhost"
  echo ""
  exit 1
fi

echo "→ Functions 배포 중 (functions:chunbaek)..."
$FB deploy --only functions:chunbaek --project "$PROJECT"

echo ""
echo "✅ 배포 완료"
echo ""
echo "확인:"
echo "  curl -s 'https://dmc-attendance.web.app/api/chunbaek?action=ping'"
echo "  회원:    https://dmc-attendance.web.app/chunbaek/"
echo "  운영진:  https://dmc-attendance.web.app/chunbaek/admin.html"
