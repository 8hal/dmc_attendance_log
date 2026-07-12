# GitHub Actions — 춘백 Firebase 배포

모바일(GitHub 앱)에서 **Run workflow**로 Hosting / Functions 배포.

## 1. 시크릿 등록 (최초 1회, 맥·PC)

### 1-1. GCP 서비스 계정 키 발급

1. [Firebase 콘솔](https://console.firebase.google.com/project/dmc-attendance/settings/serviceaccounts/adminsdk) → **서비스 계정**
2. **새 비공개 키 생성** → JSON 다운로드

또는 [GCP IAM](https://console.cloud.google.com/iam-admin/serviceaccounts?project=dmc-attendance)에서 동일.

**권한 (최소):**

| 배포 대상 | 역할 |
|-----------|------|
| Hosting만 | `Firebase Hosting Admin` |
| Functions `chunbaek` | 위 + `Cloud Functions Developer`, `Service Account User` |
| 둘 다 | `Firebase Admin` (운영 단순화용, 권장) |

### 1-2. GitHub Secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Name | Value |
|------|--------|
| `FIREBASE_SERVICE_ACCOUNT_DMC_ATTENDANCE` | 다운로드한 JSON **전체** (한 줄로 붙여넣기) |

## 2. 워크플로 파일 반영

`.github/workflows/deploy-chunbaek.yml`이 **main** 브랜치에 있어야 GitHub 앱에서 보입니다.

```bash
# feature 브랜치 작업 후 main 머지 (또는 PR 머지)
git checkout main
git pull
# PR 머지 후 확인
```

## 3. 모바일에서 배포

1. GitHub 앱 → `8hal/dmc_attendance_log` repo
2. **Actions** 탭
3. 왼쪽 **Deploy Chunbaek (Firebase)** 선택
4. **Run workflow** (우측 상단)
5. Branch: 배포할 브랜치 선택 (보통 `main` 또는 feature 브랜치)
6. **deploy_target** 선택:
   - `hosting` — FE만 (세션 복원·프로필 수정 등)
   - `functions-chunbaek` — API만
   - `hosting-and-chunbaek` — 둘 다 (Functions 먼저, Hosting 다음 순서)
7. **Run workflow** 실행
8. 실행 중 job 클릭 → 초록 체크 확인

## 4. 배포 후 확인 (모바일 브라우저)

1. https://dmc-attendance.web.app/chunbaek/ 시크릿/일반 탭
2. 로그인 → 홈
3. **새로고침** 후에도 홈 유지 (세션 복원)
4. 나 탭 → 프로필 수정

## 5. 로컬 배포와의 관계

| | 로컬 `firebase deploy` | GitHub Actions |
|--|------------------------|----------------|
| 실행 주체 | 개발자 맥/PC | GitHub 러너 |
| 인증 | `firebase login` | 서비스 계정 JSON 시크릿 |
| AI 실행 | ❌ 금지 | ✅ 워크플로 설정만 (사람이 Run) |

로컬 규칙( pre-deploy-test, 백업 )은 **수동 배포** 시 그대로 적용.  
Actions는 **춘백 FE/API 핫픽스**용으로, Functions 전체·스키마 변경 시에는 로컬 `pre-deploy-test.sh` 후 배포 권장.

## 6. 문제 해결

| 증상 | 조치 |
|------|------|
| Actions 탭에 워크플로 없음 | `deploy-chunbaek.yml`이 default branch에 있는지 확인 |
| `credentials_json` / auth 실패 | 시크릿 이름·JSON 형식 확인 |
| Hosting 403/권한 오류 | 서비스 계정에 Hosting Admin 추가 |
| Functions 배포 실패 | `functions` 폴더 `npm ci` 로그, Cloud Functions Developer 역할 확인 |
