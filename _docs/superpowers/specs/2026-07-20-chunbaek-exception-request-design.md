# 춘백 S3 출석 예외 상신·승인 디자인

날짜: 2026-07-20  
상태: 초안 (브레인스토밍 합의 반영, 사용자 리뷰 대기)  
관련: `_docs/superpowers/specs/2026-07-12-chunbaek-season3-attendance-design.md` §예외  
선행 결정: 기존 슬롯 `exception` 재사용 · 출석일 스킵 · 롤링 7일 소급 · 조기 복귀 상신

---

## 1. 배경 · 목표

### 배경
부상·휴가·출장 등은 단톡 사전 알림 후 운영진이 어드민 그리드에서 **슬롯 단위 예외**를 넣고 있다. 주당 관련 케이스가 2명 이상으로 늘며 운영 입력이 병목이 된다.

### 목표
1. 회원이 **내 100일**에서 예외(또는 조기 복귀)를 **상신**한다.
2. 운영진이 **어드민**에서 승인/반려한다.
3. 승인 시 **기존** `chunbaek_attendance.exception` 규칙을 슬롯에 일괄 적용·해제한다.
4. 집계·출석 차단·타임라인 배지는 **변경하지 않는다.**

### 비목표
- “기간 중 출석 가능, 미출석만 면제” 신규 집계 모델
- 승인 없이 회원이 예외를 직접 켜기
- `isProgramOff`(프로그램 휴무) 변경
- 1차 범위에서 단톡/푸시 자동 알림 (어드민 대기 목록으로 충분)
- 예외 사유 enum 강제 (자유 텍스트 + 권장 예시)

---

## 2. 합의된 정책

| 항목 | 결정 |
|------|------|
| 모델 | 요청 문서 + 승인 시 슬롯 예외 일괄 적용 |
| 이미 출석한 날 | **출석 유지(스킵)** — 예외로 덮지 않음 |
| 소급 | **롤링 최근 7일(오늘 포함, KST)** ~ 미래 |
| 조기 회복 | 회원 **조기 복귀 상신** → 운영 승인 → **남은(오늘 이후) 예외 슬롯 해제** |
| 승인 전 | 슬롯 변경 없음. pending 취소 가능 |
| 승인 후 과거 예외 | 조기 복귀로 **지우지 않음** (이미 적용된 과거 면제 유지) |

### 예외 의미 (현행 유지)
승인으로 슬롯에 `exception: true`, `attended: false`, `exceptionNote` 설정 시:
- 시즌·주간 집계에서 **분모·분자 제외**
- 회원은 해당 슬롯 **출석 불가**(기존 403)
- 타임라인 상태 **「예외」**

---

## 3. 요청 종류 · 상태

### 종류 (`type`)
| type | 설명 |
|------|------|
| `exception` | 기간 내 훈련일에 예외 적용 요청 |
| `early_return` | 이미 승인·적용된 예외 중 **오늘 이후** 슬롯 해제 요청 |

### 상태 (`status`)
`pending` → `approved` | `rejected` | `cancelled`(회원, pending만)

---

## 4. 데이터

### 4.1 컬렉션 `chunbaek_exception_requests/{requestId}`

```
{
  seasonId: "chunbaek-s3",
  type: "exception" | "early_return",
  memberId: string,
  nickname: string,          // 표시용 denorm
  reason: string,            // 1~200자
  startDate: "YYYY-MM-DD",   // exception: 필수 / early_return: 조기 복귀 기준일(보통 오늘)
  endDate: "YYYY-MM-DD",     // exception: 필수 / early_return: 해제할 구간의 끝(또는 원 요청 endDate)
  status: "pending" | "approved" | "rejected" | "cancelled",
  createdAt, updatedAt,
  reviewedBy: string | null, // admin memberId or "admin"
  reviewedAt: Timestamp | null,
  reviewNote: string,        // 반려·승인 메모, 0~200
  relatedRequestId: string | null, // early_return이 가리키는 원 exception 요청(선택)
  appliedSlotIds: number[],  // 승인 시 실제 반영된 dayIndex 목록
  skippedSlotIds: number[],  // 출석 유지로 스킵된 날
}
```

### 4.2 슬롯 문서 (기존)
`chunbaek_attendance` — 승인 적용 시 `admin-set-attendance`와 동일 필드:
`exception`, `exceptionNote`, `attended`, `updatedBy`

`exceptionNote` 권장 형식: `[상신] {reason}` 또는 조기복귀 시 비움/「조기복귀 승인」.

---

## 5. 서버 규칙

### 5.1 예외 상신 (`exception`) 검증
- 로그인 회원 = 본인만
- `reason` 필수(1~200)
- `startDate <= endDate`
- `startDate >= todayKst - 6일` (롤링 7일 창의 시작)
- `endDate` 상한: 시즌 `endDate`(또는 마지막 슬롯일). **최대 기간 14일(하드)** — `(endDate - startDate) > 14` 이면 400 + 안내.
- 동일 회원 `pending` 예외 요청 **1건**만 (추가 시 400)
- 구간과 겹치는 다른 pending 없음

### 5.2 승인 (`exception` → approved)
대상 슬롯: `[startDate, endDate]` ∩ 훈련일(`!isProgramOff`) ∩ 해당 회원.

각 슬롯:
1. 이미 `attended: true` → **스킵** (`skippedSlotIds`)
2. 이미 `exception: true` → no-op (applied에 포함 가능)
3. 그 외 → `exception: true`, `attended: false`, `exceptionNote` from reason, `updatedBy: "admin"`

트랜잭션/배치로 기록 후 요청에 `appliedSlotIds` / `skippedSlotIds` 저장.

### 5.3 조기 복귀 상신 (`early_return`)
- 전제: 해당 회원에 **오늘 이후** `exception: true` 슬롯이 1개 이상
- `startDate`: 해제 시작일(기본 오늘, 오늘 이상)
- `endDate`: 해제할 마지막 날(기본 = 남은 예외 슬롯 중 최대일) 또는 명시
- pending early_return 1건 제한

### 5.4 조기 복귀 승인

해제 대상 슬롯 (모두 만족):

- 해당 회원 `exception: true`
- `!isProgramOff`
- `date >= max(todayKst, request.startDate)`
- `date <= request.endDate`

각 대상: `exception: false`, `exceptionNote` 비움(또는 「조기복귀 승인」), `updatedBy: "admin"`.  
**과거(`date < todayKst`) 예외 슬롯은 절대 해제하지 않음.**

이미 `approved`/`rejected`인 요청을 다시 리뷰하면 **400**.

슬롯 write는 `admin-set-attendance`의 merge 전체 복붙보다, **예외 필드만 갱신하는 내부 헬퍼**를 두는 것을 권장(기존 note/photo 보존).

### 5.5 반려 · 취소
- 반려: 슬롯 변경 없음, `reviewNote` 권장
- 회원 취소: `pending`만
- 재리뷰(이미 확정된 요청): **400**

### 5.6 API (신규 — justification 별도 작성·승인 후 구현)

| action | 누가 | 역할 |
|--------|------|------|
| `request-exception` | 회원 | 예외 상신 |
| `request-early-return` | 회원 | 조기 복귀 상신 |
| `cancel-exception-request` | 회원 | pending 취소 |
| `my-exception-requests` | 회원 | 내 요청 목록 |
| `admin-list-exception-requests` | 운영 | 대기/최근 목록 |
| `admin-review-exception-request` | 운영 | approve / reject |

구현 시 슬롯 write는 가능하면 기존 `admin-set-attendance` 내부 함수를 재사용한다.

> 신규 API는 `new-api-validation` 규칙에 따라 justification + 사용자 승인 후 코딩.

---

## 6. UI

### 6.1 회원 — 내 100일 (`#view-timeline`)

**진입**
- 섹션 상단(주간 탭 근처)에 보조 액션:
  - 버튼: **「예외 요청」**
  - 오늘 이후 예외 슬롯이 있으면 **「조기 복귀 요청」** 도 노출

**가이드 문구 (한 줄)**  
「부상·휴가 등은 여기서 기간을 상신하면 운영진 승인 후 예외 처리됩니다. 승인된 날은 출석할 수 없습니다.»

**예외 요청 시트 (모달)**  
기존 `timeline-modal` 패턴 재사용.

| 필드 | UI |
|------|-----|
| 사유 | textarea, placeholder 예: `발목 부상으로 병원 진료` |
| 시작일 | date, 기본 오늘, min = today-6 |
| 만료일 | date, min = 시작일, max = 시작+14일(하드) |
| 미리보기 | 「적용 예정 훈련일 N일 · 이미 출석한 날은 유지됩니다」 |

CTA: **상신하기** / 취소  

**내 요청 상태**  
타임라인 상단 또는 시트 하단 리스트:
- pending: 「승인 대기 · 7/20~7/25」
- approved: 「승인됨 · 적용 N일 · 출석 유지 M일」
- rejected: 「반려 · {reviewNote}」+ 재상신

**슬롯 상세**  
기존처럼 예외 슬롯은 출석 불가 + 「예외 처리된 날…」힌트.  
변경 없음.

**가이드 탭**  
`chunbaek/index.html` 가이드 문구를  
「단톡방」→「내 100일에서 예외 요청」으로 갱신(배포 시).

### 6.2 운영 — 어드민

**내비**  
`출석 그리드` 옆에 패널: **「예외 요청」** (뱃지 = pending 수).

**목록**  
- 필터: 대기 / 최근 승인·반려  
- 행: 닉네임 · type(예외/조기복귀) · 기간 · 사유 요약 · 상신 시각 · [상세]

**상세 시트**  
- 사유 전문, 기간, 회원 링크(그리드로 점프 가능하면 좋음)
- 미리보기: 승인 시 건드릴 슬롯 목록  
  - `적용 예정` / `출석 유지(스킵)` / `이미 예외` 구분
- 조기 복귀: `해제 예정` 슬롯 목록
- 승인 메모(선택) / 반려 사유(반려 시 권장)
- CTA: **승인** / **반려**

**그리드**  
기존 셀 예외/출석/미출석 유지 — 승인 후에도 미세 조정 SSOT.

### 6.3 UI 톤 (기존 셸과 맞춤)
- 회원: `timeline-modal-*`, `btn`, `field-label` 재사용. 카드 남발 금지.
- 어드민: 기존 admin 패널·모달 버튼(`modal-btn-exception` 등)과 동일 계열.
- pending 강조는 배지/점 하나로 충분 (과도한 컬러·글로우 지양).

---

## 7. 성공 기준

1. 회원이 7일 창·최대 기간 규칙 안에서 예외 상신 가능, pending이 어드민에 보임.
2. 승인 후 미출석 훈련일만 `exception`, 출석일은 그대로.
3. 조기 복귀 승인 후 오늘 이후 예외만 해제, 과거 예외 유지.
4. 시즌률·주간 목표가 기존 exception 규칙과 동일하게 움직임.
5. 회원은 예외 슬롯에 출석 저장 불가(현행).

---

## 8. 롤아웃 · 리스크

| 리스크 | 완화 |
|--------|------|
| 주 3회 회피 상신 | 승인 필수 + 7일 소급 + 14일 상한 + pending 1건 |
| 운영이 목록을 안 봄 | 어드민 뱃지; (후속) 단톡 알림 |
| 부분 적용 혼란 | 승인 결과에 applied/skipped 수 표시 |
| API 남용 | 본인만 상신, admin 토큰으로만 리뷰 |

**배포:** Hosting(춘백 앱·어드민) + Functions(`chunbaek`).

---

## 9. 구현 순서 (요약)

1. Justification(신규 API) + 사용자 승인  
2. 요청 CRUD + 승인 시 슬롯 apply/clear (TDD)  
3. 회원 내 100일 UI  
4. 어드민 예외 요청 패널  
5. 가이드 문구·에뮬 시드·검증  

상세 태스크는 스펙 승인 후 `writing-plans`로 작성.

---

## 10. 미결 (구현 전 확정하면 좋은 것)

- [x] 최대 기간 14일 → **하드 400** (초안 확정)
- [ ] `early_return`이 원 `exception` 요청과 반드시 연결될지 → **초안은 슬롯 기준으로 충분, relatedRequestId 선택**
- [ ] 베타(0주차) 슬롯도 예외 상신 대상인지 → **초안은 본시즌·베타 모두 훈련일면 허용**
