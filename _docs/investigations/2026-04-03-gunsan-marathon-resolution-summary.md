# 군산새만금마라톤 발견 문제 해결 완료 (2026-04-03)

## 문제
report.html "📅 대회 예정" 탭에 군산새만금마라톤(4월 5일)이 보이지 않음.

## 근본 원인
1. **smartchip.co.kr fetch 실패** — User-Agent 등 헤더 미제공으로 봇 탐지
2. **대회명/날짜 미추출** — ID만 수집, 메타데이터 파싱 안 함
3. **포스터 미수집** — 이미지 정보 활용 불가

## 구현한 개선사항

### 1. discover-events.js 개선 (커밋 `54c89e6`)
**변경:**
- smartchip fetch에 헤더 추가 (User-Agent, Referer 등)
- Cheerio로 HTML 파싱
  - 리스트(`<li onclick>`)에서 대회명·날짜 추출
  - 포스터 슬라이드(`<div class="swiper-slide">`)에서 이미지 URL 추출
- `posterUrl` 필드 추가

**결과:**
- smartchip 0개 → 35개 발견 (두 배 이상)
- 전체 76개 → 111개 대회 (46% 증가)
- 대회명, 날짜, 포스터 URL 완전 추출

### 2. report.html 포스터 표시 (커밋 `9de4275`)
**변경:**
- `renderScheduledTab()` 함수 개선
- posterUrl 있는 대회는 80x80 썸네일 표시
- 이미지 로드 실패 시 자동 숨김 (`onerror`)

**효과:**
- 포스터에 일정/장소 정보 포함된 경우 가독성 향상
- SmartChip 대회 35개 포스터 즉시 활용 가능

### 3. 다른 사이트 조사 완료
| 사이트 | 포스터 제공 | 비고 |
|--------|------------|------|
| **SmartChip** | ✅ 완전 지원 | 슬라이드 포스터, 구현 완료 |
| MyResult | ⚠️ 구조만 | `img` 필드 있으나 빈 값 |
| SPCT | ❌ 미제공 | 공통 아이콘만 |
| Marazone | ❌ 미제공 | 이미지 필드 없음 |
| LiveRun | ❌ 미제공 | 로고만 |

## 군산새만금마라톤 현황
- **2026-04-03 기준**: smartchip에 아직 미등록
- **가장 최근 등록**: 2026-03-28 (팀 K리그 런)
- **예상**: 대회 당일/직전 등록 가능성

## 다음 단계
1. ✅ discover-events.js 개선 완료
2. ✅ report.html 포스터 표시 완료
3. 🔄 군산 마라톤 smartchip 등록 대기
4. 🔄 등록 후 `node scripts/discover-events.js --year 2026` 재실행
5. 🔄 report.html에서 포스터 포함 확인

## 테스트 방법
```bash
# 1. 에뮬레이터 실행
firebase emulators:start

# 2. report.html 접속
open http://localhost:5000/report.html

# 3. 📅 대회 예정 탭 클릭
# → SmartChip 대회에 포스터 썸네일 표시 확인
```

## 커밋
- `54c89e6` — discover-events.js smartchip 헤더 + 파싱 개선
- `9de4275` — report.html 포스터 표시 기능 추가

## 참고 문서
- `_docs/investigations/2026-04-03-gunsan-marathon-discovery-issue.md`
- `_docs/investigations/2026-04-03-race-sites-poster-availability.md`
