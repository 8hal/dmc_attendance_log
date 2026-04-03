# 코드 리뷰: 2026-04-01 리팩토링 (confirmedCount 제거 + confirmSource 단순화)

> **리뷰 일자:** 2026-04-03  
> **리뷰 대상:** `f93cc3c` (confirmedCount 제거) + `4d5d22e` (confirmSource 단순화)  
> **리뷰어:** AI (Claude Sonnet 4.5) + 사용자 검증 필요  
> **목적:** 향후 유사 리팩토링 시 반복 실수 방지, 아키텍처 결정 근거 문서화

---

## 요약

### 변경 내용
1. **confirmedCount 제거** (`f93cc3c`): denormalized 캐시 제거, race_results(SSOT)에서 실시간 집계
2. **confirmSource 단순화** (`4d5d22e`): enum 6개 → 2개(personal/operator), Firestore 694건 마이그레이션

### 핵심 평가
- ✅ **아키텍처 방향**: SSOT 원칙 준수, 데이터 불일치 원천 차단
- ⚠️ **성능 트레이드오프**: N+1 쿼리 위험 (전체 race_results 스캔)
- ⚠️ **프로덕션 안전성**: 테스트·에러 핸들링·동시성 검증 부족

---

## Critical Issues (P0 - 즉시 수정 필요)

### 1. N+1 쿼리 및 성능 저하

**위치:** `functions/index.js` - `/race?action=events`

**문제:**
```javascript
// events API에서 전체 confirmed race_results 스캔
const [snap, rrSnap] = await Promise.all([
  db.collection("scrape_jobs").orderBy("createdAt", "desc").get(),
  db.collection("race_results").where("status", "==", "confirmed").get(), // ← 전체 스캔
]);

const rrCountByJob = {};
rrSnap.forEach((doc) => {
  const jid = doc.data().jobId || "none";
  rrCountByJob[jid] = (rrCountByJob[jid] || 0) + 1;
});
```

**영향:**
- `confirmedCount` 제거 전: O(1) 읽기 (각 job 문서에서 숫자 1개)
- 제거 후: O(n) 스캔 (전체 confirmed 건수 = 현재 694건, 향후 수천~수만 건)
- **Firestore 읽기 비용**: 매 `/race?action=events` 요청마다 전체 confirmed 건수만큼 청구
- **응답 시간**: 데이터 증가에 비례해 선형 증가

**해결책 (우선순위 순):**

#### Option A: Firestore Aggregation Query (권장)
```javascript
// Firestore Count Aggregation (2024년 GA)
const aggQuery = db.collection("race_results")
  .where("status", "==", "confirmed");

const snapshot = await aggQuery.count().get();
const totalConfirmed = snapshot.data().count;

// jobId별 카운트는 클라이언트 측 집계 또는 별도 인덱스 필요
```

**장점:** Native 지원, 읽기 1건으로 카운트  
**단점:** jobId별 카운트는 별도 처리 필요

#### Option B: Cloud Function 트리거로 카운트 유지 (이벤트 기반)
```javascript
// functions/triggers/race-results-counter.js
exports.updateJobCount = onDocumentWritten("race_results/{docId}", async (event) => {
  const before = event.data.before?.data();
  const after = event.data.after?.data();
  
  // confirmed 상태 변화 시에만 카운트 업데이트
  if (before?.status === "confirmed" && after?.status !== "confirmed") {
    // decrement
  } else if (before?.status !== "confirmed" && after?.status === "confirmed") {
    // increment
  }
  
  const jobId = after?.jobId || before?.jobId;
  if (!jobId) return;
  
  const jobRef = db.collection("scrape_jobs").doc(jobId);
  await jobRef.update({
    confirmedCount: FieldValue.increment(delta),
    _countUpdatedAt: FieldValue.serverTimestamp(),
  });
});
```

**장점:** 
- 기존 `confirmedCount` 개념 복원하되 **수동 increment/decrement 제거**
- 트리거 기반이라 동기화 자동 보장
- `/race?action=events` 쿼리는 O(1) 유지

**단점:** 
- 트리거 비용 (write 1건당 추가 write 1건)
- 초기 backfill 필요

**구현 시 주의사항:**
1. **멱등성**: 같은 문서 여러 번 트리거돼도 카운트 정확해야 함
2. **초기화**: 기존 job의 `confirmedCount`를 0으로 리셋 후 트리거 활성화
3. **모니터링**: `_countUpdatedAt` 타임스탬프로 트리거 실행 추적

#### Option C: 캐싱 레이어 (Redis/Memorystore)
```javascript
// Redis에 jobId별 카운트 캐시
const redis = require("redis").createClient();
const cacheKey = `job:${jobId}:confirmed_count`;

const cachedCount = await redis.get(cacheKey);
if (cachedCount !== null) return parseInt(cachedCount, 10);

// cache miss → Firestore 조회 후 캐시 저장
const count = await db.collection("race_results")
  .where("jobId", "==", jobId)
  .where("status", "==", "confirmed")
  .count().get();

await redis.setex(cacheKey, 3600, count); // 1시간 TTL
```

**장점:** 읽기 성능 극대화  
**단점:** 인프라 복잡도 증가, 캐시 무효화 로직 필요

---

### 2. 트랜잭션 없는 배치 업데이트 경합

**위치:** `scripts/migrate-confirm-source.js`

**문제:**
```javascript
for (let i = 0; i < targets.length; i += 500) {
  const batch = db.batch();
  targets.slice(i, i + 500).forEach(({ ref, to }) => {
    batch.update(ref, { confirmSource: to });
  });
  await batch.commit();
  // ← 배치 사이 간격에 사용자가 동시에 같은 문서 수정 가능
}
```

**시나리오:**
1. 마이그레이션 스크립트가 배치 1 (문서 1-500) 커밋
2. 사용자가 웹앱에서 문서 250번 수정 (예: `confirm` 액션)
3. 스크립트가 배치 2 (문서 501-1000) 커밋 중에 문서 250의 다른 필드 업데이트 누락

**결과:** Lost Update (사용자 변경사항 덮어쓰기)

**해결책:**

#### Option 1: 유지보수 창 (권장 - 단순함)
```bash
# 1. Cloud Function 배포 중지 (또는 admin 전용 모드)
firebase functions:delete race --force

# 2. 마이그레이션 실행
node scripts/migrate-confirm-source.js --apply

# 3. Cloud Function 재배포
firebase deploy --only functions
```

**장점:** 동시성 문제 원천 차단  
**단점:** 서비스 중단 시간 필요 (5-10분)

#### Option 2: 낙관적 잠금 (Optimistic Locking)
```javascript
// 마이그레이션 전 타임스탬프 기록
const migrationStartTime = FieldValue.serverTimestamp();

targets.forEach(({ ref, from, to }) => {
  batch.update(ref, { 
    confirmSource: to,
    _migratedAt: migrationStartTime,
    _migrationCheck: from, // 원본 값 검증
  });
});

// 배치 커밋 후 검증
const verifySnap = await ref.get();
const data = verifySnap.data();
if (data._migrationCheck !== from) {
  console.warn(`충돌 감지: ${ref.id} - 기대값 ${from}, 실제값 ${data._migrationCheck}`);
  // 수동 검토 필요 큐에 추가
}
```

**장점:** 서비스 중단 없음, 충돌 감지 가능  
**단점:** 복잡도 증가, 충돌 시 수동 해결 필요

#### Option 3: Idempotent 스크립트 (현재 구현 개선)
```javascript
const targets = [];
snap.forEach((doc) => {
  const cs = doc.data().confirmSource;
  // 이미 변환된 값이면 스킵
  if (cs && MAPPING[cs] && cs !== MAPPING[cs]) {
    targets.push({ ref: doc.ref, id: doc.id, from: cs, to: MAPPING[cs] });
  }
});
```

**현재 코드 문제:**
```javascript
if (cs && MAPPING[cs]) {
  // ← "operator"는 MAPPING에 없으므로 재실행 시 스킵 안 됨
}
```

**개선:**
```javascript
const OLD_VALUES = new Set(Object.keys(MAPPING));
if (cs && OLD_VALUES.has(cs)) {
  // ← 이전 값만 대상으로 (이미 마이그레이션된 건 제외)
}
```

**교훈 (향후 마이그레이션):**
1. **Dry-run 필수**: `--apply` 없이 먼저 실행, 대상 건수 확인
2. **재실행 안전성**: 같은 스크립트 여러 번 실행해도 결과 동일하게 (멱등성)
3. **롤백 계획**: 실패 시 원래 상태로 복구 방법 미리 준비
4. **백업**: Firestore export (특히 production)

---

## Important Issues (P1 - 배포 전 수정 권장)

### 3. confirmSource 기본값 의미론적 오류

**위치:** `functions/index.js` - `/race?action=confirm`

**문제:**
```javascript
confirmSource: confirmSource || "operator",
```

**시나리오:**
- my.html(회원용)에서 `/race?action=confirm` 호출 시 `confirmSource` 파라미터 누락
- → 기본값 `"operator"`로 기록됨
- → 회원이 확정했는데 운영자로 잘못 기록

**근본 원인:** API가 caller identity를 검증하지 않음 (클라이언트가 `confirmSource` 명시해야 함)

**해결책:**

#### Option 1: 인증 기반 자동 추론 (권장)
```javascript
// Firebase Authentication 기반
const uid = context.auth?.uid;
if (!uid) {
  return res.status(401).json({ error: "Authentication required" });
}

const userDoc = await db.collection("members").doc(uid).get();
const userData = userDoc.data();

// role 필드로 판단 (members 컬렉션에 role 필드 추가 필요)
const inferredSource = userData?.role === "admin" ? "operator" : "personal";
const finalConfirmSource = confirmSource || inferredSource;
```

**장점:** 클라이언트 실수 방지, 서버 측에서 강제  
**단점:** Authentication 설정 필요, members.role 필드 추가

#### Option 2: 필수 파라미터로 변경
```javascript
if (!confirmSource) {
  return res.status(400).json({ 
    error: "confirmSource required (personal or operator)" 
  });
}
```

**장점:** 간단, 명시적  
**단점:** 클라이언트 코드 수정 필요 (my.html, report.html)

#### Option 3: 클라이언트 감사 (임시 조치)
```javascript
// my.html에서 확인
fetch("/race?action=confirm", {
  body: JSON.stringify({
    ...data,
    confirmSource: "personal", // ← 명시적으로 추가
  }),
});

// report.html에서 확인
fetch("/race?action=confirm", {
  body: JSON.stringify({
    ...data,
    confirmSource: "operator", // ← 명시적으로 추가
  }),
});
```

**액션 아이템:**
1. my.html, report.html 코드 검색 (`/race?action=confirm` 호출부)
2. `confirmSource` 파라미터 전달 여부 확인
3. 누락 시 추가 또는 Option 1/2 적용

---

### 4. 에러 핸들링 부재

**위치:** `functions/index.js` 전역

**문제:**
```javascript
const [snap, rrSnap] = await Promise.all([
  db.collection("scrape_jobs").orderBy("createdAt", "desc").get(),
  db.collection("race_results").where("status", "==", "confirmed").get(),
]);
// ← Firestore 장애 시 500 에러, 사용자에게 의미 없는 메시지
```

**시나리오:**
- Firestore 일시적 장애 (Network timeout, Quota exceeded)
- → 사용자는 "Internal Server Error" 만 봄
- → 재시도 가능한지, 일시적인지 판단 불가

**해결책:**

```javascript
try {
  const [snap, rrSnap] = await Promise.all([
    db.collection("scrape_jobs").orderBy("createdAt", "desc").get(),
    db.collection("race_results").where("status", "==", "confirmed").get(),
  ]);
} catch (err) {
  console.error("events API Firestore 쿼리 실패:", {
    error: err.message,
    code: err.code,
    timestamp: new Date().toISOString(),
  });
  
  // 사용자 친화적 메시지
  return res.status(500).json({ 
    error: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    code: "FIRESTORE_QUERY_FAILED",
    retryAfter: 5, // 초
  });
}
```

**추가 권장사항:**
1. **재시도 로직**: 네트워크 오류 시 자동 재시도 (exponential backoff)
2. **타임아웃**: 쿼리 시간 제한 (예: 10초)
3. **모니터링**: Error Reporting에 자동 로깅

---

## Minor Issues (개선 권장)

### 5. 매직 넘버 및 하드코딩

**위치:** `scripts/migrate-confirm-source.js`

**문제:**
```javascript
for (let i = 0; i < targets.length; i += 500) {
  // 500 ← Firestore batch limit이지만 명시되지 않음
}
```

**개선:**
```javascript
const FIRESTORE_BATCH_LIMIT = 500;

for (let i = 0; i < targets.length; i += FIRESTORE_BATCH_LIMIT) {
  const batch = db.batch();
  const chunk = targets.slice(i, i + FIRESTORE_BATCH_LIMIT);
  // ...
}
```

**교훈:** 숫자 리터럴은 상수로 추출, 주석으로 의미 설명

---

### 6. 불필요한 변수 캐싱

**위치:** `functions/index.js` - events API

**문제:**
```javascript
const rrCountByJob = {};
rrSnap.forEach((doc) => {
  const jid = doc.data().jobId || "none";
  rrCountByJob[jid] = (rrCountByJob[jid] || 0) + 1;
});

// 실제 사용처
foundCount: rrCountByJob[doc.id] || 0
// ← "none" 키에 쌓인 카운트는 사용되지 않음
```

**개선:**
```javascript
const rrCountByJob = {};
rrSnap.forEach((doc) => {
  const jid = doc.data().jobId;
  if (!jid) return; // jobId 없으면 스킵 (카운트에 포함 안 함)
  rrCountByJob[jid] = (rrCountByJob[jid] || 0) + 1;
});
```

**교훈:** Fallback 값(`"none"`) 추가 전에 실제 사용처 확인

---

### 7. 일관성 없는 주석 스타일

**현재:**
```javascript
// SSOT(race_results) 기준 jobId별 확정 건수
const rrCountByJob = {};

// confirmed 상태인데 실제 race_results가 0건인 phantom job만 이슈로 보고
const issues = [];
```

**개선 (JSDoc 형식):**
```javascript
/**
 * SSOT(race_results) 기준 jobId별 확정 건수를 집계
 * @type {Object.<string, number>}
 */
const rrCountByJob = {};

/**
 * confirmed 상태이나 실제 race_results가 없는 phantom job 목록
 * @type {Array<{jobId: string, eventName: string, actual: number}>}
 */
const issues = [];
```

**장점:** IDE 자동완성, 타입 추론, 문서 자동 생성

---

### 8. 테스트 누락

**현재:** 자동화 테스트 없음

**리스크:**
- events API 성능 회귀 탐지 불가
- data-integrity 로직 변경 검증 수동
- 리팩토링 시 기존 기능 깨짐 발견 늦음

**추천 테스트 케이스:**

```javascript
// functions/test/race-api.test.js
const { expect } = require("chai");
const { db, clearFirestore, seedData } = require("./helpers");

describe("GET /race?action=events", () => {
  beforeEach(async () => {
    await clearFirestore();
    await seedData({
      scrape_jobs: [
        { id: "job1", eventName: "서울마라톤", status: "confirmed" },
        { id: "job2", eventName: "부산마라톤", status: "pending" },
      ],
      race_results: [
        { jobId: "job1", status: "confirmed", memberName: "홍길동" },
        { jobId: "job1", status: "confirmed", memberName: "김철수" },
        { jobId: "job1", status: "confirmed", memberName: "이영희" },
        { jobId: "job2", status: "confirmed", memberName: "박민수" },
      ],
    });
  });

  it("should count confirmed results from race_results SSOT", async () => {
    const res = await fetch("http://localhost:5001/race?action=events");
    const data = await res.json();

    const job1 = data.jobs.find((j) => j.jobId === "job1");
    expect(job1.foundCount).to.equal(3); // race_results 기준

    const job2 = data.jobs.find((j) => j.jobId === "job2");
    expect(job2.foundCount).to.equal(0); // status: pending → foundCount는 results.length
  });

  it("should handle missing jobId in race_results", async () => {
    await db.collection("race_results").add({
      // jobId 없음
      status: "confirmed",
      memberName: "고아 기록",
    });

    const res = await fetch("http://localhost:5001/race?action=events");
    expect(res.status).to.equal(200); // 에러 없이 처리
  });
});

describe("GET /race?action=data-integrity", () => {
  it("should detect phantom jobs (confirmed but 0 results)", async () => {
    await seedData({
      scrape_jobs: [
        { id: "phantom", eventName: "유령대회", status: "confirmed" },
      ],
      race_results: [], // 실제 결과 없음
    });

    const res = await fetch("http://localhost:5001/race?action=data-integrity");
    const data = await res.json();

    expect(data.issues).to.have.lengthOf(1);
    expect(data.issues[0].jobId).to.equal("phantom");
    expect(data.issues[0].actual).to.equal(0);
  });
});
```

**실행:**
```bash
# 에뮬레이터 기반 테스트
firebase emulators:exec --only functions,firestore "npm test"
```

---

## 배포 전 체크리스트

### 필수 (P0-P1)
- [ ] **events API 성능 측정**
  - [ ] Firebase Console에서 Firestore 읽기 비용 확인 (최근 7일)
  - [ ] `/race?action=events` 응답 시간 측정 (Chrome DevTools Network 탭)
  - [ ] 예상 트래픽 기준 월간 비용 계산
- [ ] **confirmSource 기본값 로직 검증**
  - [ ] my.html 코드 검색: `fetch.*action=confirm` → `confirmSource: "personal"` 존재 확인
  - [ ] report.html 코드 검색: `fetch.*action=confirm` → `confirmSource: "operator"` 존재 확인
  - [ ] 누락 시: 클라이언트 코드 수정 또는 서버 측 인증 추가
- [ ] **마이그레이션 검증**
  - [ ] `node scripts/migrate-confirm-source.js` (dry-run) 재실행
  - [ ] 대상 건수 0건 확인 (이미 마이그레이션 완료)
  - [ ] Firestore Console에서 `confirmSource` 값 분포 확인 (personal/operator만 존재)

### 권장
- [ ] **에러 핸들링 추가**
  - [ ] events API에 try-catch 추가
  - [ ] 사용자 친화적 에러 메시지 작성
- [ ] **pre-deploy-test 실행**
  - [ ] `bash scripts/pre-deploy-test.sh`
  - [ ] 전체 통과 확인
- [ ] **자동화 테스트 작성**
  - [ ] events API 테스트 최소 1개
  - [ ] data-integrity API 테스트 1개

---

## 향후 개선 로드맵

### 단기 (이번 스프린트)
1. **성능 측정 및 임계치 설정**
   - 현재 읽기 비용, 응답 시간 기준선 확립
   - 알림 임계치 설정 (예: 응답 시간 > 3초, 읽기 > 1000건/일)

2. **클라이언트 코드 감사**
   - my.html, report.html에서 `confirmSource` 전달 여부 확인
   - 누락 시 즉시 수정

### 중기 (다음 스프린트)
1. **성능 개선 (데이터 > 2000건 시)**
   - Option B (트리거 기반 카운트) 구현
   - 초기 backfill 스크립트 작성
   - 배포 후 모니터링 (카운트 정확도, 트리거 실행 시간)

2. **테스트 인프라 구축**
   - `functions/test/` 폴더 생성
   - Mocha + Chai 환경 설정
   - CI/CD에 테스트 자동 실행 추가

### 장기
1. **인증 기반 confirmSource 자동 추론**
   - Firebase Authentication 적용
   - members.role 필드 추가 (admin/member)
   - 서버 측에서 자동 판단

2. **모니터링 대시보드**
   - Firebase Performance Monitoring 활성화
   - Firestore 읽기/쓰기 비용 추이 시각화
   - 이상 패턴 알림 (예: 읽기 급증)

---

## 교훈 (Lessons Learned)

### 1. 아키텍처 변경 시 성능 영향 고려
- **문제:** denormalized 캐시 제거 → 전체 스캔으로 전환
- **교훈:** 리팩토링 전 읽기/쓰기 패턴 분석, 트레이드오프 명시
- **적용:** 다음부터는 변경 전후 쿼리 비용 비교표 작성

### 2. 마이그레이션 스크립트는 멱등성 필수
- **문제:** 재실행 시 이미 변환된 값도 대상에 포함
- **교훈:** 스크립트 실행 전 dry-run, 재실행 안전성 검증
- **적용:** 마이그레이션 템플릿 작성 (idempotent 패턴 포함)

### 3. API 기본값은 의미론적 정확성 우선
- **문제:** `confirmSource || "operator"` → 회원 확정도 운영자로 기록
- **교훈:** 기본값은 "안전한 실패" 또는 명시적 오류가 나음
- **적용:** 다음부터는 기본값 대신 필수 파라미터 또는 인증 기반 추론

### 4. 프로덕션 배포 전 테스트 자동화
- **문제:** 수동 검증만으로 회귀 탐지 어려움
- **교훈:** 리팩토링 영향 범위가 큰 API는 테스트 먼저 작성
- **적용:** 이번 배포 후 즉시 events/data-integrity API 테스트 추가

---

## 관련 문서

- [데이터 딕셔너리](_docs/knowledge/data-dictionary.md) - confirmSource enum 정의
- [배포 전 체크리스트](.cursor/rules/pre-deploy-checklist.mdc) - 배포 절차
- [데이터 쓰기 안전 규칙](.cursor/rules/data-write-safety.mdc) - 마이그레이션 승인
- [2026-04-01 일지](_docs/log/2026-04-01.md) - 작업 컨텍스트

---

## 피드백

이 리뷰는 AI가 작성한 것으로, 실제 프로덕션 환경과 비즈니스 요구사항을 완전히 반영하지 못할 수 있습니다.

**사용자 액션 필요:**
1. Critical/Important Issues 중 우선순위 재조정
2. 성능 측정 결과 반영 (현재는 추정치)
3. 클라이언트 코드 실제 확인 (my.html/report.html)
4. 배포 후 모니터링 결과 업데이트

**리뷰 업데이트:**
- 성능 측정 완료 시: "성능 측정 결과" 섹션 추가
- 배포 완료 시: "배포 후 검증" 섹션 추가
- 이슈 수정 완료 시: 해당 이슈에 체크 표시 + 커밋 SHA 기록
