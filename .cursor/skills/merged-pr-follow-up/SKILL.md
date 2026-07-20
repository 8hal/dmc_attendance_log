---
name: merged-pr-follow-up
description: Use when fixing bugs or iterating after a PR may already be merged, before pushing more commits to a feature branch, when user asks how to re-merge, or when deploy/hotfix follows a recently merged PR
---

# Merged PR Follow-up

## Overview

**이미 머지된 PR의 브랜치에 커밋을 이어서 푸시하면 main에 안 들어가고, 사용자는 “또 머지 어떻게 하냐” 상태가 된다.**

**Core principle:** 추가 커밋·핫픽스 전에 **해당 브랜치 PR이 MERGED인지 반드시 확인**한다. MERGED면 **main에서 새 브랜치 + 새 PR**.

## When to Use

- 프로덕션/리뷰 피드백으로 **머지 이후** 수정이 필요할 때
- “머지한 건 어떻게 다시 머지?” / “또 PR 만들어” 류 질문
- 같은 feature 브랜치에 **이어서** `git push` 하기 직전
- 배포 안내 직전 (머지된 커밋 vs 브랜치 tip 불일치 가능)

**When NOT to use:** 아직 열린(open) PR에 커밋을 추가하는 정상 follow-up (그때는 같은 브랜치 push가 맞음).

## Iron Law

```
NO PUSH TO A FEATURE BRANCH FOR FOLLOW-UP WORK
UNTIL YOU HAVE CHECKED WHETHER ITS PR IS ALREADY MERGED
```

확인 명령 (택1 이상, 증거 없이 진행 금지):

```bash
gh pr list --head "$(git branch --show-current)" --state all --json number,state,url,title
# 또는
gh pr view --json state,mergedAt,url
git fetch origin main
git log --oneline origin/main..HEAD   # 아직 main에 없는 커밋
git log --oneline HEAD..origin/main   # main만의 커밋(머지 커밋 등)
```

## Decision

| PR state | 할 일 |
|----------|--------|
| **open** | 같은 브랜치에 커밋·push → 기존 PR에 자동 반영 |
| **merged** | 같은 브랜치에 이어서 푸시 **금지**. `origin/main`에서 **새 브랜치** → 필요한 커밋만 cherry-pick(또는 재구현) → **새 PR** |
| **closed (unmerged)** | 의도 확인. 보통 새 브랜치/새 PR 또는 기존 브랜치 재오픈 |

## Merged일 때 절차

1. `git fetch origin main`
2. `git checkout -b cursor/<short-hotfix-name>-78e6 origin/main`  
   (이 레포 브랜치 prefix/suffix 규칙 준수)
3. 머지 이후 커밋만 선별:
   ```bash
   git cherry-pick <sha1> <sha2> ...
   ```
   또는 main 위에서 최소 수정 재적용
4. push + **새** PR (`ManagePullRequest` / create_pr)
5. 사용자에게 안내: “이전 PR은 이미 머지됨 → 후속은 **새 PR #N**”

## Rationalizations (금지)

| 핑계 | 현실 |
|------|------|
| “같은 브랜치에 푸시하면 알아서 되겠지” | 머지된 PR은 추가 커밋을 흡수하지 않음 |
| “방금 내가 만든 PR이니까 아직 open일 것” | 사용자가 Actions/웹에서 이미 머지했을 수 있음 — **항상 조회** |
| “커밋이 브랜치에 있으니 main에도 있을 것” | squash merge면 SHA가 다름. `origin/main..HEAD`로 확인 |
| “나중에 새 PR 만들면 되지” | 지금 확인하지 않으면 배포 안내·커밋이 잘못된 tip 기준이 됨 |
| “문서/작은 UI라서 괜찮다” | 규모와 무관. 머지 여부가 분기점 |

## Red Flags — STOP

- feature 브랜치에 핫픽스 커밋하기 전 PR state를 안 봄
- 사용자에게 “기존 PR 다시 머지”만 안내 (이미 MERGED인 경우)
- 배포 대상을 “방금 푸시한 feature tip”으로만 말하고 main 포함 여부를 안 봄

## Related

- `@finishing-a-development-branch` — 브랜치 마무리 옵션
- `@firebase-deploy` / GitHub Actions — 머지 **된** main(또는 명시 브랜치) 기준 배포
- 근거 사례: 2026-07-20 춘백 예외 PR #34 MERGED 후 같은 브랜치에 승인 트랜잭션 핫픽스를 이어 푸시 → 사용자가 재머지 방법을 물어봄 → #35로 분리
