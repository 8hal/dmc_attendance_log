# race_results 생성 정책

**작성일**: 2026-04-20  
**상태**: Active

## 정책 정의

### `race_results`는 무엇인가?

**정의**: 대회 참가자의 모든 결과 (완주, DNS, DNF 포함)

### 생성 규칙

| 상태 | `race_results` 생성 | 저장 내용 |
|------|-------------------|----------|
| **Finished** (완주) | ✅ 생성 | `status: 'finished'`, `finishTime: required`, `overallRank: required` |
| **DNS** (Did Not Start) | ✅ 생성 | `status: 'dns'`, `finishTime: null`, `overallRank: null` |
| **DNF** (Did Not Finish) | ✅ 생성 | `status: 'dnf'`, `finishTime: null`, `overallRank: null` |

**2026-04-20 정책 변경**: 초기에는 DNS/DNF를 생성하지 않는 것으로 결정했으나, UI 표시 일관성을 위해 DNS/DNF도 `race_results`에 저장하는 것으로 변경

## 데이터 구조

### 완주자

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

### DNS/DNF

```javascript
// race_results 컬렉션 (2026-04-20 정책 변경: DNS/DNF도 저장)
{
  memberRealName: "서윤석",
  distance: "half",
  status: "dns",               // 또는 "dnf"
  finishTime: null,            // ❌ 시간 없음
  overallRank: null,           // ❌ 순위 없음
  confirmedBy: "operator",
  canonicalEventId: "evt_2026-04-19_24"
}
```

## 데이터 흐름

```
참가자 등록 (race_events.participants)
    ↓
대회 참가 및 결과
    ↓
    ├─ 완주 → race_results 생성 (status: finished, finishTime: required)
    ├─ DNS  → race_results 생성 (status: dns, finishTime: null)
    └─ DNF  → race_results 생성 (status: dnf, finishTime: null)
```

**모든 참가자가 `race_results`에 1:1 매핑됩니다.**

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

1. **데이터 일관성**: `participants` ↔ `race_results` 1:1 매핑
2. **UI 표시 통일**: DNS/DNF도 동일한 렌더링 로직으로 처리
3. **확정 여부 추적**: `confirmedBy`, `confirmedAt` 필드로 운영자 확정 추적
4. **통계 계산 단순**: 완주율 = finished / (finished + dns + dnf)

### 단점 및 대응

| 단점 | 영향 | 대응 방안 |
|------|------|----------|
| **저장 용량 증가** | DNS/DNF도 저장 | 미미함 (문서당 ~1KB) |
| **완주 기록만 조회 시 필터 필요** | 쿼리에 `.where('status', '==', 'finished')` 추가 | 성능 영향 미미 |
| **PB 계산 복잡도** | DNS/DNF 제외 필요 | `status === 'finished'` 필터로 해결 |

### 현재 대응

- **UI**: `race_results` 기준 렌더링, `status` 필드로 DNS/DNF/완주 구분
- **확정 여부**: `confirmedBy`, `confirmedAt` 필드로 추적
- **통계**: `race_results`에서 직접 계산 가능

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
| 2026-04-20 | 초안 작성 - DNS/DNF는 race_results 생성 안 함 정책 | AI Assistant |
| 2026-04-20 | **정책 변경** - DNS/DNF도 race_results에 저장 (UI 일관성) | AI Assistant |
