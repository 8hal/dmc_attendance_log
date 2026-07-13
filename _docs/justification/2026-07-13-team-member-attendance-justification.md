# team-member-attendance API 추가 필요성

## 기존 API

| API | 용도 | 메모·사진 |
|-----|------|-----------|
| `my-timeline` | 본인 100일 | 본인만 |
| `team-summary` | 팀 목록·목표·출석 집계 | 없음 |
| admin-grid | 운영진 그리드 | 있음 (운영진만) |

## 신규 API: `team-member-attendance`

- **용도:** 팀원 프로필 모달에서 해당 멤버의 출석 메모·사진 공개
- **호출처:** `openTeamProfileModal` → lazy GET

## 기존 API로 대체 불가

- `my-timeline`: 타인 `memberId` 조회 불가
- `team-summary`에 전원 슬롯 포함 시 41명×100슬롯 페이로드 과대

## 결정

- ✅ 추가 (사용자 승인 2026-07-13)
- 팀 로그인 회원 읽기 전용, `profileComplete` 멤버만
