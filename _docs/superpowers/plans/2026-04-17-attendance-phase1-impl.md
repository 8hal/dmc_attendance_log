# 출석 페이지 Phase 1 (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 재방문자 원클릭 출석 + 첫 방문자 환영 UI + 게스트 출석 지원

**Architecture:** Single-page app (Vanilla JS) with 2 view modes (Dashboard/Search), localStorage profile storage, Firebase Cloud Functions API with duplicate check

**Tech Stack:** Vanilla JS, HTML5, CSS3, Firebase Cloud Functions (Node.js 24), Firestore

**References:**
- PRD: `_docs/superpowers/specs/2026-04-17-attendance-page-redesign-v2.md`
- Tech Spec: `_docs/superpowers/specs/2026-04-17-attendance-page-tech-spec.md`

---

## File Structure

### Backend (Cloud Functions)
- **Modify**: `functions/index.js` (lines 291-388: `handlePost` 함수)
  - 중복 체크 로직 추가
  - `memberId`, `isGuest` 필드 처리
  - `action=stats` handler 추가

### Frontend (New File)
- **Create**: `attendance-v2.html` (신규 출석 페이지)
  - C안 (Dashboard) 뷰
  - B안 (Search) 뷰
  - 게스트 출석 모달
  - 팀 변경 모달
  - 통계 표시 (출석 후)

### Indexes
- **Create**: Firestore 인덱스 3개 (Firebase Console)

---

## Task 1: Firestore 인덱스 생성

**Files:**
- Firebase Console (수동)

- [ ] **Step 1: 인덱스 1 생성 (중복 체크용 - nicknameKey, 레거시 지원)**

Firebase Console → Firestore → Indexes → Create Index
- Collection: `attendance`
- Fields:
  - `nicknameKey` (Ascending)
  - `meetingDateKey` (Ascending)
- Query scope: Collection

Expected: Index created (5-10분 소요)

**용도**: memberId가 없는 레거시 데이터 중복 체크용

- [ ] **Step 2: 인덱스 2 생성 (통계 조회용 - nickname)**

Firebase Console → Firestore → Indexes → Create Index
- Collection: `attendance`
- Fields:
  - `isGuest` (Ascending)
  - `nicknameKey` (Ascending)
  - `monthKey` (Ascending)
- Query scope: Collection

Expected: Index created

- [ ] **Step 3: 인덱스 3 생성 (중복 체크용 - memberId)**

Firebase Console → Firestore → Indexes → Create Index
- Collection: `attendance`
- Fields:
  - `memberId` (Ascending)
  - `meetingDateKey` (Ascending)
- Query scope: Collection

Expected: Index created

**중요**: 이 인덱스는 Task 2의 memberId 기반 중복 체크에 필수입니다.

- [ ] **Step 4: 인덱스 4 생성 (통계 조회용 - memberId, 권장)**

Firebase Console → Firestore → Indexes → Create Index
- Collection: `attendance`
- Fields:
  - `isGuest` (Ascending)
  - `memberId` (Ascending)
  - `monthKey` (Ascending)
- Query scope: Collection

Expected: Index created

- [ ] **Step 4: 인덱스 생성 완료 확인**

Firebase Console → Firestore → Indexes
Expected: 3개 인덱스 모두 "Enabled" 상태

---

## Task 2: 백엔드 - 중복 체크 로직 추가

**Files:**
- Modify: `functions/index.js:291-388`

- [ ] **Step 1: `handlePost` 함수에서 `memberId`, `isGuest` 파라미터 추출**

`functions/index.js`의 `handlePost` 함수 (line ~305 근처)에 추가:

```javascript
const memberId = str(body.memberId).trim() || null;
const isGuest = body.isGuest === true || body.isGuest === "true";
```

- [ ] **Step 2: 중복 체크 로직 추가 (memberId 기반)**

`handlePost` 함수에서 Firestore 저장 전 (line ~342 근처)에 추가:

```javascript
// 🆕 중복 체크 (게스트는 제외, memberId 기반 권장)
if (!isGuest && nicknameStored.toUpperCase() !== "TEST") {
  // memberId가 있으면 memberId로, 없으면 nicknameKey로 체크
  const duplicateQuery = memberId
    ? db.collection(COLLECTION)
        .where('memberId', '==', memberId)
        .where('meetingDateKey', '==', meetingDateKey)
    : db.collection(COLLECTION)
        .where('nicknameKey', '==', nicknameStored.toLowerCase())
        .where('meetingDateKey', '==', meetingDateKey);
  
  const existing = await duplicateQuery.limit(1).get();
  
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

**주의**: `memberId` 기반 중복 체크를 위해서는 **인덱스 3** (`isGuest + memberId + meetingDateKey`)이 필요합니다. Task 1에서 인덱스가 "Enabled" 상태인지 반드시 확인하세요.

- [ ] **Step 3: Firestore 저장 시 `memberId`, `isGuest` 필드 추가**

`handlePost` 함수의 `db.collection(COLLECTION).add()` 부분 (line ~343)에 필드 추가:

```javascript
const docRef = await db.collection(COLLECTION).add({
  nickname: nicknameStored,
  nicknameKey: nicknameStored.toLowerCase(),
  memberId,  // 🆕 추가
  team: teamCode,
  teamLabel,
  meetingType: typeCode,
  meetingTypeLabel,
  meetingDateKey,
  monthKey,
  isGuest,  // 🆕 추가
  timestamp: FieldValue.serverTimestamp(),
  ts: now.getTime(),
});
```

- [ ] **Step 4: 로컬 에뮬레이터로 중복 체크 테스트**

```bash
cd functions
firebase emulators:start --only functions,firestore
```

테스트:
```bash
# 첫 번째 출석 (성공)
curl -X POST http://localhost:5001/PROJECT_ID/us-central1/attendance \
  -H "Content-Type: application/json" \
  -d '{"nickname":"테스트","memberId":"test_member_id","team":"T1","meetingType":"SAT","meetingDate":"2026/04/19","isGuest":false}'

# 두 번째 출석 (중복, 실패 예상)
curl -X POST http://localhost:5001/PROJECT_ID/us-central1/attendance \
  -H "Content-Type: application/json" \
  -d '{"nickname":"테스트","memberId":"test_member_id","team":"T1","meetingType":"SAT","meetingDate":"2026/04/19","isGuest":false}'
```

Expected: 
- 첫 번째: `{"ok": true, ...}`
- 두 번째: `{"ok": false, "error": "ALREADY_CHECKED_IN", ...}`

- [ ] **Step 5: 게스트 중복 허용 테스트**

```bash
# 게스트 첫 번째 (성공)
curl -X POST http://localhost:5001/PROJECT_ID/us-central1/attendance \
  -H "Content-Type: application/json" \
  -d '{"nickname":"게스트1","memberId":null,"team":"GUEST","meetingType":"SAT","meetingDate":"2026/04/19","isGuest":true}'

# 게스트 두 번째 (성공 예상 - 게스트는 중복 허용)
curl -X POST http://localhost:5001/PROJECT_ID/us-central1/attendance \
  -H "Content-Type: application/json" \
  -d '{"nickname":"게스트1","memberId":null,"team":"GUEST","meetingType":"SAT","meetingDate":"2026/04/19","isGuest":true}'
```

Expected: 둘 다 `{"ok": true, ...}` (게스트는 중복 허용)

- [ ] **Step 6: Commit**

```bash
git add functions/index.js
git commit -m "feat(api): 중복 체크 로직 + memberId/isGuest 필드 추가

- 정회원 중복 출석 차단 (memberId 기반)
- 게스트는 중복 허용
- 에러 코드: ALREADY_CHECKED_IN"
```

---

## Task 3: 백엔드 - 통계 API 추가

**Files:**
- Modify: `functions/index.js` (action handler 섹션)

- [ ] **Step 1: `action=stats` handler 추가**

`functions/index.js`에서 다른 action handlers 근처 (line ~400-500 사이)에 추가:

```javascript
// 🆕 개인 통계 조회
if (action === "stats") {
  const nickname = req.query.nickname;
  const memberId = req.query.memberId;
  const month = req.query.month;  // "2026-04"
  
  if ((!nickname && !memberId) || !month) {
    return res.status(400).json({
      ok: false,
      error: 'MISSING_PARAMS',
      message: 'nickname or memberId, and month are required'
    });
  }
  
  const monthKey = month.replace('-', '/');  // "2026/04"
  
  // memberId 또는 nickname 기반 조회 (memberId 우선)
  const query = memberId
    ? db.collection(COLLECTION)
        .where('isGuest', '==', false)
        .where('memberId', '==', memberId)
        .where('monthKey', '==', monthKey)
    : db.collection(COLLECTION)
        .where('isGuest', '==', false)
        .where('nicknameKey', '==', (nickname || '').toLowerCase())
        .where('monthKey', '==', monthKey);
  
  const userRecordsSnapshot = await query.orderBy('meetingDateKey', 'desc').get();
  const totalDays = userRecordsSnapshot.size;
  
  // 해당 월 전체 정모 횟수
  const allRecordsSnapshot = await db.collection(COLLECTION)
    .where('monthKey', '==', monthKey)
    .where('isGuest', '==', false)
    .get();
  
  const uniqueDates = new Set();
  allRecordsSnapshot.forEach(doc => {
    uniqueDates.add(doc.data().meetingDateKey);
  });
  const totalMeetingsInMonth = uniqueDates.size;
  
  // 출석률
  const attendanceRate = totalMeetingsInMonth > 0 
    ? Math.round((totalDays / totalMeetingsInMonth) * 1000) / 10 
    : 0;
  
  // 연속 출석 계산
  let consecutiveDays = 0;
  const today = new Date();
  let checkDate = today;
  
  const userDates = userRecordsSnapshot.docs
    .map(d => d.data().meetingDateKey)
    .sort()
    .reverse();
  
  for (const dateKey of userDates) {
    const recordDate = new Date(dateKey.replace(/\//g, '-'));
    const daysDiff = Math.floor((checkDate - recordDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff <= 1) {  // 오늘 또는 어제
      consecutiveDays++;
      checkDate = recordDate;
    } else {
      break;
    }
  }
  
  const lastRecord = userRecordsSnapshot.docs[0]?.data();
  
  return res.json({
    ok: true,
    nickname: nickname || lastRecord?.nickname || null,
    memberId: memberId || null,
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

- [ ] **Step 2: 로컬 에뮬레이터로 통계 API 테스트**

```bash
firebase emulators:start --only functions,firestore
```

테스트 데이터 삽입 (Firestore Emulator UI에서 수동 또는 curl):
```javascript
// attendance 컬렉션에 테스트 데이터 3개 추가
// memberId: "test_member_123"
// meetingDateKey: "2026/04/15", "2026/04/17", "2026/04/19"
// monthKey: "2026/04"
```

테스트:
```bash
curl "http://localhost:5001/PROJECT_ID/us-central1/attendance?action=stats&memberId=test_member_123&month=2026-04"
```

Expected:
```json
{
  "ok": true,
  "memberId": "test_member_123",
  "month": "2026-04",
  "totalDays": 3,
  "totalMeetingsInMonth": 4,
  "attendanceRate": 75.0,
  "consecutiveDays": 2,
  "lastAttendance": "2026/04/19",
  "lastAttendanceTime": "오후 10:30"
}
```

- [ ] **Step 3: Commit**

```bash
git add functions/index.js
git commit -m "feat(api): 개인 통계 API 추가 (action=stats)

- memberId 또는 nickname 기반 조회
- 출석 횟수, 출석률, 연속 출석 계산
- 월별 통계 제공"
```

---

## Task 4: 프론트엔드 - HTML 구조 생성

**Files:**
- Create: `attendance-v2.html`

- [ ] **Step 1: 기본 HTML 구조 생성**

`attendance-v2.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>출석 체크 - 동탄 마라톤 클럽</title>
  <style>
    /* CSS는 Step 2에서 추가 */
  </style>
</head>
<body>
  <div id="app"></div>
  
  <script>
    // JavaScript는 Task 5에서 추가
  </script>
</body>
</html>
```

- [ ] **Step 2: CSS 스타일 추가**

`attendance-v2.html`의 `<style>` 태그 내부:

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background: #F8FAFC;
  color: #0F172A;
  line-height: 1.6;
}

#app {
  max-width: 480px;
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
}

/* 버튼 기본 스타일 */
button {
  font-family: inherit;
  cursor: pointer;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  transition: all 0.2s;
}

button:active {
  transform: scale(0.98);
}

.primary-button {
  background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
  color: white;
  padding: 18px 24px;
  width: 100%;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.secondary-button {
  background: #F1F5F9;
  color: #475569;
  padding: 12px 20px;
}

/* 입력 필드 */
input {
  font-family: inherit;
  width: 100%;
  padding: 16px;
  border: 2px solid #E2E8F0;
  border-radius: 12px;
  font-size: 16px;
  transition: border-color 0.2s;
}

input:focus {
  outline: none;
  border-color: #2563EB;
}

/* 모달 */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-content {
  background: white;
  border-radius: 20px;
  padding: 24px;
  max-width: 400px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}

.hidden {
  display: none;
}

/* 애니메이션 */
.fade-in {
  animation: fadeIn 300ms ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 3: 브라우저에서 빈 페이지 확인**

```bash
# 로컬 서버 시작
python3 -m http.server 8000
```

브라우저: `http://localhost:8000/attendance-v2.html`

Expected: 빈 페이지 (CSS만 로드)

- [ ] **Step 4: Commit**

```bash
git add attendance-v2.html
git commit -m "feat(frontend): HTML 구조 + CSS 기본 스타일

- 반응형 레이아웃 (max-width: 480px)
- 버튼, 입력 필드, 모달 스타일
- 애니메이션 (fadeIn)"
```

---

## Task 5: 프론트엔드 - 상태 관리 및 API 함수

**Files:**
- Modify: `attendance-v2.html` (`<script>` 태그)

- [ ] **Step 1: 전역 상태 및 상수 정의**

`attendance-v2.html`의 `<script>` 태그:

```javascript
// API Base URL
const API_BASE = '/attendance';

// 전역 상태
const AppState = {
  currentMode: null,  // 'dashboard' | 'search'
  myProfile: null,    // { nickname, memberId, team }
  members: [],        // [{ id, nickname, team, ... }]
  membersLoadedAt: null,
  todayStatus: null,
  statusLoadedAt: null,
};

// 팀 코드 맵핑
const TEAM_LABELS = {
  'T1': 'Team 1',
  'T2': 'Team 2',
  'T3': 'Team 3',
  'T4': 'Team 4',
  'GUEST': '게스트',
};

// 정모 타입 (기존 시스템에서 가져오기)
const MEETING_TYPES = {
  'SAT': '토요일 정모',
  'SUN': '일요일 정모',
  'WED': '수요일 정모',
};
```

- [ ] **Step 2: 유틸리티 함수 추가**

```javascript
// 날짜 관련
function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function getCurrentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatDateKorean(dateKey) {
  const [year, month, day] = dateKey.split('/');
  const date = new Date(year, parseInt(month) - 1, parseInt(day));
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${year}.${month}.${day} (${weekdays[date.getDay()]})`;
}

// 정모 타입 추론 (기존 시스템 로직 참고)
function getCurrentMeetingType() {
  const day = new Date().getDay();
  if (day === 6) return 'SAT';  // 토요일
  if (day === 0) return 'SUN';  // 일요일
  if (day === 3) return 'WED';  // 수요일
  return 'SAT';  // 기본값
}
```

- [ ] **Step 3: API 호출 함수**

```javascript
// API 기본 함수
async function apiCall(url, options = {}) {
  try {
    const response = await fetch(url, {
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
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// 정회원 목록 조회 (캐싱)
async function getMembers() {
  const now = Date.now();
  const CACHE_TTL = 5 * 60 * 1000;  // 5분
  
  if (AppState.members.length > 0 && 
      now - AppState.membersLoadedAt < CACHE_TTL) {
    return AppState.members;
  }
  
  const data = await apiCall(`${API_BASE}?action=members`);
  AppState.members = data.members;
  AppState.membersLoadedAt = now;
  
  return AppState.members;
}

// 출석 등록
async function checkIn(member, isGuest = false) {
  const data = await apiCall(API_BASE, {
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
  
  return data;
}

// 오늘 출석 현황
async function getTodayStatus() {
  const data = await apiCall(
    `${API_BASE}?action=status&meetingDate=${getTodayDateKey()}`
  );
  AppState.todayStatus = data;
  AppState.statusLoadedAt = Date.now();
  return data;
}

// 개인 통계
async function getStats(memberId) {
  const data = await apiCall(
    `${API_BASE}?action=stats&memberId=${memberId}&month=${getCurrentMonthKey()}`
  );
  return data;
}
```

- [ ] **Step 4: localStorage 관리 함수**

```javascript
// 프로필 저장
function saveProfile(profile) {
  try {
    localStorage.setItem('myProfile', JSON.stringify(profile));
    return true;
  } catch (error) {
    console.warn('localStorage save failed:', error);
    showErrorModal('프로필 저장에 실패했습니다. 브라우저 설정을 확인해주세요.');
    return false;
  }
}

// 프로필 로드
function loadProfile() {
  try {
    const saved = localStorage.getItem('myProfile');
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.warn('localStorage load failed:', error);
    return null;
  }
}

// 프로필 삭제
function clearProfile() {
  localStorage.removeItem('myProfile');
  AppState.myProfile = null;
}
```

- [ ] **Step 5: 테스트 (콘솔에서)**

브라우저 개발자 도구 콘솔:
```javascript
// API 함수 테스트
getTodayDateKey();  // "2026/04/17"
getCurrentMonthKey();  // "2026-04"
getCurrentMeetingType();  // "SAT" (토요일이면)

// localStorage 테스트
saveProfile({ nickname: '테스트', memberId: 'test_123', team: 'T1' });
loadProfile();  // { nickname: '테스트', ... }
```

Expected: 모든 함수 정상 작동

- [ ] **Step 6: Commit**

```bash
git add attendance-v2.html
git commit -m "feat(frontend): 상태 관리 + API 함수

- AppState 전역 상태
- API 호출 함수 (getMembers, checkIn, getTodayStatus, getStats)
- localStorage 관리
- 유틸리티 함수 (날짜, 정모 타입)"
```

---

## Task 6: 프론트엔드 - C안 (대시보드) 구현

**Files:**
- Modify: `attendance-v2.html`

- [ ] **Step 1: C안 렌더링 함수**

`attendance-v2.html`의 `<script>` 태그에 추가:

```javascript
async function renderDashboard(profile) {
  const app = document.getElementById('app');
  
  // 오늘 출석 현황 조회
  const status = await getTodayStatus();
  const meetingType = MEETING_TYPES[getCurrentMeetingType()];
  
  app.innerHTML = `
    <div class="fade-in">
      <!-- 프로필 카드 -->
      <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: white; padding: 20px; border-radius: 16px; margin-bottom: 16px; text-align: center; position: relative;">
        <div style="font-size: 42px; margin-bottom: 8px;">👤</div>
        <div style="font-size: 20px; font-weight: 800; margin-bottom: 2px;">${profile.nickname}</div>
        <div style="font-size: 13px; opacity: 0.85; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <span>${TEAM_LABELS[profile.team] || profile.team}</span>
          <button onclick="showTeamChangeModal()" style="background: rgba(255,255,255,0.2); border: none; padding: 4px 10px; border-radius: 999px; font-size: 11px; color: white; cursor: pointer;">변경</button>
        </div>
      </div>
      
      <!-- 오늘 정모 정보 -->
      <div style="background: #F8FAFC; border-radius: 12px; padding: 16px; margin-bottom: 16px; text-align: center;">
        <div style="font-size: 13px; color: #64748B; margin-bottom: 4px;">오늘 정모</div>
        <div style="font-size: 18px; font-weight: 700; color: #0F172A; margin-bottom: 4px;">${meetingType}</div>
        <div style="font-size: 16px; color: #64748B;">${formatDateKorean(getTodayDateKey())}</div>
        <div style="font-size: 14px; color: #475569; margin-top: 8px;">현재 <strong style="color: #2563EB;">${status.total || 0}명</strong> 출석 중</div>
      </div>
      
      <!-- 출석 버튼 -->
      <button onclick="handleCheckIn()" class="primary-button" style="height: 72px; font-size: 20px;">
        ✅ 출석 체크하기
      </button>
      
      <!-- 게스트 링크 -->
      <div style="text-align: center; margin-top: 12px;">
        <a href="#" onclick="showGuestModal(); return false;" style="font-size: 13px; color: #64748B; text-decoration: underline;">게스트로 출석하기</a>
      </div>
    </div>
  `;
}
```

- [ ] **Step 2: C안 출석 처리 함수**

```javascript
async function handleCheckIn() {
  const profile = AppState.myProfile;
  if (!profile) {
    showErrorModal('프로필 정보를 찾을 수 없습니다');
    return;
  }
  
  try {
    const result = await checkIn(profile, false);
    
    // 통계 조회
    const stats = await getStats(profile.memberId);
    
    // 축하 모달 표시
    showSuccessModal(result, stats);
    
    // 오늘 출석 현황 갱신
    await getTodayStatus();
    
  } catch (error) {
    if (error.message === 'ALREADY_CHECKED_IN') {
      showErrorModal('오늘 이미 출석하셨습니다');
    } else {
      showErrorModal('출석 처리 중 오류가 발생했습니다');
    }
  }
}
```

- [ ] **Step 3: 축하 모달 (출석 후 통계 표시)**

```javascript
function showSuccessModal(result, stats) {
  const app = document.getElementById('app');
  
  const modal = document.createElement('div');
  modal.className = 'modal fade-in';
  modal.innerHTML = `
    <div class="modal-content">
      <!-- 축하 카드 -->
      <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: white; padding: 28px; border-radius: 20px; margin-bottom: 20px; text-align: center;">
        <div style="font-size: 56px; margin-bottom: 12px;">🎉</div>
        <div style="font-size: 22px; font-weight: 800; margin-bottom: 8px;">출석 완료!</div>
        <div style="font-size: 14px; opacity: 0.9;">${result.written.timeText} · 오늘 ${result.status.total}번째 출석</div>
      </div>
      
      <!-- 통계 카드 -->
      <div style="background: white; border-radius: 16px; padding: 20px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
        <div style="font-size: 12px; color: #64748B; margin-bottom: 12px; text-align: center;">📊 이번 달 출석 현황</div>
        <div style="display: flex; justify-content: space-around; text-align: center;">
          <div>
            <div style="font-size: 32px; font-weight: 800; color: #2563EB;">${stats.totalDays}회</div>
            <div style="font-size: 12px; color: #64748B;">출석</div>
          </div>
          <div style="width: 1px; background: #E2E8F0;"></div>
          <div>
            <div style="font-size: 32px; font-weight: 800; color: #059669;">${stats.attendanceRate}%</div>
            <div style="font-size: 12px; color: #64748B;">출석률</div>
          </div>
          <div style="width: 1px; background: #E2E8F0;"></div>
          <div>
            <div style="font-size: 32px; font-weight: 800; color: #DC2626;">🔥${stats.consecutiveDays}</div>
            <div style="font-size: 12px; color: #64748B;">연속</div>
          </div>
        </div>
      </div>
      
      <!-- 닫기 버튼 -->
      <button onclick="closeModal()" class="primary-button">닫기</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 5초 후 자동 닫기
  setTimeout(() => {
    closeModal();
  }, 5000);
}

function closeModal() {
  const modals = document.querySelectorAll('.modal');
  modals.forEach(m => m.remove());
  
  // 대시보드 새로고침
  if (AppState.myProfile) {
    renderDashboard(AppState.myProfile);
  }
}
```

- [ ] **Step 4: 팀 변경 모달**

```javascript
function showTeamChangeModal() {
  const profile = AppState.myProfile;
  
  const modal = document.createElement('div');
  modal.className = 'modal fade-in';
  modal.innerHTML = `
    <div class="modal-content">
      <h3 style="margin: 0 0 16px 0; font-size: 18px; text-align: center;">팀 정보 변경</h3>
      
      <div style="background: #F8FAFC; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
        <div style="font-size: 13px; color: #64748B; margin-bottom: 8px;">현재 팀</div>
        <div style="font-size: 16px; font-weight: 700; color: #0F172A;">${TEAM_LABELS[profile.team]}</div>
      </div>
      
      <div style="font-size: 13px; color: #64748B; margin-bottom: 8px;">새 팀 선택</div>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 16px;">
        ${Object.keys(TEAM_LABELS).filter(k => k !== 'GUEST').map(teamCode => `
          <button onclick="changeTeam('${teamCode}')" style="background: ${profile.team === teamCode ? '#2563EB' : 'white'}; color: ${profile.team === teamCode ? 'white' : '#475569'}; border: 2px solid ${profile.team === teamCode ? '#2563EB' : '#E2E8F0'}; padding: 12px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
            ${TEAM_LABELS[teamCode]} ${profile.team === teamCode ? '✓' : ''}
          </button>
        `).join('')}
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <button onclick="closeModal()" class="secondary-button">취소</button>
        <button onclick="closeModal()" class="primary-button">확인</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

function changeTeam(newTeam) {
  const profile = AppState.myProfile;
  profile.team = newTeam;
  
  // localStorage 업데이트
  saveProfile(profile);
  
  // 팀 버튼 UI 업데이트
  document.querySelectorAll('[onclick^="changeTeam"]').forEach(btn => {
    const teamCode = btn.getAttribute('onclick').match(/'(.+)'/)[1];
    if (teamCode === newTeam) {
      btn.style.background = '#2563EB';
      btn.style.color = 'white';
      btn.style.borderColor = '#2563EB';
      btn.innerHTML = `${TEAM_LABELS[teamCode]} ✓`;
    } else {
      btn.style.background = 'white';
      btn.style.color = '#475569';
      btn.style.borderColor = '#E2E8F0';
      btn.innerHTML = TEAM_LABELS[teamCode];
    }
  });
}
```

- [ ] **Step 5: 에러 모달**

```javascript
function showErrorModal(message) {
  const modal = document.createElement('div');
  modal.className = 'modal fade-in';
  modal.innerHTML = `
    <div class="modal-content">
      <div style="text-align: center; margin-bottom: 16px;">
        <div style="font-size: 48px; margin-bottom: 8px;">⚠️</div>
        <h3 style="margin: 0 0 8px 0; font-size: 18px;">오류</h3>
        <p style="margin: 0; font-size: 14px; color: #64748B; line-height: 1.6;">${message}</p>
      </div>
      <button onclick="closeModal()" class="primary-button">확인</button>
    </div>
  `;
  
  document.body.appendChild(modal);
}
```

- [ ] **Step 6: 테스트 (브라우저)**

```javascript
// 콘솔에서 테스트
AppState.myProfile = {
  nickname: '테스트',
  memberId: 'test_member_123',
  team: 'T1'
};

renderDashboard(AppState.myProfile);
```

Expected: 프로필 카드 + 오늘 정모 정보 + 출석 버튼 표시

- [ ] **Step 7: Commit**

```bash
git add attendance-v2.html
git commit -m "feat(frontend): C안 (대시보드) 구현

- 프로필 카드 + 팀 변경 버튼
- 오늘 정모 정보 + 현재 출석 인원
- 출석 버튼 (72px 높이)
- 축하 모달 (출석 후 통계 표시)
- 팀 변경 모달"
```

---

## Task 7: 프론트엔드 - B안 (검색) 구현

**Files:**
- Modify: `attendance-v2.html`

- [ ] **Step 1: B안 렌더링 함수**

```javascript
async function renderSearch() {
  const app = document.getElementById('app');
  
  // 정회원 목록 로드
  const members = await getMembers();
  const status = await getTodayStatus();
  const meetingType = MEETING_TYPES[getCurrentMeetingType()];
  
  app.innerHTML = `
    <div class="fade-in">
      <!-- 환영 배너 -->
      <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: white; padding: 24px; border-radius: 16px; margin-bottom: 20px; text-align: center;">
        <div style="font-size: 40px; margin-bottom: 8px;">👋</div>
        <div style="font-size: 20px; font-weight: 800; margin-bottom: 8px;">동마클에 오신 걸 환영합니다!</div>
        <div style="font-size: 14px; opacity: 0.95; line-height: 1.6;">
          오늘 ${meetingType} · 현재 <strong>${status.total || 0}명</strong> 출석 중
        </div>
      </div>
      
      <!-- 가이드 카드 -->
      <div style="background: #F0FDF4; border: 2px solid #10B981; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <div style="font-size: 13px; font-weight: 700; color: #047857; margin-bottom: 8px;">📝 출석 방법</div>
        <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #065F46; line-height: 1.8;">
          <li>아래 검색창에 <strong>본인 이름</strong>을 입력하세요</li>
          <li>"나로 저장하기" 체크하고 출석 버튼을 누르세요</li>
          <li>다음부터는 <strong>버튼 한 번</strong>으로 출석 완료!</li>
        </ol>
      </div>
      
      <!-- 검색 바 -->
      <div style="position: relative; margin-bottom: 16px;">
        <input 
          id="searchInput" 
          type="text" 
          placeholder="🔍 내 이름을 검색하세요 (예: 게살볶음밥)" 
          style="height: 64px; font-size: 18px; padding-left: 56px; border: 3px solid #2563EB; border-radius: 16px; font-weight: 600;"
          oninput="handleSearch(event)"
        />
        <div style="position: absolute; left: 20px; top: 50%; transform: translateY(-50%); font-size: 28px;">🔍</div>
      </div>
      
      <!-- 검색 결과 -->
      <div id="searchResults" class="hidden"></div>
      
      <!-- 선택 확인 -->
      <div id="selectedMember" class="hidden"></div>
      
      <!-- 게스트 & 링크 -->
      <div style="display: flex; justify-content: center; gap: 16px; margin-top: 16px;">
        <a href="#" onclick="showGuestModal(); return false;" style="font-size: 13px; color: #64748B; text-decoration: underline;">게스트로 출석하기</a>
      </div>
    </div>
  `;
  
  // 검색 입력에 포커스
  document.getElementById('searchInput').focus();
}
```

- [ ] **Step 2: 검색 함수 (자동완성)**

```javascript
function handleSearch(event) {
  const query = event.target.value.trim().toLowerCase();
  const resultsDiv = document.getElementById('searchResults');
  
  if (query.length === 0) {
    resultsDiv.classList.add('hidden');
    return;
  }
  
  // 정회원 필터링
  const filtered = AppState.members.filter(m => 
    m.nickname.toLowerCase().includes(query)
  ).slice(0, 5);  // 최대 5개
  
  if (filtered.length === 0) {
    resultsDiv.innerHTML = `
      <div style="background: white; border-radius: 12px; border: 2px solid #E2E8F0; padding: 16px; text-align: center; color: #64748B;">
        검색 결과가 없습니다
      </div>
    `;
    resultsDiv.classList.remove('hidden');
    return;
  }
  
  resultsDiv.innerHTML = `
    <div style="background: white; border-radius: 12px; border: 2px solid #E2E8F0; padding: 16px; margin-bottom: 16px;">
      <div style="font-size: 13px; font-weight: 700; color: #64748B; margin-bottom: 12px;">검색 결과</div>
      ${filtered.map(m => `
        <div onclick="selectMember('${m.id}')" style="display: flex; align-items: center; padding: 12px; background: #F8FAFC; border-radius: 8px; cursor: pointer; margin-bottom: 8px; transition: background 0.2s;" onmouseover="this.style.background='#EEF2FF'" onmouseout="this.style.background='#F8FAFC'">
          <div style="flex: 1;">
            <div style="font-size: 16px; font-weight: 700; color: #0F172A; margin-bottom: 2px;">${m.nickname}</div>
            <div style="font-size: 13px; color: #64748B;">${TEAM_LABELS[m.team]}</div>
          </div>
          <div style="font-size: 24px;">👉</div>
        </div>
      `).join('')}
    </div>
  `;
  resultsDiv.classList.remove('hidden');
}
```

- [ ] **Step 3: 회원 선택 함수**

```javascript
function selectMember(memberId) {
  const member = AppState.members.find(m => m.id === memberId);
  if (!member) return;
  
  const selectedDiv = document.getElementById('selectedMember');
  const searchResults = document.getElementById('searchResults');
  
  // 검색 결과 숨김
  searchResults.classList.add('hidden');
  
  selectedDiv.innerHTML = `
    <div style="background: #EEF2FF; border: 2px solid #6366F1; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
      <div style="font-size: 14px; font-weight: 700; color: #4338CA; margin-bottom: 12px;">✅ 선택한 정보</div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div>
          <div style="font-size: 16px; font-weight: 700; color: #1E1B4B;">${member.nickname}</div>
          <div style="font-size: 13px; color: #4338CA;">${TEAM_LABELS[member.team]}</div>
        </div>
        <button onclick="clearSelection()" style="background: none; border: none; font-size: 20px; cursor: pointer;">✏️</button>
      </div>
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 12px; background: white; border-radius: 8px;">
        <input type="checkbox" id="saveProfileCheckbox" style="width: 20px; height: 20px; cursor: pointer;">
        <span style="font-size: 14px; color: #1E1B4B; font-weight: 600;">나로 저장하기 (다음부터 원클릭 출석)</span>
      </label>
    </div>
    
    <button onclick="handleSearchCheckIn('${memberId}')" class="primary-button" style="height: 64px; font-size: 18px;">
      ✅ 출석하기
    </button>
  `;
  selectedDiv.classList.remove('hidden');
}

function clearSelection() {
  const selectedDiv = document.getElementById('selectedMember');
  selectedDiv.classList.add('hidden');
  selectedDiv.innerHTML = '';
  
  // 검색 입력 초기화
  document.getElementById('searchInput').value = '';
  document.getElementById('searchInput').focus();
}
```

- [ ] **Step 4: B안 출석 처리**

```javascript
async function handleSearchCheckIn(memberId) {
  const member = AppState.members.find(m => m.id === memberId);
  if (!member) {
    showErrorModal('회원 정보를 찾을 수 없습니다');
    return;
  }
  
  // "나로 저장하기" 체크 확인
  const saveCheckbox = document.getElementById('saveProfileCheckbox');
  const shouldSave = saveCheckbox && saveCheckbox.checked;
  
  try {
    const result = await checkIn(member, false);
    
    // 프로필 저장
    if (shouldSave) {
      const profile = {
        nickname: member.nickname,
        memberId: member.id,
        team: member.team,
        savedAt: new Date().toISOString()
      };
      saveProfile(profile);
      AppState.myProfile = profile;
    }
    
    // 통계 조회
    const stats = await getStats(member.id);
    
    // 축하 모달
    showSuccessModal(result, stats);
    
    // 다음 방문 시 대시보드 표시 안내
    if (shouldSave) {
      setTimeout(() => {
        closeModal();
        // 대시보드로 전환
        initPage();
      }, 5000);
    }
    
  } catch (error) {
    if (error.message === 'ALREADY_CHECKED_IN') {
      showErrorModal('오늘 이미 출석하셨습니다');
    } else {
      showErrorModal('출석 처리 중 오류가 발생했습니다');
    }
  }
}
```

- [ ] **Step 5: 테스트 (브라우저)**

```javascript
// 콘솔에서 테스트
AppState.myProfile = null;  // 프로필 없는 상태
renderSearch();
```

테스트:
1. 검색창에 이름 입력 → 자동완성 결과 확인
2. 회원 선택 → 선택 확인 카드 표시
3. "나로 저장하기" 체크 → 출석 버튼 클릭
4. 축하 모달 표시 → localStorage 저장 확인

Expected: 모든 플로우 정상 작동

- [ ] **Step 6: Commit**

```bash
git add attendance-v2.html
git commit -m "feat(frontend): B안 (검색) 구현

- 환영 배너 + 가이드 카드
- 검색 자동완성 (최대 5개)
- 회원 선택 + '나로 저장하기' 체크박스
- 출석 후 프로필 저장"
```

---

## Task 8: 프론트엔드 - 게스트 모달

**Files:**
- Modify: `attendance-v2.html`

- [ ] **Step 1: 게스트 모달 함수**

```javascript
function showGuestModal() {
  const modal = document.createElement('div');
  modal.className = 'modal fade-in';
  modal.innerHTML = `
    <div class="modal-content">
      <h3 style="margin: 0 0 16px 0; font-size: 18px; text-align: center;">게스트 출석 추가</h3>
      
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 13px; color: #64748B; margin-bottom: 6px;">게스트 이름 (별명)</label>
        <input id="guestNickname" type="text" placeholder="예: 친구1, 홍길동" style="height: 48px; font-size: 15px;" />
      </div>
      
      <div style="background: #FEF3C7; border-left: 3px solid #F59E0B; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
        <div style="font-size: 12px; color: #92400E; line-height: 1.6;">
          💡 게스트는 통계에 포함되지 않으며,<br>같은 이름으로 여러 번 출석 가능합니다.
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <button onclick="closeModal()" class="secondary-button">취소</button>
        <button onclick="handleGuestCheckIn()" class="primary-button" style="background: #F59E0B;">추가</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 입력 필드에 포커스
  setTimeout(() => {
    document.getElementById('guestNickname').focus();
  }, 100);
}
```

- [ ] **Step 2: 게스트 출석 처리**

```javascript
async function handleGuestCheckIn() {
  const nicknameInput = document.getElementById('guestNickname');
  const nickname = nicknameInput.value.trim();
  
  if (!nickname) {
    alert('게스트 이름을 입력해주세요');
    nicknameInput.focus();
    return;
  }
  
  const guestMember = {
    nickname: nickname,
    id: null,
    team: 'GUEST'
  };
  
  try {
    const result = await checkIn(guestMember, true);
    
    // 게스트는 통계 없음
    const fakeStats = {
      totalDays: 0,
      attendanceRate: 0,
      consecutiveDays: 0
    };
    
    closeModal();
    
    // 간단한 성공 모달
    const successModal = document.createElement('div');
    successModal.className = 'modal fade-in';
    successModal.innerHTML = `
      <div class="modal-content">
        <div style="text-align: center; margin-bottom: 16px;">
          <div style="font-size: 56px; margin-bottom: 12px;">🎉</div>
          <h3 style="margin: 0 0 8px 0; font-size: 22px;">출석 완료!</h3>
          <p style="margin: 0; font-size: 14px; color: #64748B;">
            <strong>${nickname}</strong>님 (게스트)<br>
            ${result.written.timeText} · 오늘 ${result.status.total}번째 출석
          </p>
        </div>
        <button onclick="closeModal()" class="primary-button">확인</button>
      </div>
    `;
    
    document.body.appendChild(successModal);
    
    // 3초 후 자동 닫기
    setTimeout(() => {
      closeModal();
    }, 3000);
    
  } catch (error) {
    closeModal();
    showErrorModal('게스트 출석 처리 중 오류가 발생했습니다');
  }
}
```

- [ ] **Step 3: 테스트 (브라우저)**

테스트:
1. "게스트로 출석하기" 링크 클릭
2. 게스트 이름 입력 (예: "친구1")
3. "추가" 버튼 클릭
4. 출석 완료 모달 확인

Expected: 게스트 출석 성공, `isGuest: true`로 저장

- [ ] **Step 4: Commit**

```bash
git add attendance-v2.html
git commit -m "feat(frontend): 게스트 출석 모달

- 게스트 이름 입력
- isGuest: true로 출석 등록
- 간단한 성공 모달 (통계 없음)"
```

---

## Task 9: 프론트엔드 - 페이지 초기화 및 뷰 전환

**Files:**
- Modify: `attendance-v2.html`

- [ ] **Step 1: 페이지 초기화 함수**

```javascript
// 페이지 로드 시 실행
async function initPage() {
  // 1. localStorage에서 프로필 로드
  const savedProfile = loadProfile();
  
  if (savedProfile) {
    AppState.myProfile = savedProfile;
    AppState.currentMode = 'dashboard';
    await renderDashboard(savedProfile);
  } else {
    AppState.currentMode = 'search';
    await renderSearch();
  }
}

// DOM 로드 완료 후 실행
document.addEventListener('DOMContentLoaded', () => {
  initPage();
});
```

- [ ] **Step 2: 뷰 전환 애니메이션**

```javascript
function switchView(newMode) {
  const app = document.getElementById('app');
  
  // 페이드 아웃
  app.style.opacity = '0';
  app.style.transition = 'opacity 300ms ease-out';
  
  setTimeout(async () => {
    AppState.currentMode = newMode;
    
    if (newMode === 'dashboard') {
      await renderDashboard(AppState.myProfile);
    } else if (newMode === 'search') {
      await renderSearch();
    }
    
    // 페이드 인
    app.style.opacity = '1';
  }, 300);
}
```

- [ ] **Step 3: 전체 플로우 테스트**

테스트 시나리오 1: 첫 방문자
1. `localStorage.clear()` (콘솔)
2. 페이지 새로고침
3. B안 (검색) 표시 확인
4. 회원 검색 → 선택 → "나로 저장하기" 체크 → 출석
5. 페이지 새로고침
6. C안 (대시보드) 표시 확인

테스트 시나리오 2: 재방문자
1. C안 (대시보드) 표시
2. 출석 버튼 클릭
3. 축하 모달 + 통계 확인
4. 팀 변경 버튼 → 팀 변경 → 저장

테스트 시나리오 3: 게스트
1. "게스트로 출석하기" 클릭
2. 이름 입력 → 출석
3. 성공 확인

Expected: 모든 시나리오 정상 작동

- [ ] **Step 4: Commit**

```bash
git add attendance-v2.html
git commit -m "feat(frontend): 페이지 초기화 + 뷰 전환

- initPage() 함수
- localStorage 기반 뷰 분기
- 뷰 전환 애니메이션 (300ms fade)"
```

---

## Task 10: 통합 테스트 및 버그 수정

**Files:**
- Test: `attendance-v2.html` (전체)

- [ ] **Step 1: 로컬 에뮬레이터 + 프론트엔드 통합 테스트**

```bash
# 터미널 1: 에뮬레이터 시작
cd functions
firebase emulators:start --only functions,firestore

# 터미널 2: 로컬 서버
python3 -m http.server 8000
```

브라우저: `http://localhost:8000/attendance-v2.html`

- [ ] **Step 2: 크로스 브라우저 테스트**

테스트:
- Chrome (최신)
- Safari (최신)
- Mobile Safari (iOS)
- Chrome Mobile (Android)

Expected: 모든 브라우저에서 정상 작동

- [ ] **Step 3: 모바일 반응형 테스트**

Chrome DevTools → Device Toolbar
- iPhone 12 Pro (390x844)
- iPhone SE (375x667)
- Galaxy S20 (360x800)

Expected: 모든 기기에서 UI가 깨지지 않음

- [ ] **Step 4: 버그 수정 (있다면)**

발견된 버그 목록:
- [ ] Bug 1: ...
- [ ] Bug 2: ...

수정 후 재테스트

- [ ] **Step 5: Commit**

```bash
git add attendance-v2.html
git commit -m "test: 통합 테스트 완료 + 버그 수정

- 크로스 브라우저 테스트 (Chrome, Safari)
- 모바일 반응형 테스트
- 버그 수정: [목록]"
```

---

## Task 11: 백엔드 배포

**Files:**
- Deploy: `functions/index.js`

- [ ] **Step 1: Firebase 배포 전 체크리스트**

```bash
# 1. 로컬 테스트 완료 확인
firebase emulators:start --only functions,firestore

# 2. Firestore 인덱스 생성 확인
# Firebase Console → Firestore → Indexes
# 3개 인덱스 모두 "Enabled" 확인

# 3. functions 디렉토리 확인
cd functions
npm install  # 의존성 설치
```

- [ ] **Step 2: Cloud Functions 배포**

```bash
cd functions
firebase deploy --only functions:attendance
```

Expected: 
```
✔  functions[attendance]: Successful update operation.
Function URL: https://us-central1-PROJECT_ID.cloudfunctions.net/attendance
```

- [ ] **Step 3: 프로덕션 API 테스트**

```bash
# 중복 체크 테스트
curl -X POST https://us-central1-PROJECT_ID.cloudfunctions.net/attendance \
  -H "Content-Type: application/json" \
  -d '{"nickname":"테스트API","memberId":"api_test_123","team":"T1","meetingType":"SAT","meetingDate":"2026/04/19","isGuest":false}'
```

Expected: `{"ok": true, ...}`

- [ ] **Step 4: 통계 API 테스트**

```bash
curl "https://us-central1-PROJECT_ID.cloudfunctions.net/attendance?action=stats&memberId=api_test_123&month=2026-04"
```

Expected: `{"ok": true, "totalDays": 1, ...}`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "deploy: Cloud Functions 배포 완료

- 중복 체크 로직
- memberId/isGuest 필드
- action=stats API"
```

---

## Task 12: 프론트엔드 배포 (베타)

**Files:**
- Deploy: `attendance-v2.html`
- Modify: `index.html` (베타 안내 배너)

- [ ] **Step 1: `index.html`에 베타 안내 배너 추가**

`index.html` 상단 (body 태그 바로 아래):

```html
<div style="background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%); color: white; padding: 20px; text-align: center; margin-bottom: 20px; border-radius: 12px;">
  <div style="font-size: 28px; margin-bottom: 8px;">🎉</div>
  <div style="font-size: 18px; font-weight: 800; margin-bottom: 8px;">새로운 출석 페이지 베타 테스트!</div>
  <div style="font-size: 14px; opacity: 0.95; margin-bottom: 16px; line-height: 1.6;">
    원클릭 출석, 게스트 지원 등<br>
    새로운 기능을 먼저 경험해보세요
  </div>
  <a href="attendance-v2.html" style="background: white; color: #2563EB; font-weight: 700; padding: 12px 24px; font-size: 15px; border-radius: 8px; text-decoration: none; display: inline-block;">
    🚀 베타 페이지 체험하기
  </a>
</div>
```

- [ ] **Step 2: Firebase Hosting 배포**

```bash
firebase deploy --only hosting
```

Expected:
```
✔  hosting: Hosting site deployed successfully
Hosting URL: https://PROJECT_ID.web.app
```

- [ ] **Step 3: 프로덕션 테스트**

브라우저: `https://PROJECT_ID.web.app/attendance-v2.html`

테스트:
1. 첫 방문자 플로우
2. 재방문자 플로우
3. 게스트 출석
4. 모바일 테스트

Expected: 모든 플로우 정상 작동

- [ ] **Step 4: Commit & Tag**

```bash
git add index.html attendance-v2.html
git commit -m "deploy: 출석 페이지 Phase 1 베타 배포

- attendance-v2.html 신규 생성
- index.html 베타 안내 배너 추가
- 프로덕션 배포 완료"

git tag -a v2.0.0-beta.1 -m "Phase 1 (MVP) 베타 배포"
git push origin main --tags
```

---

## Task 13: 베타 테스트 준비

**Files:**
- Create: `feedback` 컬렉션 (Firestore Console)

- [ ] **Step 1: Firestore `feedback` 컬렉션 생성**

Firebase Console → Firestore → Add collection
- Collection ID: `feedback`
- First document:
  ```json
  {
    "userId": "admin",
    "message": "테스트 피드백",
    "rating": 5,
    "timestamp": [current timestamp]
  }
  ```

- [ ] **Step 2: 베타 테스터 모집 공지 (카카오톡)**

공지 초안:
```
📢 새로운 출석 페이지 베타 테스트 모집

동마클 출석 시스템이 새로워집니다!

🎯 주요 기능:
• 원클릭 출석 (재방문자)
• 게스트 출석 지원
• 이번 달 출석 통계

🔗 베타 페이지: https://PROJECT_ID.web.app/attendance-v2.html

피드백은 [링크] 또는 댓글로 부탁드립니다!

베타 기간: 2주 (4/17 ~ 4/30)
```

- [ ] **Step 3: 모니터링 대시보드 준비**

Cloud Function 로그 확인:
```bash
firebase functions:log --only attendance
```

모니터링 지표:
- 출석 성공률 (ok: true 비율)
- 중복 시도 건수 (ALREADY_CHECKED_IN)
- API 응답 시간
- 에러 발생 건수

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: 베타 테스트 준비 완료

- feedback 컬렉션 생성
- 베타 공지 초안
- 모니터링 계획"
```

---

## 완료 체크리스트

- [ ] Task 1: Firestore 인덱스 생성 (3개)
- [ ] Task 2: 백엔드 - 중복 체크 로직
- [ ] Task 3: 백엔드 - 통계 API
- [ ] Task 4: 프론트엔드 - HTML 구조
- [ ] Task 5: 프론트엔드 - 상태 관리 + API
- [ ] Task 6: 프론트엔드 - C안 (대시보드)
- [ ] Task 7: 프론트엔드 - B안 (검색)
- [ ] Task 8: 프론트엔드 - 게스트 모달
- [ ] Task 9: 프론트엔드 - 초기화 + 뷰 전환
- [ ] Task 10: 통합 테스트
- [ ] Task 11: 백엔드 배포
- [ ] Task 12: 프론트엔드 배포 (베타)
- [ ] Task 13: 베타 테스트 준비

---

## 예상 소요 시간

| Task | 예상 시간 |
|------|----------|
| Task 1-3 (백엔드) | 4시간 |
| Task 4-5 (프론트 기반) | 2시간 |
| Task 6 (C안) | 3시간 |
| Task 7 (B안) | 3시간 |
| Task 8-9 (게스트/초기화) | 2시간 |
| Task 10 (테스트) | 3시간 |
| Task 11-13 (배포) | 2시간 |
| **합계** | **~19시간** |

---

## 참고 문서

- PRD: `_docs/superpowers/specs/2026-04-17-attendance-page-redesign-v2.md`
- Tech Spec: `_docs/superpowers/specs/2026-04-17-attendance-page-tech-spec.md`
- 기존 시스템: `index.html`, `functions/index.js`
