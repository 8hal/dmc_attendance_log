---
name: chunbaek-participant-add
description: Use when adding or removing 춘백 S3 season participants (chunbaekS3.participant), user says 합류/참가자 추가/명단에 넣어줘/개마고원 추가, or roster count must change before members-roster reflects new names
---

# 춘백 S3 참가자 추가·제외

## 원칙

> **admin UI 없음 — `plan` + `seed` 스크립트로 처리한다.**  
> **Firestore 수정이므로 dry-run → 사용자 승인 → 실행** (`.cursor/skills/firestore-data-modification/SKILL.md`).

시드는 JSON에 있는 사람에게만 `chunbaekS3.participant: true`를 설정한다. **목록에 없는 기존 참가자는 자동 해제되지 않는다.**

## SSOT 파일

| 파일 | 용도 |
|------|------|
| `scripts/data/chunbaek-s3-names.txt` | 실명 한 줄씩 (운영진 편집) |
| `scripts/data/chunbaek-s3-participants.json` | `memberIds` + 매칭 메타 (plan 출력) |
| `scripts/data/members-firestore-snapshot-mcp-post.json` | baseline (없으면 MCP export 갱신) |

## 워크플로 (추가)

### 1. 이름 기록

`chunbaek-s3-names.txt`에 실명 추가 (가나다순 유지 권장).

### 2. 전체 명단으로 plan 재생성

**⚠️ `--names=한명`만 쓰면 JSON이 1명으로 덮어써진다.** 반드시 **전체 파일**로 plan:

```bash
node scripts/plan-chunbaek-participants.js \
  --baseline=scripts/data/members-firestore-snapshot-mcp-post.json \
  --file=scripts/data/chunbaek-s3-names.txt \
  --out=scripts/data/chunbaek-s3-participants.json
```

출력 확인:
- `✓ 닉네임 (실명)` 매칭
- `매칭 N명 / 입력 N명` — **미매칭 0**이어야 다음 단계

**미매칭 시:** baseline 갱신, 실명·닉네임 오타 확인, 또는 `members`에 정회원 등록 여부 확인.

### 3. dry-run

```bash
node scripts/seed-chunbaek-participants.js \
  --input=scripts/data/chunbaek-s3-participants.json --dry-run
```

확인:
- 신규: `(신규)` 표시
- 기존: `(이미 participant)`
- `오류 0명`

결과를 사용자에게 보여주고 **「이대로 실행할까요?」** 승인 대기.

### 4. 실행 (승인 후)

```bash
node scripts/seed-chunbaek-participants.js \
  --input=scripts/data/chunbaek-s3-participants.json
```

**AI는 사용자 승인 없이 프로덕션 실행하지 않는다.**

### 5. 검증

```bash
curl -s 'https://dmc-attendance.web.app/api/chunbaek?action=members-roster' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('count', len(d['members'])); print([m['nickname'] for m in d['members'] if 'TARGET' in m.get('nickname','')])"
```

- 명단 수 = 기대 인원
- 앱 ② 명단에 신규 닉네임 노출 (재배포 불필요)
- `profileComplete: false` — 첫 방문 시 ③ 프로필부터

### 6. Git 커밋 (권장)

```
chunbaek-s3-names.txt
chunbaek-s3-participants.json
```

## 참가자 제외 (`participant: false`)

시드 스크립트는 **해제를 하지 않는다.**

| 방법 | 비고 |
|------|------|
| Firebase 콘솔 | `members/{id}.chunbaekS3.participant` → `false` |
| (미구현) | `admin-set-participant` API — 백로그 |

제외해도 기존 출석·프로필 데이터는 **삭제하지 않음** (감사·복구용).

## 금지

- ❌ dry-run·승인 없이 `seed-chunbaek-participants.js` 실행
- ❌ `--names=한명`만으로 `participants.json` 덮어쓰기 (전체 명단 유실)
- ❌ 신규 API 추가 없이 admin UI 구현 (오버 스펙 — 이 스킬 사용)
- ❌ `firebase deploy`로 명단 반영 시도 (데이터는 Firestore)

## 사용자 요청 예시 → AI 행동

| 사용자 말 | AI |
|-----------|-----|
| 「개마고원 박세진 추가해줘」 | names.txt 추가 → plan 전체 → dry-run 결과 보고 → 승인 후 seed |
| 「참가자 몇 명이야?」 | `members-roster` curl |
| 「admin에서 추가하면?」 | 이 스킬 안내 (스크립트가 정식 경로) |

## 관련

- 정책: `_docs/superpowers/specs/2026-07-12-chunbaek-season3-confirmed-decisions.md` §3
- 운영: `_docs/superpowers/specs/2026-07-16-chunbaek-season3-ops-prep.md` §4·§5
- 스크립트: `scripts/plan-chunbaek-participants.js`, `scripts/seed-chunbaek-participants.js`
