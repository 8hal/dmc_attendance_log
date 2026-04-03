# Phantom Jobs 처리 계획 (2026-04-04)

## 개요
18개 phantom jobs (status=confirmed이나 race_results 없음) 정리

## 목록

### 그룹 1: 테스트/임시 잡 (즉시 삭제)
1. 테스트 (manual_manual_1775222584867)

### 그룹 2: search_* 잡 11개 (회원 임시 검색)
- search_3tShsj67juAa2UWk8NeM_* (4개)
- search_ybLLXH8sBo2PCMRuxZnD_* (7개)

**분석:**
- `search_` 프리픽스는 회원이 직접 검색한 임시 잡
- 2명의 회원이 여러 대회를 검색했으나 확정하지 않음
- 또는 0건 확정 시도 (당시 0건 저장 불가)

**조치:**
- `status: "complete"` 또는 삭제
- confirmed → complete 다운그레이드

### 그룹 3: 정규 스크랩 잡 6개 (수동 검증 필요)
1. 오사카마라톤 (GMVYn1ixPXQMOdHutHn9)
2. 부산비치울트라 (QXrRSojIdwcwi7w54CAL)
3. 고구려마라톤 (WReDO1OwpGceKhhZ2Zku)
4. 2025 포항마라톤 챔피언십 (smartchip_202550000306)
5. 제35회 진주마라톤대회 (smartchip_202550000318)
6. 2025 부산바다마라톤 (spct_2025102601)
7. 제23회 희망드림동계국제마라톤 (spct_2026022101)

**분석:**
- 정규 source (smartchip, spct, 기타)
- 실제로 기록이 있을 가능성
- 재확정 버그로 results 삭제되었을 수 있음

**조치:**
1. report.html 완료 탭에서 수동 확인
2. "수정하기" → 회원 재검색
3. 기록 있으면 재확정, 없으면 status=complete

## 실행 계획

### Phase 1: 자동 다운그레이드 (search_* + test)
```javascript
// scripts/fix-phantom-jobs.js
const jobsToDowngrade = [
  "manual_manual_1775222584867", // 테스트
  "search_3tShsj67juAa2UWk8NeM_0",
  "search_3tShsj67juAa2UWk8NeM_1",
  "search_3tShsj67juAa2UWk8NeM_2",
  "search_3tShsj67juAa2UWk8NeM_3",
  "search_ybLLXH8sBo2PCMRuxZnD_0",
  "search_ybLLXH8sBo2PCMRuxZnD_1",
  "search_ybLLXH8sBo2PCMRuxZnD_3",
  "search_ybLLXH8sBo2PCMRuxZnD_4",
  "search_ybLLXH8sBo2PCMRuxZnD_5",
  "search_ybLLXH8sBo2PCMRuxZnD_6",
];

// status: confirmed → complete
// 이유: 실제 기록 없음 (0건 확정 시도)
```

### Phase 2: 수동 검증 (정규 잡 7개)
- [ ] report.html에서 각 잡 확인
- [ ] 기록 재검색
- [ ] 재확정 또는 다운그레이드

## 예상 결과
- Phantom Jobs: 18개 → 0개
- 시스템 건강도: 🔴 긴급 → ✅ 정상

## 참조
- `_docs/investigations/2026-04-04-ops-urgent-issues.md`
- P0 버그 수정: 2026-04-03 (커밋 b184a5d)
