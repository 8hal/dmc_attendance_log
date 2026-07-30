# DMC Attendance 모바일 Firebase 배포 (GitHub Actions)

> 승인: 2026-07-19 — 선택형 deploy_target  
> 선행: 춘백 `deploy-chunbaek.yml` + `_docs/development/github-actions-firebase-deploy.md`  
> 수정: 2026-07-19 — Scheduler IAM 403 후 대상 분리

## 목표

휴대폰 GitHub 앱에서 **Run workflow**로 `dmc-attendance` Hosting·Functions를 배포한다.

## 결정

| 항목 | 내용 |
|------|------|
| 방식 | 춘백 워크플로 **복제** (신규 YAML) |
| 시크릿 | `FIREBASE_SERVICE_ACCOUNT_DMC_ATTENDANCE` 재사용 |
| 트리거 | `workflow_dispatch`만 |
| 대상 | `hosting` · `functions-attendance` · `functions-attendance-race` · `hosting-and-attendance` · `functions-all` |
| 순서 | Functions → Hosting (`hosting-and-attendance`) |
| 스모크 | Hosting: `/attendance-v2.html` 200 · Functions: attendance `status` ok |
| 비범위 | AI 직접 deploy · Actions 내 pre-deploy-test/백업 · 자동 push 배포 |

## 장애 노트 (2026-07-19)

초기 `hosting-and-functions`가 Functions **전체**를 올려 스케줄 잡에 `cloudscheduler.jobs.update` 403.  
`attendance`/`race`/`chunbaek` 등 HTTPS는 성공했으나 워크플로 실패 → Hosting 스킵.  
→ 스케줄 없는 attendance(+race) 경로를 기본으로 분리. `functions-all`은 Cloud Scheduler Admin 필요.

## 파일

- `.github/workflows/deploy-dmc-attendance.yml`
- `_docs/development/github-actions-firebase-deploy.md`
