# PRD: 출석 페이지 개편 — 3가지 뷰 모드

> 작성일: 2026-04-17  
> 상태: 승인됨  
> 우선순위: P1  

---

## 1. 배경 및 문제

동탄 마라톤 클럽(DMC)의 현재 출석 시스템(`index.html`)은 3단계 입력 방식으로, 사용자 경험이 번거롭다.

### 현재 시스템 한계

- **3단계 입력**: 닉네임 입력 → 팀 선택 → 출석 체크
- **정회원 명단 미연동**: 자동완성이 최근 출석 기반이며, `members` 컬렉션과 연동되지 않음
- **서버 중복 방지 없음**: 같은 닉네임으로 하루에 여러 번 출석 가능
- **게스트(비정회원) 구분 없음**: 정회원과 게스트를 구분하지 않음
- **출석 통계 부재**: 출석 횟수, 출석률, 연속 출석 등 개인별 통계 없음

**핵심 고통**: 사용자가 매번 3단계를 거쳐야 하며, 자봉(자원봉사자)이 여러 사람을 대신 출석 체크할 때 비효율적이다.

---

## 2. 목표 및 성공 기준


| 목표        | 성공 기준                    |
| --------- | ------------------------ |
| 원클릭 출석    | 재방문자는 1번의 터치로 출석 완료      |
| 중요 정보 강조  | 출석 인원, 개인 통계를 크게 표시      |
| 게스트 출석 지원 | 비정회원도 출석 입력 가능           |
| 자봉 모드     | 자원봉사자가 여러 사람 대신 출석 체크 가능 |
| 서버 중복 방지  | 같은 날짜 + 닉네임 중복 출석 차단     |


---

## 3. 범위

### In Scope

- **3가지 뷰 모드**:
  - **C안 (대시보드)**: 재방문자 본인 출석 (원클릭)
  - **B안 (검색 + 빠른 선택)**: 첫 방문자 본인 출석
  - **A안 (카드 그리드)**: 자봉 모드 - 여러 사람 대신 출석 체크
- **localStorage 프로필 저장**: 재방문자 자동 인식
- **서버 중복 방지**: 같은 날짜 + 닉네임 중복 체크
- **정회원 명단 연동**: `members` 컬렉션에서 실시간 로드
- **게스트 출석**: `isGuest` 플래그로 분리, 닉네임 자유 입력
- **출석 통계**: 현재 달 기준 출석 횟수, 출석률, 연속 출석

### Out of Scope

- 카카오톡 등 외부 알림 연동
- QR 코드 출석 체크
- 4자리 출석 번호 시스템 (벤치마크 참고만)
- `history.html` 기능 변경 (현행 유지)

---

## 4. 등장인물 (Actor)


| Actor       | 사용 뷰        | 시나리오                        |
| ----------- | ----------- | --------------------------- |
| 재방문자 (정회원)  | C안 (대시보드)   | localStorage 프로필 보유, 원클릭 출석 |
| 첫 방문자 (정회원) | B안 (검색 UI)  | 검색 또는 팀별 목록에서 선택            |
| 게스트 (비정회원)  | B안 (검색 UI)  | "게스트로 출석하기" 버튼 클릭           |
| 자봉 (자원봉사자)  | A안 (카드 그리드) | "자봉 모드" 버튼 클릭 후 여러 사람 출석 처리 |


---

## 5. 유저 시나리오

### 시나리오 A: 재방문자 본인 출석 (C안 - 대시보드)

1. 페이지 로드 → localStorage에 `myProfile` 존재
2. **C안 (대시보드)** 자동 표시:
  - 프로필 카드 (닉네임, 팀, 이번 달 출석 통계)
  - 큰 "✅ 출석 체크하기" 버튼
  - 오늘 정모 정보 + 현재 출석 인원
3. 버튼 클릭 → API 호출 → 성공 메시지 + 출석 인원 업데이트
4. **원클릭 완료**

### 시나리오 B: 첫 방문자 본인 출석 (B안 - 검색 UI)

1. 페이지 로드 → localStorage에 `myProfile` 없음
2. **B안 (검색 UI)** 자동 표시:
  - 거대한 검색 바 (정회원 닉네임 자동완성)
  - 최근 출석자 빠른 선택 칩
  - 팀별 접이식 목록 (전체 정회원 85명)
3. 사용자가 검색 또는 목록에서 본인 선택
4. "나로 저장하기" 체크박스 활성화 (선택)
5. 출석 버튼 클릭 → API 호출 → 성공
6. "나로 저장하기" 체크 시 → localStorage에 프로필 저장 → 다음 방문 시 C안 표시

### 시나리오 C: 게스트 출석 (B안 - 검색 UI)

1. 페이지 로드 (B안 또는 C안)
2. 하단 "게스트로 출석하기" 버튼 클릭
3. 모달 팝업:
  - 닉네임 입력 (자유 텍스트)
  - "출석 체크" 버튼
4. 버튼 클릭 → API 호출 (`isGuest: true`) → 성공 메시지

### 시나리오 D: 자봉 모드 (A안 - 카드 그리드)

1. 페이지 로드 (B안 또는 C안)
2. 우측 상단 "자봉 모드" 버튼 클릭
3. **A안 (카드 그리드)** 전환:
  - 상단 배너: "🦺 자봉 모드 활성화 중" + 현재 출석 인원
  - 정회원 85명 카드 그리드 (3열)
  - 검색 필터 (상단 고정)
4. 카드 클릭 → 즉시 API 호출 → 카드 상태 "출석 완료" (초록 배경)
5. 연속으로 여러 사람 출석 처리
6. "자봉 모드 종료" 버튼 클릭 → 이전 뷰로 복귀

### 시나리오 E: 프로필 재설정 (C안 → B안)

1. C안 (대시보드) 표시 중
2. 프로필 카드 우측 상단 "변경" 버튼 클릭
3. localStorage `myProfile` 삭제
4. **B안 (검색 UI)** 전환
5. 새 프로필 선택 + "나로 저장하기" 체크 → localStorage 갱신

---

## 6. 기능 명세

### 6.1 뷰 전환 로직 (프론트엔드)

```javascript
// 페이지 로드 시
function initPage() {
  const myProfile = localStorage.getItem('myProfile');
  
  if (myProfile) {
    showDashboardView(JSON.parse(myProfile)); // C안
  } else {
    showSearchView(); // B안
  }
}

// 자봉 모드 전환
function enterVolunteerMode() {
  showGridView(); // A안
}

// 프로필 재설정
function resetProfile() {
  localStorage.removeItem('myProfile');
  showSearchView(); // B안
}
```

### 6.2 API 명세

**주의**: 현재 시스템은 단일 Cloud Function `exports.attendance`를 사용하며, action-based 라우팅 방식을 사용합니다 (`?action=status`, `?action=members` 등). 본 PRD에서는 기존 패턴을 유지하면서 확장하는 방식을 제안합니다.

#### 6.2.1 출석 등록 API (기존 API 확장)

**Endpoint**: `POST /attendance` (기존)

**Request Body (확장)**:

```json
{
  "nickname": "게살볶음밥",
  "team": "T1",
  "meetingType": "SAT",
  "meetingDate": "2026/04/19",
  "isGuest": false
}
```

**기존 필드**:

- `nickname`: 닉네임 (필수)
- `team`: 팀 코드 (T1, T2 등, 필수)
- `meetingType`: 정모 타입 코드 (SAT, SUN, WED 등, 필수)
- `meetingDate`: 날짜 (`YYYY/MM/DD` 형식, 필수)

**신규 필드**:

- `isGuest`: 게스트 여부 (boolean, 기본값 `false`)

**Response (성공) - 기존 유지**:

```json
{
  "ok": true,
  "written": {
    "nicknameStored": "게살볶음밥",
    "team": "T1",
    "teamLabel": "Team 1",
    "meetingType": "SAT",
    "meetingTypeLabel": "토요일 정모",
    "meetingDate": "2026/04/19",
    "timeText": "오후 10:30"
  },
  "status": {
    "total": 33,
    "byTeam": { "T1": 18, "T2": 15 }
  }
}
```

**Response (중복) - 신규 추가**:

```json
{
  "ok": false,
  "error": "ALREADY_CHECKED_IN",
  "message": "오늘 이미 출석하셨습니다",
  "existingRecord": {
    "nickname": "게살볶음밥",
    "meetingDate": "2026/04/19",
    "timeText": "오전 9:15"
  }
}
```

**백엔드 로직 (신규 중복 체크 추가)**:

```javascript
// handlePost 함수 수정 (lines 291-388)
async function handlePost(req, res) {
  // ... 기존 파라미터 파싱 ...
  
  const nicknameStored = nicknameRaw.toUpperCase() === "TEST" ? makeTestNickname() : nicknameRaw;
  const isGuest = req.body.isGuest === true || req.body.isGuest === "true";
  
  // 🆕 중복 체크 (게스트는 제외)
  if (!isGuest) {
    const existing = await db.collection(COLLECTION)
      .where('nicknameKey', '==', nicknameStored.toLowerCase())
      .where('meetingDateKey', '==', meetingDateKey)
      .limit(1)
      .get();
    
    if (!existing.empty) {
      const existingData = existing.docs[0].data();
      return res.status(400).json({
        ok: false,
        error: 'ALREADY_CHECKED_IN',
        message: '오늘 이미 출석하셨습니다',
        existingRecord: {
          nickname: existingData.nickname,
          meetingDate: existingData.meetingDateKey,
          timeText: formatKstKoreanAmPm(new Date(existingData.ts))
        }
      });
    }
  }
  
  // 🆕 isGuest 필드 추가
  await db.collection(COLLECTION).add({
    nickname: nicknameStored,
    nicknameKey: nicknameStored.toLowerCase(),
    team: teamCode,
    teamLabel,
    meetingType: typeCode,
    meetingTypeLabel,
    meetingDateKey,
    monthKey,
    isGuest, // 🆕 추가
    timestamp: FieldValue.serverTimestamp(),
    ts: now.getTime(),
  });
  
  // ... 기존 응답 로직 ...
}
```

#### 6.2.2 정회원 목록 API (기존 활용)

**Endpoint**: `GET /attendance?action=members` (기존)

**Response (기존 유지)**:

```json
{
  "ok": true,
  "members": [
    {
      "id": "doc_id_123",
      "nickname": "라우펜더만",
      "realName": "이름1",
      "team": "T1",
      "gender": "M"
    },
    {
      "id": "doc_id_124",
      "nickname": "게살볶음밥",
      "realName": "이름2",
      "team": "T1",
      "gender": "M"
    }
  ]
}
```

**프론트엔드 매핑**:

```javascript
// 기존 API 응답을 새 UI에 맞게 변환
const response = await fetch('/attendance?action=members');
const data = await response.json();
const members = data.members.map(m => ({
  nickname: m.nickname,
  team: m.team === 'T1' ? 'Team 1' : 'Team 2',
  realName: m.realName
}));
```

#### 6.2.3 오늘 출석 현황 API (기존 활용)

**Endpoint**: `GET /attendance?action=status&meetingDate=2026/04/19` (기존)

**Response (기존 유지)**:

```json
{
  "ok": true,
  "meetingDate": "2026/04/19",
  "total": 32,
  "byTeam": { "T1": 18, "T2": 14 },
  "byMeetingType": { "SAT": 32 },
  "records": [
    {
      "nickname": "쌩메",
      "team": "T2",
      "teamLabel": "Team 2",
      "meetingType": "SAT",
      "meetingTypeLabel": "토요일 정모",
      "timeText": "오전 9:15"
    }
  ]
}
```

#### 6.2.4 개인 출석 통계 API (신규 추가)

**Endpoint**: `GET /attendance?action=stats&nickname=게살볶음밥&month=2026-04` (신규)

**Response**:

```json
{
  "ok": true,
  "nickname": "게살볶음밥",
  "month": "2026-04",
  "totalDays": 12,
  "totalMeetingsInMonth": 14,
  "attendanceRate": 85.7,
  "consecutiveDays": 3,
  "lastAttendance": "2026/04/17",
  "lastAttendanceTime": "오전 10:00"
}
```

**백엔드 로직 (신규 구현)**:

```javascript
// 새 action handler 추가
if (action === 'stats') {
  const nickname = req.query.nickname;
  const month = req.query.month; // "2026-04"
  
  if (!nickname || !month) {
    return res.status(400).json({ ok: false, error: 'nickname and month required' });
  }
  
  const monthKey = month.replace('-', '/'); // "2026/04"
  
  // 해당 월 사용자 출석 기록
  const userRecords = await db.collection(COLLECTION)
    .where('nicknameKey', '==', nickname.toLowerCase())
    .where('monthKey', '==', monthKey)
    .where('isGuest', '==', false)
    .orderBy('meetingDateKey', 'desc')
    .get();
  
  // 해당 월 전체 정모 횟수 (정회원 출석 기록 기준)
  const allRecordsSnapshot = await db.collection(COLLECTION)
    .where('monthKey', '==', monthKey)
    .where('isGuest', '==', false)
    .get();
  
  const uniqueDates = new Set();
  allRecordsSnapshot.forEach(doc => {
    uniqueDates.add(doc.data().meetingDateKey);
  });
  const totalMeetingsInMonth = uniqueDates.size;
  
  const totalDays = userRecords.size;
  const attendanceRate = totalMeetingsInMonth > 0 
    ? Math.round((totalDays / totalMeetingsInMonth) * 1000) / 10 
    : 0;
  
  // 연속 출석 계산 (역순으로 날짜 체크)
  let consecutiveDays = 0;
  const today = new Date();
  let checkDate = new Date(today);
  
  const userDates = userRecords.docs.map(d => d.data().meetingDateKey).sort().reverse();
  
  for (const dateKey of userDates) {
    const recordDate = new Date(dateKey.replace(/\//g, '-'));
    if (isSameDay(recordDate, checkDate) || isSameDay(recordDate, addDays(checkDate, -1))) {
      consecutiveDays++;
      checkDate = recordDate;
    } else {
      break;
    }
  }
  
  const lastRecord = userRecords.docs[0]?.data();
  
  return res.json({
    ok: true,
    nickname,
    month,
    totalDays,
    totalMeetingsInMonth,
    attendanceRate,
    consecutiveDays,
    lastAttendance: lastRecord?.meetingDateKey || null,
    lastAttendanceTime: lastRecord ? formatKstKoreanAmPm(new Date(lastRecord.ts)) : null
  });
}
```

### 6.3 localStorage 스키마

```json
{
  "myProfile": {
    "nickname": "게살볶음밥",
    "team": "Team 1",
    "savedAt": "2026-04-17T10:30:00Z"
  }
}
```

---

## 7. UI 명세

### 7.1 C안 (대시보드 뷰) - 재방문자

#### 레이아웃

```
┌─────────────────────────────────┐
│ [자봉 모드] 버튼 (우측 상단)     │
├─────────────────────────────────┤
│ 프로필 카드                      │
│ ┌─────────────────────────────┐ │
│ │ 👤 게살볶음밥                │ │
│ │ Team 1                      │ │
│ │ [변경] 버튼 (우측 상단)      │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ 출석 통계 카드                   │
│ ┌─────────────────────────────┐ │
│ │ 12회 출석 | 85% | 🔥3 연속   │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ 오늘 정모 정보                   │
│ ┌─────────────────────────────┐ │
│ │ 토요일 정모 (2026.04.19)    │ │
│ │ 현재 32명 출석 중            │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ [✅ 출석 체크하기] 버튼 (대형)   │
├─────────────────────────────────┤
│ 게스트로 출석하기 (링크)         │
└─────────────────────────────────┘
```

#### 스타일

- 프로필 카드: 그라디언트 배경 (#8B5CF6 → #7C3AED)
- 출석 버튼: 64px 높이, 그라디언트 배경 (#2563EB → #1D4ED8)
- 최소 터치 영역: 44x44px

### 7.2 B안 (검색 뷰) - 첫 방문자

#### 레이아웃

```
┌─────────────────────────────────┐
│ [자봉 모드] 버튼 (우측 상단)     │
├─────────────────────────────────┤
│ 오늘 정모 카드                   │
│ ┌─────────────────────────────┐ │
│ │ 토요일 정모                  │ │
│ │ 32명 출석 중                 │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ 🔍 검색 바 (거대, 56px 높이)     │
├─────────────────────────────────┤
│ ⚡ 최근 출석 (빠른 선택 칩)       │
│ [라우펜더만] [게살볶음밥] [디모] │
├─────────────────────────────────┤
│ 🏃 팀별 목록                      │
│ ▼ Team 1 (18명)                 │
│   [라우펜더만] [쌩메 ✓]          │
│ ▶ Team 2 (20명)                 │
├─────────────────────────────────┤
│ [+ 게스트로 출석하기] 버튼       │
└─────────────────────────────────┘
```

#### 동작

- 검색창: 정회원 닉네임 자동완성
- 최근 출석 칩: 클릭 시 해당 회원 선택
- 팀별 목록: 아코디언 (접기/펼치기)
- 회원 선택 시: "나로 저장하기" 체크박스 + [출석 체크] 버튼 표시

### 7.3 A안 (카드 그리드 뷰) - 자봉 모드

#### 레이아웃

```
┌─────────────────────────────────┐
│ 🦺 자봉 모드 활성화 중           │
│ 현재 출석: 32명                  │
│ [자봉 모드 종료] 버튼 (우측)     │
├─────────────────────────────────┤
│ 🔍 검색 필터 (고정)              │
├─────────────────────────────────┤
│ 정회원 카드 그리드 (3열)         │
│ ┌───┐ ┌───┐ ┌───┐             │
│ │👤 │ │✅ │ │👤 │             │
│ │라우│ │쌩메│ │SJ │             │
│ └───┘ └───┘ └───┘             │
│ (85개 카드...)                  │
└─────────────────────────────────┘
```

#### 카드 상태

- **미출석**: 흰색 배경, 2px 테두리 (#E2E8F0)
- **출석 완료**: 초록 배경 (#F0FDF4), 체크 이모지 (✅)
- **터치 영역**: 최소 44x44px

#### 동작

- 카드 클릭 → 즉시 API 호출 → 상태 "출석 완료"로 변경
- 디바운싱: 빠른 연속 클릭 방지 (300ms)
- 검색 필터: 닉네임 실시간 필터링

---

## 8. 벤치마크 인사이트


| 서비스        | 핵심 패턴                        | 채용한 요소        |
| ---------- | ---------------------------- | ------------- |
| **OneTap** | QR 코드 + 이름 검색 리스트 + 관리자 대시보드 | B안의 검색 리스트    |
| **출석첵첵**   | 4자리 출석 번호 입력으로 원클릭           | 원클릭 컨셉만 차용    |
| **포포패스**   | 직관적 UI + 실시간 출결 현황           | 모든 뷰에 실시간 카운터 |


**공통점**: 검색 또는 코드 기반, 실시간 카운터 강조

---

## 9. 기술 스택 및 구현 전략

### 9.1 프론트엔드

- **기본 스택**: HTML, Vanilla JavaScript, CSS
- **localStorage**: 프로필 저장 및 뷰 분기 처리
- **API 호출**: `fetch()` 사용
- **반응형**: 모바일 우선 (375px ~ 428px 기준)

### 9.2 백엔드

- **Firebase Cloud Functions** (Node.js 24)
- **Firestore**:
  - `attendance` 컬렉션: 출석 기록
  - `members` 컬렉션: 정회원 명단
- **API 엔드포인트**:
  - `POST /api/attendance` (신규)
  - `GET /api/members` (신규)
  - `GET /api/attendance/today` (신규)
  - `GET /api/attendance/stats` (신규)

### 9.3 구현 우선순위

1. **Phase 1 (P0)**: B안 (검색 뷰) + 서버 중복 방지
2. **Phase 2 (P1)**: C안 (대시보드) + localStorage 프로필
3. **Phase 3 (P2)**: A안 (자봉 모드) + 카드 그리드
4. **Phase 4 (P3)**: 출석 통계 API + 대시보드 통계 표시

---

## 10. 주의사항 및 제약

### 10.1 중복 방지

- **서버에서 같은 날짜 + 닉네임 중복 체크 필수** (Phase 1 P0)
  - `handlePost` 함수에 중복 체크 로직 추가 필요
  - `where('nicknameKey', '==', ...).where('meetingDateKey', '==', ...)` 쿼리 사용
  - 게스트(`isGuest=true`)는 중복 체크 제외
- 프론트엔드는 API 응답(`ok: false, error: 'ALREADY_CHECKED_IN'`)에 따라 에러 메시지 표시
- 에러 메시지 예시: "오늘 이미 출석하셨습니다 (오전 9:15)"

### 10.2 정회원 동기화

- `members` 컬렉션에서 실시간 로드
- 서버 응답 캐싱 고려 (5분 TTL)

### 10.3 게스트 처리

- `isGuest=true` 플래그로 분리 (Phase 1)
  - **스키마 마이그레이션 필요**: 기존 레코드에 `isGuest: false` 기본값 추가
  - Cloud Function `handlePost` 수정하여 `isGuest` 파라미터 accept
- 닉네임 자유 입력 (정회원 명단 검증 없음)
- **게스트는 중복 체크 제외**: 같은 닉네임으로 여러 게스트 출석 가능
- 게스트는 출석 통계 API에서 제외 (`where('isGuest', '==', false)`)

### 10.4 출석 통계

- 현재 달 기준 계산
- **출석률 계산식**: `(해당 회원 출석 횟수 / 해당 월 전체 정모 횟수) * 100`
  - 전체 정모 횟수 = `attendance` 컬렉션에서 해당 월 `meetingDateKey`의 unique count
  - 정회원만 집계 (`where('isGuest', '==', false)`)
- **연속 출석 계산**: 오늘부터 역순으로 날짜 체크, 하루 이상 빠지면 중단
- API 응답 캐싱 고려 (10분 TTL)

### 10.5 자봉 모드

- 빠른 연속 클릭 대비 디바운싱 (300ms)
- 카드 상태 즉시 반영 (낙관적 업데이트)
- API 실패 시 롤백

### 10.6 모바일 최적화

- 최소 터치 영역: 44x44px
- 스크롤 성능: 가상 스크롤 고려 (85개 카드)
- Pull-to-refresh 지원

### 10.7 접근성

- 색상 대비 4.5:1 이상 (WCAG AA)
- 버튼 명확한 레이블
- 클릭 애니메이션 (시각적 피드백)
- 오류 메시지 명확하게
- **이모지 대체 텍스트**: 
  - `👤` → `aria-label="미출석"`
  - `✅` → `aria-label="출석 완료"`
  - `🦺` → `aria-label="자원봉사 모드"`

### 10.8 localStorage 및 오프라인

- **localStorage quota 초과 처리**: 
  - localStorage write 실패 시 warning 표시하되, 출석 체크는 정상 진행
  - 프로필 저장 실패 메시지: "프로필 저장에 실패했습니다 (브라우저 설정 확인)"
- **"나로 저장하기" 체크박스**: 
  - 기본값: `unchecked` (공용 기기 대비)
  - 라벨: "다음부터 바로 출석하기 (내 기기에 저장)"

### 10.9 UI 동작 명세

- **"최근 출석" 칩 (B안)**:
  - 데이터 소스: 오늘 출석 완료한 회원 (실시간, `action=status` API)
  - 최대 10명 표시, 가로 스크롤
- **팀별 목록 카운트 (B안)**:
  - `members` 컬렉션 기준 전체 회원 수 표시
  - 예: "▼ Team 1 (18명)" (hidden 회원 포함)
- **자봉 모드 종료 (A안)**:
  - localStorage `myProfile` 존재 시 → C안 (대시보드) 복귀
  - 없으면 → B안 (검색 UI) 복귀
- **디바운싱 (A안 자봉 모드)**:
  - 카드 클릭 후 150ms 동안 동일 카드 클릭 무시
  - 다른 카드는 즉시 클릭 가능 (request queueing 방식)

---

## 11. 성공 지표 (KPI)


| 지표          | 측정 방법               | 목표                         |
| ----------- | ------------------- | -------------------------- |
| 평균 출석 소요 시간 | 페이지 로드 ~ 출석 완료      | < 5초 (재방문자), < 15초 (첫 방문자) |
| 중복 출석 시도    | API 에러 응답 수         | < 1%                       |
| 자봉 모드 사용률   | 자봉 모드 진입 세션 비율      | > 20% (정모 당일)              |
| 게스트 출석 비율   | `isGuest=true` 기록 수 | > 5%                       |


---

## 12. 향후 개선 방향

### 단기 (1개월)

- QR 코드 출석 체크
- 4자리 출석 번호 시스템

### 중기 (3개월)

- 카카오톡 출석 알림
- 출석 이벤트 (연속 출석 배지, 월간 랭킹)

### 장기 (6개월)

- PWA (Progressive Web App) 전환
- 푸시 알림 지원
- 오프라인 모드

---

## 13. 부록

### 13.1 Firestore 스키마 (attendance 컬렉션)

**기존 필드**:

```javascript
{
  nickname: "게살볶음밥",
  nicknameKey: "게살볶음밥", // lowercase
  team: "T1",
  teamLabel: "Team 1",
  meetingType: "SAT",
  meetingTypeLabel: "토요일 정모",
  meetingDateKey: "2026/04/19", // YYYY/MM/DD 형식
  monthKey: "2026/04", // YYYY/MM 형식
  timestamp: Timestamp, // Firestore timestamp
  ts: 1776428224000, // Unix timestamp (ms)
}
```

**신규 필드 (Phase 1)**:

```javascript
{
  // ... 기존 필드 ...
  isGuest: false, // 🆕 게스트 여부 (boolean)
}
```

**스키마 마이그레이션 계획**:

1. Cloud Function 배포 전: 기존 모든 레코드에 `isGuest: false` 필드 추가 (Firestore 콘솔 또는 스크립트)
2. `handlePost` 함수 수정하여 `isGuest` 파라미터 accept
3. 프론트엔드 배포 후 게스트 출석 기능 활성화

```

### 13.2 Firestore 인덱스

**기존 인덱스** (이미 존재):
```

컬렉션: attendance
필드: nicknameKey (Ascending), monthKey (Ascending)

```

**신규 인덱스 (Phase 1 배포 전 생성 필요)**:
```

컬렉션: attendance
필드: nicknameKey (Ascending), meetingDateKey (Ascending)
용도: 중복 체크 쿼리 최적화

```

```

컬렉션: attendance
필드: isGuest (Ascending), monthKey (Ascending)
용도: 통계 API 쿼리 최적화

```

---

## 14. 구현 의존성 체크리스트

**Phase 1 (P0) 배포 전 필수**:
- [ ] Firestore 인덱스 생성 (`nicknameKey + meetingDateKey`, `isGuest + monthKey`)
- [ ] 기존 `attendance` 레코드에 `isGuest: false` 필드 추가 (스키마 마이그레이션)
- [ ] Cloud Function `handlePost` 수정:
  - [ ] 중복 체크 로직 추가
  - [ ] `isGuest` 파라미터 accept
  - [ ] 게스트는 중복 체크 제외
- [ ] Cloud Function에 `action=stats` handler 추가 (통계 API)
- [ ] 로컬 에뮬레이터 테스트:
  - [ ] 정회원 중복 출석 시도 → 에러 응답 확인
  - [ ] 게스트 중복 출석 시도 → 성공 확인
  - [ ] 통계 API 응답 형식 확인

**Phase 2 (P1) 배포 전**:
- [ ] localStorage 프로필 저장/로드 로직 구현
- [ ] C안 (대시보드) UI 구현
- [ ] 통계 API 호출 및 렌더링

**Phase 3 (P2) 배포 전**:
- [ ] A안 (자봉 모드) UI 구현
- [ ] 카드 그리드 성능 테스트 (85개 카드)

---

## 15. API 마이그레이션 계획

**전략**: 기존 API 패턴 유지 및 확장 (Non-breaking change)

| API | 변경 사항 | 호환성 |
|---|---|---|
| `POST /attendance` | `isGuest` 필드 추가 (optional, 기본값 `false`) | ✅ 기존 클라이언트 호환 |
| `POST /attendance` | 중복 체크 로직 추가 → 에러 응답 가능 | ⚠️ 기존 클라이언트는 에러 핸들링 필요 |
| `GET /attendance?action=members` | 변경 없음 | ✅ 완전 호환 |
| `GET /attendance?action=status` | 변경 없음 | ✅ 완전 호환 |
| `GET /attendance?action=stats` | 신규 추가 | ✅ 기존 클라이언트 영향 없음 |

**롤백 계획**:
1. 프론트엔드 문제 발생 시: `index.html`로 즉시 복귀 (백엔드는 기존 API 유지하므로 영향 없음)
2. 백엔드 중복 체크 문제 발생 시: `handlePost` 함수의 중복 체크 로직만 주석 처리 후 재배포

---

## 16. 테스트 시나리오

### Phase 1 필수 테스트

**16.1 중복 체크 테스트**:
1. 정회원 A가 오늘 출석 → 성공
2. 정회원 A가 다시 출석 시도 → 에러 `ALREADY_CHECKED_IN`
3. 게스트 "게스트1"이 출석 → 성공
4. 게스트 "게스트1"이 다시 출석 시도 → 성공 (게스트는 중복 허용)

**16.2 동시성 테스트**:
1. 같은 정회원 A가 2개 기기에서 동시 출석 → 1개는 성공, 1개는 에러
2. 다른 정회원 A, B가 동시 출석 → 둘 다 성공

**16.3 게스트 출석 테스트**:
1. 게스트 닉네임 "친구1" 입력 → 성공
2. 통계 API 호출 → 게스트는 제외됨 확인

### Phase 2 필수 테스트

**16.4 localStorage 테스트**:
1. 프로필 저장 ("나로 저장하기" 체크) → C안 표시
2. localStorage 삭제 후 재접속 → B안 표시
3. 시크릿 모드 접속 → localStorage 실패 warning + B안 표시

### Phase 3 필수 테스트

**16.5 자봉 모드 테스트**:
1. 자봉 모드 진입 → A안 표시
2. 10명 연속 출석 처리 → 모두 성공
3. 이미 출석한 회원 클릭 → 에러 메시지 표시

---

## 17. 모니터링 및 로깅

**Phase 1 배포 후 모니터링 필수**:
- 중복 출석 시도 건수 (에러 로그 `ALREADY_CHECKED_IN`)
- localStorage write 실패 건수 (프론트엔드 로그)
- API 응답 시간 (특히 통계 API)
- 게스트 출석 비율 (`isGuest=true` 비율)

**Cloud Function 로그 추가**:
```javascript
// 중복 체크 결과 로깅
if (!existing.empty) {
  console.warn(`[DUPLICATE] ${nicknameStored} tried to check-in again on ${meetingDateKey}`);
  // ... 에러 응답 ...
}

// 게스트 출석 로깅
if (isGuest) {
  console.info(`[GUEST] ${nicknameStored} checked-in on ${meetingDateKey}`);
}
```

---

## 18. 참고 자료

- [OneTap Check-In](https://www.onetapcheckin.dev/)
- [출석첵첵](https://checkcheck.runmoa.com/)
- [포포패스 App Store](https://apps.apple.com/kr/app/%ED%8F%AC%ED%8F%AC%ED%8C%A8%EC%8A%A4/id6745065406)
- [기존 출석 시스템 (index.html)](https://dmc-attendance.web.app/)

