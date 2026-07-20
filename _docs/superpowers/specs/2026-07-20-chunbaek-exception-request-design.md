# 춘백 S3 출석 예외 상신·승인 디자인

날짜: 2026-07-20  
상태: 초안 개정 (사용자 리뷰 반영)  
관련: `_docs/superpowers/specs/2026-07-12-chunbaek-season3-attendance-design.md` §예외  
선행 결정: 기존 슬롯 `exception` 재사용 · 출석일 스킵 · 롤링 7일 소급 · **조기 복귀는 회원 즉시 해제** · **상신 UI는「나」탭**

---

## 1. 배경 · 목표

### 배경
부상·휴가·출장 등은 단톡 사전 알림 후 운영진이 어드민 그리드에서 **슬롯 단위 예외**를 넣고 있다. 주당 관련 케이스가 2명 이상으로 늘며 운영 입력이 병목이 된다.

### 목표
1. 회원이 **「나」탭**에서 예외를 **상신**한다.
2. 운영진이 **어드민**에서 예외 상신을 **승인/반려**한다.
3. 승인 시 **기존** `chunbaek_attendance.exception` 규칙을 슬롯에 일괄 적용한다.
4. 회복이 빠르면 회원이 **운영 승인 없이** 남은(오늘 이후) 예외 슬롯을 **스스로 해제(조기 복귀)** 한다.
5. 집계·출석 차단·타임라인 배지 의미는 **변경하지 않는다.**

### 비목표
- “기간 중 출석 가능, 미출석만 면제” 신규 집계 모델
- 승인 없이 회원이 예외를 **켜기**(상신은 가능, 적용은 승인 후)
- `isProgramOff`(프로그램 휴무) 변경
- 1차 범위에서 단톡/푸시 자동 알림 (어드민 대기 목록으로 충분)
- 예외 사유 enum 강제 (자유 텍스트 + 권장 예시)
- 조기 복귀에 대한 운영 승인 큐

---

## 2. 합의된 정책

| 항목 | 결정 |
|------|------|
| 모델 | 요청 문서 + 승인 시 슬롯 예외 일괄 적용 |
| 이미 출석한 날 | **출석 유지(스킵)** — 예외로 덮지 않음 |
| 소급 | **롤링 최근 7일(오늘 포함, KST)** ~ 미래 |
| 조기 회복 | 회원 **즉시 해제** (운영 승인 없음). **오늘 이후** 예외 슬롯만 해제, 과거 예외 유지 |
| 승인 전 | 슬롯 변경 없음. pending 취소 가능 |
| 회원 UI 진입점 | **「나」탭** (`#view-me`) — 프로필·설정성 액션과 함께 |

### 예외 의미 (현행 유지)
승인으로 슬롯에 `exception: true`, `attended: false`, `exceptionNote` 설정 시:
- 시즌·주간 집계에서 **분모·분자 제외**
- 회원은 해당 슬롯 **출석 불가**(기존 403)
- 타임라인 상태 **「예외」**

조기 복귀로 해제한 날은 다시 일반 훈련일(미출석/출석 가능)이 된다.

---

## 3. 요청 종류 · 상태

### 종류
| type | 설명 |
|------|------|
| `exception` | 기간 내 훈련일에 예외 **적용** 요청 (운영 승인 필요) |

조기 복귀는 **요청 문서가 아니라 즉시 API**로 처리한다. (감사 로그는 아래 5.3)

### 상태 (`exception` 요청만)
`pending` → `approved` | `rejected` | `cancelled`(회원, pending만)

---

## 4. 데이터

### 4.1 컬렉션 `chunbaek_exception_requests/{requestId}`

예외 **상신·승인** 전용.

```
{
  seasonId: "chunbaek-s3",
  type: "exception",
  memberId: string,
  nickname: string,
  reason: string,            // 1~200자
  startDate: "YYYY-MM-DD",
  endDate: "YYYY-MM-DD",
  status: "pending" | "approved" | "rejected" | "cancelled",
  createdAt, updatedAt,
  reviewedBy: string | null,
  reviewedAt: Timestamp | null,
  reviewNote: string,
  appliedSlotIds: number[],
  skippedSlotIds: number[],
}
```

### 4.2 슬롯 문서 (기존)
승인·조기복귀 모두 `chunbaek_attendance`의 `exception` / `exceptionNote` / `attended` / `updatedBy` 사용.

### 4.3 조기 복귀 감사 (선택·권장)
별도 요청 큐 없이, 해제 시 `updatedBy: memberId` + `exceptionNote`를 비우거나 `"조기복귀"`로 짧게 남긴다.  
필요하면 `chunbaek_exception_events`에 `{ type: "early_return", memberId, clearedSlotIds, at }` 한 줄 로그(1차 YAGNI면 슬롯 필드만).

---

## 5. 서버 규칙

### 5.1 예외 상신 (`exception`) 검증
- 로그인 회원 = 본인만
- `reason` 필수(1~200)
- `startDate <= endDate`
- `startDate >= todayKst - 6일` (롤링 7일)
- **최대 기간 14일(하드)** — `(endDate - startDate) > 14` → 400
- `endDate` ≤ 시즌 종료(또는 마지막 슬롯일)
- 동일 회원 `pending` 예외 요청 **1건**만
- 구간과 겹치는 다른 pending 없음

### 5.2 승인 (`exception` → approved)
대상: `[startDate, endDate]` ∩ 훈련일(`!isProgramOff`).

각 슬롯:
1. 이미 `attended: true` → **스킵** (`skippedSlotIds`)
2. 이미 `exception: true` → no-op
3. 그 외 → `exception: true`, `attended: false`, `exceptionNote: [상신] {reason}`, `updatedBy: "admin"`

이미 확정된 요청 재리뷰 → **400**.

슬롯 write는 **예외 필드만** 갱신하는 내부 헬퍼 권장(`note`/`photo` 보존).

### 5.3 조기 복귀 (회원 즉시, 승인 없음)

`self-clear-future-exceptions` (가칭):

전제: 본인에게 `exception: true` 이고 `date >= todayKst` 인 슬롯 ≥ 1.

해제 대상 (모두 만족):
- 해당 회원 `exception: true`
- `!isProgramOff`
- `date >= todayKst`

각 대상: `exception: false`, `exceptionNote` 비움(또는 `"조기복귀"`), `updatedBy: memberId`.  
**`date < todayKst` 예외는 절대 해제하지 않음.**

확인 UI: 「오늘 이후 예외 N일을 해제하고 다시 출석할까요?」→ 확인 후 즉시 적용.  
사유·기간 입력 불필요(이미 예외로 묶인 남은 날 전체 해제). 부분 해제가 필요하면 운영 그리드.

### 5.4 반려 · 취소
- 반려: 슬롯 변경 없음, `reviewNote` 권장
- 회원 취소: `pending`만

### 5.5 API (신규 — justification 별도 작성·승인 후 구현)

| action | 누가 | 역할 |
|--------|------|------|
| `request-exception` | 회원 | 예외 상신 |
| `cancel-exception-request` | 회원 | pending 취소 |
| `my-exception-requests` | 회원 | 내 상신 목록 |
| `self-clear-future-exceptions` | 회원 | 조기 복귀(즉시 해제) |
| `admin-list-exception-requests` | 운영 | 대기/최근 (type=exception만) |
| `admin-review-exception-request` | 운영 | approve / reject |

> 신규 API는 `new-api-validation` 규칙에 따라 justification + 사용자 승인 후 코딩.

---

## 6. UI

### 6.1 회원 — **「나」탭** (`#view-me`) — 권장 진입점

**왜「나」인가**
- 「내 100일」은 주간 캘린더·슬롯 출석에 집중. 예외 상신은 **프로필/설정성 행정 요청**.
- 「나」에 이미 `프로필 수정`이 있어, 같은 탭에 **출석 예외** 블록을 두면 IA가 단순하다.
- 「내 100일」은 승인 후 슬롯이 「예외」로 보이는 것으로 충분(상태 확인).

**레이아웃 (프로필 DL 아래)**
```
[프로필 수정]

출석 예외
부상·휴가 등은 기간을 상신하면 운영 승인 후 예외 처리됩니다.
승인된 날은 출석할 수 없습니다. 회복되면 조기 복귀로 남은 예외를 해제하세요.

[ 예외 요청 ]
[ 조기 복귀 ]   ← 오늘 이후 예외 슬롯이 있을 때만

내 요청
· 승인 대기 · 7/20~7/25
· 승인됨 · 적용 4일 · 출석 유지 1일
```

**예외 요청 시트**  
`timeline-modal`과 같은 바텀/카드 모달 패턴.

| 필드 | UI |
|------|-----|
| 사유 | textarea |
| 시작일 | date, 기본 오늘, min = today-6 |
| 만료일 | date, min = 시작일, max = 시작+14 |
| 미리보기 | 적용 예정 훈련일 N · 출석일은 유지 |

**조기 복귀**  
확인 다이얼로그만. 「오늘부터 남은 예외 N일 해제」→ 성공 토스트 → 「나」·타임라인 갱신.

**가이드 탭**  
「단톡방」→「나 탭에서 예외 요청」으로 문구 변경.

### 6.1-b 「내 100일」과의 관계
- 슬롯 상세·배지: 현행 유지 (예외 시 출석 불가 안내).
- 타임라인 상단에 예외 CTA를 **중복 배치하지 않음**(1차). 필요 시 「나에서 요청」링크 한 줄만.

### 6.2 운영 — 어드민

**패널「예외 요청」** (pending 뱃지)  
- 목록: 예외 상신만 (조기 복귀는 큐에 안 탐)
- 상세: 사유·기간·적용/스킵 미리보기 → 승인 / 반려
- 그리드: 기존처럼 수동 예외·해제 가능 (조기 복귀 후에도 SSOT)

### 6.3 UI 톤
- 회원: 기존 `btn` / `profile-dl` / 모달 패턴. 「나」에 카드 남발 없이 섹션 제목 + 버튼 + 짧은 리스트.
- 어드민: 기존 패널·모달과 동일 계열.

---

## 7. 성공 기준

1. 「나」에서 7일·14일 규칙으로 예외 상신 → 어드민 pending.
2. 승인 후 미출석 훈련일만 `exception`, 출석일 유지.
3. 회원이 조기 복귀 시 **즉시** 오늘 이후 예외만 해제, 과거 예외 유지. 운영 큐 불필요.
4. 집계·출석 차단은 기존 exception 규칙과 동일.
5. 「내 100일」은 예외 상태를 보여 주고, 상신 UI의 주 진입은 「나」.

---

## 8. 롤아웃 · 리스크

| 리스크 | 완화 |
|--------|------|
| 주 3회 회피 상신 | 예외 **적용**은 승인 필수 + 7일·14일·pending 1건 |
| 조기 복귀 오탭 | 확인 다이얼로그 + 과거 예외 불가 해제 |
| 운영이 목록 미확인 | 어드민 뱃지 |
| 「나」발견성 | 가이드 문구 + 홈/가이드에서「나」안내 |

**배포:** Hosting(춘백) + Functions(`chunbaek`).

---

## 9. 구현 순서 (요약)

1. Justification(신규 API) + 사용자 승인  
2. 상신·승인·self-clear (TDD)  
3. 「나」탭 UI + 조기 복귀 확인  
4. 어드민 예외 요청 패널  
5. 가이드 문구·검증  

---

## 10. 미결

- [x] 최대 기간 14일 하드  
- [x] 조기 복귀 = 회원 즉시 해제 (운영 승인 없음)  
- [x] 상신 UI 주 진입 = 「나」탭  
- [ ] 베타(0주차)도 예외 상신 허용 → **초안: 허용**  
- [ ] 조기 복귀 감사 이벤트 컬렉션 → **초안: 슬롯 필드만, 이벤트는 후속**
