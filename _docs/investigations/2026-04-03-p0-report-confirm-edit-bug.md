# P0 버그 조사: report.html confirm 수정 기능 실패

> 발견일: 2026-04-03 (주간 UX 체크리스트 테스트)  
> 심각도: P0 (운영 기능 직접 영향)

## 버그 설명

### 1. 1건 이상 필수 제약

- **재현 스텝**: 완료 탭 → 대회 선택 → "수정하기" → 모든 기록 제외(✕) 시도 → "기록 저장하기"
- **예상**: 0건도 저장 가능 또는 "모두 삭제" 전용 액션 제공
- **실제**: `results.length === 0`이면 "저장할 기록이 없습니다" 토스트만 표시, 저장 불가

### 2. 수정 저장 실패

- **재현 스텝**: "청라 하늘대교마라톤 2026" 대회 선택 → "수정하기" → 기록 변경 → "기록 저장하기" → 확정
- **예상**: 수정된 기록이 Firestore에 반영됨
- **실제**: 저장 실패 (구체적 오류 미확인)

---

## Phase 1: 근본 원인 조사

### 1.1 코드 흐름 분석

#### Frontend (report.html)

```javascript
// 수정하기 버튼 (lines 2029-2035)
document.getElementById("editConfirmedBtn").addEventListener("click", () => {
  if (!confirm("저장된 기록을 수정합니다.\n...")) return;
  currentJob = { ...currentJob, status: "complete" };  // ← 로컬만 변경
  updateSaveButton();
  showToast("수정 모드입니다. 변경 후 기록 저장하기를 눌러주세요.");
});

// 확정 버튼 (lines 1947-2005)
document.getElementById("confirmSaveBtn").addEventListener("click", async () => {
  const included = getIncludedRows();  // decision === "included"만 추출
  // ...
  const res = await fetch(`${raceApiBase()}?action=confirm`, {
    method: "POST",
    body: JSON.stringify({
      jobId: currentJob.jobId,
      eventName: currentJob.eventName,
      eventDate: eventDateForSave,
      source: currentJob.source,
      sourceId: currentJob.sourceId,
      ...(currentJob.canonicalEventId ? { canonicalEventId: currentJob.canonicalEventId } : {}),
      results: included.map(r => ({ ... })),
    }),
  });
});
```

#### Backend (functions/index.js lines 1364-1453)

```javascript
if (action === "confirm" && req.method === "POST") {
  const { jobId, eventName, eventDate, source, sourceId, results, confirmSource, canonicalEventId } = req.body || {};
  
  // 1. 결과 없으면 400 반환
  if (!jobId || !results || !Array.isArray(results)) {
    return res.status(400).json({ ok: false, error: "jobId and results[] required" });
  }

  const batch = db.batch();
  const canonicalJobId = (source && sourceId && source !== "manual")
    ? `${source}_${sourceId}`
    : jobId;

  // 2. results 배열을 race_results 컬렉션에 batch.set()
  for (const r of results) {
    const docId = `${safeName}_${safeDist}_${safeDate}`;
    const ref = db.collection("race_results").doc(docId);
    batch.set(ref, { ... });
  }

  // 3. scrape_jobs 업데이트 (status: "confirmed", ...)
  const jobRef = db.collection("scrape_jobs").doc(canonicalJobId);
  const jobDoc = await jobRef.get();
  if (jobDoc.exists) {
    batch.update(jobRef, { status: "confirmed", confirmedAt: now, ... });  // ← 문제 지점 1
  } else {
    batch.set(jobRef, { status: "confirmed", ... });
  }

  // 4. 기존 jobId와 canonicalJobId가 다르면 기존 job 삭제
  if (canonicalJobId !== jobId) {
    batch.delete(db.collection("scrape_jobs").doc(jobId));
  }

  await batch.commit();
  return res.json({ ok: true, savedCount: results.length });
}
```

### 1.2 가설

#### 가설 1: 0건 저장 시 backend가 400 반환

- **근거**: `if (!results || !Array.isArray(results))` 체크는 있지만, `results.length === 0`은 체크하지 않음
- **예상**: `results: []` 요청 시 → batch.commit()은 성공 (scrape_jobs만 업데이트) → 기존 race_results는 그대로 유지
- **문제**: Frontend에서 0건 저장을 막고 있음 (lines 1894-1898)

```javascript
if (included.length === 0) {
  showToast("저장할 기록이 없습니다. 최소 1건 이상 포함(✓)해주세요.");
  return;
}
```

#### 가설 2: update() 호출 시 기존 status가 "confirmed"가 아니면 실패

- **근거**: `editConfirmedBtn` 클릭 시 `currentJob.status`를 "complete"로 변경하지만, **Firestore에는 반영하지 않음**
- **재확정 시 흐름**:
  1. Frontend: `currentJob.status = "complete"` (로컬만)
  2. Backend: `jobDoc.data().status === "confirmed"` (Firestore는 그대로)
  3. Backend: `batch.update(jobRef, { status: "confirmed", ... })` → **status는 이미 "confirmed"이므로 변화 없음**
- **문제점**:
  - `batch.update()`는 문서가 존재해야 성공하므로 jobDoc.exists 체크 때문에 실패하지는 않음
  - **하지만** `batch.update()`는 기존 필드를 **덮어쓰지 않고 병합**하므로, `results` 필드를 업데이트하지 않음!

#### 가설 3: 기존 race_results를 삭제하지 않고 set()만 실행

- **근거**: `batch.set(ref, row)` 는 **해당 docId 문서를 덮어쓰지만**, 기존에 **다른 docId로 저장된 행은 그대로 유지**
- **예시**:
  - 최초 확정: `홍길동_full_2026-03-30` 저장
  - 수정 확정: 홍길동 기록을 제외 → `included = []` → Frontend에서 저장 막힘
  - 또는: 홍길동 기록을 반영(half) → `홍길동_half_2026-03-30` 저장 → **`홍길동_full_2026-03-30`은 그대로 남음**
- **문제**: **confirm 액션은 해당 대회의 기존 race_results를 삭제하지 않음**

---

## Phase 2: 패턴 분석

### 2.1 다른 유사 기능 검색

```bash
grep -n "delete.*race_results" functions/index.js
# → delete-record 액션에서만 삭제 (개별 기록 삭제용)
```

### 2.2 confirm 액션 설계 의도

- **최초 확정**: `results[]` → race_results에 batch.set()
- **재확정**: 새 `results[]` → race_results에 batch.set() → **기존 기록은 유지되어 중복 발생**

### 2.3 올바른 패턴

1. **Option A (전체 교체)**: confirm 시 해당 대회(`jobId`)의 기존 race_results를 **전부 삭제 후** 새 results 저장
2. **Option B (명시적 삭제)**: Frontend에서 "모든 기록 삭제" 버튼 추가 → 별도 API 호출
3. **Option C (0건 저장 허용)**: `results: []` 요청 시 기존 race_results 삭제만 수행

---

## Phase 3: 최소 재현 테스트

### 3.1 테스트 시나리오

**준비**:
1. 에뮬레이터 실행: `firebase emulators:start --only functions,hosting,firestore`
2. Firestore에 더미 job 생성 (status: "confirmed", jobId: "test_edit_confirm")
3. 더미 race_results 문서 2건 생성 (`홍길동_full_2026-04-03`, `김철수_half_2026-04-03`)

**재현 스텝**:
1. `node scripts/reproduce-p0-confirm-edit.js --simulate` 실행
2. confirm 액션 시뮬레이션: 홍길동 제외, 김철수만 포함
3. Firestore 확인: `홍길동_full_2026-04-03` 문서 유무 확인

### 3.2 실제 결과

```
✅ batch.commit() 완료

🔍 Firestore 상태 확인:
   홍길동_full_2026-04-03: ✅ 존재 (문제!)
   김철수_half_2026-04-03: ✅ 존재 (정상)

⚠️  가설 3 확인: 기존 race_results가 삭제되지 않고 그대로 유지됨
   → confirm 액션은 기존 문서를 삭제하지 않고 새 문서만 추가/수정
```

**결론**: 가설 3이 확인되었습니다. confirm 액션은 **기존 race_results를 삭제하지 않고** 새 results만 추가/수정합니다.

---

## Phase 4: 해결책 구현

### 4.1 핵심 수정

**파일**: `functions/index.js` (lines 1364-1453)

**변경 사항**: confirm 액션 진입 시 **기존 race_results 삭제** 후 새 results 저장

```javascript
if (action === "confirm" && req.method === "POST") {
  const {
    jobId, eventName, eventDate, source, sourceId, results, confirmSource, canonicalEventId,
  } = req.body || {};
  if (!jobId || !results || !Array.isArray(results)) {
    return res.status(400).json({ ok: false, error: "jobId and results[] required" });
  }

  if (canonicalEventId) {
    const evDoc = await db.collection("race_events").doc(String(canonicalEventId)).get();
    if (!evDoc.exists) {
      return res.status(400).json({ ok: false, error: "invalid canonicalEventId" });
    }
  }

  const batch = db.batch();
  const now = new Date().toISOString();

  const canonicalJobId = (source && sourceId && source !== "manual")
    ? `${source}_${sourceId}`
    : jobId;

  // ✅ 수정: 기존 race_results 삭제
  const oldResultsSnap = await db.collection("race_results")
    .where("jobId", "==", canonicalJobId)
    .get();

  oldResultsSnap.forEach(doc => {
    batch.delete(doc.ref);
  });

  // 새 results 저장 (기존 로직)
  for (const r of results) {
    const resolvedDate = eventDate || r.eventDate || "";
    const safeDate = resolvedDate.replace(/[^0-9\-]/g, "");
    const safeName = (r.memberRealName || "").replace(/[^a-zA-Z0-9가-힣]/g, "_");
    const distNorm = normalizeRaceDistance(r.distance);
    const safeDist = (distNorm || "").replace(/[^a-zA-Z0-9]/g, "_");
    const docId = `${safeName}_${safeDist}_${safeDate}`;
    const ref = db.collection("race_results").doc(docId);
    // ...
    batch.set(ref, row);
  }

  // scrape_jobs 업데이트 (기존 로직)
  const jobRef = db.collection("scrape_jobs").doc(canonicalJobId);
  // ...
}
```

### 4.2 0건 저장 허용 (Frontend)

**파일**: `report.html` (lines 1893-1898)

**변경 사항**: `included.length === 0` 체크 제거 또는 확인 메시지로 대체

```javascript
document.getElementById("saveRecordsBtn").addEventListener("click", () => {
  const included = getIncludedRows();
  
  // ✅ 수정: 0건도 저장 가능 (기존 기록 삭제용)
  if (included.length === 0) {
    if (!confirm("모든 기록을 제외하고 확정하시겠습니까?\n기존 저장된 기록이 모두 삭제됩니다.")) {
      return;
    }
  }

  const pending = reviewRows.filter(r => r.decision === "pending" && r.netTime && r.netTime !== "--:--:--");
  // ...
});
```

---

## Phase 5: 검증

### 5.1 코드 변경 확인

**✅ functions/index.js (lines 1386-1395)**:
```javascript
// ✅ P0 수정 (2026-04-03): 재확정 시 기존 race_results 삭제
const oldResultsSnap = await db.collection("race_results")
  .where("jobId", "==", canonicalJobId)
  .get();

oldResultsSnap.forEach(doc => {
  batch.delete(doc.ref);
});
```

**✅ report.html (lines 1896-1901)**:
```javascript
// ✅ P0 수정 (2026-04-03): 0건 저장 허용 (기존 기록 전체 삭제 가능)
if (included.length === 0) {
  if (!confirm("모든 기록을 제외하고 확정하시겠습니까?\n\n기존에 저장된 기록이 모두 삭제됩니다.")) {
    return;
  }
}
```

### 5.2 수동 검증 방법 (로컬 에뮬레이터)

1. **에뮬레이터 시작**:
   ```bash
   cd /Users/taylor/git/dmc_attendance_log
   firebase emulators:start --only functions,hosting,firestore
   ```

2. **더미 데이터 생성**:
   ```bash
   node scripts/reproduce-p0-confirm-edit.js
   ```

3. **http://localhost:5000/report.html 접속**:
   - 비밀번호 입력: `admin_password`
   - "완료" 탭 → "테스트 대회 (수정 재현용)" 클릭
   - "수정하기" 버튼 클릭

4. **시나리오 1: 1건 제외**:
   - 홍길동 행의 토글 버튼 클릭 (✓ → ✕)
   - "기록 저장하기" → 확정
   - **기대**: 홍길동 문서 삭제, 김철수 문서 유지

5. **시나리오 2: 0건 저장**:
   - 모든 기록 제외 (✕)
   - "기록 저장하기" → 확인 메시지 표시
   - **기대**: "모든 기록을 제외하고 확정하시겠습니까?" 확인 → 모든 race_results 삭제

6. **Firestore Emulator UI 확인** (http://localhost:4000/firestore):
   - `race_results` 컬렉션에서 삭제된 문서 확인

### 5.3 프로덕션 배포 전 체크리스트

- [ ] 로컬 에뮬레이터에서 시나리오 1, 2 통과
- [ ] `scripts/pre-deploy-test.sh` 통과
- [ ] 프로덕션 백업: `cd functions && node ../scripts/backup-firestore.js`
- [ ] 배포: `firebase deploy --only functions` → `firebase deploy --only hosting`
- [ ] 프로덕션 검증: 실제 대회 1건 수정 테스트

---

## 결론

**근본 원인**: confirm 액션은 `results[]`만 `batch.set()`하고, 기존 `race_results` 문서를 삭제하지 않아 재확정 시 이전 기록이 남는 문제.

**해결책**: confirm 액션 진입 시 `canonicalJobId` 기준으로 기존 `race_results`를 전체 삭제 후 새 `results` 저장.

**영향 범위**:
- ✅ Backend: `functions/index.js` (confirm 액션)
- ✅ Frontend: `report.html` (0건 저장 허용)

**Side Effect 가능성**: 없음 (기존 최초 확정 흐름은 영향 없음, 재확정만 수정)

---

## 다음 단계

1. ✅ Phase 1 완료 (근본 원인 조사)
2. ✅ Phase 2 완료 (패턴 분석)
3. ✅ Phase 3 완료 (최소 재현 테스트)
4. ✅ Phase 4 완료 (해결책 구현)
5. ⏳ Phase 5 진행 중 (검증) — 로컬 에뮬레이터 수동 테스트 필요
6. ⏸️ Phase 6 대기 (배포)
