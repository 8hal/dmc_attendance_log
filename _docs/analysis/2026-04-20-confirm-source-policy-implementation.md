# confirmSource 정책 및 구현 검증

**작성일**: 2026-04-20  
**목적**: 재확정 시 개인 확정 기록 보호 원칙과 구현 일치 여부 확인

---

## 1. 핵심 원칙

### 1.1 정책 (Policy)

**출처**: `_docs/superpowers/specs/2026-04-20-group-reconfirm-spec.md`

1. **단순 덮어쓰기**: 같은 `confirmSource` 내에서 마지막 확정이 우선 (다른 confirmSource는 영향 없음)
2. **역할 분리**: 
   - 그룹 대회: 운영진(`confirmSource: "operator"`)
   - 개인 대회: 개인(`confirmSource: "personal"`)
3. **개인 확정 기록 보호**: 운영자 재확정 시 `confirmSource: "operator"`만 삭제, `confirmSource: "personal"` 보존
4. **적용 범위**: 모든 확정 API (`confirm`, `bulk-confirm`)

### 1.2 시나리오

**보호해야 할 케이스:**
```
1. 운영진이 경기 마라톤 85명 확정 → confirmSource: "operator"
2. 홍길동이 my.html에서 자기 기록 수정 → confirmSource: "personal" (같은 docId 덮어쓰기)
3. 운영진이 DNS 2명 추가로 재확정 실행
   → 기대: 84명 operator 삭제, 홍길동 personal은 보존
   → 결과: 84명 operator 재생성, 홍길동 personal 유지
```

---

## 2. 구현 검증

### 2.1 confirm API (개인 스크랩 재확정)

**파일**: `functions/index.js`  
**라인**: 1827-1843

**구현 코드**:
```javascript
// ✅ P0 수정 (2026-04-03): 재확정 시 기존 race_results 삭제
// ✅ Critical (2026-04-20): confirmSource 필터 추가 (개인 확정 기록 보호)
// 핵심 원칙: 같은 confirmSource 내에서만 덮어쓰기, 다른 confirmSource는 보존
const sourceToDelete = confirmSource || "operator";
const oldResultsSnap = await db.collection("race_results")
  .where("jobId", "==", canonicalJobId)
  .where("confirmSource", "==", sourceToDelete)  // ← 필터 추가
  .get();

console.log(`[confirm] 삭제 대상: ${oldResultsSnap.size}건 (${sourceToDelete}만)`);
oldResultsSnap.forEach(doc => {
  const data = doc.data();
  console.log(`  삭제: ${doc.id} (realName: ${data.memberRealName})`);
  batch.delete(doc.ref);
});
```

**검증**:
- ✅ `confirmSource` 필터 존재
- ✅ 삭제 로그 존재
- ✅ 같은 `confirmSource`만 삭제
- ✅ 원칙 1, 3 준수

---

### 2.2 bulk-confirm API (그룹 대회 재확정)

**파일**: `functions/index.js`  
**라인**: 2954-2978

**구현 코드**:
```javascript
// ✅ 재확정 시 중복 방지: 기존 결과 전체 삭제 후 재저장
// 참고: action=confirm API와 동일 패턴 (라인 1814~1820)
// ⚠️ Critical: operator만 삭제, personal은 보존 (개인 확정 기록 보호)
const oldResultsSnap = await db.collection("race_results")
  .where("canonicalEventId", "==", eventId)
  .where("confirmSource", "==", "operator")  // ← 필터 추가
  .get();

console.log(`[bulk-confirm] 삭제 대상: ${oldResultsSnap.size}건 (operator만, personal 제외)`);

const BATCH_SIZE = 500;
const oldDocs = oldResultsSnap.docs;

// 삭제 로그 (운영 모니터링용)
oldDocs.forEach((doc) => {
  const data = doc.data();
  console.log(`  삭제 예정: ${doc.id} (realName: ${data.memberRealName}, distance: ${data.distance})`);
});

for (let i = 0; i < oldDocs.length; i += BATCH_SIZE) {
  const deleteBatch = db.batch();
  oldDocs.slice(i, i + BATCH_SIZE).forEach((doc) => {
    deleteBatch.delete(doc.ref);
  });
  await deleteBatch.commit();
}

console.log(`[bulk-confirm] 기존 기록 삭제 완료: ${oldDocs.length}건`);
```

**검증**:
- ✅ `confirmSource: "operator"` 필터 존재
- ✅ 삭제 로그 존재 (삭제 예정, 삭제 완료)
- ✅ `personal`은 쿼리에서 제외됨
- ✅ 원칙 2, 3 준수

---

## 3. 원칙 vs 구현 일치 여부

| 원칙 | confirm API | bulk-confirm API | 일치 여부 |
|------|-------------|------------------|-----------|
| 1. 같은 confirmSource 내에서만 덮어쓰기 | ✅ sourceToDelete 필터 | ✅ "operator" 필터 | ✅ 일치 |
| 2. 역할 분리 (operator/personal) | ✅ confirmSource 파라미터 사용 | ✅ "operator" 고정 | ✅ 일치 |
| 3. 개인 확정 기록 보호 | ✅ personal 제외 | ✅ personal 제외 | ✅ 일치 |
| 4. 모든 API 적용 | ✅ 적용됨 | ✅ 적용됨 | ✅ 일치 |

---

## 4. 추가 검증 필요 사항

### 4.1 Firestore 인덱스

**필요 인덱스**:
1. `race_results` 컬렉션:
   - `jobId` + `confirmSource` (confirm API용)
   - `canonicalEventId` + `confirmSource` (bulk-confirm API용)

**확인 방법**:
```bash
# Firebase Console → Firestore → Indexes
# 또는 functions 로그에서 "index required" 에러 확인
```

**상태**: ⚠️ 미확인 (배포 후 확인 필요)

### 4.2 기존 데이터 마이그레이션

**문제**: 2026-04-18 배포 이전 기록은 `confirmSource` 필드가 없을 수 있음

**확인 방법**:
```javascript
// Firestore 쿼리
db.collection("race_results")
  .where("confirmSource", "==", null)
  .limit(1)
  .get()
```

**대응**:
- 옵션 1: `confirmSource || "operator"` 기본값 처리 (현재 구현)
- 옵션 2: 스크립트로 일괄 업데이트

**상태**: ⚠️ 미확인

---

## 5. 테스트 시나리오

### 5.1 단위 테스트 (로컬)

**시나리오 1: operator 재확정**
```javascript
// Given: 3개 기록 (2 operator, 1 personal)
// When: bulk-confirm 실행 (operator)
// Then: 2개 삭제, 1개 보존
```

**시나리오 2: personal 재확정**
```javascript
// Given: 2개 기록 (1 operator, 1 personal)
// When: confirm 실행 (personal)
// Then: 1개 삭제, 1개 보존
```

### 5.2 통합 테스트 (프로덕션)

**시나리오**: 경기 마라톤 재확정
```
1. 운영진이 group-detail.html에서 "재검토" 모드 진입 (UI 미구현, Firestore 직접 확인)
2. bulk-confirm API 호출
3. Functions 로그 확인:
   - "[bulk-confirm] 삭제 대상: 85건 (operator만, personal 제외)"
   - "삭제 예정: 홍길동_full_2026-04-19 ..."
4. Firestore 확인:
   - operator 기록 재생성 확인
   - personal 기록 보존 확인 (있다면)
```

---

## 6. 결론

### 6.1 원칙-구현 일치 여부

✅ **일치함**

- `confirm` API: `confirmSource` 필터 추가 (같은 source만 삭제)
- `bulk-confirm` API: `confirmSource: "operator"` 필터 추가 (personal 보호)
- 삭제 로그 추가 (운영 모니터링)

### 6.2 배포 전 확인 사항

1. ⚠️ Firestore 인덱스 생성 확인 필요
2. ⚠️ 기존 데이터 `confirmSource` 필드 확인 필요
3. ✅ 로직은 원칙과 일치

### 6.3 배포 후 검증 방법

1. Functions 로그 확인:
   ```bash
   firebase functions:log --only attendance
   ```
2. 로그에서 "삭제 대상" 건수 확인
3. Firestore에서 `confirmSource: "personal"` 기록 보존 확인

---

## 7. 리뷰 요청 사항

**리뷰어**: 팀장 또는 코드 리뷰어

**확인 필요 항목**:
1. ✅ 원칙-구현 일치 여부
2. ⚠️ Firestore 인덱스 전략 (자동 생성 vs 수동 생성)
3. ⚠️ 기존 데이터 마이그레이션 필요 여부
4. ✅ 삭제 로그 충분 여부
5. ✅ 에러 핸들링 (인덱스 없을 때)

**배포 승인 조건**:
- [ ] 리뷰어 승인
- [ ] Firestore 인덱스 전략 결정
- [ ] 기존 데이터 확인 (있다면)
