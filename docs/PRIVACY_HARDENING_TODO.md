# Privacy Hardening TODO

## 목적
- 공개 페이지에서 회원 실명이 브라우저에 불필요하게 노출되지 않도록 단계적으로 개선한다.
- 현재는 UI 일부만 정리했으며, API 응답과 클라이언트 내부 데이터 구조는 그대로 남아 있다.

## 현재 확인된 이슈
- `race?action=members` 응답에 회원 `realName`이 포함된다.
- `race?action=confirmed-races` 응답에 기록별 `realName`이 포함된다.
- `my.html`, `races.html`는 공개 페이지인데도 내부적으로 `realName`을 키로 사용한다.
- 일부 외부 기록 링크는 이름을 query string에 포함한다.

## 해야 할 일
- `members` 공개 API에서 `realName` 제거 검토
- 공개용 식별자를 `nickname` 또는 별도 `memberKey`로 전환
- `confirmed-races` 공개 응답에서 `realName` 제거
- `my.html`의 회원 선택/검색 로직을 `memberKey` 기반으로 변경
- `races.html` 개인 탭 로직을 `memberKey` 기반으로 변경
- 게스트 검색과 회원 검색의 데이터 흐름 분리
- 외부 기록 링크 생성 시 이름 query 노출 최소화 방안 검토
- 운영진 전용 API와 공개 API를 명시적으로 분리
- Firestore 보안 규칙/서버 응답 기준으로 개인정보 노출 점검 체크리스트 작성
- 배포 전 privacy 회귀 테스트 시나리오 추가

## 권장 순서
1. 공개 API에서 `memberKey + nickname + team + gender`만 내려주도록 설계
2. 프런트에서 `realName` 의존 로직 제거
3. 게스트 검색만 예외적으로 이름 직접 입력 허용
4. 운영진 전용 화면에서만 실명 접근 허용
5. 회귀 테스트 후 배포

## 회귀 테스트 체크리스트
- 공개 페이지 네트워크 응답에 회원 실명이 남아 있지 않은가
- `my.html`에서 회원 선택, 기록 조회, 저장이 정상 동작하는가
- `races.html` PB/대회/개인 탭이 정상 동작하는가
- 게스트 검색은 계속 가능한가
- 운영진 화면에서는 기존처럼 실명 기반 관리가 가능한가
