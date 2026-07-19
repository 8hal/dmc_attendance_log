# GitHub Actions — Firebase 모바일 배포

모바일(GitHub 앱)에서 **Run workflow**로 Hosting / Functions 배포.

워크플로 2개:

| Actions 이름 | 용도 |
|--------------|------|
| **Deploy Chunbaek (Firebase)** | 춘백 FE/API 핫픽스 |
| **Deploy DMC Attendance (Firebase)** | 출석·전체 Hosting / Functions |

시크릿·서비스 계정은 **공통**입니다.

---

## 1. 시크릿 등록 (최초 1회, 맥·PC)

### 1-1. GCP 서비스 계정 키 발급

1. [Firebase 콘솔](https://console.firebase.google.com/project/dmc-attendance/settings/serviceaccounts/adminsdk) → **서비스 계정**
2. **새 비공개 키 생성** → JSON 다운로드

또는 [GCP IAM](https://console.cloud.google.com/iam-admin/serviceaccounts?project=dmc-attendance)에서 동일.

**권한 (최소):**

| 배포 대상 | 역할 |
|-----------|------|
| Hosting만 | `Firebase Hosting Admin` |
| Functions (chunbaek 또는 전체) | 위 + `Cloud Functions Developer`, `Service Account User` |
| 둘 다 / 전체 | `Firebase Admin` (운영 단순화용, 권장) |

### 1-2. GitHub Secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Name | Value |
|------|--------|
| `FIREBASE_SERVICE_ACCOUNT_DMC_ATTENDANCE` | 다운로드한 JSON **전체** (한 줄로 붙여넣기) |

---

## 2. 워크플로 파일 반영

아래 파일이 **default branch(main)** 에 있어야 GitHub 앱 Actions 목록에 보입니다.

- `.github/workflows/deploy-chunbaek.yml`
- `.github/workflows/deploy-dmc-attendance.yml`

```bash
# feature 브랜치 작업 후 main 머지 (또는 PR 머지)
git checkout main
git pull
```

---

## 3. 모바일에서 배포 — 출석/전체 (DMC Attendance)

1. GitHub 앱 → `8hal/dmc_attendance_log` repo
2. **Actions** 탭
3. 왼쪽 **Deploy DMC Attendance (Firebase)** 선택
4. **Run workflow** (우측 상단)
5. Branch: 배포할 브랜치 (보통 `main`)
6. **deploy_target** 선택:
   - `hosting` — FE만 (출석 셸·허브 HTML/JS)
   - `functions` — Cloud Functions **전체**
   - `hosting-and-functions` — Functions 먼저 → Hosting
7. **Run workflow** 실행
8. job 초록 체크 확인

### 배포 후 확인 (모바일 브라우저)

1. https://dmc-attendance.web.app/attendance-v2.html (시크릿/일반)
2. Functions 포함 시: 출석 체크인 또는 운영 허브 로그인 스모크

설계: `_docs/superpowers/specs/2026-07-19-mobile-firebase-deploy-design.md`

---

## 4. 모바일에서 배포 — 춘백만

1. GitHub 앱 → 같은 repo → **Actions**
2. **Deploy Chunbaek (Firebase)** 선택
3. **Run workflow**
4. Branch 선택
5. **deploy_target**:
   - `hosting` — FE만
   - `functions-chunbaek` — 춘백 API만
   - `hosting-and-chunbaek` — 둘 다 (Functions 먼저)
6. 실행 → 초록 체크

### 배포 후 확인

1. https://dmc-attendance.web.app/chunbaek/
2. 로그인 → 홈 → 새로고침 후 세션 유지

---

## 5. 로컬 배포와의 관계

| | 로컬 `firebase deploy` | GitHub Actions |
|--|------------------------|----------------|
| 실행 주체 | 개발자 맥/PC | GitHub 러너 |
| 인증 | `firebase login` | 서비스 계정 JSON 시크릿 |
| AI 실행 | ❌ 금지 | ✅ 워크플로 설정만 (사람이 Run) |

로컬 규칙(pre-deploy-test, 백업)은 **수동 배포** 시 그대로 적용.  
Actions는 **모바일 핫픽스**용. 스키마·대규모 Functions 변경은 로컬 `pre-deploy-test.sh` 후 배포 권장.

**주의:** Hosting `public`이 `.`이므로 Actions는 **체크아웃한 커밋(브랜치 HEAD)** 기준으로 올립니다. 미푸시 로컬 수정은 포함되지 않습니다.

---

## 6. 문제 해결

| 증상 | 조치 |
|------|------|
| Actions 탭에 워크플로 없음 | YAML이 **main**(default branch)에 있는지 확인 |
| `credentials_json` / auth 실패 | 시크릿 이름·JSON 형식 확인 |
| Hosting 403/권한 오류 | 서비스 계정에 Hosting Admin 추가 |
| Functions 배포 실패 | `functions` `npm ci` 로그, Cloud Functions Developer 역할 |
| attendance smoke 실패 | Functions 배포 지연 후 재실행, URL·리전 확인 |
