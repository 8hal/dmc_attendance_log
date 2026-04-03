# 코드 리팩토링 체크리스트

> 향후 유사한 리팩토링 작업 시 반복 실수 방지용 체크리스트  
> **근거:** 2026-04-01 confirmedCount 제거 + confirmSource 단순화 리뷰 (상세: `code-review-2026-04-01-refactoring.md`)

---

## 설계 단계

### 아키텍처 영향 분석
- [ ] **읽기/쓰기 패턴 변화** 문서화 (Before/After)
- [ ] **Firestore 비용 추정** (읽기·쓰기·저장 각각)
- [ ] **응답 시간 영향** 예측 (O(1) → O(n) 전환 여부)
- [ ] **트레이드오프 명시** (예: 데이터 일관성 vs 성능)

### 성능 고려사항
- [ ] 전체 컬렉션 스캔이 필요한가? → Aggregation Query 또는 인덱스 고려
- [ ] denormalized 캐시 제거 시 → 트리거 기반 자동 업데이트 검토
- [ ] N+1 쿼리 패턴 발생 가능성 검토

### 기본값 및 Fallback
- [ ] API 기본값이 의미론적으로 정확한가? (추론 가능한가?)
- [ ] 필수 파라미터를 선택적으로 만들지 않았는가?
- [ ] 인증 기반 자동 추론이 더 안전하지 않은가?

---

## 구현 단계

### 코드 품질
- [ ] **에러 핸들링** 추가 (try-catch + 사용자 친화적 메시지)
- [ ] **매직 넘버** 상수로 추출 (예: `FIRESTORE_BATCH_LIMIT = 500`)
- [ ] **주석 일관성** (JSDoc 형식 권장)
- [ ] **불필요한 변수** 제거 (실제 사용처 확인)

### 마이그레이션 스크립트 (Firestore 데이터 수정 시)
- [ ] **Dry-run 모드** 구현 (기본값)
- [ ] **멱등성 보장** (재실행해도 결과 동일)
- [ ] **충돌 감지** (동시 수정 시나리오 고려)
- [ ] **진행 상황 로깅** (배치 단위 진행률 출력)
- [ ] **백업 계획** (Firestore export 또는 롤백 스크립트)

```javascript
// 멱등성 패턴 예시
const OLD_VALUES = new Set(Object.keys(MAPPING));
if (cs && OLD_VALUES.has(cs)) {
  // 이전 값만 대상 (이미 마이그레이션된 건 제외)
}
```

### 테스트 작성
- [ ] **단위 테스트** (최소 1개 - 핵심 로직)
- [ ] **통합 테스트** (에뮬레이터 기반 - API 엔드포인트)
- [ ] **성능 테스트** (대량 데이터 시나리오)
- [ ] **에지 케이스** (null, 빈 배열, 동시성)

---

## 배포 전 검증

### 필수 체크
- [ ] **pre-deploy-test.sh 실행** (전체 통과 확인)
- [ ] **Firestore 비용 측정** (Firebase Console - 최근 7일 추이)
- [ ] **응답 시간 측정** (Chrome DevTools - 주요 API)
- [ ] **클라이언트 코드 감사** (파라미터 누락·불일치 확인)
- [ ] **마이그레이션 dry-run** (대상 건수 0건 확인)

### 권장 체크
- [ ] 에뮬레이터에서 실제 시나리오 재현
- [ ] Linter 오류 없음 (`ReadLints` 도구)
- [ ] Git 커밋 메시지 명확성 (변경 이유 포함)

---

## 배포 후 모니터링

### 즉시 확인 (배포 후 1시간 내)
- [ ] 주요 기능 수동 테스트 (프로덕션 URL)
- [ ] `event_logs` 컬렉션에 정상 이벤트 쌓이는지
- [ ] Cloud Functions 로그에 에러 없는지 (Firebase Console)

### 단기 모니터링 (배포 후 1주일)
- [ ] Firestore 읽기/쓰기 비용 추이 (Before/After 비교)
- [ ] API 응답 시간 분포 (P50, P95, P99)
- [ ] 에러율 추이 (Cloud Functions Error Reporting)

### 이상 패턴 감지 시
- [ ] 즉시 롤백 여부 판단 (임계치 초과 시)
- [ ] 근본 원인 분석 → 일지 기록
- [ ] 핫픽스 또는 다음 배포에서 수정

---

## 자주 하는 실수 (Anti-patterns)

### ❌ 피해야 할 패턴
1. **전체 스캔으로 전환 (성능 고려 없이)**
   ```javascript
   // Bad: 매번 전체 race_results 스캔
   const rrSnap = await db.collection("race_results").get();
   ```

2. **배치 업데이트 중 동시성 무시**
   ```javascript
   // Bad: 배치 사이 충돌 가능성
   for (let i = 0; i < targets.length; i += 500) {
     await batch.commit();
     // ← 사용자가 동시에 같은 문서 수정 가능
   }
   ```

3. **기본값으로 의미 왜곡**
   ```javascript
   // Bad: 회원 확정도 운영자로 기록될 수 있음
   confirmSource: confirmSource || "operator"
   ```

4. **테스트 없는 리팩토링**
   ```javascript
   // Bad: 수동 검증만, 회귀 탐지 어려움
   // 리팩토링 후 테스트 추가 X
   ```

5. **에러를 사용자에게 그대로 노출**
   ```javascript
   // Bad: Firestore 내부 에러 그대로 반환
   catch (err) {
     return res.status(500).json({ error: err.message });
   }
   ```

### ✅ 권장 패턴
1. **Aggregation Query 또는 트리거 기반 카운트**
   ```javascript
   // Good: 읽기 1건으로 카운트
   const snapshot = await db.collection("race_results")
     .where("status", "==", "confirmed")
     .count().get();
   ```

2. **멱등성 보장**
   ```javascript
   // Good: 재실행해도 안전
   if (cs && OLD_VALUES.has(cs) && cs !== MAPPING[cs]) {
     targets.push(...);
   }
   ```

3. **명시적 파라미터 또는 인증 기반 추론**
   ```javascript
   // Good: 필수 파라미터
   if (!confirmSource) {
     return res.status(400).json({ error: "confirmSource required" });
   }
   ```

4. **테스트 우선 작성**
   ```javascript
   // Good: 리팩토링 전 테스트 작성
   it("should count from SSOT", () => { ... });
   // 구현 후 테스트 통과 확인
   ```

5. **사용자 친화적 에러 메시지**
   ```javascript
   // Good: 재시도 가능성 안내
   catch (err) {
     console.error("Firestore 쿼리 실패:", err);
     return res.status(500).json({
       error: "일시적인 오류입니다. 잠시 후 다시 시도해주세요.",
       code: "QUERY_FAILED",
     });
   }
   ```

---

## 참조 문서

- [상세 리뷰](code-review-2026-04-01-refactoring.md) - 이슈·해결책·교훈 전체
- [배포 전 체크리스트](../../.cursor/rules/pre-deploy-checklist.mdc) - 배포 절차
- [데이터 쓰기 안전](../../.cursor/rules/data-write-safety.mdc) - 마이그레이션 승인
- [롤아웃 가이드](rollout-guide.md) - 배포 후 모니터링 전략

---

## 사용법

**리팩토링 착수 전:**
1. 이 체크리스트를 복사해 작업 브랜치에 붙여넣기
2. 설계 단계 체크박스 먼저 완료
3. 구현·배포·모니터링 단계 순차 진행

**배포 후:**
1. 모니터링 결과를 일지에 기록
2. 이슈 발생 시 "자주 하는 실수" 섹션 업데이트
3. 다음 리팩토링 시 교훈 반영
