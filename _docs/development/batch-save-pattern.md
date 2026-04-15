# 배치 저장 API 패턴

> 모든 배치 저장 API (confirm, bulk-confirm 등)는 **재확정 시 중복 방지**를 위해 이 패턴을 따른다.

## 근거

2026-04-15, `bulk-confirm` API 구현 시 재확정 시나리오를 고려하지 않아 중복 저장 버그 발견.
기존 `action === "confirm"` API는 재확정 시 기존 결과를 삭제하는 패턴을 사용하고 있었으나,
신규 API는 개별 문서 `exists` 체크만으로 멱등성을 보장하려 해서 docId 변경 시 중복 발생.

상세 분석: `_docs/postmortem/2026-04-15-bulk-confirm-reconfirm-bug.md`

---

## 표준 패턴

### 재확정 시 중복 방지

```javascript
// 1. 기존 결과 전체 삭제 (eventId/jobId 기준)
const oldResultsSnap = await db.collection("race_results")
  .where("canonicalEventId", "==", eventId)  // 또는 jobId
  .get();

const batch = db.batch();
oldResultsSnap.forEach(doc => {
  batch.delete(doc.ref);
});

// 2. 새 결과 저장
for (const r of results) {
  const docId = generateDocId(r);  // 정규화된 ID
  const ref = db.collection("race_results").doc(docId);
  batch.set(ref, row);
}

// 3. 한 번에 커밋
await batch.commit();
```

---

## 왜 이 패턴인가?

### ❌ 개별 문서 exists 체크 (불충분)

```javascript
// 문제: docId 생성 로직이 변경되면 중복 발생
for (const r of results) {
  const docId = generateDocId(r);
  const ref = db.collection("race_results").doc(docId);
  
  const existing = await ref.get();
  if (existing.exists) {
    continue;  // 건너뜀
  }
  
  await ref.set(row);
}
```

**시나리오:**
1. 첫 확정: `이원기_HALF_2026-04-19` (배번 없음)
2. 배번 입력 후 재확정: `이원기_HALF_2026-04-19_12345` (배번 포함)
3. 결과: **2개 문서 생성 (중복!)**

### ✅ 전체 삭제 후 재저장 (안전)

```javascript
// eventId 기준으로 해당 대회의 모든 결과 삭제 후 재저장
const oldResultsSnap = await db.collection("race_results")
  .where("canonicalEventId", "==", eventId)
  .get();

batch.forEach(doc => batch.delete(doc.ref));
```

**장점:**
- docId 생성 로직 변경에 강건
- 운영자가 배번/시간 수정 후 재확정해도 안전
- 정규화 규칙 변경 시에도 작동

---

## 500건 제한 처리

Firestore batch는 500건 제한이 있으므로, 큰 대회는 chunk 처리:

```javascript
const BATCH_SIZE = 500;

// 1. 삭제 (chunk)
const oldDocs = oldResultsSnap.docs;
for (let i = 0; i < oldDocs.length; i += BATCH_SIZE) {
  const batch = db.batch();
  oldDocs.slice(i, i + BATCH_SIZE).forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
}

// 2. 저장 (chunk)
for (let i = 0; i < results.length; i += BATCH_SIZE) {
  const batch = db.batch();
  results.slice(i, i + BATCH_SIZE).forEach(r => {
    const docId = generateDocId(r);
    const ref = db.collection("race_results").doc(docId);
    batch.set(ref, row);
  });
  await batch.commit();
}
```

---

## 체크리스트

배치 저장 API 구현 시:

- [ ] eventId/jobId 기준 where 쿼리로 **기존 결과 전체 삭제**
- [ ] 새 결과를 batch.set()으로 저장
- [ ] batch.commit() 한 번에 처리
- [ ] 500건 제한 고려 (큰 대회는 chunk)
- [ ] **개별 exists 체크만으로는 불충분** (docId 변경 시 중복)

---

## 참고 코드

### 기존 confirm API (라인 1814~1820)

```javascript
// functions/index.js
if (action === "confirm" && req.method === "POST") {
  // ...
  
  // ✅ 재확정 시 기존 race_results 삭제
  const oldResultsSnap = await db.collection("race_results")
    .where("jobId", "==", canonicalJobId)
    .get();

  oldResultsSnap.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  // 새 결과 저장
  for (const r of results) {
    batch.set(ref, row);
  }
  
  await batch.commit();
}
```

---

## 예외 사례

**신규 대회 첫 확정 시:**
- 기존 결과가 없으므로 where 쿼리는 빈 배열 반환
- batch.delete() 호출 없음
- 정상 동작

**재확정 시:**
- 기존 결과 전체 삭제 후 새 결과 저장
- 중복 방지 보장
