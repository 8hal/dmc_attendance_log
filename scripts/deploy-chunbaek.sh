#!/usr/bin/env bash
# 춘백 S3 일괄 배포 — Functions(chunbaek) → Hosting
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION_FILE="chunbaek/VERSION"
if [[ -f "$VERSION_FILE" ]]; then
  echo "=== 춘백 S3 배포 (v$(cat "$VERSION_FILE")) ==="
else
  echo "=== 춘백 S3 배포 ==="
fi
echo ""

bash scripts/deploy-chunbaek-functions.sh
echo ""
bash scripts/deploy-chunbaek-gallery.sh

echo ""
echo "✅ 춘백 일괄 배포 완료"
if [[ -f "$VERSION_FILE" ]]; then
  echo "   버전: $(cat "$VERSION_FILE")"
fi
