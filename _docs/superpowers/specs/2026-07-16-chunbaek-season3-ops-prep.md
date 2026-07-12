# 춘백 시즌3 — 운영 준비 (Ops Prep)

> **작성일:** 2026-07-16  
> **상태:** 운영 준비 착수  
> **시즌 대회:** 춘천 마라톤 10/25(일) · 2026 JTBC 서울마라톤 11/1(일)

---

## 1. 일정 확정

> **근거:** 디모 감독 카페 공지 (2026-07-07) — 「100일 준비를 **7월 20일** 시작」

| 일정 | 날짜 | 요일 | 비고 |
|------|------|------|------|
| **발대식·출정식** | **2026-07-16** | 목 | 저녁 (프로그램 시작 **4일 전**) |
| **1일차 (공식 시작)** | **2026-07-20** | 월 | 100일 훈련 시작 |
| **98일차** | **2026-10-25** | 일 | **춘천 마라톤** 당일 |
| **100일차** | **2026-10-27** | 화 | 마지막 훈련 슬롯 |
| **JTBC 서울마라톤** | **2026-11-01** | 일 | 100일 종료 5일 후 (슬롯 밖) |

```
7/16(목) 발대식·출정식
7/20(월) ───────── 100일 훈련 ─────────► 10/27(화) 100일차
                        │ 10/25(일) 춘천 마라톤 (98일차)
                        │
                   11/1(일) JTBC 서울마라톤
```

> **두 대회를 구분한다.**  
> - **춘천 마라톤(10/25):** 100일 프로그램 **안** — 98일차. 당일 슬롯은 훈련일이며, 운영진이 admin에서 「춘천 마라톤」 등으로 라벨 입력.  
> - **JTBC 서울마라톤(11/1):** 100일 프로그램 **밖** — 10/27 종료 후 5일 뒤.

### 참가자별 목표 대회 (참고)

**참가자마다 목표 대회가 다르다.** 한 시즌에 두 대회가 있지만, 개인 목표는 둘 중 하나(또는 둘 다)일 수 있다.

| 유형 | 예시 | 비고 |
|------|------|------|
| **춘천 마라톤 목표** | 10/25 완주가 시즌 목표 | 98일차가 개인 「대회일」 |
| **JTBC 서울마라톤 목표** | 11/1 완주가 시즌 목표 | 100일 훈련 후 추가 1주 |
| **둘 다** | 춘천 → 서울 2회 참가 | 중간·최종 레이스 모두 |

**앱·데이터 (MVP):**

- 개인별 「어느 대회가 목표인지」 **별도 필드는 없음** (Phase 2 검토).
- 온보딩 **`goalMarathonNetTime`**(완주 목표 기록) + **`resolutionText`**(각오)로 개인 목표를 표현.
- 팀 화면에는 **목표 기록(시간)** 만 공개 — 춘천/JTBC 구분은 UI에 표시하지 않음.
- `season_config.raceName` / `raceDate`는 **시스템 기본값**(JTBC 서울) — 개인 목표와 1:1 대응 아님.
- 운영진은 발대식·단톡에서 「춘천 목표 / 서울 목표」 안내, admin `resolutionText`·메모로 구분 가능.

> **운영 시사점:** 98일차(10/25) 슬롯 라벨은 「춘천 마라톤」으로, 99~100일차는 서울 대회 준비자에게 회복·가벼운 런 등으로 운영진이 주차별 조정.

### 시즌 config (시드 값)

| 필드 | 값 |
|------|-----|
| `startDate` | `2026-07-20` |
| `endDate` | `2026-10-27` |
| `raceName` | `2026 JTBC 서울마라톤` (시스템 기본값, 개인 목표와 무관) |
| `raceDate` | `2026-11-01` |
| `races` | 아래 2건 (시드 시 배열로 저장) |
| `departureCeremonyDate` | `2026-07-16` |
| `weeklyTarget` | `3` |
| `photoRequired` | `false` |

**`races` 배열 (시즌 config):**

| name | date | dayIndex | 비고 |
|------|------|----------|------|
| 춘천 마라톤 | `2026-10-25` | 98 | 참가자 일부의 **개인 목표** 대회 |
| 2026 JTBC 서울마라톤 | `2026-11-01` | — | 참가자 일부의 **개인 목표** 대회, 슬롯 밖 |

### 감독 공지 주간 훈련 템플릿 (참고)

운영진이 admin **훈련 입력**에 채울 때 참고 (매주 변동 가능):

| 요일 | 내용 |
|------|------|
| 월 | 물방울 빌드업 조깅 |
| 화 | 템포런 15km |
| 수 | 둘레길 회복 빌드업 조깅 |
| 목 | 인터벌 (스피드 훈련) |
| 금 | 휴식 또는 강도 낮은 조깅 |
| 토 | 동마클 정모 장거리 훈련 |
| 일 | 회복 조깅 |

- 집합 **5:15** (당겨 볼 예정 — 공지 기준)
- **주 3회**만 참여해도 OK

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

### Phase A — 시즌 골격 (발대식 전, ~7/16 · 시드는 7/20 전까지)

| # | 작업 | 담당 | 스크립트/도구 |
|---|------|------|----------------|
| A1 | 100일 슬롯 골격 CSV 생성 | AI/운영 | `node scripts/generate-chunbaek-slot-skeleton.js` |
| A2 | season_config + slots 시드 **dry-run** | 운영진 확인 | `node scripts/seed-chunbaek-season.js --dry-run` |
| A3 | season_config + slots 시드 **실행** | 운영진 승인 후 | `node scripts/seed-chunbaek-season.js` |
| A4 | 참가자 ~40명 명단 확정 | 운영진 | 단톡·출정식 명단 |
| A5 | participant 시드 **dry-run** | 운영진 확인 | `node scripts/seed-chunbaek-participants.js --input=... --dry-run` |
| A6 | participant 시드 **실행** | 운영진 승인 후 | `node scripts/seed-chunbaek-participants.js --input=...` |
| A7 | Firestore 백업 | 운영진 | `cd functions && node ../scripts/backup-firestore.js` |

### Phase B — 발대식·출정식 (7/16 목 저녁)

| # | 작업 | 비고 |
|---|------|------|
| B1 | 앱 URL 안내 (선공유 가능) | `https://dmc-attendance.web.app/chunbaek/` |
| B2 | 운영진 URL (비공개) | `https://dmc-attendance.web.app/chunbaek/admin.html` |
| B3 | 발대식 안내 | **7/20(월) 시작**, 온보딩·주 3회·토요 이중 출석 |
| B4 | **1주차 훈련표** admin 입력 | 7/20~7/26, 감독 템플릿 참고 |

### Phase C — 7/20(월) 개시일

| # | 작업 | 확인 |
|---|------|------|
| C1 | 회원 `members-roster`에 ~40명 노출 | API 또는 앱 ② 명단 |
| C2 | `today-slot` 1일차 반환 | date=2026-07-20 |
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

## 6. 1주차 훈련표 (7/20~7/26)

| 일차 | 날짜 | 요일 | 감독 템플릿 (초안) |
|------|------|------|-------------------|
| 1 | 7/20 | 월 | 물방울 빌드업 조깅 |
| 2 | 7/21 | 화 | 템포런 15km |
| 3 | 7/22 | 수 | 둘레길 회복 빌드업 조깅 |
| 4 | 7/23 | 목 | 인터벌 (스피드 훈련) |
| 5 | 7/24 | 금 | 휴식 또는 강도 낮은 조깅 |
| 6 | 7/25 | 토 | 동마클 정모 장거리 훈련 |
| 7 | 7/26 | 일 | 회복 조깅 |

1주차 일요일 = **7/26**. 회원 소급 수정 마감은 **7/26 23:59 KST**.

발대식(7/16) 전후로 admin **훈련 입력** 탭에서 1주차 제목·내용 입력 → 저장.

---

## 7. 회원·운영진 안내 문구 (단톡용 초안)

### 발대식 후 (7/16) — 단톡 초안

> 춘백 S3 100일 준비가 **7/20(월)**부터 시작합니다.  
> 출석 앱: https://dmc-attendance.web.app/chunbaek/  
> 미리 온보딩(명단 선택·프로필) 해 두시면 7/20부터 바로 출석 가능합니다.  
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
| 2026-07-16 | 운영 준비 문서 작성 — 출정식=7/16, **시작=7/20**(카페 공지) |
| 2026-07-16 | 100슬롯 골격 CSV·시드 스크립트 추가 |
| 2026-07-16 | 참가자별 목표 대회(춘천/JTBC) 참고 정보 추가 |
