# DMC Attendance Log

QR 기반 출석 체크 경험을 개선하고, 관리자가 분석 가능한 고품질 출석 데이터를 얻기 위한
Google Apps Script 기반 출석 시스템입니다.

## 프로젝트 배경

마라톤클럽의 QR 출석 도입 이후, 기존 구글 폼 입력 경험이 비효율적이었습니다.
출석자는 매번 동일한 정보를 반복 입력해야 하고, 오늘 날짜처럼 자동화 가능한 정보까지
수동 입력해야 하는 문제가 있었습니다.

## 목표

- 출석 체크자가 응답에 걸리는 시간과 피로도를 0에 가깝게 감소
- 관리자가 데이터 분석에 필요한 품질 좋은 출석 데이터를 확보

## 성공 지표

- 출석 완료 수: 특정 모임일 기준 유효 응답 수(중복/오류 제외)
- 출석 전환율: QR 방문 대비 유효 제출 비율
- 데이터 품질
  - 잘못된 닉네임 입력률
  - 중복 제출률
  - 필수 필드 누락률

## 사용자 흐름 요약

1. 사용자가 QR 코드를 스캔해 출석 페이지로 이동
2. 닉네임/팀/모임유형/날짜를 간편 입력 후 제출
3. 서버가 시트에 저장하고, 해당 날짜의 출석 현황을 반환
4. 출석자 목록에서 닉네임을 선택해 월간 출석 기록을 확인

## 웹 페이지

- `index.html`: 출석 체크 및 당일 출석 현황
- `history.html`: 닉네임별 월간 출석 기록(출석률 바 포함)

## 데이터 스키마 (응답 시트)

- A: timestamp (DateTime)
- B: nickname (string)
- C: teamLabel (string, 예: 1팀, S팀)
- D: meetingTypeLabel (string, 예: 토요일, 기타)
- E: meetingDate (Date object 또는 "YYYY. M. D" 문자열)

## API

### POST /exec

요청 필드
- nickname: string
- team: enum code (T1..T5, S)
- meetingType: enum code (ETC, TUE, THU, SAT)
- meetingDate: YYYY/MM/DD

응답
- 저장된 출석 정보와 해당 날짜의 출석 현황

### GET /exec?action=status&date=YYYY/MM/DD

- date 파라미터 생략 시 KST 기준 오늘 날짜로 조회
- E 컬럼이 Date 또는 문자열인 경우 모두 인식
- "YYYY/MM/DD" 또는 "YYYY. M. D" 형식 지원

## 개발 및 배포

이 프로젝트는 Google Apps Script를 사용합니다.

1. Google Sheets에 응답 시트를 준비하고 시트 이름을 확인합니다.
2. `apps-script/Code.gs`의 `TARGET_SHEET_NAME`을 실제 시트명으로 설정합니다.
3. Apps Script에 코드를 배포하여 웹 앱 엔드포인트를 생성합니다.

### 현재 배포

- 버전: 12 (2026. 1. 7., PM 10:22)
- 설명: UI 업데이트 및 GA 이벤트 추가
- 배포 ID: `AKfycbz2_GEXNqGdf7WGb75H9w6N0KorGJNQ_iD7SU5hxE8NLPBXrpU-fwxpTy1P1WHPlxsx4A`
- 웹 앱 URL: `https://script.google.com/macros/s/AKfycbz2_GEXNqGdf7WGb75H9w6N0KorGJNQ_iD7SU5hxE8NLPBXrpU-fwxpTy1P1WHPlxsx4A/exec`
- 라이브러리 URL: `https://script.google.com/macros/library/d/1HpT8BoitLaBHA4a5fZrKfjUTQlEYD3CexbMCR3Ys-0oCNDpWfM3YV4Zt/12`

## Analytics (GA4)

`index.html`과 `history.html`의 `GA_MEASUREMENT_ID`에 GA4 측정 ID를 입력하면 이벤트가 전송됩니다.

이벤트 목록
- attendance_view: date_key, meeting_type, meeting_type_auto
- attendance_date_change: date_key, meeting_type, meeting_type_auto
- attendance_meeting_type_change: meeting_type
- attendance_submit_attempt: date_key, meeting_type, team
- attendance_submit_success: date_key, meeting_type, team, duration_ms, page_to_submit_ms
- attendance_submit_error: error_type, date_key(optional)
- attendance_status_fetch_success: date_key
- attendance_status_fetch_error: date_key
- history_view: nickname_present, month
- history_fetch_success: month, latency_ms, count
- history_back_click: month

## 기술 스택

- Google Apps Script
- Google Sheets

## 향후 계획

- 제출 레이턴시 측정 체계 구축 (클라이언트/서버 구간 분리)
- 제출 레이턴시 최적화로 응답 체감 속도 개선
- 입력 자동화 개선 및 중복 제출 방지 로직 강화
- 지표 대시보드 및 품질 검증 룰 확장
- GA 추가를 통한 사용자 행동 로그 및 분석 환경 구축
- GitHub + Apps Script 배포 자동화 파이프라인 구축 (clasp/GitHub Actions)
- 월별 출석 현황 보기 뷰 추가로 출석 체크 행동의 효용을 높여 출석 체크율 증대
- 라벨 프린터 연동으로 출석 후 스티커 라벨 출력 제공 (종이컵/옷 부착, 일회용품 사용량 감소 및 회원 간 소통 증대)
- 월별 출석 현황 게시물을 자동 생성해 카페에 게시

## 고민 사항

- 날짜와 정모 유형의 관계 정립
- 날짜 변경 시 정모 유형 자동 변경 여부는 당장은 구현하지 않음

## 라이선스

TBD
