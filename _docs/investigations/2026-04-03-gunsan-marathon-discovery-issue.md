# 군산새만금마라톤 발견 실패 이슈 (2026-04-03)

## 문제
report.html "📅 대회 예정" 탭에 군산새만금마라톤(4월 5일)이 보이지 않음.

## 근본 원인
1. **smartchip.co.kr fetch 실패** (discover-events.js)
   - User-Agent, Referer 등 헤더 미제공으로 봇 탐지
   - 76개 → 17개 smartchip 대회 누락

2. **군산새만금마라톤 미등록** (smartchip.co.kr)
   - 2026-04-03 기준, smartchip에 4월 5일 대회 미등록
   - 가장 최근 등록 대회: 2026-03-28 (팀 K리그 런)

## 해결
### 1. discover-events.js 수정 (완료)
**변경 내용:**
```javascript
// discoverSmartChip() 함수에 헤더 추가
headers: {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://smartchip.co.kr/',
  'Connection': 'keep-alive'
}
```

**결과:**
- smartchip 0개 → 17개 발견
- 전체 76개 → 93개 대회

### 2. 군산새만금마라톤 미등록 (미해결)
**대안:**
- A) smartchip 등록 대기 (대회 직전/당일 등록 가능성)
- B) 수동 등록 스크립트 (`race_events` 직접 입력)
- C) 다른 기록 사이트 확인 (myresult, spct 등)

## 대회 정보
- **공식명**: 2026 군산새만금마라톤
- **일시**: 2026-04-05 (토) 07:30
- **장소**: 군산 월명종합운동장
- **규모**: 약 12,000명
- **종목**: 풀코스(1,800명), 하프앤하프(100팀), 10km(4,000명), 5km(4,000명)
- **홈페이지**: www.gunsanmarathon.com

## 다음 단계
1. ✅ discover-events.js smartchip 헤더 수정 (완료)
2. 🔴 군산새만금마라톤 수동 등록 or smartchip 등록 대기
3. 🔴 report.html "대회 예정" 탭 검증

## 참고
- 커밋: (discover-events.js 수정 커밋 예정)
- 관련 파일:
  - `scripts/discover-events.js`
  - `report.html` (line 990: renderScheduledTab)
  - `data/discovered-events-2026.json`
