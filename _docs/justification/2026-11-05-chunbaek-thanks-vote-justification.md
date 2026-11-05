# 쫑파티 투표·시상 조회 API 추가 필요성

## 기존 API 목록

1. `team-summary` — 로그인한 춘백 참가자의 팀 현황. 시상 계산에 쓰는 출석·기록 필드가 들어 있지만, 운영진 비밀번호가 없고 투표 문서를 쓰지 않는다.
2. `admin-member-directory` — 참가자 명단 추가·제외. 시상 집계와 투표 결과가 없다.
3. `my-profile` — 본인 프로필. 다른 멤버에게 투표하거나 득표를 모으지 않는다.

전역 검색(`thanks-vote`, `finale-party`, `admin-finale`, `고마웠다`)에서 같은 역할의 API는 없었다.

## 신규 API

- `thanks-vote` GET/POST — 참가자 세션으로 동료 1명 투표, 재투표 덮어쓰기. 응답은 투표 여부와 후보만.
- `admin-thanks-votes` GET — 운영진 비밀번호로 득표와 이유.
- `finale-party` GET — 참가자에게 날짜·장소·시간·안내만. 장소·시간은 저장값이 없으면 빈 문자열.
- `admin-finale` GET — 운영진에게 시상 계산용 멤버 집계와 파티 안내.
- `admin-finale-party` POST — 운영진이 장소·시간·안내를 저장.

## 기존 API로 대체 불가능한 이유

- `team-summary`는 멤버 토큰이면 누구나 호출하고, 투표 저장소가 없다. 시상 화면을 멤버에게서 숨기려면 집계 조회를 운영진 비밀번호 뒤로 따로 둔다.
- `admin-member-directory`는 출석 일수·완주 기록을 시상 모델에 맞게 돌려주지 않는다.
- 회원 API를 반복 호출해도 1인 1표 문서와 관리자 전용 결과를 만들 수 없다.

## 신규 API 추가 결정

- 추가 필요: 투표는 `chunbaek_thanks_votes/{voterMemberId}`, 안내는 `chunbaek_season_config/chunbaek-s3.finaleParty`.
- 클라이언트 직접 읽기는 `firestore.rules`에서 막는다.
