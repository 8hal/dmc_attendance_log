# 핸드오프: 단체 대회 — 춘백식 회원 홈 → 총무 패널

> 작성: 2026-08-18  
> 이 세션 브랜치: `cursor/group-event-member-home-4524`  
> 이 세션 PR: https://github.com/8hal/dmc_attendance_log/pull/74 (draft)  
> 선행 브랜치/PR: `cursor/group-event-admin-design-4524` / https://github.com/8hal/dmc_attendance_log/pull/80  
> **프로덕션 `firebase deploy` 금지** (AI 실행 금지, 사용자 승인 게이트)

새 세션 첫 지시 예시:

```
핸드오프 _docs/handoff/2026-08-18-group-event-member-home.md 읽고 이어서.
1) 에뮬에서 회원 홈 확인
2) 이상 없으면 Phase 2 event-admin 춘백식 패널
```

---

## 1. 목표 (한 줄)

철원 베타 단체 대회 UX를 **춘백처럼 “지금 할 일 하나”**로 맞춘다.  
C안: 회원 홈 + 총무 둘 다. **구현 순서는 회원 홈 먼저** (Phase 1 코드는 이 브랜치에 있음).

---

## 2. 잠긴 제품 결정

### 역할

| 역할 | 화면 | 하는 일 |
|------|------|---------|
| 회원 | `event-home` + 탭 `홈\|버스\|명단` | 지금 할 일 버튼만 누르면 됨 |
| 총무 | `event-admin` 한 페이지 (Phase 2에서 패널화) | 준비 → 버스 → 배번 현황 → 스크랩 |
| 배번 없음 | — | 스크랩·컨펌 대상 아님 = 미참가 |

### 데이터 두 명단 (섞지 말 것)

- **버스 로스터** `busBoarding.roster` — 누가 타나 (지인 가능, 배번 없음 가능)
- **참가자** `participants[]` — 누가 뛰나 (배번 있으면 스크랩·컨펌)

철원 기술 검증에서는 테스트용으로 **40명 동일**로 시드했다. 모델은 여전히 분리.

### 결과 파이프라인

```
배번 입력 → 총무 배번 스크랩 (대기) → 참가자 self-confirm → race_results (SSOT)
```

총무 일괄 `bulk-confirm` / 이름 갭 UI는 **주경로 아님**.

### 춘백에서 옮긴 원칙 (Phase 1·2 공통)

1. **홈 = 지금 할 일 하나** (디렉터리/런처 금지)
2. **탭 = 둘러보기** (할 일 목록이 아님)
3. **나는 누구인지가 먼저** (닉 선택 후 CTA)
4. **총무는 지금 단계 한 패널** (나머지는 메뉴만) ← Phase 2

### 회원 홈 상태 기계 (구현됨)

우선순위 `assets/event-home-action.js` `resolveNextAction`:

1. 닉 없음 → pick (`당신은 누구신가요?`)
2. 가는 버스 미탑승 → `탑승하기` → `boarding.html`
3. 배번 없음 → `배번 입력` → `my-bib.html`
4. 스크랩 대기 `confirmMode=pending` → 홈에서 2단 컨펌
5. 오는 버스 미탑승 → `탑승하기`
6. 컨펌 완료 + 버스 끝 → `수고하셨어요` / 컨펌 완료 ✓
7. 배번 있음·기록 전 → `기록 준비 중` + 명단 링크

배번·컨펌은 **탭이 아니라 홈 CTA**. 탭은 `홈 | 버스 | 명단`만.

### 철원 기술 검증 데이터

- 이벤트 ID: `evt_cheorwon_tech` (에뮬 전용)
- 버스 CSV = 2026 카페 명단 40명 (환희 중복 1건 제거)
- 기록 사이트 2026은 **아직 모름**. 스크랩 검증은 **2025 SPCT** `spct / 2025092102`
- 무배번 12명: 레이스, 오구오구, 말아톤, 6스타, 된다, 난닝구, 지미송, 호프로, 바람, 민주아빠, 송송, Josh
- 다건 6명은 fixture에 임의 1개 (진달 20666, 제임스 21184, 시카고 25115, 디모 40069, SJ 15109, 바람요정 15108)
- **프로덕션에서 날짜를 `2025-09-21`로 두고 self-confirm 하면 작년 철원 `race_results` 덮어씀.** 샌드박스는 오늘 날짜 + 별도 eventId.

---

## 3. 브랜치 / PR 지도

| 브랜치 | PR | 역할 | 머지 상태 |
|--------|-----|------|-----------|
| `cursor/group-event-admin-design-4524` | [#80](https://github.com/8hal/dmc_attendance_log/pull/80) | event-admin, bib scrape(+spct), self-confirm, public-roster, 철원 시드 | draft, **main 미머지** |
| `cursor/group-event-member-home-4524` | [#74](https://github.com/8hal/dmc_attendance_log/pull/74) | 춘백식 회원 홈 Phase 1 | draft. **#80 선 위에 쌓임** (base SHA `05e616e1`) |
| `cursor/group-event-day-boarding-design-4524` | (구) | 버스 Phase 1 설계 계열 | 컨텍스트만. 주경로 아님 |

**머지 순서 권장:** #80 → #74 (또는 #74가 #80을 포함하므로 #74만 리뷰해도 됨. 중복 커밋 주의).

**force-push 주의 (2026-08-18):**  
원격 `cursor/group-event-member-home-4524`에 예전 **목업/키프레임 docs** 커밋이 있었다 (`ec7da786` 등). 이 세션에서 로컬을 #80 위에 쌓은 뒤 `--force-with-lease` 했다. 그 docs 전용 히스토리는 이 브랜치에서 빠졌다. 필요하면 `origin` reflog 또는 해당 커밋 SHA로 복구.

---

## 4. 구현 상태

### Phase 1 회원 홈 — 코드 있음, **에뮬 수동 확인 미완**

| 파일 | 역할 |
|------|------|
| `event-home.html` | 닉 pick + today 카드 + 단일 CTA + 하단 탭 |
| `assets/event-home-action.js` | 상태 기계 |
| `assets/event-member-shell.css` | today 카드 · 탭 바 |
| `assets/event-member-tabs.js` | 탭 href/active, 버스 off면 muted |
| `boarding.html` | 상단/하단 텍스트 내비 제거, 동일 탭 |
| `event-roster.html` | 상단 member-tabs 제거, 동일 탭 |
| `scripts/test/event-home-action.test.js` | 우선순위 단위 테스트 |
| `_docs/superpowers/specs/2026-08-18-group-event-member-home-chunbaek-ia.md` | Phase 1 스펙 초안 |

테스트:

```bash
npm run test:event-home
```

### Phase 2 총무 — **미착수**

현재 `event-admin.html`은 ①준비 ②버스 ③배번 ④스크랩이 **한 스크롤**이고, 위에 구 링크가 남아 있다:

- 버스 (회원) → `boarding.html`
- 배번 입력 → `my-bib`
- 단체 대회 목록 → `group.html`
- 버스 전용 총무 → `boarding-admin.html`

목표: 춘백 `chunbaek/admin.html`처럼 **사이드(또는 상단) 메뉴 + 한 패널**. 기본 화면 = 지금 단계. 구 링크는 주경로에서 제거.

참조 구현: `chunbaek/admin.html` (`admin-sidebar` + `admin-panel`).

### 선행 기능 (이미 #80에 있음)

- `event-admin.html` 운영 홈
- bib scrape allowlist: `smartchip`, `ohmyrace`, **`spct`** (`functions/lib/group-scrape-bib.js`)
- `my-pending-result` / `self-confirm`
- `GET public-roster` + `event-roster.html`
- 철원 시드·픽스처 (`scripts/seed-emulator-cheorwon-tech-check.js` 등)

---

## 5. 에뮬레이터 (막혔던 지점)

Functions가 요청마다 죽으면 로그인 「확인 중…」에 멈춘다. **비번 문제가 아님.**

원인: `firebase-functions` v7의 `functions.config()`가 throw. firebase-tools 에뮬이 워커 부팅 때 호출함. 우리 `index.js`에는 `config()` 없음.

**로컬 우회 (커밋 금지):**  
`functions/node_modules/firebase-functions/lib/v1/config.js` 의 `config`가 `return {}` 하게 패치.

기동:

```bash
firebase emulators:start --only functions,hosting,firestore,storage --project dmc-attendance
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator-cheorwon-tech-check.js
```

포트: Hosting `5000`, Functions `5001` (**asia-northeast3**), Firestore `8080`, UI `4000`.

로그인 확인:

```bash
curl -sS -X POST 'http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race?action=verify-admin' \
  -H 'Content-Type: application/json' -d '{"pw":"dmc2008"}'
# {"ok":true,"role":"operator"}
```

**반드시** `http://127.0.0.1:5000/...` 로 연다. Cursor 미리보기 hostname이 localhost가 아니면 **프로덕션 Functions**로 간다.

운영진 비번: `dmc2008` (`DMC_ADMIN_PW` 없으면). 스크랩·소스 저장은 `DMC_OWNER_PW`.

Pubsub 스케줄 함수 ignore는 정상 (pubsub 에뮬 없음).

회원 홈 URL:

```
http://127.0.0.1:5000/event-home.html?eventId=evt_cheorwon_tech
```

총무:

```
http://127.0.0.1:5000/event-admin.html?eventId=evt_cheorwon_tech
```

---

## 6. 새 세션에서 할 일

### A. 회원 홈 수동 확인 (구현보다 먼저)

에뮬 + 시드 후:

1. 시크릿/저장 닉 없이 홈 → **당신은 누구신가요?** → 닉 선택 → 시작하기
2. 버스 on이면 홈 CTA가 **가는 버스 · 탑승하기** 하나인지 (런처 3개 없어야 함)
3. 하단 탭 홈|버스|명단 이동, 버스 페이지에서도 탭 유지
4. 배번 입력 후 홈이 **배번 카드가 아니라 다음 상태**(기록 준비 중 또는 컨펌)인지
5. 컨펌 2단 (확인 → 이 기록으로 컨펌) → 명단에 닉·기록만, 실명·배번 숫자 없음
6. 닉네임 변경 → pick으로 돌아감

스모크 닉/배번 (플랜): 써니형 `40066`, 하우스 `20294`, 오칠팔이 `10399`.

E2E 플랜: `_docs/superpowers/plans/2026-08-17-cheorwon-e2e-tech-check.md`

### B. Phase 2 `event-admin` (A 통과 후)

브레인스토밍 스킬 → 스펙 보강 → 구현. 범위:

- 춘백 admin처럼 **한 번에 한 패널** (준비 / 버스 / 배번 / 스크랩)
- 기본 패널 = 지금 단계 추정 가능하면 그쪽으로 (없어도 메뉴 전환만으로 OK)
- 주경로에서 `boarding-admin` · `group.html` 링크 제거
- SPA 전면 재작성 금지. 기존 섹션을 패널로 감싸기
- 신규 API 만들지 말 것 (이미 있는 `bus-boarding` / `group-events` / `verify-admin`)

디자인 기준: `_docs/superpowers/specs/2026-08-13-group-event-admin-design.md`  
회원 홈 스펙: `_docs/superpowers/specs/2026-08-18-group-event-member-home-chunbaek-ia.md`

### C. 하지 말 것

- `firebase deploy`
- 프로덕션 Firestore에 철원 2025 날짜로 self-confirm
- `node_modules` config 패치 커밋
- 신규 거대 API / `group-events` 전면 재작성
- 회원·운영 단일 셸 (비목표)

---

## 7. 관련 문서

| 종류 | 경로 |
|------|------|
| 이 핸드오프 | `_docs/handoff/2026-08-18-group-event-member-home.md` |
| 회원 홈 스펙 | `_docs/superpowers/specs/2026-08-18-group-event-member-home-chunbaek-ia.md` |
| 총무 스펙 | `_docs/superpowers/specs/2026-08-13-group-event-admin-design.md` |
| 당일 UX (모듈 독립) | `_docs/superpowers/specs/2026-08-02-group-event-day-ux-design.md` |
| 철원 E2E | `_docs/superpowers/plans/2026-08-17-cheorwon-e2e-tech-check.md` |
| self-confirm justification | `_docs/justification/2026-08-14-self-confirm-bib-scrape-justification.md` |
| 춘백 회원 | `chunbaek/index.html` (홈 CTA + 하단 탭) |
| 춘백 운영 | `chunbaek/admin.html` (사이드 + 패널) |

---

## 8. 커밋 앵커

이 세션 구현 커밋:

```
42bd72c6 feat(event-home): Chunbaek-style today action and bottom tabs
```

그 아래는 #80 내용 (`05e616e1` 철원 시드, `8a83cbad` public-roster, self-confirm 등).
