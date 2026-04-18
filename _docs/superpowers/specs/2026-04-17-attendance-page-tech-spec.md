# Tech Spec: 출석 페이지 개편 Phase 1

> 작성일: 2026-04-17  
> PRD 참조: `2026-04-17-attendance-page-redesign-v2.md`  
> 상태: 초안  

---

## 1. 개요

본 문서는 출석 페이지 개편 Phase 1의 기술적 설계를 다룬다. PRD에서 정의한 제품 요구사항을 구현 가능한 기술 아키텍처로 변환한다.

---

## 2. 시스템 아키텍처

### 2.1 컴포넌트 다이어그램

```
┌─────────────────────────────────────────────────────────┐
│                   attendance-v2.html                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  C안 (대시보드) │  │  B안 (검색 UI)  │  │ 게스트 모달    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│           ↓                ↓                 ↓          │
│      ┌────────────────────────────────────────┐        │
│      │     JavaScript 상태 관리 (Vanilla)      │        │
│      │  - currentMode: 'dashboard' | 'search' │        │
│      │  - myProfile: { nickname, memberId }   │        │
│      └────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
                          ↓
                  localStorage (프로필)
                          ↓
┌─────────────────────────────────────────────────────────┐
│           Firebase Cloud Functions (Node.js 24)         │
│  ┌────────────────────────────────────────────────────┐ │
│  │  exports.attendance (단일 함수, action-based)       │ │
│  │  - POST: handlePost (중복 체크 + 출석 등록)         │ │
│  │  - GET ?action=members: 정회원 목록                 │ │
│  │  - GET ?action=status: 오늘 출석 현황               │ │
│  │  - GET ?action=stats: 개인 통계 (신규)             │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   Firestore Database                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  attendance  │  │   members    │  │   feedback   │  │
│  │  (출석 기록)   │  │  (정회원 명단) │  │  (베타 피드백) │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 데이터 모델링

### 3.1 Firestore 스키마

#### 3.1.1 `attendance` 컬렉션

**기존 필드**:

```javascript
{
  // 식별 정보
  nickname: "게살볶음밥",           // String, 표시용
  nicknameKey: "게살볶음밥",       // String, lowercase, 쿼리용
  
  // 팀 정보 (스냅샷)
  team: "T1",                       // String, 팀 코드
  teamLabel: "Team 1",              // String, 팀 레이블
  
  // 정모 정보
  meetingType: "SAT",               // String, 정모 타입 코드
  meetingTypeLabel: "토요일 정모",   // String, 정모 타입 레이블
  meetingDateKey: "2026/04/19",    // String, YYYY/MM/DD
  monthKey: "2026/04",             // String, YYYY/MM
  
  // 타임스탬프
  timestamp: Timestamp,             // Firestore Timestamp
  ts: 1776428224000,               // Number, Unix timestamp (ms)
}
```

**신규 필드 (Phase 1)**:

```javascript
{
  // ... 기존 필드 ...
  
  // 회원 연결 (Foreign Key)
  memberId: "members_doc_id_123",  // String | null
                                   // - 정회원: members 컬렉션의 Doc ID
                                   // - 게스트: null
  
  // 게스트 플래그
  isGuest: false,                  // Boolean
                                   // - true: 게스트 출석
                                   // - false: 정회원 출석
}
```

**전체 스키마 (Phase 1 이후)**:

```javascript
{
  nickname: "게살볶음밥",
  nicknameKey: "게살볶음밥",
  memberId: "members_doc_id_123",  // 🆕 Foreign Key
  team: "T1",
  teamLabel: "Team 1",
  meetingType: "SAT",
  meetingTypeLabel: "토요일 정모",
  meetingDateKey: "2026/04/19",
  monthKey: "2026/04",
  isGuest: false,                  // 🆕 게스트 플래그
  timestamp: Timestamp,
  ts: 1776428224000,
}
```

**게스트 레코드 예시**:

```javascript
{
  nickname: "친구1",
  nicknameKey: "친구1",
  memberId: null,                  // 🆕 게스트는 null
  team: "GUEST",
  teamLabel: "게스트",
  meetingType: "SAT",
  meetingTypeLabel: "토요일 정모",
  meetingDateKey: "2026/04/19",
  monthKey: "2026/04",
  isGuest: true,                   // 🆕 게스트 플래그
  timestamp: Timestamp,
  ts: 1776428224000,
}
```

#### 3.1.2 `members` 컬렉션 (변경 없음)

```javascript
{
  id: "auto_generated_doc_id",    // Firestore Doc ID
  nickname: "게살볶음밥",
  realName: "홍길동",
  team: "T1",
  gender: "M",
  // ... 기타 필드 (변경 없음)
}
```

#### 3.1.3 `feedback` 컬렉션 (신규, 베타용)

```javascript
{
  userId: "nickname or guest",     // String
  message: "출석이 너무 편해요!",    // String
  rating: 5,                       // Number (1-5)
  timestamp: Timestamp,            // Firestore Timestamp
  userAgent: "Mozilla/5.0...",     // String (optional)
}
```

### 3.2 데이터 관계

```
members (1) ────────────> (N) attendance
  ^                                 |
  |                                 |
  | memberId (FK)                   |
  |                                 |
  +─────────────────────────────────+
  
게스트: attendance.memberId = null
```

### 3.3 필드 전략 및 마이그레이션 계획

#### 3.3.1 nicknameKey vs memberId

**현재 상황**:

- 기존 시스템: `nicknameKey` (lowercase) 기반 쿼리
- Phase 1: `memberId` (FK) 추가

**전략**:


| Phase        | nicknameKey | memberId | 용도                               |
| ------------ | ----------- | -------- | -------------------------------- |
| Phase 1 (현재) | ✅ 유지        | ✅ 추가     | 둘 다 저장, 점진적 전환                   |
| Phase 2 (차기) | ✅ 유지        | ✅ 주 쿼리   | memberId 기반 쿼리, nicknameKey는 검색용 |
| Phase 3 (장기) | ⚠️ 검색만      | ✅ 주 쿼리   | nicknameKey 인덱스 제거 고려            |


**쿼리 전환 예시**:

```javascript
// Phase 1: 둘 다 지원 (하위 호환)
// 기존 쿼리
const records = await db.collection('attendance')
  .where('nicknameKey', '==', nickname.toLowerCase())
  .get();

// 신규 쿼리 (권장)
const records = await db.collection('attendance')
  .where('memberId', '==', memberId)
  .get();

// Phase 2+: memberId만 사용
const records = await db.collection('attendance')
  .where('memberId', '==', memberId)
  .get();
// nicknameKey는 자동완성 검색에만 활용
```

**장점**:

- 닉네임 변경 시에도 과거 기록 유지 (memberId 기반)
- 기존 코드 호환성 유지 (nicknameKey 유지)
- 점진적 마이그레이션 가능

#### 3.3.2 팀 정보 관리 전략 (하이브리드)

**문제**: 팀 정보를 누가 어떻게 수정할 수 있는가?

**전략**: 본인 수정 (localStorage) + 운영자 정리 (members 컬렉션)

**데이터 소스**:

1. `**members` 컬렉션**: Source of Truth (운영자 관리)
2. `**localStorage`**: 사용자 프로필 (빠른 수정)
3. `**attendance` 레코드**: 스냅샷 (당시 팀 정보)

**플로우**:

```
┌─────────────────────────────────────────────────────────┐
│ 1. 사용자: 프로필 카드에서 팀 변경                        │
│    → localStorage만 업데이트 (즉시 반영)                  │
│    → 다음 출석부터 새 팀으로 기록                         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 2. 출석 등록 시                                          │
│    → localStorage의 팀 정보를 attendance에 스냅샷 저장    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 3. 운영자: 월 1회 또는 팀 재편성 시즌                     │
│    → ops.html에서 "팀 정보 동기화" 실행                   │
│    → 최근 출석 기록 기준으로 members 컬렉션 업데이트       │
└─────────────────────────────────────────────────────────┘
```

**구현**:

```javascript
// 1. 사용자 뷰 (attendance-v2.html)
function changeTeam(newTeam) {
  const profile = JSON.parse(localStorage.getItem('myProfile'));
  profile.team = newTeam;
  localStorage.setItem('myProfile', JSON.stringify(profile));
  
  // UI 즉시 갱신
  renderDashboard(profile);
  showSuccessMessage('팀이 변경되었습니다. 다음 출석부터 반영됩니다.');
}

// 2. 출석 등록 시 (localStorage 팀 정보 사용)
async function checkIn() {
  const profile = JSON.parse(localStorage.getItem('myProfile'));
  
  await fetch('/attendance', {
    method: 'POST',
    body: JSON.stringify({
      memberId: profile.memberId,
      nickname: profile.nickname,
      team: profile.team,  // localStorage의 최신 팀 정보
      // ...
    }),
  });
}

// 3. 운영자 도구 (ops.html, Phase 1.5 추가 고려)
async function syncMemberTeams() {
  // 최근 100개 출석 기록에서 최신 팀 정보 추출
  const recentAttendance = await db.collection('attendance')
    .where('isGuest', '==', false)
    .orderBy('timestamp', 'desc')
    .limit(100)
    .get();
  
  const teamMap = {};  // memberId → team
  recentAttendance.forEach(doc => {
    const data = doc.data();
    if (!teamMap[data.memberId]) {
      teamMap[data.memberId] = data.team;  // 최신 팀 정보만
    }
  });
  
  // members 컬렉션 일괄 업데이트
  const batch = db.batch();
  for (const [memberId, team] of Object.entries(teamMap)) {
    const memberRef = db.collection('members').doc(memberId);
    batch.update(memberRef, { team });
  }
  await batch.commit();
  
  console.log(`✅ ${Object.keys(teamMap).length}명의 팀 정보 동기화 완료`);
}
```

**장점**:

- 사용자: 즉시 변경 가능, 다음 출석부터 반영
- 운영자: 주기적 정리로 정합성 확보
- 팀 재편성 시즌(6개월마다)에만 집중 관리

**단점**:

- `members` 컬렉션과 일시적 불일치 가능
- 운영자가 주기적으로 동기화 실행 필요

**완화**:

- Phase 1.5에서 `syncMemberTeams()` 자동 실행 (월 1회 Cloud Scheduler)
- 또는 사용자가 팀 변경 시 Firestore `team_change_requests` 컬렉션에 기록 → 운영자 승인

### 3.4 인덱스 전략

#### 3.4.1 기존 인덱스 (이미 존재)

```
컬렉션: attendance
필드: nicknameKey (Ascending), monthKey (Ascending)
용도: 개인별 월별 출석 기록 조회
```

#### 3.4.2 신규 인덱스 (Phase 1 배포 전 생성 필요)

**인덱스 1: 중복 체크용**

```
컬렉션: attendance
필드: nicknameKey (Ascending), meetingDateKey (Ascending)
용도: 같은 날짜 + 닉네임 중복 체크
쿼리: where('nicknameKey', '==', ...).where('meetingDateKey', '==', ...)
```

**인덱스 2: 통계 조회용 (닉네임 기반)**

```
컬렉션: attendance
필드: isGuest (Ascending), nicknameKey (Ascending), monthKey (Ascending)
용도: 정회원 월별 통계 (게스트 제외)
쿼리: where('isGuest', '==', false).where('nicknameKey', '==', ...).where('monthKey', '==', ...)
```

**인덱스 3: 통계 조회용 (memberId 기반, 권장)**

```
컬렉션: attendance
필드: isGuest (Ascending), memberId (Ascending), monthKey (Ascending)
용도: 정회원 월별 통계 (닉네임 변경 대응)
쿼리: where('isGuest', '==', false).where('memberId', '==', ...).where('monthKey', '==', ...)
```

**인덱스 생성 명령**:

```bash
# Firebase Console에서 수동 생성 또는
# firestore.indexes.json에 추가 후 deploy
```

### 3.5 쿼리 패턴 분석

#### 3.5.1 중복 체크 (출석 등록 시)

```javascript
// Before: O(n) - collection scan
const existing = await db.collection('attendance')
  .where('nickname', '==', nickname)
  .where('meetingDateKey', '==', date)
  .limit(1)
  .get();

// After (인덱스 활용): O(log n)
// 인덱스: nicknameKey + meetingDateKey
```

**성능**:

- 레코드 10,000개 기준
- Before: ~500ms (collection scan)
- After: ~50ms (index scan) → **10배 개선**

#### 3.5.2 개인 통계 조회

```javascript
// Option A: nickname 기반 (닉네임 변경 시 문제)
const records = await db.collection('attendance')
  .where('isGuest', '==', false)
  .where('nicknameKey', '==', nickname.toLowerCase())
  .where('monthKey', '==', '2026/04')
  .get();

// Option B: memberId 기반 (권장)
const records = await db.collection('attendance')
  .where('isGuest', '==', false)
  .where('memberId', '==', memberId)
  .where('monthKey', '==', '2026/04')
  .get();
```

**권장**: memberId 기반 (닉네임 변경에도 안정적)

---

## 4. API 설계

### 4.1 엔드포인트 목록


| Method | Endpoint                                              | Action  | 설명            |
| ------ | ----------------------------------------------------- | ------- | ------------- |
| POST   | `/attendance`                                         | -       | 출석 등록 (신규/확장) |
| GET    | `/attendance?action=members`                          | members | 정회원 목록 (기존)   |
| GET    | `/attendance?action=status&meetingDate=YYYY/MM/DD`    | status  | 오늘 출석 현황 (기존) |
| GET    | `/attendance?action=stats&nickname=...&month=YYYY-MM` | stats   | 개인 통계 (신규)    |


### 4.2 출석 등록 API 상세 설계

#### 4.2.1 Request 검증

```javascript
// 필수 필드 검증
const required = ['nickname', 'team', 'meetingType', 'meetingDate'];
for (const field of required) {
  if (!req.body[field]) {
    return res.status(400).json({
      ok: false,
      error: 'MISSING_FIELD',
      message: `${field} is required`
    });
  }
}

// 날짜 형식 검증
if (!/^\d{4}\/\d{2}\/\d{2}$/.test(req.body.meetingDate)) {
  return res.status(400).json({
    ok: false,
    error: 'INVALID_DATE_FORMAT',
    message: 'meetingDate must be YYYY/MM/DD'
  });
}

// memberId 검증 (정회원만)
if (!req.body.isGuest && !req.body.memberId) {
  return res.status(400).json({
    ok: false,
    error: 'MISSING_MEMBER_ID',
    message: 'memberId is required for non-guest attendance'
  });
}
```

#### 4.2.2 중복 체크 로직

```javascript
// 게스트는 중복 체크 제외
if (!isGuest) {
  // Option A: nickname 기반 (Phase 1 최소 구현)
  const existing = await db.collection('attendance')
    .where('nicknameKey', '==', nicknameStored.toLowerCase())
    .where('meetingDateKey', '==', meetingDateKey)
    .limit(1)
    .get();
  
  // Option B: memberId 기반 (권장, 더 정확)
  const existing = await db.collection('attendance')
    .where('memberId', '==', memberId)
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
```

**권장**: memberId 기반 (닉네임 변경 시에도 정확)

#### 4.2.3 에러 코드 정의


| 코드                     | HTTP Status | 의미                |
| ---------------------- | ----------- | ----------------- |
| `MISSING_FIELD`        | 400         | 필수 필드 누락          |
| `INVALID_DATE_FORMAT`  | 400         | 날짜 형식 오류          |
| `MISSING_MEMBER_ID`    | 400         | 정회원인데 memberId 없음 |
| `ALREADY_CHECKED_IN`   | 400         | 오늘 이미 출석함         |
| `INVALID_TEAM`         | 400         | 유효하지 않은 팀 코드      |
| `INVALID_MEETING_TYPE` | 400         | 유효하지 않은 정모 타입     |
| `INTERNAL_ERROR`       | 500         | 서버 내부 오류          |


### 4.3 통계 API 상세 설계

#### 4.3.1 출석률 계산 로직

```javascript
// 1. 해당 월 사용자 출석 기록
const userRecords = await db.collection('attendance')
  .where('isGuest', '==', false)
  .where('memberId', '==', memberId)  // memberId 기반 (권장)
  .where('monthKey', '==', monthKey)
  .get();

const totalDays = userRecords.size;

// 2. 해당 월 전체 정모 횟수
const allRecordsSnapshot = await db.collection('attendance')
  .where('monthKey', '==', monthKey)
  .where('isGuest', '==', false)
  .get();

// 고유 날짜 추출
const uniqueDates = new Set();
allRecordsSnapshot.forEach(doc => {
  uniqueDates.add(doc.data().meetingDateKey);
});
const totalMeetingsInMonth = uniqueDates.size;

// 3. 출석률 계산
const attendanceRate = totalMeetingsInMonth > 0 
  ? Math.round((totalDays / totalMeetingsInMonth) * 1000) / 10 
  : 0;
```

#### 4.3.2 연속 출석 계산 로직

```javascript
// 사용자 출석 날짜 역순 정렬
const userDates = userRecords.docs
  .map(d => d.data().meetingDateKey)
  .sort()
  .reverse();  // ["2026/04/17", "2026/04/14", "2026/04/10", ...]

let consecutiveDays = 0;
let checkDate = new Date();  // 오늘부터 시작

for (const dateKey of userDates) {
  const recordDate = new Date(dateKey.replace(/\//g, '-'));
  
  // 오늘 또는 어제면 연속
  if (isSameDay(recordDate, checkDate) || 
      isSameDay(recordDate, addDays(checkDate, -1))) {
    consecutiveDays++;
    checkDate = recordDate;
  } else {
    break;  // 하루 이상 빠지면 중단
  }
}
```

**성능 최적화**:

- 전체 출석 날짜를 한 번에 조회 (O(n))
- 클라이언트에서 계산 (DB 부하 감소)
- 캐싱 고려 (10분 TTL)

---

## 5. 프론트엔드 아키텍처

### 5.1 상태 관리

```javascript
// 전역 상태
const AppState = {
  // 현재 뷰 모드
  currentMode: null,  // 'dashboard' | 'search'
  
  // 사용자 프로필
  myProfile: null,    // { nickname, memberId, team } | null
  
  // 정회원 목록 (캐싱)
  members: [],        // [{ id, nickname, team, ... }]
  membersLoadedAt: null,  // Timestamp
  
  // 오늘 출석 현황 (캐싱)
  todayStatus: null,  // { total, byTeam, records }
  statusLoadedAt: null,
};

// localStorage 스키마
const storageSchema = {
  myProfile: {
    nickname: "게살볶음밥",
    memberId: "members_doc_id_123",
    team: "T1",
    savedAt: "2026-04-17T10:30:00Z"
  }
};
```

### 5.2 뷰 전환 로직

```javascript
// 페이지 로드 시
async function initPage() {
  // 1. localStorage에서 프로필 로드
  const savedProfile = localStorage.getItem('myProfile');
  
  if (savedProfile) {
    AppState.myProfile = JSON.parse(savedProfile);
    await showDashboardView();  // C안
  } else {
    await showSearchView();  // B안
  }
}

// C안 → B안 전환 (프로필 재설정)
function resetProfile() {
  localStorage.removeItem('myProfile');
  AppState.myProfile = null;
  showSearchView();
}

// 뷰 전환 애니메이션
function switchView(newMode) {
  const appEl = document.getElementById('app');
  
  // 페이드 아웃
  appEl.style.opacity = '0';
  appEl.style.transition = 'opacity 300ms ease-out';
  
  setTimeout(() => {
    AppState.currentMode = newMode;
    
    if (newMode === 'dashboard') {
      renderDashboard(AppState.myProfile);
    } else if (newMode === 'search') {
      renderSearch();
    }
    
    // 페이드 인
    appEl.style.opacity = '1';
  }, 300);
}
```

### 5.3 API 호출 패턴

```javascript
// API 기본 함수
async function apiCall(endpoint, options = {}) {
  const response = await fetch(endpoint, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  
  const data = await response.json();
  
  if (!data.ok) {
    throw new Error(data.error || 'API_ERROR');
  }
  
  return data;
}

// 출석 등록
async function checkIn(member, isGuest = false) {
  try {
    const result = await apiCall('/attendance', {
      method: 'POST',
      body: {
        nickname: member.nickname,
        memberId: isGuest ? null : member.id,
        team: member.team,
        meetingType: getCurrentMeetingType(),
        meetingDate: getTodayDateKey(),
        isGuest,
      },
    });
    
    // 성공 시 축하 화면 표시
    showSuccessModal(result);
    
    // 오늘 출석 현황 갱신
    await refreshTodayStatus();
    
  } catch (error) {
    if (error.message === 'ALREADY_CHECKED_IN') {
      showErrorModal('오늘 이미 출석하셨습니다');
    } else {
      showErrorModal('출석 처리 중 오류가 발생했습니다');
      console.error(error);
    }
  }
}

// 정회원 목록 조회 (캐싱)
async function getMembers() {
  const now = Date.now();
  const CACHE_TTL = 5 * 60 * 1000;  // 5분
  
  // 캐시 유효하면 재사용
  if (AppState.members.length > 0 && 
      now - AppState.membersLoadedAt < CACHE_TTL) {
    return AppState.members;
  }
  
  // 새로 조회
  const data = await apiCall('/attendance?action=members');
  AppState.members = data.members;
  AppState.membersLoadedAt = now;
  
  return AppState.members;
}

// 통계 조회
async function getStats(memberId, month) {
  const data = await apiCall(
    `/attendance?action=stats&memberId=${memberId}&month=${month}`
  );
  return data;
}
```

### 5.4 에러 처리 전략

```javascript
// 전역 에러 핸들러
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  showErrorModal('예상치 못한 오류가 발생했습니다');
});

// API 에러 핸들링
function handleApiError(error) {
  const errorMessages = {
    'ALREADY_CHECKED_IN': '오늘 이미 출석하셨습니다',
    'MISSING_FIELD': '필수 정보가 누락되었습니다',
    'INVALID_DATE_FORMAT': '날짜 형식이 올바르지 않습니다',
    'MISSING_MEMBER_ID': '회원 정보를 찾을 수 없습니다',
  };
  
  const message = errorMessages[error.message] || '오류가 발생했습니다';
  showErrorModal(message);
}

// localStorage 실패 처리
function saveProfile(profile) {
  try {
    localStorage.setItem('myProfile', JSON.stringify(profile));
    return true;
  } catch (error) {
    // Quota 초과 또는 Private browsing
    console.warn('localStorage write failed:', error);
    showWarningModal(
      '프로필 저장에 실패했습니다. 브라우저 설정을 확인해주세요.'
    );
    return false;
  }
}
```

---

## 6. 성능 최적화

### 6.1 프론트엔드 최적화

**1. 정회원 목록 캐싱**:

```javascript
// 5분 TTL 캐싱
const MEMBERS_CACHE_TTL = 5 * 60 * 1000;
```

**2. 검색 자동완성 디바운싱**:

```javascript
let searchTimeout;
function onSearchInput(event) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    filterMembers(event.target.value);
  }, 300);  // 300ms 디바운싱
}
```

**3. 번들 크기 최적화**:

- Vanilla JS (No framework) → ~50KB
- CSS Inline (No external CSS) → ~10KB
- **총 예상 번들 크기: 60KB**

### 6.2 백엔드 최적화

**1. 인덱스 활용**:

- 중복 체크: `nicknameKey + meetingDateKey` 복합 인덱스
- 통계 조회: `isGuest + memberId + monthKey` 복합 인덱스

**2. Firestore 읽기 최적화**:

```javascript
// Bad: 2번 조회
const userRecords = await db.collection('attendance')
  .where('memberId', '==', memberId)
  .get();
const allRecords = await db.collection('attendance')
  .where('monthKey', '==', month)
  .get();

// Good: 1번 조회 + 클라이언트 필터링
const allRecords = await db.collection('attendance')
  .where('monthKey', '==', month)
  .get();
const userRecords = allRecords.docs.filter(
  d => d.data().memberId === memberId
);
```

**3. Cloud Function 응답 시간 목표**:

- 출석 등록: < 500ms
- 정회원 목록: < 300ms (캐싱)
- 통계 조회: < 800ms

---

## 7. 보안 고려사항

### 7.1 인증/인가

**현재 상태**: 인증 없음 (Public API)

**Phase 1**: 인증 없이 진행 (기존 시스템 유지)

- 클럽 내부용 시스템
- URL 비공개
- 악의적 사용 가능성 낮음

**Phase 2 고려사항**:

- Firebase Auth 도입
- 운영자 비밀번호 (`DMC_ADMIN_PW`)
- Rate limiting

### 7.2 입력 검증

```javascript
// 서버 사이드 검증 필수
function validateInput(req) {
  // XSS 방지
  const sanitized = {
    nickname: sanitizeHtml(req.body.nickname),
    team: req.body.team,  // ENUM이므로 안전
    // ...
  };
  
  // 길이 제한
  if (sanitized.nickname.length > 50) {
    throw new Error('NICKNAME_TOO_LONG');
  }
  
  return sanitized;
}
```

### 7.3 Rate Limiting

**Phase 1**: 구현 안 함 (기존 시스템 유지)

**Phase 2 고려**:

```javascript
// Firebase Functions Rate Limiting
// IP당 분당 10회 제한
```

---

## 8. 모니터링 및 로깅

### 8.1 Cloud Function 로깅

```javascript
// 구조화된 로깅
console.log(JSON.stringify({
  level: 'INFO',
  action: 'CHECK_IN',
  nickname: nicknameStored,
  memberId: memberId,
  meetingDate: meetingDateKey,
  isGuest: isGuest,
  durationMs: Date.now() - startMs,
}));

// 에러 로깅
console.error(JSON.stringify({
  level: 'ERROR',
  action: 'CHECK_IN',
  error: error.message,
  stack: error.stack,
  request: {
    nickname: req.body.nickname,
    meetingDate: req.body.meetingDate,
  },
}));
```

### 8.2 프론트엔드 모니터링

```javascript
// 페이지 로딩 성능
window.addEventListener('load', () => {
  const perfData = performance.getEntriesByType('navigation')[0];
  console.log({
    loadTime: perfData.loadEventEnd - perfData.fetchStart,
    domReady: perfData.domContentLoadedEventEnd - perfData.fetchStart,
  });
});

// API 호출 추적
async function apiCall(endpoint, options) {
  const startTime = Date.now();
  
  try {
    const response = await fetch(endpoint, options);
    const duration = Date.now() - startTime;
    
    console.log({
      endpoint,
      method: options.method,
      duration,
      status: response.status,
    });
    
    return response;
  } catch (error) {
    console.error({
      endpoint,
      error: error.message,
      duration: Date.now() - startTime,
    });
    throw error;
  }
}
```

### 8.3 베타 테스트 지표

Firestore `feedback` 컬렉션 + Cloud Function 로그:


| 지표              | 수집 방법                             | 목표        |
| --------------- | --------------------------------- | --------- |
| 출석 성공률          | Cloud Function 로그 (`ok: true` 비율) | > 95%     |
| 평균 응답 시간        | Cloud Function `durationMs`       | < 500ms   |
| 중복 시도 건수        | `ALREADY_CHECKED_IN` 에러 카운트       | < 10건/월   |
| localStorage 실패 | 프론트엔드 로그                          | < 5%      |
| 사용자 만족도         | `feedback` 컬렉션 `rating` 평균        | > 4.0/5.0 |


---

## 9. 배포 전 체크리스트

### 9.1 백엔드

- Firestore 인덱스 3개 생성 확인
- `handlePost` 중복 체크 로직 추가
- `memberId`, `isGuest` 필드 처리
- `action=stats` API 구현
- 로컬 에뮬레이터 테스트 완료
- 에러 핸들링 검증

### 9.2 프론트엔드

- `attendance-v2.html` 생성
- C안 (대시보드) 구현
- B안 (검색) 구현
- 게스트 모달 구현
- 팀 변경 모달 구현
- localStorage 처리
- 모바일 반응형 테스트
- 브라우저 호환성 테스트 (Chrome, Safari)

### 9.3 데이터

- 기존 `attendance` 레코드에 `isGuest: false` 추가 (마이그레이션)
- 기존 레코드에 `memberId` 역조회 후 추가 (선택, 권장)

---

## 10. 리스크 및 완화 전략


| 리스크                   | 영향  | 확률  | 완화 전략                    |
| --------------------- | --- | --- | ------------------------ |
| Firestore 인덱스 생성 실패   | 높음  | 낮음  | 배포 전 Firebase Console 확인 |
| localStorage quota 초과 | 중간  | 낮음  | Warning 표시, 출석은 정상 진행    |
| 중복 체크 로직 버그           | 높음  | 중간  | 철저한 로컬 테스트 + 베타 모니터링     |
| memberId 누락 (정회원)     | 중간  | 중간  | API 검증 + 프론트엔드 검증        |
| 통계 API 성능 저하          | 낮음  | 중간  | 캐싱 + 쿼리 최적화              |


---

## 11. 다음 단계 (Phase 2)

Phase 1 성공 후 고려사항:

1. **A안 (자봉 모드)**:
  - 85명 카드 그리드
  - 출석 취소/수정 API
  - 팀별 필터
2. **memberId 활용 확장**:
  - 닉네임 변경 이력 (`members.previousNicknames: []`)
  - 과거 기록 통합 조회
3. **성능 개선**:
  - Firebase Hosting CDN 최적화
  - 이미지 압축 (프로필 사진 추가 시)

---

## 12. 부록

### 12.1 날짜 유틸리티 함수

```javascript
// YYYY/MM/DD 형식 변환
function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

// 오늘 날짜 키
function getTodayDateKey() {
  return formatDateKey(new Date());
}

// 이번 달 키
function getCurrentMonthKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}/${month}`;
}
```

### 12.2 팀 코드 상수

```javascript
const TEAM_CODES = {
  T1: 'Team 1',
  T2: 'Team 2',
  T3: 'Team 3',
  T4: 'Team 4',
  GUEST: '게스트',
};

const MEETING_TYPE_CODES = {
  SAT: '토요일 정모',
  SUN: '일요일 정모',
  WED: '수요일 정모',
};
```

---

**작성자**: Claude (AI Assistant)  
**검토자**: TBD  
**승인자**: TBD