---
name: members-sync-via-mcp
description: Use for Firestore members baseline export (read-only). For applying changes, use members-sync-via-api skill instead of MCP write.
---

# 정회원 명단 — MCP (조회·baseline 전용)

> **적용(쓰기)은 `members-sync-via-api` 스킬을 사용한다.**  
> MCP direct write는 API·스크립트가 불가할 때만 fallback.

## MCP로 할 일

1. `members` 컬렉션 전체 export → `scripts/data/members-firestore-snapshot.json`
2. (선택) 퇴회 대상 `attendance` / `race_results` **건수 조회**로 dry-run 보조

형식 예:

```json
{
  "members": [
    { "id": "docId...", "realName": "...", "nickname": "...", "hidden": false }
  ]
}
```

## 적용은 API 스크립트

```bash
node scripts/plan-members-sync.js --baseline=scripts/data/members-firestore-snapshot.json --plan-out=scripts/data/sync-plan-2026-06-30.json
node scripts/apply-members-sync-via-api.js --plan=scripts/data/sync-plan-2026-06-30.json --dry-run
# 승인 후
node scripts/apply-members-sync-via-api.js --plan=scripts/data/sync-plan-2026-06-30.json
```

스킬: `.cursor/skills/members-sync-via-api/SKILL.md`

## 금지

- ❌ plan 승인 없이 MCP write
- ❌ API 스크립트 가능한데 Admin SDK / MCP로 직접 쓰기

## 관련 파일

- `scripts/lib/member-sync-plan.js` — diff·operations 생성
- `scripts/plan-members-sync.js` — CLI
- `scripts/apply-members-sync-via-api.js` — **권장 적용**
