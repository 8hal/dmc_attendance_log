# DMC Attendance Log

QR 기반 출석 체크 경험을 개선하고, 관리자가 분석 가능한 고품질 출석 데이터를 얻기 위한
**Firebase 기반** 출석 시스템입니다.

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

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│  사용자 (QR 스캔)                                            │
│         ↓                                                    │
│  ┌─────────────────┐     ┌─────────────────┐                │
│  │  GitHub Pages   │     │ Firebase Hosting │                │
│  │  (프로덕션 FE)   │     │   (백업 FE)      │                │
│  └────────┬────────┘     └────────┬────────┘                │
│           │                       │                          │
│           └───────────┬───────────┘                          │
│                       ↓                                      │
│           ┌───────────────────────┐                          │
│           │  Firebase Functions   │  ← API (asia-northeast3) │
│           │  (Cloud Functions)    │                          │
│           └───────────┬───────────┘                          │
│                       ↓                                      │
│           ┌───────────────────────┐                          │
│           │      Firestore        │  ← 메인 데이터베이스      │
│           └───────────┬───────────┘                          │
│                       ↓                                      │
│           ┌───────────────────────┐                          │
│           │    Google Sheets      │  ← 실시간 백업           │
│           └───────────────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

### 성능 개선 (2026. 1. 11.)

| 구분 | 이전 (Apps Script) | 현재 (Firebase) | 개선 |
|-----|-------------------|-----------------|------|
| API 응답 속도 | 500~2000ms | 100~300ms | **5~10배 향상** |
| Cold Start | 느림 | 빠름 | 체감 속도 개선 |

## 사용자 흐름 요약

1. 사용자가 QR 코드를 스캔해 출석 페이지로 이동
2. 닉네임/팀/모임유형/날짜를 간편 입력 후 제출
3. Firebase Functions가 Firestore에 저장하고, Google Sheets에 실시간 백업
4. 해당 날짜의 출석 현황을 반환
5. 출석자 목록에서 닉네임을 선택해 월간 출석 기록을 확인

## 웹 페이지

- `index.html`: 출석 체크 및 당일 출석 현황
- `history.html`: 닉네임별 월간 출석 기록(출석률 바 포함)

### 서비스 URL

| 용도 | URL |
|-----|-----|
| **프로덕션 (QR)** | https://8hal.github.io/dmc_attendance_log/ |
| Firebase Hosting | https://dmc-attendance.web.app |

## 데이터 스키마

### Firestore (`attendance` 컬렉션)

| 필드 | 타입 | 설명 |
|-----|------|------|
| nickname | string | 닉네임 |
| nicknameKey | string | 검색용 소문자 닉네임 |
| team | string | 팀 코드 (T1~T5, S) |
| teamLabel | string | 팀 라벨 (1팀~5팀, S팀) |
| meetingType | string | 모임 유형 코드 (TUE, THU, SAT, ETC) |
| meetingTypeLabel | string | 모임 유형 라벨 |
| meetingDateKey | string | 모임 날짜 (YYYY/MM/DD) |
| monthKey | string | 월 키 (YYYY-MM) |
| timestamp | Timestamp | 서버 타임스탬프 |
| ts | number | 클라이언트 타임스탬프 (ms) |

### Google Sheets (백업)

- A: timestamp (DateTime)
- B: nickname (string)
- C: teamLabel (string, 예: 1팀, S팀)
- D: meetingTypeLabel (string, 예: 토요일, 기타)
- E: meetingDate (YYYY/MM/DD)

## API

### POST /attendance

출석 등록

**요청 필드**
- nickname: string
- team: enum code (T1..T5, S)
- meetingType: enum code (ETC, TUE, THU, SAT)
- meetingDate: YYYY/MM/DD

**응답**
- 저장된 출석 정보와 해당 날짜의 출석 현황

### GET /attendance?action=status&date=YYYY/MM/DD

날짜별 출석 현황 조회

- date 파라미터 생략 시 KST 기준 오늘 날짜로 조회

### GET /attendance?action=history&nickname=xxx&month=YYYY-MM

닉네임별 월간 출석 기록 조회

## 개발 및 배포

### Firebase 프로젝트

- 프로젝트 ID: `dmc-attendance`
- 리전: `asia-northeast3` (서울)

### 배포

```bash
# Functions 배포
firebase deploy --only functions

# Hosting 배포
firebase deploy --only hosting

# 전체 배포
firebase deploy
```

### 로컬 테스트

```bash
# Functions 에뮬레이터
cd functions
npm run serve

# 로컬 서버 (프론트엔드)
python3 -m http.server 8080
```

## 스크립트

### 마이그레이션 (Sheets → Firestore)

```bash
cd scripts

# 1. Google Sheets에서 CSV 내보내기 후 data.csv로 저장
# 2. service-account.json 준비

npm run migrate
```

### 테스트 데이터 정리

```bash
cd scripts

# 삭제 대상 미리보기 (dry-run)
npm run cleanup:dry

# 실제 삭제 (Firestore + Sheets)
npm run cleanup
```

## Analytics (GA4)

`index.html`과 `history.html`의 `GA_MEASUREMENT_ID`에 GA4 측정 ID를 입력하면 이벤트가 전송됩니다.

**이벤트 목록**
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

- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Backend**: Firebase Cloud Functions (Node.js)
- **Database**: Firestore
- **Backup**: Google Sheets (실시간 동기화)
- **Hosting**: GitHub Pages, Firebase Hosting
- **Analytics**: Google Analytics 4

## 변경 이력

### 2026. 1. 16. - 요일 기반 기본값 자동 설정 📅

- **요일에 따른 기본 날짜/정모 유형 자동 설정**
  - 월요일: 토요 정모 + 2일 전 (토요일)
  - 화요일: 화요 정모 + 당일
  - 수요일: 화요 정모 + 1일 전 (화요일)
  - 목요일: 목요 정모 + 당일
  - 금요일: 목요 정모 + 1일 전 (목요일)
  - 토요일: 토요 정모 + 당일
  - 일요일: 토요 정모 + 1일 전 (토요일)
- **문제 해결**: QR 없이 다음 날 출석 체크 시 날짜를 변경하지 않아 잘못된 데이터가 쌓이는 문제 해결
- **스테이징 테스트 모드**: `?testDate=YYYY-MM-DD` URL 파라미터로 날짜 시뮬레이션 가능
- **정모 정보 문서 추가**: `docs/MEETING_INFO.md`

### 2026. 1. 14. - UI 리뉴얼 🎨

- **출석 체크 폼 구조 개선**
  - 닉네임 → 소속팀 → 출석 체크 버튼 → 상세 설정(접힘)
  - 날짜/정모 유형을 아코디언으로 숨김 처리 (자주 변경하지 않는 값)
- **블루 스카이 색상 팔레트 적용**
  - Primary: `#2563EB`
  - 입력 필드 포커스 효과, 버튼 호버 효과 추가
- **출석 체크 버튼 강조** (60px 높이, 세미볼드)
- **월별 기록 페이지 개선**
  - 공유 버튼을 상단 네비게이션으로 이동
  - 하단 버튼 영역 제거
- **SNS 공유 이미지 개선**
  - 10% 단위 원형 프로그레스 바 이미지 적용
  - `html2canvas` 호환성 문제 해결

### 2026. 1. 11. - Firebase 마이그레이션 🚀

- Google Apps Script → Firebase Cloud Functions 전환
- Google Sheets → Firestore 마이그레이션 (99개 데이터)
- API 응답 속도 5~10배 향상 (500~2000ms → 100~300ms)
- 실시간 Google Sheets 백업 기능 추가
- 테스트 데이터 정리 스크립트 추가

### 2026. 1. 7.

- GA4 이벤트 추가
- 월별 출석 현황 보기 뷰 추가
- 제출 레이턴시 측정 체계 구축
- UI 업데이트

## 향후 계획

- ~~GA 추가를 통한 사용자 행동 로그 및 분석 환경 구축~~ (완료: 2026. 1. 7.)
- ~~월별 출석 현황 보기 뷰 추가로 출석 체크 행동의 효용을 높여 출석 체크율 증대~~ (완료: 2026. 1. 7.)
- ~~제출 레이턴시 측정 체계 구축 (클라이언트/서버 구간 분리)~~ (완료: 2026. 1. 7.)
- ~~제출 레이턴시 최적화로 응답 체감 속도 개선~~ (완료: 2026. 1. 11. - Firebase 마이그레이션)
- ~~입력 자동화 개선 및 중복 제출 방지 로직 강화~~ (완료: 2026. 1. 7.)
- ~~월별 출석 기록 SNS 공유 기능~~ (완료: 2026. 1. 14.)
- ~~UI 리뉴얼 및 색상 팔레트 개선~~ (완료: 2026. 1. 14.)
- ~~요일 기반 기본 날짜/정모 유형 자동 설정~~ (완료: 2026. 1. 16.)
- 지표 대시보드 및 품질 검증 룰 확장
- 라벨 프린터 연동으로 출석 후 스티커 라벨 출력 제공
- 월별 출석 현황 게시물을 자동 생성해 카페에 게시

## 라이선스

TBD
