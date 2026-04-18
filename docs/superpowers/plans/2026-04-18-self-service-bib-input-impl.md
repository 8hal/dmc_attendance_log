# 회원 셀프 서비스 배번 입력 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단체 대회 참가자가 본인의 배번을 직접 입력할 수 있는 셀프 서비스 페이지 구현

**Architecture:** my-bib.html (프론트엔드) + functions/index.js 내 update-bib API (백엔드), race_events.participants[].bib 필드 업데이트, 닉네임 간소 인증

**Tech Stack:** Vanilla JS, Firebase Cloud Functions, Firestore

**Spec:** `_docs/superpowers/specs/2026-04-18-self-service-bib-input-design.md`

---

## File Structure

```
my-bib.html                신규 - 회원 배번 입력 페이지
functions/index.js         수정 - update-bib API 추가 (line ~2900 부근)
```

---

## Task 1: Backend API - update-bib 구현

**Files:**
- Modify: `functions/index.js` (action === "group-events" 블록 내 추가, line ~2900)

- [ ] **Step 1: update-bib subAction 추가**

`functions/index.js` 파일에서 `action === "group-events" && req.method === "POST" && req.body && req.body.subAction === "bulk-confirm"` 블록 뒤에 추가:

```javascript
if (action === "group-events" && req.method === "POST" && req.body && req.body.subAction === "update-bib") {
  const { eventId, nickname, bib } = req.body;
  
  // 1. 필수 파라미터 검증
  if (!eventId) {
    return res.status(400).json({ ok: false, error: "eventId required" });
  }
  if (!nickname) {
    return res.status(400).json({ ok: false, error: "nickname required" });
  }
  if (!bib || typeof bib !== 'string') {
    return res.status(400).json({ ok: false, error: "bib required" });
  }
  
  // 배번 형식 검증
  const trimmedBib = bib.trim();
  if (trimmedBib === '') {
    return res.status(400).json({ ok: false, error: "bib cannot be empty" });
  }
  
  try {
    // 2. 대회 조회
    const eventDoc = await db.collection("race_events").doc(eventId).get();
    if (!eventDoc.exists) {
      return res.status(404).json({ ok: false, error: "event not found" });
    }
    
    const event = eventDoc.data();
    
    // 3. 참가자 찾기
    const participantIndex = event.participants.findIndex(
      p => p.nickname === nickname
    );
    
    if (participantIndex === -1) {
      return res.status(403).json({ 
        ok: false, 
        error: "not a participant" 
      });
    }
    
    // 4. 배번 업데이트
    event.participants[participantIndex].bib = trimmedBib;
    
    await db.collection("race_events").doc(eventId).update({
      participants: event.participants
    });
    
    // 5. 성공 응답
    return res.json({ 
      ok: true, 
      message: "배번이 저장되었습니다" 
    });
    
  } catch (error) {
    console.error("update-bib error:", error);
    return res.status(500).json({ 
      ok: false, 
      error: "server error" 
    });
  }
}
```

위치: `action === "group-events" && ... subAction === "bulk-confirm"` 블록 바로 다음

- [ ] **Step 2: 로컬 테스트 (에뮬레이터)**

```bash
cd /Users/taylor/git/dmc_attendance_log
npm run serve  # Firebase Emulator 시작
```

별도 터미널에서 테스트:

```bash
# 1. 테스트 대회 생성 (Firestore Emulator에 수동 추가)
# 2. API 호출 테스트
curl -X POST "http://localhost:5001/dmc-attendance/asia-northeast3/race?action=group-events" \
  -H "Content-Type: application/json" \
  -d '{
    "subAction": "update-bib",
    "eventId": "evt_test",
    "nickname": "테스트러너",
    "bib": "12345"
  }'
```

예상 응답:
```json
{"ok":true,"message":"배번이 저장되었습니다"}
```

에러 케이스 테스트:
```bash
# eventId 없음
curl -X POST "http://localhost:5001/dmc-attendance/asia-northeast3/race?action=group-events" \
  -H "Content-Type: application/json" \
  -d '{"subAction":"update-bib","nickname":"테스트러너","bib":"12345"}'
# 예상: {"ok":false,"error":"eventId required"}

# nickname 없음
curl -X POST "http://localhost:5001/dmc-attendance/asia-northeast3/race?action=group-events" \
  -H "Content-Type: application/json" \
  -d '{"subAction":"update-bib","eventId":"evt_test","bib":"12345"}'
# 예상: {"ok":false,"error":"nickname required"}

# bib 빈 문자열
curl -X POST "http://localhost:5001/dmc-attendance/asia-northeast3/race?action=group-events" \
  -H "Content-Type: application/json" \
  -d '{"subAction":"update-bib","eventId":"evt_test","nickname":"테스트러너","bib":"  "}'
# 예상: {"ok":false,"error":"bib cannot be empty"}
```

- [ ] **Step 3: Commit**

```bash
git add functions/index.js
git commit -m "feat(api): 회원 배번 입력 API 구현 (update-bib)

group-events subAction에 update-bib 추가.
회원이 본인의 배번을 직접 입력할 수 있도록 지원.

- 파라미터 검증: eventId, nickname, bib
- race_events.participants[].bib 업데이트
- 에러 처리: 400/403/404/500"
```

---

## Task 2: Frontend - my-bib.html 구조 및 스타일

**Files:**
- Create: `my-bib.html`

- [ ] **Step 1: HTML 기본 구조 작성**

`my-bib.html` 생성:

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>배번 입력 - 동탄 마라톤 클럽</title>
  <link rel="icon" href="assets/dmc_logo.png" />
  <style>
    :root {
      --primary: #2563EB;
      --primary-hover: #1D4ED8;
      --bg: #F8FAFC;
      --card: #FFFFFF;
      --text: #0F172A;
      --text-sub: #64748B;
      --border: #E2E8F0;
      --green: #059669;
      --green-light: #D1FAE5;
      --red: #DC2626;
      --red-light: #FEE2E2;
    }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
      margin: 0;
      background: var(--bg);
      color: var(--text);
      padding: 20px;
    }
    .wrap { max-width: 500px; margin: 0 auto; }
    
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .header-icon {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .header-title {
      font-size: 24px;
      font-weight: 700;
      margin: 0 0 8px;
    }
    .header-subtitle {
      font-size: 14px;
      color: var(--text-sub);
      margin: 0;
    }
    
    .card {
      background: var(--card);
      border-radius: 14px;
      padding: 24px;
      margin-bottom: 16px;
      box-shadow: 0 2px 12px rgba(15,23,42,0.07);
    }
    .card-title {
      font-size: 16px;
      font-weight: 700;
      margin: 0 0 16px;
    }
    
    .form-group {
      margin-bottom: 16px;
    }
    .form-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-sub);
      margin-bottom: 6px;
    }
    .form-input {
      width: 100%;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 16px;
    }
    .form-input:focus {
      outline: none;
      border-color: var(--primary);
    }
    
    .btn {
      width: 100%;
      padding: 14px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
    }
    .btn-primary {
      background: var(--primary);
      color: white;
    }
    .btn-primary:hover {
      background: var(--primary-hover);
    }
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .info-box {
      background: var(--bg);
      border-radius: 8px;
      padding: 14px;
      margin-top: 16px;
    }
    .info-title {
      font-size: 13px;
      font-weight: 700;
      margin: 0 0 8px;
    }
    .info-list {
      font-size: 13px;
      color: var(--text-sub);
      margin: 0;
      padding-left: 20px;
    }
    .info-list li {
      margin-bottom: 4px;
    }
    
    .success-box {
      background: var(--green-light);
      border: 2px solid var(--green);
      border-radius: 10px;
      padding: 20px;
      text-align: center;
    }
    .success-icon {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .success-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--green);
      margin: 0 0 8px;
    }
    .success-message {
      font-size: 14px;
      color: var(--text-sub);
      margin: 0;
    }
    
    .error-box {
      background: var(--red-light);
      border: 2px solid var(--red);
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 16px;
      font-size: 14px;
      color: var(--red);
    }
    
    .loading {
      text-align: center;
      padding: 40px;
      color: var(--text-sub);
    }
    
    .hidden {
      display: none;
    }
    
    @media (max-width: 600px) {
      body {
        padding: 12px;
      }
      .header-title {
        font-size: 20px;
      }
      .card {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="header-icon">🎽</div>
      <h1 class="header-title">배번 입력</h1>
      <p class="header-subtitle" id="eventInfo">로딩 중...</p>
    </div>
    
    <div id="loadingScreen" class="loading">
      대회 정보를 불러오는 중...
    </div>
    
    <div id="authScreen" class="hidden">
      <div class="card">
        <h2 class="card-title">📝 본인 확인</h2>
        <div id="authError" class="error-box hidden"></div>
        <div class="form-group">
          <label class="form-label" for="nicknameInput">닉네임 입력</label>
          <input 
            type="text" 
            id="nicknameInput" 
            class="form-input" 
            placeholder="예: 라우펜더만"
            autocomplete="off"
          />
        </div>
        <button class="btn btn-primary" id="authBtn">다음</button>
      </div>
    </div>
    
    <div id="inputScreen" class="hidden">
      <div class="card">
        <h2 class="card-title">✅ <span id="confirmedNickname"></span>님 확인되었습니다</h2>
        <div id="inputError" class="error-box hidden"></div>
        <div class="form-group">
          <label class="form-label">종목</label>
          <div id="distanceInfo" style="font-size: 15px; font-weight: 600;"></div>
        </div>
        <div class="form-group">
          <label class="form-label">현재 배번</label>
          <div id="currentBib" style="font-size: 15px; font-weight: 600; color: var(--text-sub);"></div>
        </div>
        <div class="form-group">
          <label class="form-label" for="bibInput">배번 번호</label>
          <input 
            type="text" 
            id="bibInput" 
            class="form-input" 
            placeholder="예: 12345"
            autocomplete="off"
          />
        </div>
        <button class="btn btn-primary" id="saveBtn">저장</button>
        
        <div class="info-box">
          <div class="info-title">💡 안내</div>
          <ul class="info-list">
            <li>배번은 대회 당일 받는 번호판입니다</li>
            <li>동명이인 이슈 해결을 위해 필요합니다</li>
            <li>입력하지 않아도 기록은 저장됩니다</li>
          </ul>
        </div>
      </div>
    </div>
    
    <div id="successScreen" class="hidden">
      <div class="card">
        <div class="success-box">
          <div class="success-icon">✅</div>
          <div class="success-title">저장 완료</div>
          <p class="success-message">
            배번이 저장되었습니다.<br>
            대회 기록이 자동으로 매칭됩니다.
          </p>
        </div>
      </div>
    </div>
  </div>
  
  <script>
    // 다음 Task에서 구현
  </script>
</body>
</html>
```

- [ ] **Step 2: 브라우저에서 레이아웃 확인**

```bash
# Firebase Hosting 로컬 서버 시작
cd /Users/taylor/git/dmc_attendance_log
firebase serve --only hosting
```

브라우저에서 `http://localhost:5000/my-bib.html?eventId=test` 접속하여 레이아웃 확인:
- 헤더 (🎽 배번 입력)
- 로딩 화면 표시
- authScreen, inputScreen, successScreen은 hidden

- [ ] **Step 3: Commit**

```bash
git add my-bib.html
git commit -m "feat(frontend): 배번 입력 페이지 UI 구조 및 스타일

my-bib.html 기본 레이아웃 작성:
- 3단계 화면: 로딩 → 인증 → 입력 → 성공
- 반응형 디자인 (모바일 최적화)
- 안내 메시지 및 에러 표시 영역"
```

---

## Task 3: Frontend - JavaScript 로직 구현

**Files:**
- Modify: `my-bib.html` (script 블록)

- [ ] **Step 1: 상수 및 상태 변수 정의**

`my-bib.html`의 `<script>` 태그 내에 추가:

```javascript
const API_BASE = "https://asia-northeast3-dmc-attendance.cloudfunctions.net/race";

// 상태
const STEP = {
  LOADING: 1,
  AUTH: 2,
  INPUT: 3,
  SUCCESS: 4
};

let currentStep = STEP.LOADING;
let currentEvent = null;
let currentParticipant = null;

// DOM 요소
const loadingScreen = document.getElementById('loadingScreen');
const authScreen = document.getElementById('authScreen');
const inputScreen = document.getElementById('inputScreen');
const successScreen = document.getElementById('successScreen');
const eventInfo = document.getElementById('eventInfo');
const authError = document.getElementById('authError');
const inputError = document.getElementById('inputError');
const nicknameInput = document.getElementById('nicknameInput');
const authBtn = document.getElementById('authBtn');
const confirmedNickname = document.getElementById('confirmedNickname');
const distanceInfo = document.getElementById('distanceInfo');
const currentBib = document.getElementById('currentBib');
const bibInput = document.getElementById('bibInput');
const saveBtn = document.getElementById('saveBtn');
```

- [ ] **Step 2: 화면 전환 및 유틸 함수**

```javascript
function showScreen(step) {
  currentStep = step;
  
  loadingScreen.classList.add('hidden');
  authScreen.classList.add('hidden');
  inputScreen.classList.add('hidden');
  successScreen.classList.add('hidden');
  
  if (step === STEP.LOADING) {
    loadingScreen.classList.remove('hidden');
  } else if (step === STEP.AUTH) {
    authScreen.classList.remove('hidden');
  } else if (step === STEP.INPUT) {
    inputScreen.classList.remove('hidden');
  } else if (step === STEP.SUCCESS) {
    successScreen.classList.remove('hidden');
  }
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideError(elementId) {
  const el = document.getElementById(elementId);
  el.classList.add('hidden');
}

function formatDistance(distance) {
  const map = {
    'full': '풀 마라톤',
    'half': '하프 마라톤',
    '10K': '10km',
    '5K': '5km'
  };
  return map[distance] || distance;
}
```

- [ ] **Step 3: 대회 정보 로드**

**참고:** `group-events` detail API는 이미 구현되어 있음 (functions/index.js line 2832)
- 응답에 `event.id`는 Firestore document ID가 자동으로 포함됨 (line 2843)

```javascript
async function loadEvent() {
  const urlParams = new URLSearchParams(window.location.search);
  const eventId = urlParams.get('eventId');
  
  if (!eventId) {
    alert('잘못된 접근입니다. 링크를 확인해주세요.');
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}?action=group-events&subAction=detail&eventId=${eventId}`);
    const data = await res.json();
    
    if (!data.ok) {
      alert('대회 정보를 불러올 수 없습니다.');
      return;
    }
    
    currentEvent = data.event;  // event.id는 Firestore document ID
    eventInfo.textContent = `${currentEvent.eventName} · ${currentEvent.eventDate}`;
    showScreen(STEP.AUTH);
    
  } catch (error) {
    console.error('loadEvent error:', error);
    alert('네트워크 오류가 발생했습니다.');
  }
}
```

- [ ] **Step 4: 인증 처리**

```javascript
function authenticateUser() {
  const nickname = nicknameInput.value.trim();
  
  if (!nickname) {
    showError('authError', '닉네임을 입력해주세요');
    return;
  }
  
  const participant = currentEvent.participants.find(
    p => p.nickname === nickname
  );
  
  if (!participant) {
    showError('authError', '해당 대회에 참가하지 않는 회원입니다');
    return;
  }
  
  hideError('authError');
  currentParticipant = participant;
  
  confirmedNickname.textContent = participant.nickname;
  distanceInfo.textContent = formatDistance(participant.distance);
  currentBib.textContent = participant.bib || '미입력';
  
  if (participant.bib) {
    bibInput.value = participant.bib;
  }
  
  showScreen(STEP.INPUT);
}
```

- [ ] **Step 5: 배번 저장**

```javascript
async function saveBib() {
  const bib = bibInput.value.trim();
  
  if (!bib) {
    showError('inputError', '배번을 입력해주세요');
    return;
  }
  
  hideError('inputError');
  saveBtn.disabled = true;
  saveBtn.textContent = '저장 중...';
  
  try {
    const res = await fetch(`${API_BASE}?action=group-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subAction: 'update-bib',
        eventId: currentEvent.id,
        nickname: currentParticipant.nickname,
        bib: bib
      })
    });
    
    const data = await res.json();
    
    if (!data.ok) {
      throw new Error(data.error || '저장 실패');
    }
    
    showScreen(STEP.SUCCESS);
    
  } catch (error) {
    console.error('saveBib error:', error);
    showError('inputError', error.message || '네트워크 오류가 발생했습니다');
    saveBtn.disabled = false;
    saveBtn.textContent = '저장';
  }
}
```

- [ ] **Step 6: 이벤트 리스너 및 초기화**

```javascript
authBtn.addEventListener('click', authenticateUser);
nicknameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    authenticateUser();
  }
});

saveBtn.addEventListener('click', saveBib);
bibInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    saveBib();
  }
});

// 페이지 로드 시 대회 정보 불러오기
loadEvent();
```

- [ ] **Step 7: 브라우저 테스트**

Firebase Hosting 로컬 서버에서 테스트:

1. 테스트 대회 데이터 생성 (Firestore Emulator 또는 실제 DB):
```javascript
// Collection: race_events
// Document ID: evt_test_2026_04_18
{
  eventName: "테스트 마라톤",
  eventDate: "2026-04-20",
  isGroupEvent: true,
  participants: [
    {
      memberId: "test_001",
      nickname: "테스트러너",
      realName: "홍길동",
      distance: "half",
      bib: null
    }
  ]
}
```

2. 브라우저에서 `http://localhost:5000/my-bib.html?eventId=evt_test_2026_04_18` 접속

3. 테스트 시나리오:
   - [ ] 대회 정보 로딩 확인
   - [ ] 닉네임 입력: "테스트러너" → [다음]
   - [ ] 종목 표시: "하프 마라톤"
   - [ ] 현재 배번: "미입력"
   - [ ] 배번 입력: "12345" → [저장]
   - [ ] 성공 메시지 표시
   - [ ] Firestore에서 bib 필드 업데이트 확인

4. 에러 케이스 테스트:
   - [ ] 닉네임 빈 값 → "닉네임을 입력해주세요"
   - [ ] 존재하지 않는 닉네임 → "해당 대회에 참가하지 않는 회원입니다"
   - [ ] 배번 빈 값 → "배번을 입력해주세요"

- [ ] **Step 8: Commit**

```bash
git add my-bib.html
git commit -m "feat(frontend): 배번 입력 페이지 JavaScript 로직 구현

대회 정보 로드, 닉네임 인증, 배번 저장 완성:
- loadEvent: detail API 호출
- authenticateUser: 참가자 확인
- saveBib: update-bib API 호출
- 에러 처리 및 사용자 피드백"
```

---

## Task 4: 통합 테스트 및 배포

**Files:**
- Test: `my-bib.html` + `functions/index.js`

- [ ] **Step 1: 로컬 통합 테스트**

Firebase Emulator로 전체 플로우 테스트:

```bash
# 1. 에뮬레이터 시작
npm run serve

# 2. Firestore Emulator UI 접속
# http://localhost:4000 (브라우저에서 열림)

# 3. 테스트 데이터 준비 (Firestore Emulator UI에서 수동 추가)
# Collection: race_events
# Document ID: evt_test_full
# Fields:
{
  "eventName": "통합 테스트 대회",
  "eventDate": "2026-04-25",
  "isGroupEvent": true,
  "participants": [
    {
      "memberId": "m001",
      "nickname": "러너1",
      "realName": "김철수",
      "distance": "full",
      "bib": null
    },
    {
      "memberId": "m002",
      "nickname": "러너2",
      "realName": "이영희",
      "distance": "half",
      "bib": "99999"
    }
  ]
}
# groupSource, groupScrapeJobId, groupScrapeStatus는 선택 사항 (없어도 동작)

# 4. 브라우저 테스트
# http://localhost:5000/my-bib.html?eventId=evt_test_full
```

**테스트 체크리스트:**
- [ ] 대회 정보 표시: "통합 테스트 대회 · 2026-04-25"
- [ ] 닉네임 입력: "러너1" → 종목 "풀 마라톤", 현재 배번 "미입력"
- [ ] 배번 입력: "11111" → 저장 성공
- [ ] Firestore 확인: participants[0].bib = "11111"
- [ ] 닉네임 입력: "러너2" → 현재 배번 "99999" 표시
- [ ] 배번 변경: "88888" → 저장 성공 (덮어쓰기)
- [ ] Firestore 확인: participants[1].bib = "88888"

- [ ] **Step 2: 배포 전 체크**

```bash
# 1. Lint 확인
cd functions
npm run lint

# 2. 함수 크기 확인
ls -lh index.js
# 예상: 200KB 이하

# 3. my-bib.html 문법 체크
# (브라우저 개발자 도구 콘솔에서 에러 없는지 확인)
```

- [ ] **Step 3: Firebase 배포**

```bash
cd /Users/taylor/git/dmc_attendance_log

# 1. Functions 배포
firebase deploy --only functions:race
# 예상 출력: ✔  functions[race(asia-northeast3)] Successful update operation.

# 2. Hosting 배포
firebase deploy --only hosting
# 예상 출력: ✔  hosting: release complete

# 3. 배포 확인
echo "Production URL: https://dmc-log.web.app/my-bib.html?eventId=evt_test"
```

- [ ] **Step 4: Production 검증**

실제 환경에서 테스트:

```bash
# API 엔드포인트 테스트
curl -X POST "https://asia-northeast3-dmc-attendance.cloudfunctions.net/race?action=group-events" \
  -H "Content-Type: application/json" \
  -d '{
    "subAction": "update-bib",
    "eventId": "evt_prod_test",
    "nickname": "실제닉네임",
    "bib": "12345"
  }'
```

**브라우저 테스트:**
1. 실제 단체 대회 데이터로 테스트 (또는 운영진 협조)
2. 카카오톡으로 링크 공유 테스트
3. 모바일 기기에서 접근성 확인

- [ ] **Step 5: 최종 Commit 및 배포 기록**

```bash
git add -A
git commit -m "chore: 배번 입력 기능 배포 완료

Production 배포 검증 완료:
- API: update-bib 동작 확인
- Frontend: my-bib.html 접근 가능
- 통합 테스트 통과

다음 단계: 1주일 후 성공 지표 측정
- 배번 입력률 30% 목표
- 운영진 시간 절감 10분 목표"
```

---

## Task 5: 문서화 및 링크 공유 가이드

**Files:**
- Create: `_docs/guides/bib-input-usage.md`

- [ ] **Step 1: 사용자 가이드 작성**

`_docs/guides/bib-input-usage.md` 생성:

```markdown
# 배번 입력 사용 가이드

## 운영진용: 링크 공유 방법

### 1. 단체 대회 등록 후

`group.html`에서 단체 대회를 등록하고 참가자를 선택합니다.

### 2. 링크 생성

대회 ID를 확인하고 다음 형식으로 링크를 생성합니다:

```
https://dmc-log.web.app/my-bib.html?eventId={대회ID}
```

**예시:**
```
https://dmc-log.web.app/my-bib.html?eventId=evt_2026-04-19_24
```

### 3. 카카오톡 메시지 템플릿

```
🎽 제24회 경기마라톤대회 배번 입력

대회 당일 기록 매칭을 위해 배번을 입력해주세요.
(1분 소요, 대회 1일 전까지)

👉 https://dmc-log.web.app/my-bib.html?eventId=evt_2026-04-19_24

💡 배번은 대회 당일 받는 번호판 번호입니다.
동명이인 이슈 해결을 위해 필요하지만, 필수는 아닙니다.
```

### 4. 입력 현황 확인

`group-detail.html`에서 참가자별 배번 입력 여부를 확인할 수 있습니다.

---

## 회원용: 배번 입력 방법

### 1. 링크 접속

운영진이 공유한 링크를 클릭합니다.

### 2. 닉네임 입력

본인의 DMC 닉네임을 입력합니다.

### 3. 배번 입력

대회 참가 확인서 또는 배번 택배에서 번호를 확인하여 입력합니다.

### 4. 완료

"저장 완료" 메시지가 표시되면 끝입니다.

---

## FAQ

**Q: 배번을 아직 받지 못했는데 어떻게 하나요?**
A: 배번을 받은 후 입력하시면 됩니다. 대회 당일에도 입력 가능합니다.

**Q: 배번을 잘못 입력했어요.**
A: 같은 링크로 다시 접속하여 수정할 수 있습니다.

**Q: 배번을 입력하지 않으면 기록이 저장 안 되나요?**
A: 아니요. 배번이 없어도 기록은 저장됩니다. 다만 동명이인이 있을 경우 매칭이 어려울 수 있습니다.

**Q: 다른 사람 배번도 입력할 수 있나요?**
A: 닉네임만 알면 기술적으로 가능하지만, 본인 배번만 입력해주세요.
```

- [ ] **Step 2: 운영진 공지 초안 작성**

`_docs/guides/bib-input-announcement.md` 생성:

```markdown
# 배번 입력 기능 런칭 공지 (운영진용)

## 카카오톡 채널 공지 초안

```
📢 새로운 기능: 배번 직접 입력

단체 대회 참가자분들께서 본인의 배번을 직접 입력할 수 있게 되었습니다!

🎯 왜 필요한가요?
- 동명이인 이슈 해결
- 기록 매칭 정확도 향상
- 운영진 수작업 감소

⏱️ 언제 입력하나요?
- 대회 1일 전까지 (권장)
- 대회 당일에도 가능

📱 어떻게 사용하나요?
1. 운영진이 보낸 링크 클릭
2. 닉네임 입력
3. 배번 입력
4. 끝!

💡 입력하지 않아도 기록은 저장됩니다.
```

## 성공 지표 추적 계획

### 1주일 후 측정 항목

1. **배번 입력률**
   - 입력 회원 수 / 전체 참가자 수
   - 목표: 30% 이상

2. **운영진 시간 절감**
   - 대회 당일 매칭 소요 시간
   - 목표: 30분 → 20분 이하 (10분 절감)

3. **동명이인 오류**
   - 잘못 매칭된 기록 건수
   - 목표: 0건

### 데이터 수집 방법

```javascript
// Firestore 쿼리로 입력률 계산
const eventDoc = await db.collection("race_events").doc(eventId).get();
const participants = eventDoc.data().participants;
const totalCount = participants.length;
const bibInputCount = participants.filter(p => p.bib).length;
const inputRate = (bibInputCount / totalCount * 100).toFixed(1);

console.log(`배번 입력률: ${inputRate}% (${bibInputCount}/${totalCount})`);
```

### Phase 2 진행 판단

**조건 만족 시 사진 업로드 기능 추가:**
1. 입력률 30% 이상
2. 회원 피드백 "숫자 입력 불편"
3. 운영진 OCR 검수 수용 가능
```

- [ ] **Step 3: Commit**

```bash
git add _docs/guides/
git commit -m "docs: 배번 입력 사용 가이드 및 공지 문서

운영진용 링크 공유 가이드:
- 카카오톡 메시지 템플릿
- 입력 현황 확인 방법

회원용 사용법:
- 단계별 입력 가이드
- FAQ

성공 지표 추적 계획:
- 입력률, 시간 절감, 오류율 측정 방법"
```

---

## Completion Checklist

구현 완료 후 확인:

- [ ] Backend API (update-bib) 동작
- [ ] Frontend (my-bib.html) 접근 가능
- [ ] 로컬 테스트 통과
- [ ] Production 배포 완료
- [ ] 문서화 완료
- [ ] 운영진 공지 초안 작성

**다음 단계:**
1. 운영진에게 기능 안내
2. 첫 단체 대회에서 테스트
3. 1주일 후 성공 지표 측정
4. Phase 2 (사진 업로드) 진행 여부 결정
