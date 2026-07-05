# 회원 탈퇴·제명 및 익명화 정책

**작성일**: 2026-07-05  
**상태**: Active

## 1. 정책 요약

| 구분 | 운영 의미 | 시스템 처리 |
|------|-----------|-------------|
| **자진 탈퇴** | 회원이 클럽을 떠남 | `hidden: true` + 닉·실명 익명화 |
| **제명** | 운영진 결정으로 자격 박탈 | **탈퇴와 동일** (`hidden: true` + 닉·실명 익명화) |

> **제명과 탈퇴는 UI·API·스크립트 동작이 같다.**  
> 감사용으로만 `leaveReason`(`withdrawn` / `expelled`)을 남길 수 있다. 처리 절차·익명화 범위는 동일하다.

**문서 삭제(`delete`)는 하지 않는다.** 회원 문서 ID(`memberId`)와 과거 출석·기록 연결을 유지하기 위함이다.

---

## 2. 처리 대상

명단 동기화·수동 탈퇴·제명 모두 아래 **「퇴회 처리」** 를 따른다.

### 2.1 `members` (필수)

| 필드 | 처리 |
|------|------|
| `hidden` | `true` |
| `nickname` | 익명 닉네임으로 **덮어쓰기** (아래 §3) |
| `realName` | 익명 실명으로 **덮어쓰기** |
| `leaveReason` | 선택. `"withdrawn"` 또는 `"expelled"` |
| `leftAt` | 선택. ISO 날짜 (`YYYY-MM-DD`) |
| `_archivedNickname` | 퇴회 전 `nickname` 보관 (운영·감사용, §4) |
| `_archivedRealName` | 퇴회 전 `realName` 보관 |
| `anonymizedAt` | 익명화 시각 (ISO 8601) |

### 2.2 연관 데이터 (필수 — UI 노출 익명화)

`members`만 바꾸면 `race_results`·출석 화면에 실명·닉이 그대로 남는다. **퇴회 처리 시 아래도 같은 익명 값으로 갱신한다.**

| 컬렉션 | 매칭 키 | 갱신 필드 |
|--------|---------|-----------|
| `attendance` | `memberId` == 퇴회 회원 doc ID | `nickname`, `nicknameKey` |
| `race_results` | `memberRealName` == 퇴회 전 실명 | `memberRealName`, `memberNickName` |

> `attendance`에 `memberId`가 없는 레거시 행은 `_archivedRealName` + 퇴회 전 `nickname`/`nicknameKey`로 추가 매칭 후 갱신한다.

### 2.3 갱신하지 않는 것

| 데이터 | 이유 |
|--------|------|
| `race_events` / `scrape_jobs` 내 스냅샷 | 과거 작업 이력. 필요 시 별도 백필 과제 |
| Google Sheets 출석 백업 | 이미 기록된 시트는 수정하지 않음 (운영 정책) |
| `event_logs` | 감사 로그 유지 |

---

## 3. 익명화 형식

회원 doc ID(`members` 문서 ID)를 기준으로 **충돌 없는** placeholder를 쓴다.

```
익명 닉네임:  탈퇴_{memberId 앞 8자}
익명 실명:    탈퇴회원_{memberId 앞 8자}
nicknameKey:  익명 닉네임 소문자 (attendance 갱신 시)
```

**예** (doc ID `AbCdEfGh1234567890`):

- `nickname`: `탈퇴_AbCdEfGh`
- `realName`: `탈퇴회원_AbCdEfGh`

### 3.1 닉네임 재사용

익명화 후 **원래 닉네임(`초이스` 등)은 새 정회원에게 재할당 가능**하다.  
(`add-member`는 익명 닉네임과만 충돌 검사)

### 3.2 실명 재가입

동일 실명으로 재가입하는 경우 **신규 `members` 문서**로 추가한다.  
과거 `race_results`는 익명 실명으로 남으며, 재가입 후 기록은 새 실명으로 쌓인다.

---

## 4. 원본 보관 (`_archived*`)

| 원칙 | 내용 |
|------|------|
| 목적 | 운영진 분쟁·오처리 복구 시 **Firestore 접근 권한 있는 운영진**만 확인 |
| 공개 API | `action=members`, 출석·기록 API 응답에 **`_archived*` 포함 금지** |
| `admin.html` | 숨김 회원 행에 `_archivedNickname` / `_archivedRealName` 표시 가능 (추후 UI) |

일반 회원·공개 화면에서는 익명 값만 보인다.

---

## 5. 실행 절차 (스크립트·수동 공통)

`.cursor/skills/firestore-data-modification/SKILL.md` 를 따른다.

1. **영향 범위 출력**: 퇴회 대상, `members` / `attendance` / `race_results` 건수
2. **`--dry-run` 필수**
3. **사용자(운영진) 승인**
4. **순서**
   1. `_archived*` 저장 + `members` 익명화 + `hidden: true`
   2. `attendance` 일괄 갱신
   3. `race_results` 일괄 갱신
5. **검증**: 공개 `members` API에 퇴회자 미노출, `my.html`/`races.html`에서 실명 검색 불가

### 5.1 명단 동기화 시

`sync-members` 계열 스크립트에서 **명단에 없는 활성 회원**은 곧바로 `hidden`만 하지 않고 **퇴회 처리(익명화 포함)** 를 실행한다.

**제명 목록** (예: 2026-06-30 이경주):

- 별도 JSON/`--expelled` 인자로 `leaveReason: "expelled"` 지정 가능
- **처리 내용은 자진 탈퇴와 동일**

---

## 6. API

| API | 역할 | 비고 |
|-----|------|------|
| `hide-member` | 퇴회·제명 (익명화 + `attendance`/`race_results` 연동) | `leaveReason`, `leftAt` 선택 |
| `add-member` | 신규 등록 | 명단 sync 시 신규 행 |
| `update-member` | 닉·실명·복귀(`hidden: false`) | 익명화된 회원 `hidden: false` **불가** |
| **명단 일괄 sync** | 별도 bulk API 없음 | `apply-members-sync-via-api.js`가 위 API를 ~20회 순차 호출 (6/30 규모) |

---

## 7. 사례: 2026-06-30 이경주(초이스) 제명

| 항목 | 값 |
|------|-----|
| 퇴회 전 | `nickname`: 초이스, `realName`: 이경주 |
| `leaveReason` | `expelled` (감사용, 처리는 탈퇴와 동일) |
| `leftAt` | `2026-06-30` |
| 6/30 정회원 명단 | **미포함** → 퇴회 처리 대상 |

---

## 8. 금지 사항

- ❌ `members` 문서 `delete()` (memberId 단절, 복구 어려움)
- ❌ dry-run·승인 없이 프로덕션 일괄 익명화
- ❌ `_archived*` 없이 익명화만 수행 (운영 추적 불가)
- ❌ `members`만 익명화하고 `race_results` 방치 (실명 UI 노출 잔존)

---

## 9. 관련 문서

- `docs/DATA_MODEL.md` — `members` 필드
- `.cursor/skills/firestore-data-modification/SKILL.md` — dry-run·승인
- `_docs/superpowers/policies/race-results-creation-policy.md` — `race_results` SSOT

## 10. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-05 | 초안 — 탈퇴·제명 동일 처리, 닉·실명 익명화, 연관 컬렉션 범위 정의 |
