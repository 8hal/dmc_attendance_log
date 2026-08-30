# 확정(done) 프로필 카드 — 종목 · 완주 시간 · PB / DNS·DNF

**상태:** 설계 초안 · **사용자 승인 대기** (구현 HARD-GATE)  
**선택:** Option 2 「조금 더」 — 종목(거리) + 완주 시간 + PB 여부 / DNS·DNF  
**범위:** `event-home.html` `#profileCard` 의 `confirmed` / `is-done` 만  
**신규 HTTP API:** 불필요 (기존 `my-pending-result` `result` 재사용). 단, 클라이언트에서 `status`↔DNS/DNF 해석 필수 (아래 데이터 절).

관련 짧은 메모(구버전): `_docs/superpowers/specs/2026-08-30-profile-done-record-design.md` → **본 문서로 대체**.

---

## 1. 오늘 `profileCard` done 상태가 하는 일

### 상태 진입

1. `loadConfirmState` → `GET group-events&subAction=my-pending-result&eventId=&nickname=`
2. `EventHomeBadges.confirmPanelFromApi` → `mode: "confirmed"` + `result`
3. `confirmMode = "confirmed"` 이면 `shouldPollConfirm()` 이 폴링 중단
4. `EventHomeAction.resolveProfileCard` → `state: "confirmed"`,  
   `prompt: "끝. 동마클 대회 기록에 저장됐어요."`
5. `renderProfileCard`: `profileCard.classList.add("is-done")` (연녹 보더/배경, `event-member-shell.css`)

### 확정 직후 데이터 갱신

`self-confirm` 성공 → `refreshHomeState` → 다시 `my-pending-result` → `confirmResult` 갱신.  
카드는 **로컬 optimistic 조립이 아니라** API `result` 를 다시 그린다.

### 기존 UI 언어 (비교용)

| 상태 | 큰 숫자 / 페이스 | 부제 `.profile-sub` | 프롬프트 |
|------|------------------|---------------------|----------|
| `wait` | bib-face (배번) | (비움) | 자동 수집 안내 |
| `pending` | `.profile-time` (기록) + 큰 배번 | `종목 · 배번 N` | 「고생했어요. 이 기록이 맞나요?」 |
| `confirmed` (변경 전) | 없음 | 없음 | 「끝. 동마클 대회 기록에 저장됐어요.」만 |
| `bus` done | — | — | 경로 제목 + 「· 탑승 완료」 톤 |

완료 카피(「끝. …」)와 `is-done` 그린 카드는 **유지**. Option 2는 그 아래에 기록 요약을 얹는다.

---

## 2. 클라이언트에 이미 있는 확정 필드 (신규 API 없음)

`state === "confirmed"` 일 때 `result` 는 **`race_results` 문서 원본** (`resolveMyPendingState` → `result: confirmed`).

| 필드 | 용도 | 비고 |
|------|------|------|
| `netTime` / `gunTime` / `finishTime` | 완주 시각 표시 | FE 기존 `confirmDisplayTime`: net → gun → finish, 플레이스홀더 `--:--:--` / `-` 제외 |
| `distance` | 종목 | canonical (`half`, `full`, …). 표시는 `EventMemberCopy.memberDistanceLabel` |
| `pbConfirmed` | PB 여부 | boolean. DNS/DNF 행은 self-confirm 시 강제 `false` |
| `status` | 완주 vs DNS/DNF | `"confirmed"` \| `"dns"` \| `"dnf"` (소문자). **문서에 `dnStatus` 키는 보통 없음** |
| `bib`, `memberNickname`, … | 본 카드 비표시 | done에서는 배번 페이스 숨김 (기록 우선) |

**폴백 (거리):** `confirmResult.distance` 비면 `participant.distance`.

**신규 API 필요 여부:** 없음.  
다만 `public-roster` 는 응답에 `dnStatus: "DNS"|"DNF"|null` 를 정규화하지만, `my-pending-result` confirmed 는 **정규화하지 않는다**.  
→ FE는 `public-roster` 와 같은 규칙으로 `dnStatus` **또는** `status` 를 읽어 DNS/DNF를 판정해야 한다 (`functions/lib/public-roster.js` 의 `publicDnStatus` 패턴).  
API 스키마를 맞추고 싶으면 **선택적 후속**(승인 별도) — Option 2 범위에서는 FE 해석으로 충분.

**pending `result` 와의 차이:** pending 은 job 행 일부(`bib`, `netTime`, `gunTime`, `distance`, …)만 온다. confirmed 는 Firestore 행 전체. 표시 헬퍼는 공통 필드만 쓰면 된다.

---

## 3. 제시 방식 2–3안 + 권장

### A. Pending과 같은 계층 (권장)

```
[끝. 동마클 대회 기록에 저장됐어요.]     ← .today-desc 유지
1:42:18                                  ← .profile-time (있을 때만)
하프 · PB                                ← .profile-sub
```

DNS 예:

```
[끝. …]
풀 · DNS                                 ← 시간 줄 숨김, 부제만
```

- **장점:** 기존 DOM(`.profile-time`, `.profile-sub`), CSS, pending 시각 언어 재사용. 구현 최소. event-home 「큰 숫자 + 작은 메타」 언어과 일치.
- **단점:** bib-face 연속성 없음 (의도적 — 확정 후 핵심은 기록).

### B. 한 줄 메타만 (시간 작게)

프롬프트 아래 `하프 · 1:42:18 · PB` 한 줄.

- **장점:** 면적 최소.
- **단점:** pending에서 쓰던 큰 시간 강조가 사라지고, 「조금 더」 선택과 안 맞음.

### C. bib-face 유지 + 시간 오버레이

wait/pending 배번 페이스에 시간을 얹음.

- **장점:** 대기→확정 시각 연속.
- **단점:** 확정 후 배번은 부차; 레이아웃·접근성 과설계. 비권장.

### 권장: **A**

기존 카드 언어(큰 `.profile-time` + `.profile-sub` · 구분)와 Option 2 요구를 동시에 만족.  
카피 변경 없음. CTA/링크 추가 없음.

**부제 조립 규칙 (권장):**

1. 종목 라벨 있으면 포함  
2. DNS/DNF 이면 상태 토큰만 추가 (**PB 무시**)  
3. 아니면 `pbConfirmed === true` 일 때만 `PB`  
4. ` · ` 로 join. 시간 줄은 `confirmDisplayTime` 결과가 있을 때만 표시  
5. 시간·부제 모두 비면 display 블록 숨김 (프롬프트만 — 데이터 공백 방어)

헬퍼 후보: `EventHomeBadges.confirmDoneSummary(result, { distanceLabel })` → `{ timeText, subText }`  
(단위 테스트로 DNS>PB, 빈 result, finishTime 폴백 고정).

---

## 4. 엣지 케이스

| 케이스 | 동작 |
|--------|------|
| **DNS / DNF** | `status`/`dnStatus` → `DNS`/`DNF`. 완주 시각 줄 숨김(보통 `netTime` 비움). 부제: `종목 · DNS`. PB 체크되어 있어도 표시 안 함 (저장 시에도 `pbConfirmed: false`) |
| **PB 필드 없음 / false** | 부제에 `PB` 없음. 예: `하프` 또는 `하프` + 시간만 |
| **거리 없음** | result·participant 모두 비면 종목 생략. `unknown`/`?` → `memberDistanceLabel` → 「종목 미정」 |
| **시간만 없고 완주 confirmed** | 부제만 (종목 · PB?). 프롬프트는 유지 |
| **재확정** | 홈 done 카드에 수정 CTA 없음 (비범위). 총무/다른 플로우로 `race_results` 바뀌면 **다음 홈 진입·새로고침** 때 `my-pending-result` 가 새 행을 줌. confirmed 중 폴링 없음 → 당일 화면 고정은 허용 |
| **self-confirm 직후** | `refreshHomeState` 로 즉시 재조회 → done 요약 반영 |
| **게스트** | confirmed 경로 진입 안 함 (기존 guest 분기) |

**구현 주의 (승인 후):** `confirmDoneSummary` 가 `dnStatus` 만 보면 confirmed Firestore 행에서 DNS/DNF 가 빠진다. **반드시 `status` 도 검사** (public-roster와 동일).

---

## 5. 승인용 설계 섹션 (짧게)

### Scope (범위)

- `#profileCard` + `card.state === "confirmed"` / `is-done` 표시만.
- 종목 라벨 + 완주 시간(있을 때) + PB 또는 DNS/DNF.
- 기존 완료 프롬프트·그린 카드 스타일 유지.
- 데이터: `confirmResult` (`my-pending-result`) + 거리 폴백.

### UI

- 권장안 **A**: `.profile-time` + `.profile-sub`, pending과 동일 계층.
- bib-face / 배번 / 「대회 기록」 딥링크 / 수정 버튼: done에서 추가하지 않음.

### Data

- 신규 API 없음.
- 시각: `confirmDisplayTime`.
- DNS/DNF: `dnStatus` **또는** `status` ∈ {dns,dnf} (대소문자 무시) → 표시는 `DNS`/`DNF`.
- PB: `pbConfirmed === true` 이고 DNS/DNF 아닐 때만.

### Non-goals (비범위)

- 신규·변경 HTTP API / `my-pending-result` 응답 정규화(후속 가능)
- `wait` / `pending` / `bib` / `manual` / 버스 카드 변경
- 재확정·수정 UX, races/roster 딥링크 CTA
- 순위·건타임 병기·PB 자동 계산(체크 값만)
- 데이터 사전 `race_results.status` 문서 보강(dns/dnf) — 별도 문서 작업

---

## 6. 성공 기준 (승인 후 구현·검증용)

- 완주+PB: 큰 시간 + `종목 · PB`, 완료 문구 유지, `is-done` 유지.
- DNS/DNF: 시간 없음 + `종목 · DNS|DNF`, PB 미표시.
- PB 미체크 완주: 시간 + 종목만.
- 콘솔 오류 없음. 기존 pending/wait/bib 회귀 없음.
- 단위: `confirmDoneSummary` + `renderProfileCard` confirmed 분기 존재 스모크.

---

## 7. 승인 질문

이 설계(권장안 **A**, 신규 API 없음, `status` 기반 DNS/DNF 해석)로 구현에 들어가도 될까요?
