---
name: firebase-deploy
description: Use when the user asks to deploy, firebase deploy, hosting/functions 배포, 올려줘, 반영해줘, or 프로덕션에 적용.
---

# Firebase 배포 스킬

## 핵심 원칙 (2026-08-23 변경)

> **사용자가 배포를 요청하면 AI가 체크리스트를 수행하고 `firebase deploy`를 Shell로 실행한다.**
> 명령어만 안내하고 멈추지 않는다.

배포는 요청이 있을 때만 한다. 목표·테스트·백업·커밋 없이 올리지 않는다.

---

## 배포 요청 감지 조건

다음 중 하나라도 해당하면 이 스킬을 따른다:
- "배포", "deploy", "firebase deploy", "functions 배포", "hosting 배포"
- "올려줘", "반영해줘", "프로덕션에 적용"

---

## 배포 절차 (AI가 실행)

### 0단계: 배포 목표 정의

```
배포 목표: [이 배포로 무엇이 달라지는가? 한 문장]
배포 범위: [functions / hosting / 둘 다]
성공 기준: [배포 후 무엇을 확인하면 성공인가?]
실패 기준: [어떤 상태면 롤백하는가?]
```

목표가 없으면 배포하지 않는다.

### 1단계: 테스트

```bash
bash scripts/pre-deploy-test.sh
```

`✅ 전체 통과 — 배포 가능`이 나와야 다음 단계. 실패면 고치고 재실행.

**전제:** `java`, `cd functions && npm ci`. 스크립트는 `emulators:exec`로 functions·hosting·firestore를 띄운다.

### 2단계: 백업

```bash
cd functions && node ../scripts/backup-firestore.js
```

`backup/YYYY-MM-DD/` 확인.

### 3단계: 커밋 + 푸시

의도한 변경만 커밋·푸시. Hosting은 디스크를 올리므로 `git status`·`git diff`로 미커밋이 없어야 한다.

### 4단계: 배포 (AI가 실행)

```bash
firebase deploy --only functions
firebase deploy --only hosting
```

범위가 hosting만이면 hosting만. functions 변경이 있으면 functions 먼저.

### 5단계: 배포 후 검증

- 프로덕션 URL 주요 기능 확인
- `event_logs`에 `page_load`가 쌓이는지 확인

### 6단계: 버전 태그

```bash
git tag -a vMAJOR.MINOR.PATCH -m "배포 요약"
git push origin vMAJOR.MINOR.PATCH
```

MAJOR: 스키마/호환 불가, MINOR: 새 기능, PATCH: 버그·문구.

---

## AI 금지 행동

```
❌ 사용자 요청 없이 배포
❌ 테스트/백업/커밋을 건너뛰고 배포
❌ 배포가 끝나기 전에 "배포했습니다" 선언
❌ 미커밋 로컬 파일이 있는 채로 Hosting 배포
```
