# 확정(done) 프로필 카드 — 기록증(certificate) 톤

**상태:** 설계 초안 · **사용자 승인 대기** (구현 HARD-GATE)  
**선행 합의:** Option 2 「조금 더」 — 종목 + 완주 시간 + PB / DNS·DNF (데이터·엣지 유지)  
**이번 갱신:** 서울하프 모바일 기록증 *느낌*(히어로 시간·계층)을 **동마클 카드 언어**로 옮긴다.  
**범위:** `event-home.html` `#profileCard` 의 `confirmed` / `is-done` 만  
**신규 HTTP API:** 불필요 (`my-pending-result` `result` 재사용)

**관련 문서**
- 구버전 포인터: `_docs/superpowers/specs/2026-08-30-profile-done-record-design.md` → **본 문서로 대체**
- 배번 페이스 패턴: `_docs/superpowers/specs/2026-08-30-profile-bib-face-design.md` (wait 전용; 구조 참조만)
- 선행 에이전트: `bc-47f88184` Option 2 A/B/C 초안 → **본 문서가 시각 계층을 기록증 톤으로 승격**. 데이터·비범위·DNS `status` 해석은 흡수.

**브랜치 참고:** `cursor/profile-done-record-d30f` 에 Option 2 A 조기 구현(`confirmDoneSummary` + `.profile-time`/`.profile-sub`)이 이미 있음. 승인 전 시각 변경 금지. 승인 후 구현은 **본 문서의 권장안(D)으로 시각을 교체**하고, DNS는 `status`/`dnStatus` 둘 다 읽도록 수정.

---

## 1. 오늘 `profileCard` done 상태 (베이스라인)

### 상태 진입

1. `loadConfirmState` → `GET group-events&subAction=my-pending-result&eventId=&nickname=`
2. `EventHomeBadges.confirmPanelFromApi` → `mode: "confirmed"` + `result`
3. `confirmMode = "confirmed"` 이면 `shouldPollConfirm()` 폴링 중단
4. `EventHomeAction.resolveProfileCard` → `state: "confirmed"`,  
   `prompt: "끝. 동마클 대회 기록에 저장됐어요."`
5. `renderProfileCard`: `profileCard.classList.add("is-done")` (연녹 보더/배경)

### 확정 직후 데이터

`self-confirm` 성공 → `refreshHomeState` → `my-pending-result` → `confirmResult` 갱신.  
카드는 API `result`를 다시 그린다 (optimistic 조립 없음).

### 스크린샷 대비

| | 현재 done (프롬프트만 / Option 2 A) | 목표 (기록증 톤) |
|--|--|--|
| 계층 | 문장 1줄 또는 시간+부제 평문 | 배지 → (이름) → **히어로 시간** → 축하/저장 문구 → 풋터 |
| 감정 | 알림/완료 배너 | 기념·축하 카드 (공식 대회 복제 아님) |

---

## 2. 참조 기록증 → DMC 매핑 (복제 금지)

참조: 서울하프 2024 모바일 기록증 (검정 헤더 / 흰 본문 / 파란 풋터 / 빨간 히어로 시간).

| 서울하프 요소 | 가져올 *느낌* | DMC에서의 구현 | 하지 말 것 |
|---|---|---|---|
| 검정 헤더 + 로고 | 상단 프레임 | **생략** 또는 bib-face처럼 **파란 밴드 + 대회명**만 | Seoul/S 로고, 검정 풀폭 헤더 복제 |
| `Half 모바일 기록증` pill | 종목·카드 역할 | 거리 pill (`bib-face-dist` 스타일) + 선택적 `PB` pill | “모바일 기록증” 카피·서울 컬러 pill |
| 참가번호(Bib) | 보조 신원 | `result.bib` / `participant.bib` 있을 때만 작은 메타 | 없을 때 플레이스홀더 |
| 큰 이름 | 주인공 | `identity.nickname` (홈 `nickChip`과 동일 소스). 카드 안 큰 표시 | 실명 신규 조회 |
| **빨간 거대 완주시간** | 히어로 | `.profile-time` 확대 + `--dmc-color-danger` (완주만) | 서울 전용 빨강 hex 복제 강요; DNS에 빨강 |
| 축하 문구 | 감정 한 줄 | 기존 「끝. 동마클…」을 **시간 아래**로 이동하거나 유지+약화 | 대회 공식 축하 문장 복제 |
| 날짜 | 맥락 | `cachedEvent` 날짜 라벨 있을 때만 작은 줄 | 가짜 날짜 |
| 파란 풋터 + 면책 | “참고용” | 연한 primary/success 스트립 + 「동마클 저장 기록 · 공식 기록이 아닐 수 있어요」 | 공식 인장·주최사 면책 문구 복제 |

**시각 언어 원칙**
- 셸: 기존 `#profileCard.today-card.is-done` (연녹) 유지 → “저장 완료” 시그널.
- 안쪽: wait의 `.bib-face`처럼 **흰 패널**로 기록증 본문 (카드 속 카드는 상호작용 단위가 아니라 **기념 패널** — 보더/그림자는 bib-face 수준만).
- 토큰: `assets/design-tokens.css` (`--dmc-color-danger`, `--dmc-color-primary`, `--dmc-green-*`, pill radius). AI 퍼플/크림/고대비 검정 테마 금지.

---

## 3. 클라이언트 필드 (신규 API 없음)

`state === "confirmed"` 일 때 `result` = **`race_results` 원본**.

| 필드 | 용도 | 비고 |
|------|------|------|
| `netTime` / `gunTime` / `finishTime` | 히어로 시간 | `confirmDisplayTime` (net→gun→finish, `--:--:--`/`-` 제외) |
| `distance` | 종목 pill | `EventMemberCopy.memberDistanceLabel`; 폴백 `participant.distance` |
| `pbConfirmed` | PB pill | DNS/DNF면 표시·저장 모두 false |
| `status` | 완주 vs DNS/DNF | `"confirmed"` \| `"dns"` \| `"dnf"`. **문서에 `dnStatus` 키는 보통 없음** |
| `bib` | 보조 메타 | 있을 때만 |
| `memberNickname` / identity | 큰 이름 | `activeIdentity.nickname` 우선 |

**DNS/DNF 판정:** `dnStatus` **또는** `status` ∈ {dns,dnf} (대소문자 무시) — `public-roster`의 `publicDnStatus`와 동일.  
조기 구현 `confirmDoneSummary`가 `dnStatus`만 보면 버그 → 승인 후 반드시 `status`도 검사.

**헬퍼:** `confirmDoneSummary` 확장 또는 `confirmCertificateView(result, opts)` →  
`{ timeText, distanceLabel, pb, dnLabel, bib, name, showHeroTime }`  
단위 테스트로 DNS>PB, 빈 result, finishTime 폴백 고정.

---

## 4. 제시 방식 2–3안 + 권장

### A. Pending과 같은 계층 (Option 2 권장안 · *시각 목표 미달*)

```
[끝. 동마클 대회 기록에 저장됐어요.]
1:42:18
하프 · PB
```

- 장점: DOM/CSS 최소, 이미 브랜치에 구현됨.
- 단점: 기록증 히어로·배지·풋터 없음. **사용자 요청(기록증 톤) 미충족.**

### B. 시간만 키우고 빨강 (얕은 기록증)

평문 레이아웃 유지 + `.profile-time` 36–44px + danger 색 + PB를 pill로.

- 장점: 변경 면적 작음.
- 단점: 헤더/본문/풋터 계층이 약해 “배너에 큰 숫자”로 끝남.

### C. 서울형 3단 풀카드 (비권장)

검정 헤더 + 흰 본문 + 하늘색 풋터를 `#profileCard` 전체에 적용.

- 장점: 참조와 유사.
- 단점: DMC `is-done` 그린·today-card와 충돌, 브랜드 복제 위험. **기각.**

### D. bib-face형 기록증 패널 (권장)

`is-done` 카드 안에 흰 `.result-cert` (또는 `.bib-face` 변형) 패널:

```
┌─ #profileCard.is-done (연녹 셸) ─────────────────┐
│  (선택) 짧은 kicker — 생략 가능                    │
│  ┌─ .result-cert (흰 패널) ─────────────────────┐ │
│  │  [하프]  [PB?]                                 │ │
│  │  배번 2543          ← bib 있을 때만             │ │
│  │  게살볶음밥           ← nickname, 크게           │ │
│  │  01:42:18             ← 히어로, danger red     │ │
│  │  끝. 동마클 대회 기록에 저장됐어요.              │ │
│  │  2026년 …             ← 이벤트 날짜 있을 때만    │ │
│  ├─ .result-cert-foot (연한 primary 스트립) ──────┤ │
│  │  동마클 저장 기록 · 공식 기록이 아닐 수 있어요     │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

- **장점:** 서울하프의 *계층*(배지→이름→히어로 시간→문구→면책)을 가져오면서 색·모서리·토큰은 DMC/bib-face와 연속. Option 2 필드 요구 충족. 신규 API 없음.
- **단점:** CSS·마크업 약간 증가; `profilePrompt` 위치 조정 필요.
- **권장: D**

카피: 「끝. …」 유지 (축하 감정은 레이아웃이 담당). CTA/딥링크 추가 없음.

---

## 5. DNS / DNF / PB 엣지

| 케이스 | 동작 |
|--------|------|
| **완주 + PB** | 거리 pill + PB pill. 히어로 `timeText` (danger). 풋터 표시 |
| **완주 · PB 없음** | 거리 pill만. 히어로 시간. PB pill 숨김 |
| **DNS / DNF** | 히어로 시간 **숨김**. 큰 상태 텍스트 `DNS`/`DNF` (slate, danger 아님). PB 무시. 거리 pill 유지. 저장 문구 유지. 풋터 유지 |
| **거리 없음** | pill 생략. `unknown` → 「종목 미정」만 쓸지 / 아예 숨길지: **숨김 우선** (빈 pill 금지) |
| **시간 없고 완주 confirmed** | 히어로 숨김. 이름+종목+저장 문구만 (데이터 공백 방어) |
| **bib 없음** | bib 줄 숨김 |
| **nickname 없음** | 이름 줄 숨김 (게스트 confirmed 경로 없음이 기본) |
| **재확정** | 홈에 수정 CTA 없음. 새로고침 시 `my-pending-result` 반영 |
| **self-confirm 직후** | `refreshHomeState`로 즉시 반영 |

---

## 6. Scope / Non-goals

### Scope

- `#profileCard` + `confirmed` / `is-done` 시각만 (권장안 D).
- 필드: 종목, 완주시간 또는 DNS/DNF, PB(해당 시), nickname/bib(있을 때).
- 데이터: 기존 `confirmResult` + identity/participant 폴백.
- 조기 구현의 DNS `status` 해석 수정은 본 시각 작업에 포함.

### Non-goals

- 신규·변경 HTTP API / `my-pending-result` 응답에 `dnStatus` 정규화 (후속·별도 승인)
- 서울하프·주최사 로고/브랜드/카피/컬러 팔레트 복제
- 가짜 공식 인장·QR·공유 이미지·다운로드
- `wait` / `pending` / `bib` / `manual` / 버스 카드 변경 (bib-face wait는 그대로)
- 재확정·수정 UX, races/roster 딥링크 CTA
- 순위·건타임 병기·PB 자동 계산
- 전체 홈을 “증명서 앱”으로 재브랜딩

---

## 7. 성공 기준 (승인 후 구현·검증)

- 완주+PB: 흰 패널 안 거리·PB pill, 큰 danger 시간, 저장 문구, 연녹 `is-done`, 풋터 면책.
- DNS/DNF: 빨간 시간 없음, `DNS`/`DNF` 히어로, PB 없음.
- 콘솔 오류 없음. wait bib-face / pending 확인 플로우 회귀 없음.
- 단위: summary/certificate 헬퍼 + confirmed 분기 스모크 (기존 `event-home-done-record` / badges 테스트 확장).

---

## 8. 승인 질문

기록증 톤 **권장안 D**(bib-face형 흰 패널 + 히어로 시간 + DMC 토큰, 서울 브랜딩 없음) + 신규 API 없음 + `status`/`dnStatus` DNS 해석으로 구현에 들어가도 될까요?
