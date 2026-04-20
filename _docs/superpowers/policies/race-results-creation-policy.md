# race_results 생성 정책

**작성일**: 2026-04-20  
**상태**: Active

## 정책 정의

### `race_results`는 무엇인가?

**정의**: 대회에서 실제로 완주한 사람의 기록

### 생성 규칙

| 상태 | `race_results` 생성 | 이유 |
|------|-------------------|------|
| **Finished** (완주) | ✅ 생성 | 기록(시간, 순위)이 존재 |
| **DNS** (Did Not Start) | ❌ 생성 안 함 | 출전하지 않음 = 기록 없음 |
| **DNF** (Did Not Finish) | ❌ 생성 안 함 | 완주하지 못함 = 기록 없음 |

## 데이터 구조

### 완주자 (race_results 생성)

```javascript
// race_results 컬렉션
{
  memberRealName: "조상현",
  distance: "half",
  status: "finished",
  finishTime: "04:10:26",      // ✅ 시간 있음
  overallRank: 474,             // ✅ 순위 있음
  confirmedBy: "operator",
  canonicalEventId: "evt_2026-04-19_24"
}
```

### DNS/DNF (race_results 생성 안 함)

```javascript
// race_events.participants에만 존재
{
  realName: "김재헌",
  nickname: "잴킴",
  distance: "half",
  status: "dns",               // DNS 표시
  memberId: "..."
}

// race_results에는 레코드 없음
```

## 데이터 흐름

```
참가자 등록 (race_events.participants)
    ↓
대회 참가 및 결과
    ↓
    ├─ 완주 → race_results 생성 (status: finished, finishTime: required)
    ├─ DNS  → race_results 생성 안 함 (participants에만 존재)
    └─ DNF  → race_results 생성 안 함 (participants에만 존재)
```

## UI 표시

### group-detail.html

```javascript
// participants 기준으로 렌더링
function renderParticipant(p) {
  // 1. race_results에서 매칭 확인
  const confirmedResult = confirmedByName[`${p.realName}_${p.distance}`];
  
  if (confirmedResult) {
    // 완주 기록 표시
    return `
      <div class="participant confirmed">
        ✅ ${p.nickname} ${p.realName}
        ${confirmedResult.finishTime} (${confirmedResult.overallRank}위)
        ${p.distance}
      </div>
    `;
  } else {
    // DNS/DNF 또는 미확정
    return `
      <div class="participant">
        ⚠️ ${p.nickname} ${p.realName}
        미확정 또는 DNS/DNF
        ${p.distance}
      </div>
    `;
  }
}
```

## 영향 분석

### 장점

1. **의미적 명확성**: `race_results` = "완주 기록"
2. **쿼리 성능**: 완주자만 조회 (불필요한 DNS/DNF 필터링 불필요)
3. **PB 계산 단순**: 모든 `race_results`가 PB 대상
4. **저장 용량**: DNS/DNF 미저장으로 용량 절약

### 단점 및 대응

| 단점 | 영향 | 대응 방안 |
|------|------|----------|
| **Silver-Gold 불일치** | participants 85명 ≠ race_results 82건 | `participants` 기준으로 UI 렌더링 |
| **DNS/DNF 확정 추적 불가** | 운영자가 DNS 확정해도 기록 없음 | 필요 시 `participants`에 `confirmedAt` 추가 고려 |
| **통계 계산 복잡** | 완주율 = ? | `participants` 조회 필요 |

### 현재 대응

- **UI**: `participants` 기준 렌더링, `race_results`는 매칭용으로만 사용
- **확정 여부**: `participants.status` 필드로 DNS/DNF 구분
- **통계**: `participants` 배열에서 직접 계산

## 예외 상황

### 1. 실제 완주했는데 DNS/DNF로 잘못 표시

**문제**: 서윤석, 조상현이 PDF에서는 완주 기록이 있는데 `race_results`에 없었음

**원인**: Firestore 수동 수정 시 `participants`만 추가하고 `race_results` 미생성

**해결**: 
- PDF 확인 후 `finishTime`이 있으면 `race_results` 생성
- 스크립트: `scripts/hotfix-create-missing-results.js`

### 2. 운영자가 DNS/DNF로 확정하고 싶은 경우

**현재 방식**:
- `participants.status` 필드만 업데이트
- `race_results`는 생성하지 않음

**UI에서**:
- 케밥 메뉴 → "DNS 처리" → `confirm-one` API 호출
- API는 `race_results` 삭제 (있다면) + `participants.status` 업데이트

## 정책 재검토 조건

다음 문제가 발생하면 정책 재검토:

1. **DNS/DNF 확정 추적 필요성 증가**: 운영자가 "누가 DNS 확정됐는지" 자주 물어볼 때
2. **통계 계산 복잡도 증가**: 완주율, 참가율 등 통계 요구사항이 많아질 때
3. **Silver-Gold 불일치 혼란**: 개발자가 자주 헷갈릴 때

→ 이 경우 **Medallion Architecture 설계 문서**(2026-04-20-medallion-architecture.md)의 **Collection 분리 방안** 재검토

## 관련 문서

- [Medallion Architecture 설계](./2026-04-20-medallion-architecture.md)
- [그룹 대회 재확정 스팩](./2026-04-20-group-reconfirm-spec.md)
- [Firestore 스키마](../../../.cursor/rules/dmc-firestore-schema.mdc)

## 변경 이력

| 날짜 | 변경 내용 | 작성자 |
|------|----------|--------|
| 2026-04-20 | 초안 작성 - DNS/DNF는 race_results 생성 안 함 정책 확정 | AI Assistant |
