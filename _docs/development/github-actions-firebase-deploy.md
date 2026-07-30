# GitHub Actions — Firebase 모바일 배포

모바일(GitHub 앱)에서 **Run workflow**로 Hosting / Functions 배포.

워크플로 2개:

| Actions 이름 | 용도 |
|--------------|------|
| **Deploy Chunbaek (Firebase)** | 춘백 FE/API 핫픽스 |
| **Deploy DMC Attendance (Firebase)** | 출석 Hosting / attendance(+race) API |

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
| HTTPS Functions (`chunbaek`, `attendance`, `race`) | 위 + `Cloud Functions Developer`, `Service Account User` |
| **Functions 전체** (`functions-all`, 스케줄 잡 포함) | 위 + **`Cloud Scheduler Admin`** (`roles/cloudscheduler.admin`) |
| 운영 단순화 | `Firebase Admin` + `Cloud Scheduler Admin` |

> **2026-07-19 장애:** `functions`(전체) 배포 시 스케줄 함수에 `cloudscheduler.jobs.update` 403 → 워크플로가 실패하고 Hosting이 스킵됨.  
> 출석 모바일 배포 기본값은 **스케줄 없는** `functions-attendance` / `hosting-and-attendance` 입니다.

### 1-2. GitHub Secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Name | Value |
|------|--------|
| `FIREBASE_SERVICE_ACCOUNT_DMC_ATTENDANCE` | 다운로드한 JSON **전체** (한 줄로 붙여넣기) |

---

## 2. 워크플로 파일 반영

아래 파일이 **default branch(main)** 에 있어야 GitHub 앱 Actions 목록에 최신 옵션이 보입니다.

- `.github/workflows/deploy-chunbaek.yml`
- `.github/workflows/deploy-dmc-attendance.yml`

---

## 3. 모바일에서 배포 — 출석 (DMC Attendance)

1. GitHub 앱 → `8hal/dmc_attendance_log` repo
2. **Actions** 탭
3. 왼쪽 **Deploy DMC Attendance (Firebase)** 선택
4. **Run workflow**
5. Branch: 보통 `main` (워크플로 수정 직후면 해당 브랜치)
6. **deploy_target** 선택:

| 값 | 의미 | 권장 |
|----|------|------|
| `hosting` | FE만 | UI만 올릴 때 |
| `functions-attendance` | `attendance`만 | API만 |
| `functions-attendance-race` | `attendance` + `race` | 허브 회원 API까지 |
| `hosting-and-attendance` | attendance → Hosting | **출석 앱 일반 배포** |
| `functions-all` | Functions **전부**(스케줄 포함) | Scheduler Admin IAM 있을 때만 |

7. 실행 → 초록 체크

### 배포 후 확인

1. https://dmc-attendance.web.app/attendance-v2.html
2. Functions 포함 시: 출석 체크인 / 운영 허브

설계: `_docs/superpowers/specs/2026-07-19-mobile-firebase-deploy-design.md`

---

## 4. 모바일에서 배포 — 춘백만

1. **Deploy Chunbaek (Firebase)**
2. `hosting` / `functions-chunbaek` / `hosting-and-chunbaek`

확인: https://dmc-attendance.web.app/chunbaek/

---

## 5. 로컬 배포와의 관계

| | 로컬 `firebase deploy` | GitHub Actions |
|--|------------------------|----------------|
| 실행 주체 | 개발자 맥/PC | GitHub 러너 |
| 인증 | `firebase login` | 서비스 계정 JSON 시크릿 |
| AI 실행 | ❌ 금지 | ✅ 워크플로 설정만 (사람이 Run) |

로컬 규칙(pre-deploy-test, 백업)은 **수동 배포** 시 그대로.  
Actions는 **모바일 핫픽스**용. 스키마·스케줄 함수 변경은 로컬 또는 `functions-all`(+ Scheduler IAM).

Hosting은 체크아웃한 **커밋 HEAD** 기준입니다 (미푸시 로컬 수정 미포함).

---

## 6. 문제 해결

| 증상 | 조치 |
|------|------|
| Actions에 워크플로/옵션 없음 | YAML이 **main**에 있는지, 앱 새로고침 |
| `cloudscheduler.jobs.update` 403 | `functions-all` 말고 `functions-attendance` 사용. 또는 SA에 Cloud Scheduler Admin 부여 |
| `credentials_json` 실패 | 시크릿 이름·JSON 확인 |
| Hosting 403 | Hosting Admin |
| attendance smoke 실패 | Functions 전파 대기 후 재실행 |
