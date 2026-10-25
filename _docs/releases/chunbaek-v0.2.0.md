# 춘백 S3 v0.2.0 — 시즌 마감 개인 성과 리포트

> **상태:** 배포 준비 (체크리스트·테스트 후 프로덕션 반영)  
> **대상:** 시즌3 마감(2026-10-27) 전 개인 성과 확인·대회 기록 등록  
> **브랜치:** `cursor/chunbaek-season-report-762d`  
> **Git 태그:** `chunbaek-v0.2.0` (배포 성공 후) · 저장소 태그 `v0.21.0` (배포 성공 후)

---

## 배포 목표

춘백 회원이 홈 배너와 `[나]` 탭에서 시즌 성과 페이지(`#view-report`)로 들어가, 100일 출석 요약과 최고 대회 1건(완주 Net Time / DNF / DNS)을 등록·비교할 수 있게 한다.

- **배포 범위:** `functions:chunbaek` → Hosting → `storage` (기록증 경로 규칙)
- **신규 HTTP action 없음.** 기존 `update-profile` / `my-profile` / `team-summary` 확장.

## 성공 기준

| # | 확인 |
|---|------|
| 1 | `chunbaek/VERSION` 및 `<meta name="app-version">` → `0.2.0` |
| 2 | `https://dmc-attendance.web.app/chunbaek/` 에 `#view-report`, `#season-report-banner`, `js/ocr.js` |
| 3 | `GET https://dmc-attendance.web.app/api/chunbaek?action=ping` → `"ok":true` |
| 4 | 로그인 후 홈 배너 → 성과 페이지, 완주/DNF/DNS 저장 후 `my-profile`에 `seasonResult` |
| 5 | 기존 출석·프로필·팀 보드 회귀 없음 |

## 실패 기준 (롤백)

- `pre-deploy-test.sh` 실패
- ping 실패 또는 기존 `update-profile` 깨짐
- Hosting이 `main`보다 뒤처져 응원 보드(`lab/cheer`, #91)를 덮어씀 — 이 브랜치는 배포 전 `origin/main`을 머지함

롤백: 직전 Hosting/`functions:chunbaek` 리비전으로 되돌리고 태그 `chunbaek-v0.1.0-alpha.2` 기준을 참고.

---

## 포함 변경

### Functions (`chunbaek`)

- `computeMemberStats`: `seasonTrainingDays`, `seasonDenom`, `seasonExceptionCount`, `seasonWeeksCount`, `seasonWeeksMetCount`, `seasonWeekSummaries`
- `update-profile`: `seasonResult` 단독/동시 저장, 기록증 `imageBase64` → Storage `chunbaek/season-results/chunbaek-s3/{memberId}.jpg`
- `my-profile` / `team-summary`: `seasonResult` 직렬화 (`goalMet`, `pbAchieved`, `raceLabel`)

### Hosting (`/chunbaek/`)

- `#view-report` 개인 성과 뷰 (배지, 대회 폼, 출석 그리드, 주간 칩)
- 홈 `#season-report-banner`, `[나]` `#btn-open-report`
- 클라이언트 OCR (`chunbaek/js/ocr.js`, Tesseract.js lazy load)
- 프리뷰 `?preview=1` + `season-end` 시나리오

### Storage

- `chunbaek/season-results/{seasonId}/{fileName}` jpg 읽기 허용, 쓰기는 Admin SDK만

---

## 배포 절차

**전제:** Node **22**, `firebase login`

```bash
# 1) 테스트
node --test scripts/test/chunbaek-season-report.test.js
bash scripts/pre-deploy-test.sh

# 2) 백업
cd functions && node ../scripts/backup-firestore.js && cd ..

# 3) 일괄 (chunbaek Functions → Hosting)
bash scripts/deploy-chunbaek.sh

# 4) 기록증 경로 규칙
firebase deploy --only storage --project dmc-attendance
```

모바일 핫픽스: GitHub Actions **Deploy Chunbaek (Firebase)** → `hosting-and-chunbaek`. Storage 규칙은 Actions에 없으므로 로컬에서 `firebase deploy --only storage`를 한 번 더 한다.

### 배포 후 확인

```bash
curl -sS "https://dmc-attendance.web.app/api/chunbaek?action=ping"
curl -sS "https://dmc-attendance.web.app/chunbaek/" | grep -E 'view-report|app-version|ocr.js'
```

- 회원: https://dmc-attendance.web.app/chunbaek/
- 프리뷰: https://dmc-attendance.web.app/chunbaek/?preview=1&scenario=season-end#/report

### 태그 (배포 성공 후)

```bash
git tag -a chunbaek-v0.2.0 -m "춘백 S3 v0.2.0 — 시즌 마감 개인 성과 리포트·기록증 OCR"
git tag -a v0.21.0 -m "춘백 S3 시즌 마감 개인 성과 리포트"
git push origin chunbaek-v0.2.0 v0.21.0
```

---

## 참고

- 설계: `docs/superpowers/specs/2026-10-22-chunbaek-season-report-design.md`
- 구현 계획: `docs/superpowers/plans/2026-10-23-chunbaek-season-report-impl.md`
- 이전 릴리스: [chunbaek-v0.1.0-alpha.2.md](./chunbaek-v0.1.0-alpha.2.md)
