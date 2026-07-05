---
name: members-sync-via-mcp
description: Use when syncing member roster to Firestore without service-account.json — plan via scripts/plan-members-sync.js, apply via Firebase MCP (firebase login)
---

# 정회원 명단 동기화 (Firebase MCP)

## 전제

- Cursor **Firebase MCP** 연결됨 (`firebase login` 완료)
- **서비스 계정 JSON 불필요** — MCP가 `firebase login` 인증 사용
- 정책: `_docs/superpowers/policies/member-leave-anonymization-policy.md`

## 워크플로 (테스트 → 적용)

### 1단계: 단위 테스트 (인증 불필요)

```bash
npm run test:members-sync
npm run test:members-sync:emulator   # Firestore 에뮬: 시드→적용→검증 (프로덕션 미접속)
```

전체 통과 후 다음 단계.

### 2단계: baseline 확보 (MCP)

Firebase MCP로 `members` 컬렉션 전체 조회 후 JSON 저장:

`scripts/data/members-firestore-snapshot.json` 형식 예:

```json
{
  "members": [
    { "id": "docId...", "realName": "...", "nickname": "...", "hidden": false }
  ]
}
```

또는 cleaned 배열 (`members-2026-03-31-cleaned.json` 형식)도 가능.

### 3단계: plan 생성 (인증 불필요)

```bash
node scripts/plan-members-sync.js \
  --baseline=scripts/data/members-firestore-snapshot.json \
  --plan-out=scripts/data/sync-plan-2026-06-30.json
```

출력의 `summary`와 `operations`를 사용자에게 보여주고 **승인 대기**.

### 4단계: MCP로 dry-run (조회만)

각 `member_leave` operation에 대해 MCP로:

- `attendance` where `memberId` / `nicknameKey` 건수 조회
- `race_results` where `memberRealName` 건수 조회

**쓰기 없음.** 건수를 plan과 비교해 보고.

### 5단계: 사용자 승인 후 MCP 적용

`sync-plan-*.json`의 `operations` 순서대로:

| type | MCP 동작 |
|------|----------|
| `add_member` | `members` 새 문서 create |
| `update_member` | `members/{docId}` update |
| `member_leave` | `members` update → `attendance` / `race_results` 연관 update |

`member_leave` 필드는 plan의 `memberUpdate` + `relatedUpdates` 그대로 따름.

### 6단계: 검증

- MCP로 활성 회원 수 (`hidden != true`) ≈ 176
- `이경주` / `초이스` 실명·닉 검색 시 익명 값만 또는 미노출

## 금지

- ❌ plan 승인 없이 MCP write
- ❌ `member_leave` 시 `members`만 수정하고 `race_results` 방치
- ❌ 익명화된 회원 `hidden: false` 복원

## 관련 파일

- `scripts/lib/member-sync-plan.js` — diff·operations 생성
- `scripts/plan-members-sync.js` — CLI
- `functions/lib/member-leave.js` — 익명화 규칙
