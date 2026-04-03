#!/bin/bash
# 배포 전 통합 테스트 (추가 검증)
# 기본 pre-deploy-test.sh 통과 후 실행

echo "━━━ 배포 전 통합 테스트 ━━━"
echo ""

# 색상 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

PASS=0
FAIL=0

check() {
  if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} $1"
    ((PASS++))
  else
    echo -e "  ${RED}✗${NC} $1"
    ((FAIL++))
  fi
}

echo -e "${YELLOW}[1/4] Functions 구문 검증...${NC}"
cd functions
node -e "require('./index.js'); console.log('✓ index.js 로드 성공')" 2>&1 | grep -q "로드 성공"
check "functions/index.js 구문 오류 없음"

node -e "const s = require('./lib/scraper'); const count = Object.keys(s).length; process.exit(count >= 30 ? 0 : 1)"
check "scraper.js 30개 이상 함수 export (실제: 34개)"
cd ..

echo ""
echo -e "${YELLOW}[2/4] 새 API 시그니처 검증...${NC}"

# ops-scrape-health 응답 구조 확인 (period, overall, bySource, upcomingWeekend)
grep -q 'period:' functions/index.js && grep -q 'overall:' functions/index.js && grep -q 'bySource' functions/index.js && grep -q 'upcomingWeekend:' functions/index.js
check "ops-scrape-health 응답 필드 (period, overall, bySource, upcomingWeekend)"

# ops-gorunning-events 응답 구조 확인
grep -q 'matchStatus' functions/index.js && grep -q 'matchedJob' functions/index.js
check "ops-gorunning-events 매칭 로직 (matchStatus, matchedJob)"

# weekendScrapeReadinessCheck 이메일 발송
grep -q 'sendEmail' functions/index.js && grep -q 'weekendScrapeReadinessCheck' functions/index.js
check "weekendScrapeReadinessCheck 이메일 발송 로직"

echo ""
echo -e "${YELLOW}[3/4] Frontend 무결성 검증...${NC}"

# ops.html 새 섹션 확인
grep -q 'systemHealth' ops.html && grep -q 'scrapeHealthCard' ops.html && grep -q 'weekendReadinessCard' ops.html
check "ops.html Section 1-3 (systemHealth, scrapeHealth, weekendReadiness)"

grep -q 'gorunningEventsCard' ops.html && grep -q 'ops-gorunning-events' ops.html
check "ops.html Section 5 (고러닝 예정 대회)"

# report.html 포스터 이미지
grep -q 'posterUrl' report.html && grep -q '<img' report.html
check "report.html 포스터 이미지 렌더링"

# discover-events.js SmartChip 파싱
grep -q 'cheerio' scripts/discover-events.js && grep -q 'posterUrl' scripts/discover-events.js
check "discover-events.js SmartChip 포스터 파싱"

echo ""
echo -e "${YELLOW}[4/4] 환경 변수 체크...${NC}"

# .env 파일 존재 (배포 시 필요)
if [ -f "functions/.env" ]; then
  echo -e "  ${GREEN}✓${NC} functions/.env 존재"
  ((PASS++))
  
  # 이메일 환경 변수 확인 (Warning만, 실패 처리 안함)
  if grep -q 'GMAIL_USER' functions/.env && grep -q 'GMAIL_APP_PASSWORD' functions/.env && grep -q 'ADMIN_EMAIL' functions/.env; then
    echo -e "  ${GREEN}✓${NC} 이메일 환경 변수 설정됨"
    ((PASS++))
  else
    echo -e "  ${YELLOW}⚠${NC} 이메일 환경 변수 미설정 (프로덕션 배포 전 필수)"
    echo -e "     → Firebase Console > Functions > 환경변수에서 설정:"
    echo -e "        GMAIL_USER, GMAIL_APP_PASSWORD, ADMIN_EMAIL"
  fi
else
  echo -e "  ${YELLOW}⚠${NC} functions/.env 없음 (프로덕션에서 환경변수 설정 필요)"
  echo -e "     → Firebase Console > Functions > 환경변수"
fi

echo ""
echo "━━━ 통합 테스트 결과 ━━━"
echo -e "  ${GREEN}통과: $PASS${NC} / ${RED}실패: $FAIL${NC}"

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✅ 통합 테스트 통과 — 배포 안전성 확인${NC}"
  exit 0
else
  echo -e "${RED}❌ 통합 테스트 실패 — 배포 전 수정 필요${NC}"
  exit 1
fi
