# 철원 E2E 기술 검증 테스트 플랜

> **For agentic workers:** 프로덕션 `firebase deploy` 금지. 에뮬 또는 별도 테스트 이벤트만.

**Goal:** 2026 철원 **버스 명단**으로 탑승 흐름을 돌리고, 기록 파이프라인(배번 입력 → 배번 스크랩 → 개인 컨펌 → 명단·결과)은 **2025 철원 SPCT**로 기술 검증한다.

**Architecture:** 참가자 명단 = 버스 명단(40명). 2026 기록 사이트는 미확정. `groupSource`는 샌드박스용 `spct / 2025092102`. 배번 없는 12명은 미참가(스크랩 제외).

**Tech Stack:** event-admin, bus-boarding CSV import, update-bib, group scrape `queryBy=bib`, self-confirm, public-roster, SPCT live search

---

## 0. 범위 (반드시)

| 포함 | 제외 |
|------|------|
| 2026 카페 버스 명단 40명 import · 왕복 탑승 | 2026 철원 **실제 기록** 스크랩 (소스 미확정) |
| 같은 40명을 `participants`로 등록 | 프로덕션 기존 `race_events` 덮어쓰기 |
| 겹치는 회원 **2025 SPCT 배번**으로 bib scrape | 환희 중복 2행 (1명만) |
| 개인 컨펌 → `race_results` → 명단·결과 | 배번 미매칭 12명의 강제 스크랩 |

**테스트 이벤트 ID (에뮬):** `evt_cheorwon_tech`

---

## 1. 준비물

| 파일 | 역할 |
|------|------|
| `scripts/fixtures/cheorwon-2026-bus.csv` | event-admin 버스 CSV (닉네임, 이름, 왕복, 중식) |
| `scripts/fixtures/cheorwon-2025-spct-bib-input.csv` | 수동 배번 입력 시트 28명 + 기대 netTime |
| `scripts/fixtures/cheorwon-tech-check.json` | 메타·다건 선택·무배번 목록 |
| `scripts/seed-emulator-cheorwon-tech-check.js` | 에뮬 시드 |
| `scripts/qa-cheorwon-spct-bib-live.js` | SPCT 실사이트 배번 조회 스모크 (DB 미기록) |

코드 전제: 단체 배번 스크랩 allowlist에 **`spct` 포함**.

---

## 2. 명단 규칙

- 원본 41행 중 **환희/김진석 중복 1건 제거** → 40명.
- 참가자 = 버스 전원. 배번은 처음에 비움.
- 스크랩 대상 = 배번 입력한 사람만.
- 무배번 12명: 레이스, 오구오구, 말아톤, 6스타, 된다, 난닝구, 지미송, 호프로, 바람, 민주아빠, 송송, Josh → 버스만, 결과 파이프라인 제외.
- 다건 6명 배번은 fixture에 **임의 1개** 적어둠. 바꾸려면 CSV만 수정.

---

## 3. 시나리오

### A. 실사이트 배번 조회 (코드/네트워크)

```bash
node scripts/qa-cheorwon-spct-bib-live.js --limit 5
# 전체 28명:
node scripts/qa-cheorwon-spct-bib-live.js
```

성공: `SUMMARY` fail=0, 기대기록과 netTime 일치.

### B. 에뮬 앱 흐름 (신규 버전)

1. 에뮬 기동 후 시드

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator-cheorwon-tech-check.js
```

2. `event-admin.html?eventId=evt_cheorwon_tech` (admin `dmc2008` / scrape는 ownerPw)
   - 소스: **spct / 2025092102** 저장 확인
   - 버스 on, CSV가 이미 시드돼 있으면 인원 40 확인. 아니면 `cheorwon-2026-bus.csv` import
3. `boarding.html` — 하우스 등 몇 명 **가는/오는 탑승**
4. `my-bib.html` 또는 참가자로 `cheorwon-2025-spct-bib-input.csv`의 배번 **최소 3명** 입력  
   권장 스모크 3명: 써니형 `40066`, 하우스 `20294`, 오칠팔이 `10399`
5. event-admin **배번 N명 스크랩**
6. `event-home.html?eventId=evt_cheorwon_tech` 해당 닉으로 **내 기록 확인 · 컨펌**
7. `event-roster.html` — 닉·종목·기록만, 실명·배번 숫자 없음. 컨펌한 사람 `hasResult`

실패 기준:

- scrape 400 `배번 스크랩은 …만 지원` (spct 미허용)
- pending이 안 뜨거나 타인 기록
- 무배번 12명이 scrape 대상에 포함
- public-roster에 실명/배번 필드

### C. 회귀 (기존 QA, 시드 job)

```bash
npm run test:group-scrape-bib
npm run test:self-confirm
npm run test:public-roster
```

라이브 SPCT는 pre-deploy에 넣지 않음 (외부 사이트).

---

## 4. 수동 체크리스트

- [ ] A: live bib 스모크 pass
- [ ] B1: 버스 40명, 왕복 required
- [ ] B2: 탑승 self-board 성공
- [ ] B3: 배번 3명 입력
- [ ] B4: scrape 대상 = 배번 있는 사람만
- [ ] B5: pending → self-confirm → `confirmSource: personal`
- [ ] B6: 명단·결과에 기록, PII 없음
- [ ] 무배번 회원은 스크랩/컨펌 CTA 없음

---

## 5. 2026 본선으로 옮길 때

2026 타이머(`spct` / `smartchip` / `ohmyrace`)와 sourceId가 정해지면:

1. 테스트 이벤트 `groupSource`만 교체
2. 배번 시트는 **2026 실제 배번**으로 교체 (2025 배번은 폐기)
3. 버스 CSV는 그대로 재사용 가능
