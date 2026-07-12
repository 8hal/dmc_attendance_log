# 춘백 S3 v0.1.0-alpha.2

> **상태:** **준비됨 — 미배포·미태그**  
> **대상:** 출정식(7/16) 전 Hosting 갱신 (alpha.1 FE가 아직 프로덕션에 없으면 **한 번에** 배포)  
> **브랜치:** `cursor/cloud-agent-1783816981460-v32r8`  
> **Git 태그:** `chunbaek-v0.1.0-alpha.2` (배포 성공 후 생성)

---

## 배포 목표

카톡·SNS **링크 미리보기(OG)** 가 목업 문구 대신 실서비스 안내로 보이게 한다.  
alpha.1 FE가 Mac에 아직 안 올라갔다면, 이번 배포로 **알파 1 전체 + OG 수정**을 한꺼번에 반영한다.

## 성공 기준

| # | 확인 |
|---|------|
| 1 | `chunbaek/VERSION` → `0.1.0-alpha.2` (앱 `meta app-version`) |
| 2 | 카톡에 `https://dmc-attendance.web.app/chunbaek/` 공유 시 제목 **「춘백 S3 — 100일 출석」** (목업 없음) |
| 3 | OG description에 **7/20 시작·온보딩** 안내 (가상 데이터 문구 없음) |
| 4 | alpha.1 성공 기준([alpha.1 §성공 기준](./chunbaek-v0.1.0-alpha.1.md)) 회귀 없음 |

## 실패 기준 (롤백 검토)

- 온보딩·API 회귀, OG만 깨짐은 Hosting 롤백 검토

---

## 포함 변경 (이번 번들)

### Hosting (`chunbaek/index.html`)

| 항목 | 이전 (프로덕션 잔존) | alpha.2 |
|------|---------------------|---------|
| `og:title` | `춘백 S3 — 100일 출석 (목업)` | `춘백 S3 — 100일 출석` |
| `og:description` | 가상 데이터·미리보기 | 7/20 시작·온보딩 안내 |
| `og:url` | 없음 | `https://dmc-attendance.web.app/chunbaek/` |
| `og:image` | 없음 | `assets/dmc_logo.png` |
| `og:site_name` | 없음 | `동마클 출석` |
| `meta description` | 짧은 한 줄 | 7/20·온보딩 포함 |

### 운영진 admin (`chunbaek/js/admin.js`)

- 로그인 후 **오늘(KST) 날짜 기준 주차**가 출석 그리드·훈련 입력에 자동 선택
- 시즌 시작 전(7/20 이전)에는 **0주차 (베타)** 기본
- 백엔드 `defaultWeekForAdmin` · `findWeekForDate` 연동

### 0주차 베타 (`week: 0`, dayIndex 901~907)

- 기간 **7/13~7/19** — 본시즌 1주차와 **데이터·집계 분리**
- 베타 기간 **출석 UX** 가능, **시즌 출석률·팀 weekMet 제외**
- 시드: `node scripts/seed-chunbaek-week0.js` (dry-run → 승인 → 실행)
- 스펙: `_docs/superpowers/specs/2026-07-12-chunbaek-week0-beta-design.md`

### 버전

- `chunbaek/VERSION` → `0.1.0-alpha.2`

### alpha.1과의 관계

| 프로덕션 상태 | 이번 배포 의미 |
|--------------|----------------|
| alpha.1 FE **미반영** (현재) | alpha.1 전체 + OG = **첫 실서비스 FE 배포** |
| alpha.1 FE **이미 반영** | OG·메타만 핫픽스 |

Functions 변경 **없음** — Hosting만 배포해도 OG 반영됨.  
다만 alpha.1 FE가 아직이면 `deploy-chunbaek.sh` **일괄** 권장.

---

## 배포 절차 (사용자 실행)

**전제:** Node **22** (`nvm use 22`)

```bash
cd ~/git/dmc_attendance_log
git pull origin cursor/cloud-agent-1783816981460-v32r8

# alpha.1 FE 미반영 시 — 일괄 (Functions + Hosting)
bash scripts/deploy-chunbaek.sh

# alpha.1 FE 이미 반영·OG만 갱신 시 — Hosting만
# bash scripts/deploy-chunbaek-gallery.sh
```

### 배포 후 — 카톡 OG 캐시

카톡은 OG를 **오래 캐시**한다. 배포 직후에도 예전 「목업」 미리보기가 보일 수 있다.

1. [카카오 링크 미리보기 캐시 초기화](https://developers.kakao.com/tool/clear/og)에서 URL 입력:
   - `https://dmc-attendance.web.app/chunbaek/`
2. 다시 공유해 제목·설명 확인

### 태그 (배포 성공 후)

```bash
git tag -a chunbaek-v0.1.0-alpha.2 -m "춘백 S3 alpha.2 — OG 실서비스 문구"
git push origin chunbaek-v0.1.0-alpha.2
```

---

## 배포 상태

| 항목 | 상태 |
|------|------|
| 코드·VERSION | ✅ 준비됨 |
| Git 태그 | ⏳ 배포 후 |
| 프로덕션 OG | ⏳ 여전히 목업 문구 (이전 Hosting) |

---

## 참고

- alpha.1 릴리스: [chunbaek-v0.1.0-alpha.1.md](./chunbaek-v0.1.0-alpha.1.md)
- `?preview=1` 화면 상단 목업 배너는 **의도적 유지** (OG와 별개)
