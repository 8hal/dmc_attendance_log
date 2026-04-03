# ops.html 스크랩 예정 섹션 필요성 분석

> 체크일: 2026-04-03  
> 질문: "다음 실행 시 먼저 스크랩될 후보 (최대 5건/회)" 섹션이 여전히 필요한가?

## 결론: **필요 없음 → 제거 권장**

## 근거

### 1. 자동 스크랩이 존재하지 않음

**현재 시스템 (functions/index.js lines 540-644)**:
```javascript
/**
 * 주간 자동 **대회 발견만** (토/일 15:00 KST)
 * 전 회원 스크랩은 하지 않음 — report에서 운영자가 대회 선택 후 수집.
 */
exports.weeklyDiscoverAndScrape = onSchedule(...)
```

- **실제 동작**: 대회 발견 → `scrape_jobs` 플레이스홀더 생성 (`status: "queued"`)
- **스크랩 실행**: **없음** (회원 수집 0건)
- **수동 작업**: report.html에서 운영자가 대회 선택 → "발견" 버튼 → 스크랩 실행

### 2. "다음 실행 시" 문구의 오해 소지

**ops.html (lines 123-126)**:
```html
<div style="font-size:11px;color:#64748B;margin:14px 0 6px;font-weight:600;">
  다음 실행 시 먼저 스크랩될 후보 (최대 5건/회)
</div>
```

**문제**:
- "다음 실행 시"는 자동 스크랩이 존재한다는 암시
- 실제로는 플레이스홀더만 생성 (스크랩 0건)
- `WEEKLY_MAX_JOBS_PER_RUN = 5` 는 **문서/미리보기 전용** (scraper.js line 884)

### 3. 운영진 혼란 가능성

**운영자 입장**:
- "다음 실행 시 스크랩될 5건"을 보고 자동 스크랩 기대
- 실제로는 report.html에서 수동으로 "발견" 클릭해야 함

**혼란 포인트**:
- 자동 vs 수동 구분이 불명확
- "상위 5건"의 의미: 참고용 순서일 뿐, 실제 실행은 없음

### 4. 대체 정보

**이미 있는 정보**:
- "오늘(KST) 개최일로 잡힌 대회" (실용적)
- "그 다음 대기" (참고용 큐)

**필요한 정보**:
- 운영자가 report.html에서 "발견" 후 어떤 대회가 나타날지

## 개선 제안

### Option A: 섹션 제거 (권장)

**변경**:
```html
<!-- 제거: "다음 실행 시 먼저 스크랩될 후보" 섹션 -->

<div style="font-size:11px;color:#64748B;margin:14px 0 6px;font-weight:600;">
  대기 중인 대회 (참고 순서, 최대 20건)
</div>
<table>...queueTail...</table>
```

**장점**:
- "자동 실행" 오해 제거
- 단순화 (2섹션 → 1섹션)

### Option B: 문구 수정 (차선)

**변경**:
```html
<div style="font-size:11px;color:#64748B;margin:14px 0 6px;font-weight:600;">
  운영자 수집 시 참고 순서 (상위 5건)
</div>
```

**장점**:
- "자동 실행" 오해는 제거
- 순서 정보는 유지

**단점**:
- 여전히 "상위 5건"이 실질적 의미 없음 (운영자가 원하는 대회부터 수집)

## 관련 이슈

### 자동 스크랩 구현 계획 (BACKLOG.md)

**대회 파이프라인** (`_docs/plans/event-pipeline.md`):
- Phase 1: 고러닝 수집 + ops.html 예정 탭
- Phase 2: 참가자 목록 입력
- **Phase 3: 자동 스크랩 트리거**

**현 상태**: Phase 1 미착수 (고러닝 스크래퍼 없음)

→ 자동 스크랩이 실제로 구현되면 "다음 실행 시" 섹션이 의미 있을 수 있음

**권장**: **지금은 제거** → Phase 3 구현 시 재추가

## 다음 단계

1. **즉시 제거**: "다음 실행 시" 섹션 삭제
2. **문구 단순화**: "대기 중인 대회 (참고 순서)"로 통합
3. **Phase 3 구현 시**: 자동 트리거가 생기면 섹션 복원

---

## 관련 파일

- `ops.html`: lines 123-126 (제거 대상)
- `functions/index.js`: lines 540-644 (`weeklyDiscoverAndScrape`)
- `functions/lib/scraper.js`: line 884 (`WEEKLY_MAX_JOBS_PER_RUN`)
- `_docs/plans/event-pipeline.md`: 자동 스크랩 계획
- `BACKLOG.md`: 대회 파이프라인 항목
