# Postmortem: bulk-confirm 재확정 시 중복 저장 버그

**발견일**: 2026-04-15  
**심각도**: Critical (배포 전 발견)  
**상태**: 미배포 (배포 전 차단)

---

## 요약

신규 `bulk-confirm` API가 재확정 시 **기존 race_results를 삭제하지 않고** 새 결과를 추가로 저장하여, 동일 참가자의 기록이 중복 생성되는 버그.

---

## 타임라인

| 시각 | 이벤트 |
|------|--------|
| 07:00 | 단체 대회 상세 페이지 개발 시작 |
| 14:30 | `bulk-confirm` API 구현 완료 |
| 15:00 | TC 작성 (멱등성 테스트 포함) |
| 16:00 | 코드 리뷰 (Critical 2개, Important 5개 발견) |
| 16:30 | Critical/Important 수정 완료 |
| 17:00 | **배포 직전, 사용자가 기존 confirm API 확인 요청** |
| 17:05 | **재확정 중복 버그 발견 (배포 차단)** |

---

## 근본 원인 (Root Cause)

### 1. 기존 API 패턴 불완전 학습

**기존 `action === "confirm"` API (라인 1789~1889):**
```javascript
// 라인 1814~1820: 재확정 시 기존 결과 삭제
const oldResultsSnap = await db.collection("race_results")
  .where("jobId", "==", canonicalJobId)
  .get();

oldResultsSnap.forEach(doc => {
  batch.delete(doc.ref);
});
```

**신규 `bulk-confirm` API (라인 2895~):**
```javascript
// 멱등성 체크만 (개별 문서 exists 확인)
const existingDoc = await db.collection("race_results").doc(docId).get();
if (existingDoc.exists) {
  continue; // 건너뜀
}
```

**차이점:**
- 기존: **전체 삭제 후 재저장** (jobId 기준 where 쿼리)
- 신규: **개별 문서 존재 시 건너뜀** (docId 기준 get)

**문제:**
- docId 생성 로직이 변경되면 (예: 배번 추가, 정규화 변경) 다른 ID로 저장됨
- 첫 확정: `이원기_HALF_2026-04-19` (배번 없음)
- 재확정: `이원기_HALF_2026-04-19_12345` (배번 포함) → **중복!**

---

### 2. 워크플로우 위반

**`.cursor/rules/implementation-workflow.mdc` 위반:**

| 단계 | 규칙 | 실제 | 결과 |
|------|------|------|------|
| 1. 문서 우선 | `api-patterns.md` 읽기 | ✅ 읽음 | - |
| 2. 패턴 탐색 | **기존 confirm API 전체 확인** | ❌ `group-events` 내부만 확인 | **패턴 누락** |
| 3. 구현 | 기존 패턴 준수 | ❌ 삭제 로직 누락 | **버그 유입** |
| 5. 코드 리뷰 | Critical/Important 발견 | ⚠️ 이 이슈는 놓침 | **검증 실패** |

**왜 놓쳤는가?**

1. **패턴 탐색 범위 협소:**
   - `action === "group-events"` 내부만 검색 (`confirm-one` 발견)
   - **`action === "confirm"` 은 검색하지 않음**
   - Grep 패턴: `action === "group-events"` → `confirm` 전역 검색 안 함

2. **코드 리뷰 한계:**
   - 리뷰어는 **diff만 보고 판단** (기존 confirm API와 비교 불가)
   - "멱등성 체크 있음" → 통과로 판단
   - 재확정 시나리오 (docId 변경 케이스)는 TC에 없었음

---

### 3. TC 설계 불완전

**작성된 TC:**
```markdown
TC-004-5: 멱등성 보장 (Idempotent)
- 같은 결과를 2번 저장해도 1건만 존재
```

**실제 테스트:**
```javascript
// 첫 저장
await bulkConfirm([{ realName: "이원기", finishTime: "1:45:23" }]);

// 재저장 (동일 데이터)
await bulkConfirm([{ realName: "이원기", finishTime: "1:45:23" }]);

// 검증
const count = await db.collection("race_results")
  .where("memberRealName", "==", "이원기")
  .get();
expect(count.size).toBe(1);  // ✅ 통과
```

**문제:**
- **동일 데이터** 재저장만 테스트 (docId 동일)
- **수정된 데이터** (배번 추가, 시간 변경) 재저장은 테스트 안 함
- 실제 사용 시나리오 (운영자가 배번 입력 후 재확정)를 커버하지 못함

---

## 영향 범위

**만약 배포되었다면:**

1. **데이터 중복:**
   - 재확정 시마다 race_results 중복 생성
   - 동일 참가자가 여러 기록 보유 → report.html에서 중복 표시

2. **통계 오염:**
   - 완주율, 평균 시간 등 집계 오류
   - `confirmedCount` 부정확

3. **롤백 난이도:**
   - 어느 기록이 최신인지 판단 불가 (confirmedAt 동일 가능)
   - 수동 정리 필요 (eventId + realName 기준 group by → 최신 1건만 유지)

---

## 즉시 조치 (Immediate Actions)

### 1. 버그 수정 (배포 전)

```javascript
// functions/index.js bulk-confirm 내에 추가 (라인 2900 이후)

// 1. 기존 결과 삭제 (eventId 기준)
const oldResultsSnap = await db.collection("race_results")
  .where("canonicalEventId", "==", eventId)
  .get();

const batch = db.batch();
oldResultsSnap.forEach(doc => {
  batch.delete(doc.ref);
});

// 2. 새 결과 저장
for (const r of results) {
  // ... (기존 로직)
  batch.set(ref, row);
}

await batch.commit();
```

**주의:**
- 500건 제한 → 큰 대회는 chunk 필요
- 기존 `confirm` API와 동일 패턴

---

### 2. TC 추가

```javascript
// TC-004-5-extended: 재확정 시 중복 방지
test("재확정 (수정된 데이터) 시 이전 기록 삭제", async () => {
  // 첫 저장 (배번 없음)
  await bulkConfirm([{ realName: "이원기", finishTime: "1:45:23", bib: "" }]);
  
  let count = await db.collection("race_results")
    .where("memberRealName", "==", "이원기")
    .get();
  expect(count.size).toBe(1);
  
  // 재저장 (배번 추가)
  await bulkConfirm([{ realName: "이원기", finishTime: "1:45:23", bib: "12345" }]);
  
  count = await db.collection("race_results")
    .where("memberRealName", "==", "이원기")
    .get();
  expect(count.size).toBe(1);  // 여전히 1건만
  expect(count.docs[0].data().bib).toBe("12345");  // 최신 데이터
});
```

---

## 방지 방안 (Prevention)

### 1. 워크플로우 강화

**`.cursor/rules/implementation-workflow.mdc` 업데이트:**

```markdown
### 2. 패턴 탐색 (신규 기능 구현 시)

**찾아야 할 것:**
- API 호출 패턴
- 오류 처리 방법
- 이벤트 리스너 등록 방식
- 변수명 컨벤션
+ **유사 기능의 전역 검색** (예: confirm 관련 API → "confirm" 전역 Grep)

**방법 B: Grep (빠른 확인)**
```
Grep: "fetch.*API_BASE"
Grep: "addEventListener.*click"
+ Grep: "action === \"confirm\"" (전역 검색, 특정 action 내부만 보지 말 것)
```

**체크리스트:**
```
☐ 기존 패턴 준수
☐ 오류 처리 추가
☐ 문서에 명시된 실수 회피
+ ☐ 유사 기능 전역 검색 완료 (함수명/API 액션 등)
```
```

---

### 2. API 패턴 문서 업데이트

**`_docs/development/api-patterns.md` 추가:**

```markdown
## 배치 저장 API 패턴

### 재확정 시나리오 처리

모든 배치 저장 API (confirm, bulk-confirm 등)는 **재확정 시 중복 방지**를 위해 다음 패턴을 따른다:

```javascript
// 1. 기존 결과 삭제 (eventId/jobId 기준)
const oldResultsSnap = await db.collection("race_results")
  .where("canonicalEventId", "==", eventId)  // 또는 jobId
  .get();

const batch = db.batch();
oldResultsSnap.forEach(doc => {
  batch.delete(doc.ref);
});

// 2. 새 결과 저장
for (const r of results) {
  batch.set(ref, row);
}

await batch.commit();
```

**이유:**
- docId 생성 로직이 변경될 수 있음 (배번 추가, 정규화 수정 등)
- 개별 문서 `exists` 체크만으로는 불충분
- 전체 삭제 후 재저장이 가장 안전

**체크리스트:**
- [ ] eventId/jobId 기준 where 쿼리로 기존 결과 전체 삭제
- [ ] batch.commit() 한 번에 처리
- [ ] 500건 제한 고려 (큰 대회는 chunk)
```

---

### 3. 코드 리뷰 체크리스트 강화

**`.cursor/skills/requesting-code-review/code-reviewer.md` 업데이트:**

```markdown
## Review Checklist

**Code Quality:**
- Clean separation of concerns?
- Proper error handling?
- Type safety (if applicable)?
- DRY principle followed?
- Edge cases handled?
+ **유사 기능과 패턴 일치?** (기존 API 참조했는가?)

**Production Readiness:**
- Migration strategy (if schema changes)?
- Backward compatibility considered?
- Documentation complete?
- No obvious bugs?
+ **재실행/재확정 시나리오 처리?** (멱등성, 중복 방지)
```

---

### 4. TC 템플릿 추가

**`_docs/test-cases/tc-template-batch-api.md` 생성:**

```markdown
# 배치 API TC 템플릿

모든 배치 저장 API (confirm, bulk-confirm 등)는 다음 TC를 포함해야 한다:

## 필수 TC

1. **정상 저장**: N건 저장 성공
2. **멱등성 (동일 데이터)**: 같은 데이터 재저장 시 1건만
3. **멱등성 (수정된 데이터)**: 수정된 데이터 재저장 시 이전 기록 삭제 ✅
4. **부분 실패**: 일부 실패 시 207 + 성공 건수
5. **500건 제한**: 큰 배치는 chunk 처리

## 재확정 시나리오 (필수)

```javascript
test("재확정 시 이전 기록 삭제 (docId 변경 케이스)", async () => {
  // 첫 저장
  await api.bulkConfirm(eventId, [{ realName: "홍길동", bib: "" }]);
  
  // 재저장 (bib 추가 → docId 변경 가능)
  await api.bulkConfirm(eventId, [{ realName: "홍길동", bib: "999" }]);
  
  // 검증: 여전히 1건만
  const results = await db.collection("race_results")
    .where("canonicalEventId", "==", eventId)
    .where("memberRealName", "==", "홍길동")
    .get();
  
  expect(results.size).toBe(1);
  expect(results.docs[0].data().bib).toBe("999");
});
```
```

---

### 5. 자동화 도구 (향후 고려)

**배포 전 자동 체크:**

```bash
# scripts/pre-deploy-pattern-check.sh
#!/bin/bash

# 1. 배치 저장 API에 삭제 로직 있는지 체크
if grep -q "bulk.*confirm\|batch.*save" functions/index.js; then
  if ! grep -q "batch.delete\|.where.*==.*Id" functions/index.js; then
    echo "❌ 배치 저장 API에 기존 결과 삭제 로직 없음"
    exit 1
  fi
fi

echo "✅ 패턴 체크 통과"
```

---

## 교훈 (Lessons Learned)

1. **"유사 기능"의 정의를 넓게:**
   - `group-events` 내부만 보지 말고 **전역 검색**
   - `action === "confirm"` / `confirm-one` / `bulk-confirm` 모두 관련

2. **멱등성 ≠ 중복 방지:**
   - "같은 요청 2번" 테스트만으로는 불충분
   - "수정된 데이터 재저장" 시나리오 필수

3. **코드 리뷰 한계 인정:**
   - 리뷰어는 diff만 보므로 기존 패턴 비교 불가
   - **구현자가 패턴 탐색을 완벽히 해야 함**

4. **배포 전 사용자 확인의 가치:**
   - "기존 API 모두 확인했니?" → Critical 버그 발견
   - 워크플로우 준수를 사용자가 검증

---

## 액션 아이템

- [ ] `bulk-confirm` API 수정 (기존 결과 삭제 로직 추가)
- [ ] TC-004-5-extended 추가 (재확정 시나리오)
- [ ] `implementation-workflow.mdc` 업데이트 (전역 검색 명시)
- [ ] `api-patterns.md` 업데이트 (배치 저장 패턴 추가)
- [ ] `code-reviewer.md` 체크리스트 강화
- [ ] TC 템플릿 생성 (`tc-template-batch-api.md`)
- [ ] 수정 후 QA 재실행
- [ ] 배포 진행

---

**작성자**: AI Agent  
**검토자**: @taylor  
**다음 리뷰 일정**: 2026-05-15 (1개월 후 재검토)
