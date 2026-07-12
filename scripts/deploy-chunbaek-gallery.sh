#!/usr/bin/env bash
# 춘백 Hosting 배포 (회원·admin·갤러리)
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

source scripts/lib/firebase-cli.sh

PROJECT="$FB_PROJECT"

echo "=== 춘백 Hosting 배포 ==="
echo "경로: $REPO_ROOT"
echo "Node: $(node -v)"
echo ""

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ git 저장소가 아닙니다."
  exit 1
fi

for f in firebase.json chunbaek/gallery.html chunbaek/admin.html chunbaek/screenshots/01-welcome.png; do
  if [[ ! -f "$f" ]]; then
    echo "❌ 필수 파일 없음: $f"
    exit 1
  fi
done

echo "✓ 필수 파일 확인"
echo ""

if ! $FB login:list 2>&1 | grep -q "@"; then
  echo "Firebase 로그인이 필요합니다."
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
echo "  회원:    https://dmc-attendance.web.app/chunbaek/"
echo "  운영진:  https://dmc-attendance.web.app/chunbaek/admin.html"
echo "  갤러리:  https://dmc-attendance.web.app/chunbaek/gallery.html"
