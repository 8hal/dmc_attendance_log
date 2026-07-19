# DMC Attendance 모바일 Firebase 배포 (GitHub Actions)

> 승인: 2026-07-19 — 선택형 deploy_target (hosting / functions / 둘 다)  
> 선행: 춘백 `deploy-chunbaek.yml` + `_docs/development/github-actions-firebase-deploy.md`

## 목표

휴대폰 GitHub 앱에서 **Run workflow**로 `dmc-attendance` Hosting·Functions를 배포한다.

## 결정

| 항목 | 내용 |
|------|------|
| 방식 | 춘백 워크플로 **복제** (신규 YAML) |
| 시크릿 | `FIREBASE_SERVICE_ACCOUNT_DMC_ATTENDANCE` 재사용 |
| 트리거 | `workflow_dispatch`만 |
| 대상 | `hosting` \| `functions`(전체) \| `hosting-and-functions` |
| 순서 | Functions → Hosting (둘 다일 때) |
| 스모크 | Hosting: `/attendance-v2.html` 200 · Functions: attendance `status` HTTP+ok |
| 비범위 | AI 직접 deploy · Actions 내 pre-deploy-test/백업 · 자동 push 배포 |

## 파일

- `.github/workflows/deploy-dmc-attendance.yml`
- `_docs/development/github-actions-firebase-deploy.md` (절 추가)
