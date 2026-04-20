# 2026-04-20 결정 사항 요약

**작성일**: 2026-04-20  
**문서 타입**: 공식 결정 사항 (Official Decisions)

---

## 1. race_results 생성 정책 확정

### 결정 내용

**`race_results`는 대회 참가자의 모든 결과를 저장한다** (완주, DNS, DNF 포함)

| 상태 | race_results 생성 | 저장 내용 |
|------|-------------------|----------|
| **Finished** | ✅ 생성 | `status: 'finished'`, `finishTime: required`, `overallRank: required` |
| **DNS** | ✅ 생성 | `status: 'dns'`, `finishTime: null`, `overallRank: null` |
| **DNF** | ✅ 생성 | `status: 'dnf'`, `finishTime: null`, `overallRank: null` |

### 근거

1. **데이터 일관성**: `participants` ↔ `race_results` 1:1 매핑
2. **확정 여부 추적**: `confirmedBy`, `confirmedAt` 필드로 운영자 확정 기록
3. **UI 표시 일관성**: 모든 참가자를 동일한 렌더링 로직으로 처리
4. **통계 계산 단순화**: 완주율 = finished / (finished + dns + dnf)

### 변경 이력

- 초기 가정: "DNS/DNF는 race_results 생성 안 함" (잘못된 가정)
- 실제 확인: `bulk-confirm` API가 이미 DNS/DNF도 생성 중
- **최종 결정**: DNS/DNF도 race_results에 저장 (2026-04-20)

### 관련 문서

- `_docs/superpowers/policies/race-results-creation-policy.md`

---

## 2. 그룹 대회 재확정 핵심 원칙

### 결정 내용

**SSOT (Single Source of Truth) 원칙**:
- `race_results`는 1명당 1개 기록만 존재
- 재확정 시 무조건 덮어쓰기 (Last Write Wins)
- 운영자가 최종 권한

**역할 분리**:
- 그룹 대회: 운영진이 관리 (`confirmSource: "operator"`)
- 개인 대회: 개인이 입력 (`confirmSource: "personal"`)

**데이터 보호**:
- 재확정 시 `confirmSource: "operator"`만 삭제
- `confirmSource: "personal"` 기록은 보존

### 근거

1. **단순성**: 복잡한 Merge 로직보다 관리 용이
2. **명확성**: 그룹 대회는 운영진, 개인 대회는 개인
3. **안전성**: 개인 확정 기록 보호

### 관련 문서

- `_docs/superpowers/specs/2026-04-20-group-reconfirm-spec.md`

---

## 3. Medallion Architecture 설계 원칙

### 결정 내용

**3계층 데이터 아키텍처 도입**:

| Layer | 역할 | 신뢰도 | 가변성 | 현재 대응 |
|-------|------|--------|--------|-----------|
| **Bronze** | Raw 원본 | 낮음 | 읽기 전용 | `scrape_jobs` |
| **Silver** | Staging | 중간 | 확정 전까지 수정 가능 | `race_events.participants` |
| **Gold** | SSOT | 높음 | 확정 후 수정 가능 | `race_results` |

**핵심 규칙**:
1. **단방향 흐름**: Bronze → Silver → Gold (역방향 쓰기 금지)
2. **Gold 우선**: Gold 존재 시 Silver/Bronze 무시
3. **Silver 동기화**: Gold 생성/수정 시 Silver 자동 참조 업데이트
4. **Bronze 불변**: scrape_jobs는 생성 후 수정 불가

### 근거

- 김형진/서윤석/조상현 이슈를 통해 데이터 파편화 문제 발견
- 동일 정보가 3곳에 중복 저장되어 수동 수정 시 동기화 불가
- 신뢰도 계층화로 데이터 품질 보증

### 구현 계획

| Phase | 작업 | 우선순위 |
|-------|------|----------|
| Phase 1 | Gold 메타데이터 추가 (`dataLineage`, `trustLevel`) | P0 |
| Phase 2 | Silver 참조 추가 (`confirmedResult`) | P0 |
| Phase 3 | UI Gold 우선 표시 + 신뢰도 뱃지 | P1 |
| Phase 4 | 중복 생성 방지 | P2 |
| Phase 5 | Bronze Archival | P3 |

### 관련 문서

- `_docs/superpowers/specs/2026-04-20-medallion-architecture.md`

---

## 4. 그룹 대회 확정 페이지 UX 개선 (Phase 1)

### 결정 내용

**Smart Review Mode 구현**:
1. ✅ 확정 후 기록 데이터 표시 (시간, 순위, DNS/DNF 배지)
2. ✅ 케밥 메뉴(⋮) + Bottom Sheet 모달
3. ✅ DNS/DNF 처리 (confirm-one API)
4. ✅ 코스 변경 (Full/Half/10K 등)
5. ✅ PB 확정 토글
6. ✅ 일괄 저장 버튼 자동 숨김

### 기대 효과

- 작업 시간 6배 단축 (3분 → 30초)
- 노이즈 85% 감소 ("이미 확정" 85번 반복 제거)
- 정보 가시성 100% 증가

### 구현 시간

- 총 9.5시간 (8개 태스크)
- 배포 완료: 2026-04-20

### 관련 커밋

- `819fb22`~`abcba97`: Phase 1 구현
- `d097e4e`, `9fef42f`: 버그 수정

---

## 5. 데이터 정규화 규칙

### 결정 내용

**`normalizeRaceDistance()` 함수 일관 적용**:
- 모든 distance 값은 정규화 함수를 거쳐야 함
- 매칭 키 생성 시 필수 적용

**문제 사례**:
- `race_results`: `distance: "10K"` (대문자)
- `participants`: `distance: "10k"` (소문자)
- 매칭 키 불일치로 28건 매칭 실패

**해결**:
```javascript
const normDist = normalizeRaceDistance(d.distance);  // "10k" → "10K"
const key = `${d.memberRealName}_${normDist}`;
```

### 근거

- 대소문자, 공백 등으로 인한 매칭 실패 방지
- 데이터 일관성 보장

---

## 6. 개발 프로세스 교훈

### 결정 내용

**정책 수립 전 실제 구현 확인 필수**:
- 코드 확인 없이 정책을 세우면 불일치 발생
- "DNS/DNF 생성 안 함" 정책 → 실제로는 이미 생성 중

**서브에이전트 활용**:
- 복잡한 디버깅은 병렬 분석 도구 활용
- 근본 원인 파악 시간 단축

**사용자 요구사항 명확화**:
- "DNS 처리"가 "DNS로 변경"인지 "DNS 생성"인지 명확히
- 오해로 인한 재작업 방지

---

## 7. 배포 이력

### v0.15.0 - 그룹 대회 확정 페이지 개선
- 날짜: 2026-04-20
- 내용: Phase 1 UI 개선 (Smart Review Mode)
- 작업 시간: 9.5시간

### Hotfix - 데이터 이슈 해결
- 날짜: 2026-04-20
- 내용: 
  - 김형진 distance 수정
  - 서윤석 DNS, 조상현 DNF 처리
  - distance 정규화 버그 수정

---

## 다음 단계

1. **Medallion Architecture Phase 1-3 구현**: 데이터 계보 추가
2. **Phase 2 재검토 모드**: 벌크 수정 UI (필요 시)
3. **정책 문서 유지보수**: 모든 결정 사항 최신 상태 유지

---

## 승인

- 작성자: AI Assistant
- 검토자: Taylor (Product Owner)
- 승인 일자: 2026-04-20

**상태**: ✅ 승인됨 (Approved)
