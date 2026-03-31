---
name: day-start
description: Use when the user opens a fresh daily session for this repo or says today start, day kickoff, morning start, or equivalent Korean phrases for dmc_attendance_log
---

# 하루 시작 (Day Start)

## 근거

회사 워크스페이스 `meta-agent.mdc`의 **Morning Boot**는 새 세션에서 동일 질문 반복을 줄이기 위해 **날짜 고정 → 문서 로딩 → 브리핑 → 일지** 순으로 정리한다. 이 레포는 Jira·`HANDOFF_*`·`WORKSPACE_MAP` 대신 **`_docs/log`**, **주간/테마 플랜**, **Git 작업 트리**가 SSOT에 가깝다.

**EOD 백업:** 전역 퇴근 루틴(`~/.cursor/skills/end-of-day/SKILL.md`)이 이 레포를 항상 커버하지 않거나, 전날에 못 돌린 경우 **미커밋 변경이 원격에 없으면** 기기 손실·다중 편집기 미동기만으로 작업이 사라질 수 있다. 아래 **EOD 미실행 시 작업 트리 백업** 절차를 day-start에서 함께 안내한다.

## 개요

매일 **새 대화**로 시작할 때 한 번 실행하는 부팅 시퀀스. 코딩보다 **맥락 복구**가 우선이다.

## 트리거 (사용자 문구 예시)

아래를 포함하면 이 스킬을 따른다:

- `오늘 시작`, `하루 시작`, `오늘 업무 시작`, `데일리 시작`, `아침 시작`
- `day start`, `daily kickoff` (영어)

## 시퀀스

### Step 0: 선행 규칙

**대화의 첫 응답이라면** `.cursor/rules/conversation-start-hook.mdc`에 따라 `.cursor/skills/using-superpowers/SKILL.md`를 먼저 읽는다. 그 다음 이 스킬을 적용한다.

### Step 1: 오늘 날짜 고정

- Cursor **user_info**의 `Today's date`가 있으면 그것을 **권위**로 삼는다.
- 없으면: `date +"%Y-%m-%d %A"` (또는 동등한 로컬 확인).

### Step 2: 컨텍스트 로딩 (이 순서)

1. **어제 일지**  
   - 경로: `_docs/log/{어제 날짜}.md` (파일명 `YYYY-MM-DD.md`).  
   - 공휴일·주말 등으로 없으면: `_docs/log/`에서 **가장 최근** `YYYY-MM-DD.md`를 1개 읽어 “마지막 작업일”로 취급한다.

2. **진행 중인 주간·테마 플랜** (있으면)  
   - `_docs/superpowers/plans/*.md` 중 사용자가 최근에 보던 것, 또는 수정 시각이 가장 최근인 파일 1~2개.  
   - 없으면 스킵.

3. **월요일 옵션**  
   - **월요일**이면 한 눈에 구조를 보려고 `_docs/learning/INDEX.md` 또는 루트 `README`를 훑는다 (필수 아님, 1분 이내).

4. **Git 작업 트리**  
   - `git status -sb` 와 간단한 `git branch --show-current`로 **미커밋 변경·브랜치**를 파악한다.  
   - **미커밋이 있고** 어제 EOD·푸시를 못 했을 가능성이 있으면: 브리핑 **「이어서 할 것」**에 **커밋·푸시로 원격 백업**을 한 줄 넣고, Step 5 다음의 **EOD 미실행 시 작업 트리 백업** 절차를 따르라고 안내한다 (사용자가 거절하면 존중).  
   - **배포 직전**이면: `hosting.public`이 디스크 기준이라 **미커밋이 프로덕션에 섞일 수 있음**을 브리핑에 한 줄 넣는다 (`.cursor/rules/pre-deploy-checklist.mdc` 근거).

5. **Jira / 외부 보드**  
   - 이 레포에는 기본 경로 없음. 사용자가 별도 이슈 트래커를 쓰면 **그걸 물어보거나** 사용자가 붙여 준 목록만 반영한다.

### Step 3: 캘린더 (선택)

회사 Morning Boot와 동일하게 **오늘 일정**이 업무 우선순위에 영향을 주면 짧게 요청한다:

- Google Calendar **일간**: `https://calendar.google.com/calendar/u/0/r/day`
- **주간**: `https://calendar.google.com/calendar/u/0/r/week`

사용자가 “없음”이면 바로 Step 4로 간다.

### Step 4: 브리핑 출력

읽은 내용만으로 아래 형식을 채운다 (추측으로 이슈를 만들지 말 것).

```markdown
## 오늘 브리핑 — {YYYY-MM-DD} ({요일})

### 마지막 작업일 요약
- {어제(또는 최근) 일지 기준 3줄 이내}

### 이어서 할 것
- {일지 "다음에 할 것" 체크박스·bullet}
- {미커밋/브랜치가 있으면 한 줄}

### 오늘 미팅 / 일정
- {캘린더 반영 — 없으면 "없음" 또는 섹션 생략}

### 활성 플랜 (있을 때만)
- {superpowers/plans 한 줄 요약}

### 우선순위 제안
1. {가장 먼저}
2. {그다음}

무엇부터 할까요?
```

### Step 5: 오늘 일지 스텁

`_docs/log/{오늘}.md`가 **없으면** 아래 스텁만 만든다 (이미 있으면 **덮어쓰지 않는다**).

```markdown
# YYYY-MM-DD (요일) 일일 로그

## 요약

(퇴근·마무리 때 채움)

## 주요 작업

## Git (당일 main 등)

## 다음에 할 것

## 수동 메모
```

### EOD 미실행 시 작업 트리 백업

전날 **퇴근 루틴을 건너뛰었거나** day-start 시점에 **미커밋·미푸시**가 남아 있으면, 사용자가 원할 때 **원격에 백업**한다.

1. **`git status -sb`** 로 변경 범위 확인. 배포 예정이면 `.cursor/rules/pre-deploy-checklist.mdc`와 같이 **의도한 것만** 스테이징할 것.
2. **의도한 파일만** `git add` (로컬 전용·비밀 파일 제외).
3. **한 커밋 또는 논리 단위**로 `git commit` (본문에 맥락 한 줄, 예: 문서·룰·스킬 정리).
4. **`git push origin $(git branch --show-current)`** 로 원격 반영까지 하면 EOD 미실행에 대비한 백업으로 충분하다.

**금지·주의:** `data-write-safety.mdc`가 적용되는 **Firestore 대량 쓰기·임포트 스크립트 실행**은 커밋과 별도로 사용자 승인·dry-run을 따른다. **AI는 `firebase deploy`를 실행하지 않는다** (배포 스킬·체크리스트).

## When NOT to use

- 이미 구체적 작업 지시만 있고 맥락 로딩이 불필요할 때 — 바로 실행 요청에 응답한다.
- **Firestore 대량 쓰기·임포트**가 메인이면 `.cursor/rules/data-write-safety.mdc`를 먼저 따른다.

## 연계 스킬

| 상황 | 스킬 |
|------|------|
| 주간 목표를 새로 잡는 날 | `.cursor/skills/weekly-plan-creation/SKILL.md` (전역 스킬 사용 시 그 절차) |
| 회고 후 운영진 안내 문구 | `.cursor/skills/weekly-ops-bulletin/SKILL.md` |
| 퇴근·하루 마무리 | `~/.cursor/skills/end-of-day/SKILL.md` (전역; 이 레포만 쓸 때는 미커밋 백업은 본 스킬 **EOD 미실행** 절차) |
