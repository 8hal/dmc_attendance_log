# 마라톤 기록 사이트별 포스터 이미지 제공 현황 (2026-04-03)

## 조사 결과

### ✅ SmartChip (smartchip.co.kr) — 완전 지원
**제공 방식:**
- 메인 페이지 슬라이드에 대회별 포스터 이미지
- URL 패턴: `https://smartchip.co.kr/images/{filename}`
- 예시: `2026경주벚꽃_포스터.jpg`, `26영암벚꽃_포스터.jpg`

**추출 가능:**
- 대회 ID ↔ 포스터 파일명 매핑
- `discover-events.js`에 구현 완료

---

### ❌ MyResult (myresult.co.kr) — 구조만 존재
**API 응답:**
```json
{
  "id": 147,
  "name": "제22회 예산윤봉길 전국마라톤대회",
  "img": "",  // 빈 문자열
  "date": "2026-04-05"
}
```

**현황:**
- `img` 필드 존재하지만 모든 대회가 빈 값
- 향후 채워질 가능성 있음

---

### ❌ SPCT (time.spct.kr) — 공통 아이콘만
**제공 방식:**
- 대회 종목별 고정 아이콘 (러닝/자전거)
- `<img src='assets/img/icon-run.png'>`
- 대회별 개별 포스터 없음

---

### ❌ Marazone (raceresult.co.kr) — 미제공
**API 응답:**
```json
{
  "comp_date": "2026-04-05",
  "comp_title": "제12회 나주영산강마라톤대회",
  "comp_place": "나주시청"
}
```

**현황:**
- 이미지 관련 필드 없음

---

### ❌ LiveRun (liverun.co.kr) — 로고만
**현황:**
- 사이트 로고 이미지만 존재
- 대회별 포스터 미제공

---

## 결론

**포스터 수집 가능:** SmartChip만 ✅

**권장 사항:**
1. SmartChip 포스터를 우선 활용
2. MyResult는 `img` 필드 모니터링 (향후 채워질 가능성)
3. 다른 소스는 대회 공식 홈페이지에서 수동 수집 필요

## 구현 현황
- ✅ `discover-events.js` — SmartChip 포스터 URL 추출 완료
- ✅ `posterUrl` 필드 — `discovered-events-2026.json`에 저장
- 🔄 report.html — 포스터 표시 UI 미구현 (향후 추가 가능)

## 활용 방안
1. **대회 예정 탭**: 포스터 썸네일 표시
2. **검색 결과**: 대회 카드에 포스터 배경
3. **상세 페이지**: 포스터 전체 이미지
4. **알림/공유**: 포스터 포함 공유 이미지
