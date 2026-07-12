# 춘백 시즌3 — 운영 준비 (Ops Prep)

> **작성일:** 2026-07-16  
> **상태:** 운영 준비 착수  
> **대회:** 춘천마라톤 2026-10-25 (일)

---

## 1. 일정 확정

| 일정 | 날짜 | 요일 | 비고 |
|------|------|------|------|
| **출정식** | **2026-07-16** | 수 | 저녁 (프로그램 시작 전날) |
| **D-100 / 1일차** | **2026-07-17** | 금 | 100일 훈련 시작 |
| **100일차** | **2026-10-24** | 토 | 마지막 슬롯 (동마클 토요 정모 겹침) |
| **춘천마라톤** | **2026-10-25** | 일 | 대회 당일 (슬롯 밖) |

```
7/16(수) 출정식
7/17(금) ───────── 100일 ─────────► 10/24(토) 100일차
                                         10/25(일) 춘천마라톤
```

### 시즌 config (시드 값)

| 필드 | 값 |
|------|-----|
| `startDate` | `2026-07-17` |
| `endDate` | `2026-10-24` |
| `raceDate` | `2026-10-25` |
| `weeklyTarget` | `3` |
| `photoRequired` | `false` |

---

## 2. 기술 현황 (2026-07-16)

| 구성 | 상태 |
|------|------|
| Functions `chunbaek` | ✅ 배포됨 |
| Hosting (`chunbaek/`) | ✅ 배포됨 |
| Admin API 6개 | ✅ 구현·배포 |
| `chunbaek_season_config` | ❌ 프로덕션 미적용 |
| `chunbaek_slots` 100건 | ❌ 프로덕션 미적용 |
| `members.chunbaekS3.participant` | ❌ ~40명 미적용 |

---

## 3. 운영 준비 체크리스트

### Phase A — 시즌 골격 (출정식 전, ~7/16)

| # | 작업 | 담당 | 스크립트/도구 |
|---|------|------|----------------|
| A1 | 100일 슬롯 골격 CSV 생성 | AI/운영 | `node scripts/generate-chunbaek-slot-skeleton.js` |
| A2 | season_config + slots 시드 **dry-run** | 운영진 확인 | `node scripts/seed-chunbaek-season.js --dry-run` |
| A3 | season_config + slots 시드 **실행** | 운영진 승인 후 | `node scripts/seed-chunbaek-season.js` |
| A4 | 참가자 ~40명 명단 확정 | 운영진 | 단톡·출정식 명단 |
| A5 | participant 시드 **dry-run** | 운영진 확인 | `node scripts/seed-chunbaek-participants.js --input=... --dry-run` |
| A6 | participant 시드 **실행** | 운영진 승인 후 | `node scripts/seed-chunbaek-participants.js --input=...` |
| A7 | Firestore 백업 | 운영진 | `cd functions && node ../scripts/backup-firestore.js` |

### Phase B — 출정식 당일 (7/16 저녁)

| # | 작업 | 비고 |
|---|------|------|
| B1 | 회원 URL 공유 (단톡) | `https://dmc-attendance.web.app/chunbaek/` (**preview=1 없이**) |
| B2 | 운영진 URL 공유 (비공개) | `https://dmc-attendance.web.app/chunbaek/admin.html` |
| B3 | 출정식 안내 | 온보딩 5단계, 주 3회, 토요=동마클+춘백 각각 출석 |
| B4 | 1주차 훈련표 입력 | admin → 훈련 입력 → `admin-save-week-slots` |

### Phase C — 7/17(금) 개시일

| # | 작업 | 확인 |
|---|------|------|
| C1 | 회원 `members-roster`에 ~40명 노출 | API 또는 앱 ② 명단 |
| C2 | `today-slot` 1일차 반환 | date=2026-07-17 |
| C3 | 테스트 계정 온보딩 E2E | create-profile → 출석 |
| C4 | admin-grid 1주차 | 출석 그리드 로드 |

### Phase D — 시즌 중 (매주)

| # | 작업 | 주기 |
|---|------|------|
| D1 | 다음 주 훈련표 입력 | 주 1회 (admin 훈련 입력) |
| D2 | 미출석·주 3회 미달 확인 | admin 출석 그리드 |
| D3 | 예외 처리 | 단톡 사전 알림 → admin 예외 |
| D4 | 합류자 추가 | `participant: true` (스크립트 또는 admin 확장 API) |

---

## 4. 시드 실행 순서 (확정)

```bash
# 0. 백업 (필수)
cd functions && node ../scripts/backup-firestore.js

# 1. 슬롯 골격 (이미 생성됨)
node scripts/generate-chunbaek-slot-skeleton.js
# → scripts/data/chunbaek-s3-slots-100days.csv

# 2. 시즌 config + 100슬롯 — dry-run 먼저
node scripts/seed-chunbaek-season.js --dry-run
# 확인 후
node scripts/seed-chunbaek-season.js

# 3. 참가자 명단 작성
node scripts/plan-chunbaek-participants.js \
  --baseline=scripts/data/members-firestore-snapshot.json \
  --file=scripts/data/chunbaek-s3-names.txt \
  --out=scripts/data/chunbaek-s3-participants.json

# 4. participant — dry-run 먼저
node scripts/seed-chunbaek-participants.js \
  --input=scripts/data/chunbaek-s3-participants.json --dry-run
# 확인 후
node scripts/seed-chunbaek-participants.js \
  --input=scripts/data/chunbaek-s3-participants.json
```

> **규칙:** Firestore 수정은 반드시 `--dry-run` → 운영진 승인 → 실행 (`.cursor/skills/firestore-data-modification/SKILL.md`)

---

## 5. 참가자 명단 — 필요한 입력

운영진이 아래 중 하나를 제공해야 합니다.

1. **실명 목록** (출정식 명단) → `scripts/data/chunbaek-s3-names.txt` 한 줄에 한 명
2. **members doc id 목록** → `chunbaek-s3-participants.json`에 직접 기입

명단 매칭 보조:

```bash
node scripts/plan-chunbaek-participants.js \
  --baseline=scripts/data/members-firestore-snapshot.json \
  --names=김재연,이유창 \
  --out=scripts/data/chunbaek-s3-participants.json
```

baseline 스냅샷이 오래됐으면 MCP/API로 최신 `members` export 후 `--baseline` 갱신.

---

## 6. 1주차 훈련표 (7/17~7/23)

| 일차 | 날짜 | 요일 | 비고 |
|------|------|------|------|
| 1 | 7/17 | 금 | 개시일 |
| 2 | 7/18 | 토 | |
| 3 | 7/19 | 일 | |
| 4 | 7/20 | 월 | |
| 5 | 7/21 | 화 | |
| 6 | 7/22 | 수 | |
| 7 | 7/23 | 목 | 1주차 마감(일요일 23:59 KST 규칙은 해당 주 일요일) |

1주차 일요일 = 7/19. 주차 마감은 **7/19 23:59 KST**.

출정식 후 admin **훈련 입력** 탭에서 1주차 제목·내용 입력 → 저장.

---

## 7. 회원·운영진 안내 문구 (단톡용 초안)

### 출정식 후 (7/16)

> 춘백 S3 100일이 내일(7/17)부터 시작합니다.  
> 출석 앱: https://dmc-attendance.web.app/chunbaek/  
> ①~⑤ 온보딩 후 매일 [출석하기]를 눌러 주세요.  
> **토요일**은 동마클 정모 출석 + 춘백 출석 **둘 다** 필요합니다.

### 운영진 (비공개)

> admin: https://dmc-attendance.web.app/chunbaek/admin.html  
> 비밀번호: (DMC admin pw)  
> 매주 훈련표 입력 · 출석/예외는 출석 그리드에서 처리

---

## 8. 산출물

| 파일 | 용도 |
|------|------|
| `scripts/data/chunbaek-s3-slots-100days.csv` | 100일 날짜·주차 골격 |
| `scripts/data/chunbaek-s3-participants.template.json` | 참가자 JSON 템플릿 |
| `scripts/generate-chunbaek-slot-skeleton.js` | 골격 재생성 |
| `scripts/seed-chunbaek-season.js` | season_config + slots |
| `scripts/seed-chunbaek-participants.js` | participant 플래그 |
| `scripts/plan-chunbaek-participants.js` | 실명→doc id 매칭 |

---

## 9. 다음 액션 (지금)

1. **운영진:** 참가자 실명 ~40명 목록 제공 (`chunbaek-s3-names.txt`)
2. **AI/운영:** `seed-chunbaek-season.js --dry-run` 결과 공유 → 승인 후 실행
3. **운영진:** 1주차 훈련표 초안 준비 (출정식 전 admin에 입력 가능)

---

## 10. 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-07-16 | 운영 준비 문서 작성 — D-100=7/17, 출정식=7/16 확정 |
| 2026-07-16 | 100슬롯 골격 CSV·시드 스크립트 추가 |
