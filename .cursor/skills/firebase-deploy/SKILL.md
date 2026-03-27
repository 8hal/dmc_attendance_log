---
name: firebase-deploy
description: Firebase 배포 워크플로우. 배포 목표 정의 → 테스트 → 백업 → 커밋 → 배포 → 검증 → 태그 순서로 진행. "배포", "deploy", "firebase deploy" 요청 시 사용.
---

# Firebase 배포 스킬

## 핵심 원칙 (절대 예외 없음)

> **AI는 `firebase deploy` 명령어를 직접 실행하지 않는다.**
> 반드시 사용자에게 명령어를 안내하고, 사용자가 직접 실행하도록 한다.

## 근거

배포는 되돌리기 어렵고 프로덕션 서비스에 즉시 영향을 미친다.
AI가 임의로 배포를 실행했다가 오류가 발생하면 사용자가 인지하지 못한 상태에서 서비스가 중단될 수 있다.

---

## 배포 요청 감지 조건

다음 중 하나라도 해당하면 이 스킬을 따른다:
- "배포", "deploy", "firebase deploy", "functions 배포", "hosting 배포"
- "올려줘", "반영해줘", "프로덕션에 적용"

---

## 배포 절차 (6단계)

### 0단계: 배포 목표 정의 (AI가 먼저 작성)

```
배포 목표: [이 배포로 무엇이 달라지는가? 한 문장]
배포 범위: [functions / hosting / 둘 다]
성공 기준: [배포 후 무엇을 확인하면 성공인가?]
실패 기준: [어떤 상태면 롤백하는가?]
```

목표가 불명확하면 → 사용자에게 확인 후 진행.

### 1단계: 테스트 실행 (사용자가 실행)

```bash
bash scripts/pre-deploy-test.sh
```

전체 통과(`✅ 전체 통과`) 확인 후 다음 단계 진행.

### 2단계: 백업 (사용자가 실행)

```bash
cd functions && node ../scripts/backup-firestore.js
```

### 3단계: 커밋 + 푸시 (사용자가 실행)

변경 사항 전부 커밋 후 원격 푸시.

### 4단계: 배포 명령어 안내 (AI가 안내, 사용자가 실행)

```bash
# Functions 먼저
firebase deploy --only functions

# Hosting 나중에
firebase deploy --only hosting
```

> AI는 이 명령어를 Shell 도구로 직접 실행하지 않는다.
> 텍스트로 안내만 하고 사용자가 터미널에서 직접 실행한다.

### 5단계: 배포 후 검증

- 프로덕션 URL 주요 기능 수동 확인
- `event_logs`에 `page_load` 이벤트 수집 확인

### 6단계: 버전 태그 (사용자가 실행)

```bash
git tag -a vMAJOR.MINOR.PATCH -m "배포 요약"
git push origin vMAJOR.MINOR.PATCH
```

버전 규칙:
- MAJOR: 아키텍처/스키마 변경
- MINOR: 새 기능 추가
- PATCH: 버그 수정

---

## AI 금지 행동

```
❌ Shell 도구로 firebase deploy 실행
❌ 사용자 확인 없이 functions/index.js 배포
❌ 테스트/백업 단계 생략하고 바로 배포 진행
❌ "배포했습니다" 라고 먼저 선언하고 나서 확인 요청
```
