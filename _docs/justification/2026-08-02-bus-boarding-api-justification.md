# bus-boarding API 추가 필요성 검증

> 날짜: 2026-08-02  
> 관련: `_docs/superpowers/specs/2026-08-02-group-event-day-ux-design.md` §6  
> 게이트: `new-api-validation` — **사용자 승인 전 BE 핸들러(Task 3+) 구현 금지**

---

## 1. 유사 API 전역 검색 (완료)

| 패턴 | 검색 범위 | 결과 |
|------|-----------|------|
| `bus` | `*.js`, `*.html`, `*.md` | 도메인 API **없음**. `functions/package-lock.json`의 `@fastify/busboy`만 매칭 |
| `boarding` | `*.js`, `*.html` | **없음** — `busBoarding`, `boarding.html`, `self-board` 등 미구현 |
| `update-bib` | 전역 | `functions/index.js` ~3579 (`group-events` POST subAction), `my-bib.html`, `scripts/test-update-bib.js` |
| `action=group-events` | `*.js`, `*.html` | `group-detail.html`, `group.html`, `my-bib.html`, `ops.html`, `functions/index.js` — subAction 11종 (아래 §2) |
| `verify-admin` | 전역 | `functions/index.js` ~2688 (`POST action=verify-admin`), `group.html`, `attendance-admin.js`, `report.html`, `ops.html` 등 |
| `self-board` | 전역 | **없음** — 탑승 셀프 체크 API 미존재 |

**검색 결론**

- **기존 탑승 체크 API 없음** — 버스·탑승·로스터 관련 HTTP 엔드포인트가 코드베이스에 없다.
- **공개 쓰기 최근접 패턴: `update-bib`** — 인증 없이 `eventId + nickname`으로 `race_events` 내 단일 필드만 갱신하는 유일한 `group-events` POST subAction.
- **admin 서버 검증 패턴: `verifyAdminPassword` / `ownerPw`**
  - `verifyAdminPassword(pw)` (`functions/index.js` ~3875): `DMC_OWNER_PW` → role `owner`, `DMC_ADMIN_PW`(기본 `dmc2008`) → role `operator`.
  - `POST action=verify-admin` (~2688): FE 세션용; `ownerPw`/`adminPw` 비교 후 `{ ok, role }` 반환.
  - 서버 측 admin API 예: `handleAdminDeleteAttendance`, `handlePostMeetingTraining` — 요청 body의 `pw`를 `verifyAdminPassword`로 검증.
  - `group-events`의 `source`/`scrape`는 `ownerPw`만 body에 요구(UI-only에 가까운 기존 패턴). **버스 API는 스펙상 서버 admin 검증 필수.**

---

## 2. 기존 API 목록

### A. `POST /race?action=verify-admin`

- **용도**: 관리자 비밀번호 확인 (FE `sessionStorage` 게이트)
- **호출처**: `group.html`, `attendance-admin.js`, `report.html`, `ops.html` 등
- **특징**: 읽기/쓰기 분리 없음 — 인증만. `ownerPw` / `adminPw` 환경변수 비교

### B. `action=group-events` (GET/POST, `exports.race`)

| subAction | Method | 용도 | 호출처 |
|-----------|--------|------|--------|
| *(없음)* | GET | 단체 대회 목록 | `group.html`, `ops.html` |
| `detail` | GET | 대회 상세 (`race_events` 전체) | `group-detail.html`, `my-bib.html` |
| `gap` | GET | 기록 매칭 갭 | `group.html`, `group-detail.html` |
| `participants` | POST | `participants[]` **전체 교체** (memberId 검증) | `group-detail.html` |
| `update-bib` | POST | 참가자 **본인** `bib` 1필드 갱신 (공개) | `my-bib.html` |
| `source` | POST | `groupSource` (ownerPw) | `group-detail.html` |
| `scrape` | POST | 스크래핑 잡 트리거 (ownerPw) | `group-detail.html` |
| `confirm-one` | POST | 1명 `race_results` 확정 | `group-detail.html` |
| `bulk-confirm` | POST | 전원 일괄 확정 | `group-detail.html` |
| `promote` | POST | canonical 이벤트 승격 | `ops.html` |
| `delete` | POST | `race_events` 문서 삭제 | `group-detail.html` |

- **공통**: `participants[]` 중심 — 정회원 신청·배번·스크랩·확정 파이프라인. **버스 로스터·구간 탑승 필드 없음.**

### C. `POST /race?action=group-events` + `subAction=update-bib` (공개 쓰기 참고)

- **입력**: `{ eventId, nickname, bib }`
- **검증**: `participants` 배열에서 `nickname` exact match → 해당 행 `bib`만 update
- **권한**: 공개 (로그인 없음). 닉네임·참가자 여부로 범위 제한
- **특징**: 트랜잭션 없음(Phase 1 bus-boarding은 동시 self-board lost update 방지를 위해 트랜잭션 필수 — 스펙 §12.1)

### D. admin 쓰기 패턴 (서버 `pw` 검증)

- **`verifyAdminPassword(body.pw)`**: `admin-delete-attendance`, `meeting-training` POST 등
- **`ownerPw` body**: `group-events` `source`, `scrape` — 오너 전용, operator 불가

---

## 3. 신규 API: `action=bus-boarding`

### 용도

단체 대회 당일 **버스 탑승** 운영 — `race_events.busBoarding` optional 객체 CRUD 및 탑승 상태 갱신.

| subAction | Method | 권한 | 설명 |
|-----------|--------|------|------|
| `status` | GET | 공개(최소) / admin(`pw`, note 포함) | 로스터 + leg 상태 |
| `self-board` | POST | 공개 | `{ eventId, nickname, leg }` — 참가자 셀프 탑승 |
| `admin-board` | POST | admin (`pw`) | 대리 체크/취소 |
| `roster-upsert` | POST | admin | 지인·비고·rideType 등 명단 편집 |
| `roster-remove` | POST | admin | 로스터 행 제거 |
| `import` | POST | admin | CSV 머지 import |
| `settings` | POST | admin | `enabled`, `legs` — 최초 `busBoarding` 생성 |

### 호출처 (예정)

- `boarding.html` — 참가자 셀프 탑승 (`self-board`, GET `status`)
- `boarding-admin.html` — 총무 현황·import·명단·QR (`verify-admin` UI + 서버 `pw`)
- `group-detail.html` — 허브 카드(요약 status, 딥링크)

### 데이터

- **저장 위치**: `race_events.busBoarding` (기존 `participants[]`와 분리)
- **로스터**: `roster[]` — 정회원(`memberId`) + **지인**(`isGuest: true`)
- **구간**: `legs.outbound` / `legs.return` — `rideType`에 따른 `required` + `boarded` 상태

---

## 4. 기존 API로 대체 불가능한 이유

### 왜 `update-bib`를 재사용·확장하지 않는가?

| 차원 | `update-bib` | 버스 탑승 |
|------|--------------|-----------|
| 대상 필드 | `participants[].bib` | `busBoarding.roster[].legs.*` |
| 대상 인원 | `participants`에 등록된 **정회원만** | 설문 CSV + **지인** (`isGuest`) |
| 동작 | 배번 1필드 문자열 | 구간별 boolean + `boardedAt` + `boardedBy` |
| subAction 수 | 1개 | status / self-board / admin-board / roster-* / import / settings (7+) |

- **지인 로스터**: `update-bib`는 `participants.findIndex(nickname)` — 지인은 `participants`에 없어 403. 버스는 `busBoarding.roster` 전용.
- **구간 체크**: `bib`와 달리 outbound/return **leg** 단위·`rideType`별 `required` 검증 필요. 단일 필드 API로 표현 불가.
- **총무 기능**: CSV import, 대리 체크, 비고(`note`), enable/disable — `update-bib` 범위 밖.

공개 쓰기 **패턴**만 참고: `eventId + nickname` 검증, trim exact match, idempotent 재제출.

### 왜 `group-events` subAction으로 넣지 않는가?

1. **도메인 분리**: `group-events`는 배번·스크랩·gap·확정 파이프라인. 버스는 당일 운영(탑승 명단) — 스펙 §3.2 «`group-events` BE 전면 재작성 금지», §11.2 «버스 로스터를 `participants`에 합치기 금지».
2. **subAction 폭발**: 7+ subAction + `busBoarding` 전용 트랜잭션·import·enable 게이트 → 단일 action `bus-boarding`이 라우팅·QA·문서화에 명확 (Phase 1 계획 확정).
3. **권한 모델 차이**: 기존 `participants` POST는 admin 비밀번호 **서버 검증 없음**(UI-only). 버스 admin API는 **`verifyAdminPassword(body.pw)` 필수** — `group-events`에 섞으면 기존 subAction과 보안 수준 혼선.
4. **공개 GET 응답**: 참가자용 `status`는 `note` 제외 — `detail` GET과 응답 shape·필드 마스킹이 다름.

### 왜 `participants` POST로 로스터를 흉내 내지 않는가?

- `participants`는 **memberId 필수** + 배열 **전체 교체** — 지인·비고·편도/왕복·탑승 시각 필드 없음.
- 총무 CSV import는 **머지**(기존 `boarded` 유지) — participants 덮어쓰기와 정반대.
- 탑승 체크와 배번/확정 **모듈 독립**(스펙 §2 원칙 2) — `participants`에 탑승 상태를 넣으면 파이프라인 결합.

### 왜 `verify-admin`만으로 충분하지 않은가?

- `verify-admin`은 FE 세션용 **인증 API**. 탑승 데이터 CRUD는 별도 action 필요.
- 버스 **admin subAction**은 각 POST body에 `pw` + `verifyAdminPassword` — `admin-delete-attendance`·`meeting-training`과 동일 서버 검증 패턴.

---

## 5. 신규 API 추가 결정

### ✅ 추가 필요: `GET/POST /race?action=bus-boarding` (+ `subAction`)

**요약**

- 탑승 체크 API **전무** — 신규 action 필요.
- `update-bib`: 공개 쓰기·닉네임 매칭 참고만; 필드·로스터·구간 모델 불일치.
- `group-events`: participants/확정 파이프라인; 지인·leg·서버 admin·CSV import 대체 불가.
- 별도 action `bus-boarding`으로 도메인·권한·트랜잭션·QA 경계 명확.

### ⚠️ 대안 검토

| 대안 | 판정 |
|------|------|
| `group-events` + `subAction=board` 등 | ❌ subAction 비대·보안·데이터 모델 혼선 |
| `update-bib` 확장 | ❌ 지인·구간·admin·import 미지원 |
| `participants`에 탑승 필드 추가 | ❌ 스펙 금지, memberId/전체교체 제약 |
| Firestore 클라이언트 직접 쓰기 | ❌ Hosting 정적 FE, admin/공개 권한 서버 필수 |

### 구현 시 참조 패턴

- 공개 쓰기: `update-bib` (~3579) — nickname trim, participant/roster index, 400/403/404
- admin 검증: `verifyAdminPassword` + `handleAdminDeleteAttendance` body `pw` 패턴
- 동시성: 스펙 §12.1 — roster 갱신 **Firestore 트랜잭션** (`update-bib`는 단일 필드라 트랜잭션 없음; 버스는 필수)
- 닉네임 정규화: `my-bib` / `update-bib`와 동일 (`trim` 후 exact `===`)

### Phase 1 subAction (잠금)

```
GET  ?action=bus-boarding&subAction=status&eventId=
POST ?action=bus-boarding  body: { subAction, eventId, ... }
  — self-board | admin-board | roster-upsert | roster-remove | import | settings
```

---

## 6. 승인

- ⏳ **사용자 승인 대기** — 본 문서 작성 완료. **Task 3(BE HTTP 핸들러) 착수 전** controller/사용자 승인 필요.
- Task 1–2(순수 로직 `functions/lib/bus-boarding.js` + 단위 테스트)는 승인 전 진행 가능 (Phase 1 계획).

---

**작성**: AI Agent (Task 0)  
**브랜치**: `cursor/group-event-day-boarding-design-4524`
