---
name: members-sync-via-api
description: Use when syncing member roster to production — plan offline, apply via add-member/update-member/hide-member API loop (preferred over MCP direct write or Admin SDK scripts)
---

# 정회원 명단 동기화 (단건 API 반복)

## 원칙

> **DB 직접 수정·MCP write보다 기존 HTTP API를 우선한다.**

6/30 기준 변경 ~20건(신규 17·닉변경 2·퇴회 1)이라 **일괄 API 없이** `add-member` / `update-member` / `hide-member` 를 순서대로 호출하는 스크립트로 충분하다.

## 전제

- 정책: `_docs/superpowers/policies/member-leave-anonymization-policy.md`
- `hide-member` 는 퇴회·익명화 + `attendance` / `race_results` 연동 포함

## 워크플로

### 1단계: 단위 테스트

```bash
npm run test:members-sync
npm run test:members-sync:emulator   # Firestore 에뮬 (로직 검증)
```

### 2단계: baseline 확보

**권장:** Firebase MCP로 `members` 전체 export → `scripts/data/members-firestore-snapshot.json`

또는 최신 cleaned JSON(오프라인 diff용).

### 3단계: plan 생성 (인증 불필요)

```bash
node scripts/plan-members-sync.js \
  --baseline=scripts/data/members-firestore-snapshot.json \
  --plan-out=scripts/data/sync-plan-2026-06-30.json
```

`summary`·`warnings`·퇴회 미리보기를 사용자에게 보여주고 **승인 대기**.

### 4단계: dry-run (API 호출 없음)

```bash
node scripts/apply-members-sync-via-api.js \
  --plan=scripts/data/sync-plan-2026-06-30.json \
  --dry-run
```

### 5단계: 사용자 승인 후 프로덕션 적용

```bash
node scripts/apply-members-sync-via-api.js \
  --plan=scripts/data/sync-plan-2026-06-30.json
```

에뮬 검증 시 `--local` (Functions 에뮬 필요).

### 6단계: 검증

- `GET ?action=all-members` — 활성 회원 수 ≈ 명단 인원
- 이경주(초이스) 등 퇴회자: 익명 닉·실명, `leaveReason: expelled`

## operation → API 매핑

| plan type | API | 비고 |
|-----------|-----|------|
| `add_member` | `POST add-member` | 닉 중복 시 409 |
| `update_member` | `POST update-member` | 닉 변경·복귀(unhide) |
| `member_leave` | `POST hide-member` | `leaveReason`, `leftAt` 전달 |

## 금지·비권장

- ❌ plan 승인 없이 프로덕션 API 호출
- ❌ `scripts/sync-members-*.js` Admin SDK 직접 쓰기 (레거시·에뮬 테스트용만)
- ❌ MCP로 `members`/`race_results` 직접 write (API·스크립트 불가 시 최후 수단)

## 관련 파일

- `scripts/plan-members-sync.js` — diff·plan JSON
- `scripts/apply-members-sync-via-api.js` — **권장 적용 경로**
- `scripts/lib/member-sync-plan.js` — diff 로직
- `functions/lib/member-leave.js` — `hide-member` 서버 익명화

## MCP 스킬 (fallback)

조회·baseline export만 MCP 사용: `.cursor/skills/members-sync-via-mcp/SKILL.md` (write 단계는 API 스크립트로 대체)
