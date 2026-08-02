# 단체 대회 당일 UX — 버스 탑승 · 배번 · 결과 보드

날짜: 2026-08-02  
상태: **초안** (브레인스토밍 합의 반영)  
관련:
- `_docs/superpowers/specs/2026-04-18-self-service-bib-input-design.md` (배번 셀프입력)
- `_docs/superpowers/specs/2026-04-06-group-event-pipeline-prd.md` (단체 대회 파이프라인)
- `_docs/superpowers/specs/2026-04-15-group-detail-page-v2.md` (group-detail)
- 카페 공지·네이버 폼: 2026 철원 DMZ 마라톤 버스 탑승 및 중식 설문 (참고 사례)

---

## 1. 배경 및 문제

멀리 가는 단체 대회는 버스를 대절한다. 운영 총무는 사전 설문으로 탑승·중식을 받은 뒤, 새벽 집합 장소에서 종이/수기 명부로 탑승 여부를 확인한다.

문제:
- 새벽 4–5시 현장에서 총무 혼자 명단을 대조하기 어렵다.
- 정회원 지인(게스트)이 타는 경우가 있어, 기존 단체 `participants`(정회원만)로는 탑승 명단을 표현할 수 없다.
- 탑승 후에는 배번 입력 → 결과 취합 → 복귀 버스에서 동행 기록을 보고 싶은 니즈가 이어지지만, 지금은 기능이 흩어져 있거나 없다(스트라바 의존).

목표 UX: **한 단체 대회의 ‘하루’를 관장**한다.  
버스가 없는 가까운 대회(예: 수원)는 버스 단계만 끈다.

---

## 2. 제품 비전 — 당일 타임라인

중심 엔티티: `race_events` (`isGroupEvent: true`).

| 단계 | 누가 | 무엇을 |
|------|------|--------|
| 사전 | 총무 | 설문 CSV를 가져와 버스 탑승 명단 준비, 참가자용 링크/QR 준비 |
| 새벽 출발 | 참가자 | QR/링크로 본인(닉네임) 선택 → **가는 버스 탑승 완료** |
| 새벽 출발 | 총무 | 미탑승 강조, 대리 체크/취소, 지인·누락 추가/제외, 비고 편집 |
| 이동 중 | 참가자 | 같은 대회 맥락에서 **배번 입력** (`my-bib` 연결) |
| 경기 후 | 시스템/운영 | 배번·명단 기반 **결과 취합** (기존 스크랩·확정·gap) |
| 복귀 | 참가자 | **결과 보드**로 동행 기록 확인 (스트라바 대체) |
| 복귀 | 참가자/총무 | **오는 버스 탑승** 체크 |

원칙:
1. 데이터는 단체 대회에 연결한다 (통합 관리).
2. 버스·결과 보드는 대회별 on/off.
3. 정회원 `participants`(배번·확정)와 버스 로스터(지인 포함)는 역할을 분리하고, `memberId`/닉네임으로 느슨히 연결한다.
4. 스펙은 전체 비전을 담고, **구현은 Phase로 나눈다**.

---

## 3. 범위

### 3.1 In scope (비전 스펙)

- 버스 탑승 명단(CSV import), 가는/오는 구간별 체크
- 참가자 셀프 체크 + 총무 현황·조치
- 지인 로스터 추가/제외, 비고(`note`) — 총무만 열람·수정
- 탑승 → 배번(`my-bib`) 연결
- 공개 결과 보드 (취합된 기록 읽기)
- `group-detail` 총무 진입점(항상) 및 `enabled` 시 운영 중 뱃지

### 3.2 Out of scope (1차·비전 공통)

- 중식 참석 체크/정산 (설문·엑셀에만 유지; 앱 모델에 넣지 않음)
- 네이버 폼 API 연동 (CSV 수동 export만)
- 버스 좌석 배정, 요금 결제
- `group-detail.html` 전면 리팩터 (연결부·진입점만)
- 푸시 알림 / 카카오 알림톡

### 3.3 합의된 운영 규칙

- 탑승 체크 대상: 설문에서 **버스 탑승(왕복·편도)** 을 선택한 사람만. 개별 이동은 로스터에 넣지 않음.
- 구간: **가는 버스 / 오는 버스** 를 따로 체크. `rideType`에 따라 해당 구간만 `required`.
- 참가자: 링크/QR → 닉네임 선택 → 탑승 완료.
- 총무: 대리 체크/취소, 미탑승 강조, 명단 추가·제외, 비고.
- 권한: 참가자용 공개 링크 + 총무용 관리자 비밀번호(`verify-admin`) 역할 분리.
- 지인: 닉네임 + 실명으로 로스터에만 등록 (`isGuest: true`). 배번/결과 파이프라인에는 기본 미포함.

---

## 4. 데이터 모델

### 4.1 `race_events.busBoarding` (신규, optional)

버스가 없는 대회는 필드를 생략하거나 `enabled: false`.

```javascript
{
  // …기존 race_events 필드 (participants[], groupSource, …)
  busBoarding: {
    enabled: true,
    legs: ["outbound", "return"], // 가는 / 오는
    importMeta: {
      importedAt: Timestamp | null,
      rowCount: number,
      sourceLabel: string | null // 예: "철원설문_0809.csv"
    },
    roster: [
      {
        rosterId: string,          // 문서 내 고유키 (uuid 등)
        nickname: string,          // 표시·셀프체크 키
        realName: string,
        memberId: string | null,   // 정회원이면 members id, 지인이면 null
        isGuest: boolean,
        rideType: "roundtrip" | "outbound_only" | "return_only",
        note: string | null,       // 비고 — 총무만
        legs: {
          outbound: {
            required: boolean,
            boarded: boolean,
            boardedAt: Timestamp | null,
            boardedBy: "self" | "admin" | null
          },
          return: {
            required: boolean,
            boarded: boolean,
            boardedAt: Timestamp | null,
            boardedBy: "self" | "admin" | null
          }
        }
      }
    ]
  }
}
```

### 4.2 `rideType` → `legs.*.required` 매핑

| rideType (설문) | outbound.required | return.required |
|-----------------|-------------------|-----------------|
| `roundtrip` (왕복) | true | true |
| `outbound_only` (동탄→대회지 편도) | true | false |
| `return_only` (대회지→동탄 편도) | false | true |

개별 이동은 import 대상이 아니다. CSV에 들어오면 스킵하거나 import 리포트에 ‘제외’로 표시한다.

### 4.3 `participants`와의 관계

| | `participants[]` | `busBoarding.roster[]` |
|--|------------------|-------------------------|
| 목적 | 단체 신청·배번·결과 확정 | 버스 탑승 체크 |
| 지인 | 불가(현재 회원 검증) | 가능 (`isGuest`) |
| 배번 | `bib` 필드 / `my-bib` | 없음 |
| 연결 | — | `memberId` 또는 닉네임 느슨 매칭 |

문서 내 `roster[]`로 철원 규모는 충분하다. 인원이 매우 커져 문서 한도를 위협하면 하위 컬렉션으로 분리하는 것을 후속으로 둔다.

### 4.4 공개 API 응답과 비고

참가자용 GET은 `note`를 **포함하지 않는다**. 총무용 GET만 `note`를 반환한다.

---

## 5. 화면 · 권한

### 5.1 참가자 (공개)

| 화면 | URL (가칭) | Phase | 역할 |
|------|------------|-------|------|
| 탑승 체크 | `boarding.html?eventId=` | 1 | 닉네임 선택 → 구간별 탑승 완료. 비고 미표시 |
| 배번 입력 | `my-bib.html?eventId=` | 2 (연결) | 기존 기능. 탑승 완료 후 CTA로 이동 가능 |
| 결과 보드 | `group-results.html?eventId=` | 3 | 확정/취합 기록 목록. 비밀번호 없음 |

셀프 탑승 규칙:
- 로스터에 존재하는 `nickname`만 선택 가능.
- 해당 `leg.required === true` 일 때만 체크 가능.
- 이미 `boarded`면 idempotent 성공 + 상태 표시.
- `localStorage`에 닉네임 기억 (`my-bib` 패턴).

### 5.2 총무/운영 (관리자 비밀번호)

| 화면 | URL (가칭) | Phase | 역할 |
|------|------------|-------|------|
| 탑승 현황 | `boarding-admin.html?eventId=` | 1 | `verify-admin` 후: 구간 탭, 탑승/미탑승 카운트, 미탑승 강조, 대리 체크·취소, 명단 추가/제외, 비고 편집, CSV import, 참가자용 QR·링크 복사, **버스 최초 활성화·설정** |
| 진입점 | `group-detail.html` | 1 | 항상 ‘버스 탑승’ 진입 가능(총무/운영 맥락). `enabled`이면 현황으로, 아니면 설정(활성화) 안내 후 같은 admin 화면으로 |

### 5.3 권한 요약

| 동작 | 권한 |
|------|------|
| 참가자 탑승 체크 (self-board) | 공개. `eventId + nickname + leg` 검증 |
| 총무 대리 체크/취소, 명단 변경, import, enable | UI: `verify-admin`. **서버에서도 admin(또는 동등) 검증 필수** |
| 결과 보드 읽기 | 공개. 닉네임·거리·기록 등 최소 필드 |
| 비고 읽기/쓰기 | 총무만 |

기존 일부 `group-events` 변경 API가 UI-only 게이트인 것과 달리, **버스 탑승 변경 API는 서버 검증을 스펙 요구사항으로 둔다.**

---

## 6. API (가칭)

구현 전 `new-api-validation` 절차(유사 API 전역 검색 · 정당화 문서 · 사용자 승인)를 따른다.  
공개 쓰기 패턴 참고: `update-bib`. 총무 변경은 `verify-admin` / admin password 바디 검증.

권장 배치: `action=bus-boarding` (또는 `group-events` 하위 `subAction`). 최종 action 이름은 정당화 단계에서 확정.

| Method | subAction (가칭) | 권한 | 설명 |
|--------|------------------|------|------|
| GET | `status` | 공개(최소) / admin(전체+note) | roster + leg 상태. admin 인증 시에만 note·상세 포함. `busBoarding` 없으면 `{ enabled: false, roster: [] }` 형태로 성공 응답(404 아님) — admin 활성화 패널용 |
| POST | `self-board` | 공개 | `{ eventId, nickname, leg }` |
| POST | `admin-board` | admin | `{ eventId, rosterId, leg, boarded: true\|false }` |
| POST | `roster-upsert` | admin | 단건 추가/수정(지인·비고·rideType 등) |
| POST | `roster-remove` | admin | `{ eventId, rosterId }` |
| POST | `import` | admin | CSV 파싱 결과 rows → roster 반영 정책(아래) |
| POST | `settings` | admin | `enabled`, `legs` 등. **최초 호출 시 `busBoarding` 객체가 없으면 생성** |

### 6.0 버스 기능 부트스트랩 (Phase 1 필수)

모순 없이 아래 순서만 허용한다.

1. 총무가 `group-detail` → ‘버스 탑승’ 또는 `boarding-admin.html?eventId=` 직접 진입.
2. `verify-admin` 성공.
3. `busBoarding`가 없거나 `enabled !== true` 이면 admin 화면에 **활성화 패널**만 우선 표시 (참가자 URL은 아직 무의미).
4. `POST settings { enabled: true, legs: ["outbound","return"] }` → 문서에 `busBoarding` 생성/갱신.
5. 이후 CSV import · 명단 편집 · QR 노출.
6. 참가자 `boarding.html`은 `enabled === true` 일 때만 체크 가능. 꺼져 있으면 “아직 열리지 않음” 안내.
7. Admin 화면은 `enabled`와 무관하게 **항상** 열린다.

`enabled !== true` (필드 없음 포함)일 때 admin 허용 범위는 다음에 **고정**한다.
- 허용: `settings`(활성화/재활성화), 명단 **조회**(GET status admin), 비고 읽기
- 금지: `self-board`와 동일하게 참가자 체크 불가; admin의 `admin-board` / `roster-upsert` / `roster-remove` / `import` 도 거부 (먼저 enable 필요)
- 기존 `roster`·`boarded` 데이터는 `enabled: false`로 돌려도 **삭제하지 않음**

### 6.1 CSV import

기대 열(헤더명은 구현 시 유연 매핑, 스펙 최소):

| 열 | 필수 | 매핑 |
|----|------|------|
| 닉네임 | Y | `nickname` |
| 이름 | Y | `realName` |
| 버스 탑승 여부 | Y | `rideType` (왕복/편도 문구 → enum) |
| 비고 | N | `note` |

- 개별 이동 행: 제외 + import 리포트에 기록.
- 동일 닉네임 중복: import 실패 항목으로 돌려 총무가 확인 (자동 덮어쓰기 금지가 기본).
- import 모드(Phase 1): **머지 전용** — 닉네임을 키로 하고, 기존 `boarded` / `boardedAt` / `boardedBy` 는 유지한다. 전체 교체는 제공하지 않는다 (당일 체크 유실 방지).
- CSV에 **없는** 기존 roster 행은 **삭제하지 않고 유지**한다. 제외는 `roster-remove`로만 한다.
- `memberId`: 닉네임으로 `members` 조회해 있으면 채우고 `isGuest=false`, 없으면 `isGuest=true`.

### 6.2 실시간

- 총무 화면: **3–5초 폴링** (기존 스크랩 job 폴링과 동일 계열).
- 참가자: 제출 후 본인 상태 갱신.
- 결과 보드(Phase 3): 폴링. Firestore `onSnapshot`은 Phase 4 후보.

---

## 7. Phase 계획

| Phase | 내용 | 성공 기준 |
|-------|------|-----------|
| **1** | `busBoarding` 모델, CSV import, `boarding.html` / `boarding-admin.html`, 가는·오는 체크, 총무 조치·비고·QR/링크, `group-detail` 진입점, 서버 admin 검증 | 철원형 시나리오: CSV → 새벽 셀프체크 → 총무가 미탑승 확인·지인 추가 |
| **2** | 탑승 완료 후 `my-bib` CTA, (선택) 로스터↔participants 매칭 힌트 | 버스에서 배번 입력까지 한 흐름으로 안내 가능 |
| **3** | `group-results.html` — 확정/`race_results` 기반 공개 보드 | 복귀 버스에서 동행 기록 확인 가능 |
| **4** | 실시간 리스너, 중식 등 확장 (별도 승인) | — |

**구현 착수 순서:** Phase 1 계획 → 구현. Phase 2–3은 본 스펙을 유지한 채 별도 구현 계획.

---

## 8. UX 스케치 (Phase 1)

### 8.1 `boarding.html`

1. 대회명 · 구간 선택(가는/오는) — 기본값은 시각·설정에 따라 outbound.
2. 닉네임 검색/목록 (실명 보조 표시). 지인은 ‘지인’ 뱃지 가능.
3. ‘탑승 완료’ 큰 버튼. 성공 시 확인 화면.
4. 비고 없음.

### 8.2 `boarding-admin.html`

1. 관리자 비밀번호.
2. `enabled !== true` 이면 **활성화 패널**(대회명 + ‘버스 탑승 시작’ / legs 확인)만 강조. enable 전에는 import·대리체크 UI 비활성.
3. enable 후 상단: 구간 탭, `탑승 n / 필요 m`, 미탑승 목록 강조.
4. 행: 닉네임, 실명, 지인 여부, rideType, boarded 토글, 비고.
5. 액션: CSV import, 명단 추가, 링크/QR 복사, (선택) 버스 기능 끄기.

### 8.3 QR

- 참가자 URL을 QR로 렌더(클라이언트 생성 또는 고정 이미지). 버스/집합 장소에 부착.
- 단톡에는 동일 링크 텍스트 공유.

---

## 9. 에러 · 경계

| 상황 | 동작 |
|------|------|
| 없는 닉네임 self-board | 4xx, 안내 |
| required=false 구간 체크 | 4xx |
| 중복 self-board | 200 + 이미 완료 |
| admin 없이 admin API | 401/403 |
| `busBoarding` 없음 또는 `enabled` false | 참가자: “아직 열리지 않음”. 총무: 활성화 패널 (화면 자체는 열림) |
| CSV 형식 오류 | 행 단위 에러 리포트 |

---

## 10. 테스트 시나리오 (Phase 1 최소)

1. 부트스트랩: `busBoarding` 없음 → admin `settings`로 생성·enable → import → 참가자 outbound 체크 성공.
2. `enabled: false` 후 참가자 self-board 거부, admin import/admin-board 거부, GET 명단·재활성화는 가능.
3. 왕복 회원: outbound self-board → admin에 반영 → return self-board.
4. 편도(outbound_only): return 체크 시도 → 실패.
5. 지인 추가 후 셀프 체크 → admin 카운트 증가.
6. admin 대리 체크/취소.
7. CSV import 후 boarded 유지(머지).
8. 비고: admin GET에만 존재, 참가자 GET에 없음.
9. admin 미인증 상태의 roster-upsert 거부.

---

## 11. `group-detail` / FE 리팩터 방침

- 전면 리팩터는 하지 않는다.
- ‘버스 탑승’ **진입 버튼은 총무 화면에서 항상** 둔다 (미활성이어도 `boarding-admin`으로 가 부트스트랩).
- `enabled === true` 일 때만 ‘운영 중’ 뱃지·요약(탑승 n/m)을 붙인다.
- 버스 도메인 UI는 신규 HTML로 분리해 `group-detail` 비대화를 피한다.
- 구식 패턴이 탑승 기능 연결을 막을 때만 해당 연결부를 수정한다.

---

## 12. 열린 결정 (구현 계획 전 확정)

구현 계획 착수 시 아래만 짧게 확정하면 된다. 제품 방향은 본 스펙으로 고정.

1. API action 이름 최종 (`bus-boarding` vs `group-events` subAction).
2. CSV 헤더 별칭 목록(네이버 폼 export 실제 컬럼명).
3. 닉네임 매칭 정규화: Phase 1 계획에서 **`my-bib` / `update-bib`와 동일 규칙으로 맞춘다** (별도 규칙 신설 금지).
4. Phase 3 결과 보드에 넣을 필드 목록(기록·순위·거리 등) — Phase 3 계획 때 상세화.
---

## 12.1 Phase 1 필수 제약 (계획 체크리스트)

- roster 배열 갱신은 **트랜잭션(또는 동등한 원자적 갱신)**. 새벽 동시 `self-board` lost update 방지 (`update-bib`와 동일 위험).
- 닉네임 정규화는 `my-bib` / `update-bib`와 동일.
- import는 머지 전용.
- 서버에서 총무 API admin 검증.

---

## 13. 성공 기준 (비전)

- 총무가 새벽 현장에서 미탑승자를 휴대폰으로 즉시 파악한다.
- 참가자는 QR/링크만으로 탑승 사실을 남긴다.
- 지인·비고·편도/왕복이 명단에서 빠지지 않는다.
- (후속) 배번 입력과 복귀 결과 보드까지 같은 대회 맥락으로 이어진다.
