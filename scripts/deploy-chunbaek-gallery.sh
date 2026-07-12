#!/usr/bin/env bash
# 춘백 목업 갤러리 Hosting 배포 (functions 불필요)
set -euo pipefail
cd "$(dirname "$0")/.."

FB="npx --yes firebase-tools@13.29.1"
PROJECT="dmc-attendance"

echo "=== 춘백 목업 갤러리 배포 ==="
echo "경로: $(pwd)"
echo ""

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ git 저장소가 아닙니다."
  exit 1
fi

for f in firebase.json chunbaek/gallery.html chunbaek/screenshots/01-welcome.png; do
  if [[ ! -f "$f" ]]; then
    echo "❌ 필수 파일 없음: $f"
    exit 1
  fi
done

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

echo "→ Hosting 배포 중..."
$FB deploy --only hosting --project "$PROJECT"

echo ""
echo "✅ 배포 완료"
echo ""
echo "확인 링크:"
echo "  갤러리: https://dmc-attendance.web.app/chunbaek/gallery.html"
echo "  목업:   https://dmc-attendance.web.app/chunbaek/?preview=1"
