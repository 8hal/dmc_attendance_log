---
name: pre-deploy-test
description: 배포 전 로컬 검증. bash scripts/pre-deploy-test.sh 실행, 실패 시 에뮬·의존성 점검. "pre-deploy", "배포 전 테스트", "에뮬 테스트" 요청 시 사용.
---

# pre-deploy-test 스킬

## 언제

- 배포 직전, 또는 CI/로컬에서 API·호스팅 스모크가 필요할 때.
- 에뮬레이터가 안 뜨거나 멈춘 것 같을 때.

## 실행

```bash
bash scripts/pre-deploy-test.sh
```

성공 시 마지막에 `✅ 전체 통과 — 배포 가능`.

## 로컬 전제

| 항목 | 이유 |
|------|------|
| `firebase` CLI | 에뮬 실행 |
| `java` | Firestore 에뮬레이터 |
| `cd functions && npm ci` | `firebase-functions` 없으면 Functions 에뮬이 소스 로드를 실패함 |

## 동작 요약

- `firebase emulators:exec --only functions,hosting,firestore` 로 한 번에 기동·종료.
- 에뮬 Firestore에 `members` 시드 1건 (`scripts/seed-emulator-pre-deploy.js`).
- 본 검증: `scripts/pre-deploy-test-runner.sh` (curl API + 호스팅 정적 파일 문자열 검사).

## 실패 시

1. 로그 끝의 `tail` 또는 터미널 전체에서 `Cannot find module 'firebase-functions'` → `functions` 에서 `npm ci`.
2. Java 관련 오류 → JDK 설치 또는 `JAVA_HOME`.
3. 포트 충돌(5000/5001/8080) → 다른 에뮬/프로세스 종료.

## 배포 순서와의 관계

전체 워크플로우는 `.cursor/skills/firebase-deploy/SKILL.md` 및 `.cursor/rules/pre-deploy-checklist.mdc` 를 따른다. 이 스킬은 **1단계(테스트)** 만 담당한다.
