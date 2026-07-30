# admin-member-directory 추가 필요성 검증

## 기존 API 목록

1. `members-roster` (GET, 공개) — `participant: true` 만 반환, admin 비밀번호 불필요
2. `admin-set-participant` (POST, admin) — 참가자 추가·제외
3. `admin-grid` (GET, admin) — participant만 그리드에 포함

## 신규 API: `admin-member-directory`

- 용도: 운영진 admin 「참가자 명단」 탭에서 정회원 전체 + participant 플래그 조회
- 호출처: `chunbaek/admin.html` → `admin.js` `refreshRosterDirectory()`

## 기존 API로 대체 불가능한 이유

### 왜 `members-roster`를 재사용하지 않는가?

- participant만 반환 → **추가 가능한 정회원** 목록을 만들 수 없음

### 왜 races `members` API를 재사용하지 않는가?

- 엔드포인트·인증 체계가 다름 (chunbaek adminPw 게이트 없음)
- `chunbaekS3.participant` / `profileComplete` 플래그 없음

### 왜 `admin-set-participant`만으로 충분하지 않은가?

- 쓰기 전용. memberId를 알아야 하며, 검색·목록 UI에 읽기 API 필요

## 신규 API 추가 결정

- ✅ 추가 필요: admin UI에서 운영진이 스크립트 없이 참가자 관리
- ⚠️ 대안: 177명 memberId를 운영진이 수동 입력 — 비현실적

## 사용자 승인

- 2026-07-30 대화에서 admin 참가자 관리 UI 설계·제외 확인(A) 승인
