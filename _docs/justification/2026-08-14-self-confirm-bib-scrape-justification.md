# self-confirm · bib scrape API 추가 필요성 검증

> 날짜: 2026-08-14  
> 관련: `_docs/superpowers/specs/2026-08-13-group-event-admin-design.md`  
> 계획: `_docs/superpowers/plans/2026-08-14-group-event-admin-impl.md` (Task 2)  
> 게이트: `new-api-validation` — **사용자 승인 전** API 핸들러·FE 호출(Tasks 4–5, 6–7) **구현 금지**  
> Task 3(순수 헬퍼 `group-scrape-bib.js` + 단위 테스트)은 승인 전 진행 가능

---

## 1. 유사 API 전역 검색 (완료)

검색 명령 (함수):

```bash
rg -n 'subAction === "scrape"|bulk-confirm|confirm-one|update-bib|self-confirm|action === "confirm"' functions/index.js
```

| 패턴 | 위치 (`functions/index.js`) | 결과 |
|------|------------------------------|------|
| `action === "confirm"` | ~2245 | 개인/ops 스크랩 잡 확정 → `race_results` (jobId 기준 삭제 후 재저장) |
| `subAction === "scrape"` | ~3208 | 단체 스크랩 트리거 — **전원 `realName`** → `memberRealNames` |
| `subAction === "confirm-one"` | ~3252 | 총무 1명 gap 확정 (`confirmSource` 기본 `operator`) |
| `subAction === "bulk-confirm"` | ~3389 | 총무 일괄 확정 — 이벤트 전체 `race_results` 삭제 후 재저장 |
| `subAction === "update-bib"` | ~3522 | 참가자 본인 배번 1필드 (공개, nickname 매칭) |
| `self-confirm` / `my-pending-result` | — | **없음** (미구현) |

HTML 호출처:

| API | 호출처 |
|-----|--------|
| `action=confirm` | `report.html`, `races.html`, `my.html` |
| `group-events` `scrape` | `ops.html` (~808) |
| `group-events` `bulk-confirm` | `group-detail.html` (~1206) |
| `group-events` `confirm-one` | `group-detail.html` (갭 UI 다수 ~1547+) |
| `group-events` `update-bib` | `my-bib.html` (~587) |
| `group-events` `detail` / `gap` | `group-detail.html`, `my-bib.html`, `group.html` |

**검색 결론**

- 참가자 셀프 컨펌·배번 대기 조회 API **전무**.
- 기존 확정 경로는 모두 **총무/ops** 또는 **개인 스크랩 잡**(`action=confirm`)이며, 매칭 키가 **실명·갭 UI** 중심.
- 현재 `scrape`는 `participants` **전원 실명**으로 조회 — 스펙의 「배번 있는 사람만」과 불일치.

---

## 2. 기존 API 목록

### A. `POST /race?action=confirm`

- **용도**: 스크랩 잡(`jobId`) 결과를 `race_results`에 확정
- **호출처**: `report.html`, `races.html`, `my.html`
- **입력**: `{ jobId, results[], confirmSource?, … }`
- **특징**: `jobId`(=canonicalJobId) 기준 **기존 결과 전체 삭제** 후 배치 저장. 단체 대회의 `participants[]`·배번 파이프라인과 무관. 기본 `confirmSource: "operator"` (개인 페이지에서 `"personal"` 가능).

### B. `POST group-events` · `subAction=scrape`

- **용도**: 단체 대회 스크래핑 잡 비동기 트리거 (`ownerPw`)
- **호출처**: `ops.html` (group-detail에는 현재 scrape 호출 없음)
- **동작 (현재)**: `memberRealNames = participants.map(p => p.realName)` → `triggerGroupScrape` — **배번 유무 무시**
- **특징**: `race_results`에 쓰지 않음. `groupScrapeStatus` / job만 갱신.

### C. `POST group-events` · `subAction=confirm-one`

- **용도**: 갭 UI에서 후보 1건을 `race_results`에 확정
- **호출처**: `group-detail.html` (ambiguous/missing/수동 확정)
- **입력**: `{ canonicalEventId, participant{ realName, … }, confirmSource? }`
- **특징**: docId = `realName_distance_date`. 기본 `confirmSource: "operator"`. **총무·이름 갭** 전제.

### D. `POST group-events` · `subAction=bulk-confirm`

- **용도**: 참가자 전원(또는 화면에서 고른 목록) 일괄 → `race_results`
- **호출처**: `group-detail.html`
- **특징**: `canonicalEventId` 기준 **기존 기록 전부 삭제** 후 재저장. 잡 `status: confirmed`. 스펙상 철원 베타 **주경로 비목표**.

### E. `POST group-events` · `subAction=update-bib`

- **용도**: 참가자 본인 `participants[].bib`만 갱신
- **호출처**: `my-bib.html`
- **입력**: `{ eventId, nickname, bib }` (공개)
- **특징**: 공개 쓰기·닉네임 exact match — **self-confirm 권한 경계 참고**. `race_results` 미기록.

### F. `GET group-events` · `subAction=detail` (+ gap)

- **용도**: 대회 상세 + **실명 기반** gap (`ok` / `ambiguous` / `missing` / `confirmed`)
- **호출처**: `group-detail.html`, `my-bib.html`
- **특징**: 스크랩 결과를 `memberRealName`으로 묶음. 참가자 1명용 최소 대기 조회 API 아님. 스펙: 이름 갭 UI **주경로 제거**.

---

## 3. 제안 API / 동작 변경

모두 `action=group-events` **subAction**으로 둔다 (스펙 열린 결정 #2 — 별도 action 불필요: 같은 `race_events`·job·`race_results` 파이프라인).

| 항목 | Method | 성격 | 설명 |
|------|--------|------|------|
| `scrape` | POST | **기존 확장** | 대상을 `pickBibScrapeTargets(participants)`만. 배번 0명이면 400. `queryBy: "bib"`로 scraper 호출. 개인/ops 이름 스크랩 경로 유지 |
| `my-pending-result` | GET | **신규** | `eventId` + `nickname` → 본인 bib로 job 대기 행 조회. `state`: `confirmed` \| `pending` \| `none` |
| `self-confirm` | POST | **신규** | `eventId` + `nickname` → pending bib 행을 `race_results`에 upsert. `confirmSource: "personal"`. **해당 docId만** 덮어쓰기 (이벤트 전체 삭제 금지) |

### 호출처 (예정)

- `scrape`: `event-admin.html` (총무 「배번 N명 스크랩」); `ops.html` 기존 버튼은 동일 subAction 사용 → **동작이 bib 필터로 바뀜**
- `my-pending-result` / `self-confirm`: 회원 홈 배너(`event-home` 등), 필요 시 명단·결과 ‘나’ 행

### 제품 규칙 (합의)

- 배번 있음 = 스크랩·컨펌 대상; 배번 없음 = 미참가 (파이프라인 제외)
- 이름 갭 UI는 주경로 아님
- 총무가 스크랩; **참가자가** self-confirm → `race_results` (SSOT)
- `confirmSource: "personal"`

---

## 4. 기존 API로 대체 불가능한 이유

### 왜 `bulk-confirm`으로 대체하지 않는가?

| 차원 | `bulk-confirm` | 필요 동작 |
|------|----------------|-----------|
| 행위자 | 총무(운영 UI) | **참가자** 본인 확인 |
| 범위 | 이벤트 전원 · **전체 delete** | 본인 1건만 upsert |
| 매칭 | FE가 넘긴 `results[]` (갭/실명) | 서버가 **bib**로 pending 조회 |
| 소스 | 기본 `operator` | 고정 `"personal"` |
| UX | group-detail 일괄 확정 | 홈 배너 「내 기록 확인 · 컨펌」 |

- 참가자가 `bulk-confirm`을 호출하면 타인 기록 삭제·덮어쓰기 위험.
- 스펙 §2.2: 총무 일괄 bulk-confirm을 운영 홈 **주경로로 이식하지 않음**.

### 왜 `confirm-one`을 반복 호출하지 않는가?

- **갭 UX 전제**: 총무가 후보를 고른 `participant` 페이로드. 참가자는 gap UI가 없음.
- 클라이언트에 전체 scrape job·실명 후보를 노출하면 보안·복잡도↑.
- `confirmSource` 기본이 operator — personal 셀프 경로와 혼동.
- 배번 키로 서버가 pending을 고르는 계약이 없음.

### 왜 `action=confirm`으로 대체하지 않는가?

- 입력 모델: `jobId` + `results[]` (개인 스크랩 잡). 단체는 `eventId` + nickname.
- 재확정 시 **job 전체** 삭제 — 타인 단체 기록까지 지울 수 있음.
- 참가자 FE가 job 결과 전체를 조립해야 함 — `my-pending-result` 없이 불가에 가깝다.

### 왜 `detail` / gap만으로 대기 조회하지 않는가?

- `detail`은 전체 gap·전원 PII·실명 매칭. 회원 홈은 **본인 1행**만 필요.
- 갭 제거 후 FE가 `gapStatus`에 의존하면 회귀.
- → 최소 공개 조회: `my-pending-result` (`state` 삼항).

### 왜 `scrape`를 새 subAction으로 쪼개지 않는가?

- 트리거·ownerPw·잡 수명주기는 동일. 바뀌는 것은 **대상 선정 + bib 조회**.
- 새 `scrape-by-bib`는 라우팅·ops 호출처 이중화만 초래.
- **동작 변경**(기존 `scrape` 확장)이 YAGNI·호환에 맞음. `groupEventAutoScrape`도 동일 bib 대상으로 맞춤.

### 왜 `update-bib`만으로는 부족한가?

- 배번 저장만 함. 스크랩·pending·`race_results` 없음.
- 공개 쓰기 **패턴만** self-confirm에 재사용 (`eventId` + `nickname`, bib 필수).

---

## 5. 신규 API 추가 결정

### ✅ 필요

1. **`scrape` 동작 변경** — bib 있는 participant만, bib-first 조회 (개인 이름 스크랩 유지).
2. **`my-pending-result`** — 참가자 컨펌 UX용 최소 대기 조회.
3. **`self-confirm`** — 본인 bib pending → `race_results`, `confirmSource: "personal"`.

### ⚠️ 검토한 대안

| 대안 | 판정 |
|------|------|
| `bulk-confirm` / `confirm-one` 재사용 | ❌ 총무·갭·전체삭제·operator |
| `action=confirm` | ❌ job 단위 전체 삭제, 입력 모델 불일치 |
| `detail` gap 확장만 | ❌ 갭 UI 잔존, 과다 노출 |
| 별도 `action=self-confirm` | ❌ 같은 파이프라인 — subAction으로 충분 |
| Firestore 클라이언트 직접 쓰기 | ❌ Hosting 정적 FE, 권한·검증 서버 필수 |

### 구현 시 참조 패턴

- 공개 식별: `update-bib` (~3522) — nickname trim, participants index, 403 not participant
- 행 조립·docId: `confirm-one` (~3252) — `safeName_safeDist_safeDate`
- 재확정(본인만): confirm-one의 **단건 set**; bulk/confirm의 **이벤트·잡 전체 삭제 금지**
- `confirmSource: "personal"` — 기존 personal/operator 구분과 정합

---

## 6. 승인 게이트 (게이트)

| 작업 | 승인 전 |
|------|---------|
| Task 3 — `functions/lib/group-scrape-bib.js` + 단위 테스트 | ✅ 허용 (순수 헬퍼) |
| Task 4–5 — `scrape` 변경, `my-pending-result`, `self-confirm` HTTP | ❌ **승인 후** |
| Task 6–7 — FE에서 위 API 호출 | ❌ **승인 후** |

- ⏳ **사용자 승인 대기** — 본 문서 작성 완료. Tasks 4–5·6–7 착수 전 controller/사용자 승인 필요.
- 승인 후: 기존 패턴 준수 + TC에 재컨펌·무배번 제외·personal 소스 시나리오 포함.

---

**작성**: AI Agent (Task 2)  
**브랜치**: `cursor/group-event-admin-design-4524`  
**승인 상태**: ⏳ 사용자 승인 필요  
**승인일**: (승인 후 기재)
