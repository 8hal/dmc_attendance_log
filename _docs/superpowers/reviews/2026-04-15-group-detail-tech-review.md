# 테크 스펙 리뷰 - 단체 대회 상세 페이지

**리뷰 일시**: 2026-04-15  
**리뷰어**: Technical Lead (관점)  
**대상**: 2026-04-15-group-detail-impl.md

---

## 평가 기준

| 항목 | 가중치 | 설명 |
|------|--------|------|
| 구현 가능성 (Feasibility) | 25% | 기술 스택, 복잡도, 의존성 |
| 확장성 (Scalability) | 20% | 대용량, 성능, 병목 |
| 안정성 (Reliability) | 25% | 오류 처리, idempotent, 롤백 |
| 보안 (Security) | 15% | 인증, 권한, 데이터 검증 |
| 유지보수성 (Maintainability) | 15% | 코드 품질, 문서화, 테스트 |

---

## 1. 구현 가능성 (Feasibility) — 10/10

### ✅ 강점

**기술 스택:**
- HTML/CSS/JS (vanilla) ✅
- Firebase Hosting ✅
- Cloud Functions (Node.js 24) ✅
- Firestore Admin SDK ✅

**복잡도:**
- Frontend 상태 관리: 중간 (gapResults 배열)
- Backend API: 단순 (CRUD + batch write)
- 의존성: 없음 (순수 기존 기술)

**기존 패턴 재사용:**
- `API_BASE` 상수 ✅
- `showToast()` 헬퍼 ✅
- `normalizeRaceDistance()` 헬퍼 ✅
- `allocateCanonicalEventId()` 헬퍼 ✅

### ⚠️ 약점
- 없음

**점수**: 10/10

---

## 2. 확장성 (Scalability) — 9/10

### ✅ 강점

**대용량 처리:**
- Batch write (500건씩 청크) ✅
- 페이지네이션 계획 (Phase 2) ✅

**성능 최적화:**
- Idempotent API (중복 저장 방지) ✅
- sessionStorage (새로고침 대응) ✅

### ⚠️ 약점

**병목 지점:**
- `bulk-confirm` API: 85건 batch write → 5-10초 소요 (측정 필요)
- **개선**: 백그라운드 처리 + 진행률 표시
  ```javascript
  // Frontend: polling으로 진행률 확인
  const jobId = await startBulkConfirm();
  
  // Backend: batch 커밋 후 progress 업데이트
  await db.collection("bulk_jobs").doc(jobId).update({
    progress: saved / total,
    saved
  });
  ```

**점수**: 9/10 (진행률 표시 부재 -1)

---

## 3. 안정성 (Reliability) — 10/10

### ✅ 강점

**Idempotent 보장:**
```javascript
const docId = `${safeName}_${safeDist}_${safeDate}`;
const existing = await db.collection("race_results").doc(docId).get();
if (existing.exists) {
  saved++;
  continue; // skip
}
```

**오류 처리:**
- try/catch ✅
- 네트워크 타임아웃 (60초) ✅
- 부분 저장 대응 (재시도) ✅

**롤백 계획:**
- git revert + 재배포 ✅
- 백업 복구 (backup-firestore.js) ✅
- Feature flag (선택) ✅

### ⚠️ 약점
- 없음

**점수**: 10/10

---

## 4. 보안 (Security) — 8/10

### ✅ 강점

**권한 구분:**
- 운영자: group.html 접근
- 오너: ops.html 접근 (소스 설정, 스크랩)

**데이터 검증:**
- `realName` 필수 체크 ✅
- `eventId` 존재 여부 확인 ✅

### ⚠️ 약점

**1. 인증 체크 부재:**
- `group-detail.html` URL 직접 접근 → 누구나 접근 가능
- **개선 (Phase 2)**:
  ```javascript
  // 로드 시 인증 체크
  if (sessionStorage.getItem("dmc_group_auth") !== "verified") {
    window.location.href = "group.html";
  }
  ```

**2. CSRF 방어 부재:**
- POST 요청에 CSRF 토큰 없음
- **개선**: Cloud Functions의 CORS 설정 확인
  ```javascript
  // functions/index.js
  res.set("Access-Control-Allow-Origin", "https://dmc-attendance.web.app");
  ```

**점수**: 8/10 (인증 체크 -1, CSRF -1)

---

## 5. 유지보수성 (Maintainability) — 10/10

### ✅ 강점

**코드 품질:**
- 명확한 함수명 (`analyzeProcessingStatus`, `updateProgressUI`) ✅
- 단일 책임 원칙 (함수당 1개 작업) ✅
- 매직 넘버 없음 (`PAGE_SIZE = 50` 등) ✅

**문서화:**
- API 명세 (request/response) ✅
- 상태 관리 (gapResults 구조) ✅
- 오류 처리 전략 ✅
- 배포 계획 ✅

**테스트 시나리오:**
- 정상 흐름 ✅
- 에러 케이스 (네트워크, 부분 저장) ✅
- 엣지 케이스 (참가자 0명) ✅

### ⚠️ 약점
- 없음

**점수**: 10/10

---

## 종합 점수

| 항목 | 점수 | 가중치 | 가중 점수 |
|------|------|--------|-----------|
| 구현 가능성 | 10/10 | 25% | 2.5 |
| 확장성 | 9/10 | 20% | 1.8 |
| 안정성 | 10/10 | 25% | 2.5 |
| 보안 | 8/10 | 15% | 1.2 |
| 유지보수성 | 10/10 | 15% | 1.5 |

**총점: 9.5 / 10** ✅

---

## 필수 개선 사항 (배포 전)

### 1. 인증 체크 추가

**위치**: `group-detail.html` (로드 시)

```javascript
// 상단에 추가
const GROUP_AUTH_KEY = "dmc_group_auth";
if (sessionStorage.getItem(GROUP_AUTH_KEY) !== "verified") {
  alert("권한이 없습니다. 로그인 페이지로 이동합니다.");
  window.location.href = "group.html";
}
```

### 2. CORS 검증

**위치**: `functions/index.js`

```javascript
// bulk-confirm API 시작 부분
res.set("Access-Control-Allow-Origin", "https://dmc-attendance.web.app");
res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
```

---

## 선택 개선 사항 (Phase 2)

### 1. 진행률 표시 (백그라운드 처리)

**Backend:**
```javascript
// bulk_jobs 컬렉션 생성
const jobId = db.collection("bulk_jobs").doc().id;
await db.collection("bulk_jobs").doc(jobId).set({
  status: "running",
  total: results.length,
  saved: 0,
  startedAt: new Date()
});

// 청크마다 업데이트
for (let i = 0; i < results.length; i += CHUNK_SIZE) {
  // ... batch commit ...
  await db.collection("bulk_jobs").doc(jobId).update({
    saved: i + chunk.length
  });
}
```

**Frontend:**
```javascript
// 폴링
async function pollProgress(jobId) {
  const interval = setInterval(async () => {
    const jobDoc = await db.collection("bulk_jobs").doc(jobId).get();
    const { saved, total, status } = jobDoc.data();
    
    updateProgressBar(saved / total);
    
    if (status === "done") {
      clearInterval(interval);
      showSuccessModal(saved);
    }
  }, 1000);
}
```

### 2. 단위 테스트

**Frontend (Jest):**
```javascript
describe("analyzeProcessingStatus", () => {
  it("should count processed and unprocessed", () => {
    const gap = [
      { gapStatus: "ok" },
      { gapStatus: "ambiguous", selectedCandidate: null }
    ];
    const stats = analyzeProcessingStatus(gap);
    expect(stats.processed).toBe(1);
    expect(stats.unprocessed).toBe(1);
  });
});
```

**Backend (Mocha):**
```javascript
describe("bulk-confirm API", () => {
  it("should save 85 records", async () => {
    const res = await request(app)
      .post("/race?action=group-events")
      .send({
        subAction: "bulk-confirm",
        eventId: "evt_test",
        results: [...]
      });
    expect(res.body.ok).toBe(true);
    expect(res.body.saved).toBe(85);
  });
});
```

---

## 아키텍처 검토

### ✅ 칭찬할 점

1. **단일 책임 분리**:
   - `group.html`: 목록
   - `group-detail.html`: 관리
   - 명확한 역할 구분 ✅

2. **Idempotent 설계**:
   - 문서 ID 기반 중복 방지
   - 재시도 안전 ✅

3. **오류 처리 계층**:
   - Frontend: try/catch + toast
   - Backend: validation + error response
   - Database: idempotent + transaction ✅

### ⚠️ 개선 여지

**1. API 응답 일관성:**
```javascript
// 현재 (혼재)
{ ok: true, saved: 85 }
{ ok: false, error: "message" }
{ ok: false, saved: 42, errors: [...] }

// 개선 (통일)
{
  ok: true | false,
  data: { saved: 85 } | null,
  error: null | { message, code, details }
}
```

**2. 상태 머신 명시:**
```javascript
// race_events.groupScrapeStatus
const STATES = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETE: "complete",
  CONFIRMED: "confirmed",
  FAILED: "failed"
};

// 허용 전이
const TRANSITIONS = {
  pending: ["running"],
  running: ["complete", "failed"],
  complete: ["confirmed"],
  confirmed: []
};
```

---

## 배포 준비도

### ✅ 준비 완료

- [x] 기획 리뷰 (9.5/10)
- [x] UX 리뷰 (9.35/10)
- [x] 테크 스펙 리뷰 (9.5/10)
- [x] 프로토타입 (group-detail-v2.html)
- [x] API 설계 (detail, bulk-confirm)
- [x] 오류 처리 전략
- [x] 롤백 계획

### 🔄 배포 전 TODO

**필수:**
- [ ] 인증 체크 추가 (group-detail.html)
- [ ] CORS 검증 (functions/index.js)
- [ ] API 구현 (detail, bulk-confirm)
- [ ] group.html 카드 클릭 이벤트
- [ ] 로컬 에뮬레이터 테스트
- [ ] pre-deploy-test.sh 통과
- [ ] 코드 리뷰

**선택 (Phase 2):**
- [ ] 진행률 표시 (bulk_jobs)
- [ ] 단위 테스트
- [ ] API 응답 통일
- [ ] 상태 머신 명시

---

## 타임라인 재검토

**당초 예상**: 8-10시간

**리뷰 후 조정**: 9-11시간
- Frontend: 3-4시간
- Backend: 3-4시간 (인증 체크 + CORS 추가)
- Integration: 1시간
- 테스트: 2시간
- 코드 리뷰: 1시간

---

## 위험 재평가

| 위험 | 이전 | 현재 | 변화 |
|------|------|------|------|
| API 타임아웃 | 중 | 중 | → |
| 인증 우회 | - | 중 | ↑ (신규) |
| CSRF 공격 | - | 저 | ↑ (신규) |
| 중복 저장 | 중 | 저 | ↓ (Idempotent) |

---

## 결론

**9.5/10 — 배포 승인 조건부** ✅

**조건:**
1. ✅ 인증 체크 추가
2. ✅ CORS 검증
3. ✅ 로컬 에뮬레이터 테스트
4. ✅ 코드 리뷰

**승인 후 다음 단계:**
1. Backend API 구현 (3-4시간)
2. Frontend 통합 (1시간)
3. 로컬 테스트 (1시간)
4. 코드 리뷰 (1시간)
5. 배포 (1시간)

**예상 완료**: 2026-04-16 (내일)

---

## 최종 코멘트

이 테크 스펙은 **프로덕션 배포 수준**입니다.

**칭찬:**
- Idempotent 설계 (중복 저장 방지) 👏
- 오류 처리 완벽 (네트워크, 부분 저장) 👏
- 롤백 계획 명확 (git revert + 백업) 👏

**개선 필요:**
- 인증 체크 (보안)
- CORS 검증 (보안)

위 2개만 추가하면 **배포 가능**합니다.
