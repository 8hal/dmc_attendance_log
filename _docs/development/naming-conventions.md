# 변수명 및 코딩 규칙

> 이 문서는 dmc_attendance_log 프로젝트의 변수명 규칙과 코딩 스타일을 정의합니다.

## 변수명 규칙

### JavaScript 상수

**UPPER_SNAKE_CASE** - 변경되지 않는 상수

```javascript
// ✅ 정답
const API_BASE = "https://...";
const IS_LOCAL = window.location.hostname === "localhost";
const DEFAULT_TZ = "Asia/Seoul";
const OPS_AUTH_KEY = "dmc-ops-auth";
```

```javascript
// ❌ 오답
const apiBase = "https://...";  // 함수처럼 보임
const isLocal = true;            // 상수임을 알 수 없음
```

### JavaScript 함수

**camelCase** - 동사로 시작

```javascript
// ✅ 정답
function loadGroupEvents() { }
function renderMemberList() { }
async function postConfirmOne(event, participant) { }
```

```javascript
// ❌ 오답
function LoadGroupEvents() { }  // PascalCase는 클래스용
function render_member_list() { }  // snake_case는 Python용
```

### JavaScript 변수

**camelCase**

```javascript
// ✅ 정답
const eventId = "...";
let selectedMemberIds = new Set();
const gorunningFilteredEvents = [];
```

```javascript
// ❌ 오답
const event_id = "...";  // snake_case
const EventId = "...";   // PascalCase
```

### DOM ID

**kebab-case** - HTML 속성은 소문자+하이픈

```html
<!-- ✅ 정답 -->
<div id="member-filter"></div>
<div id="gorunning-list"></div>
<button id="scrape-btn-123"></button>
```

```html
<!-- ❌ 오답 -->
<div id="memberFilter"></div>  <!-- camelCase -->
<div id="gorunning_list"></div>  <!-- snake_case -->
```

**JavaScript에서 접근:**
```javascript
// ✅ 정답
document.getElementById("member-filter")

// ❌ 오답
document.getElementById("memberFilter")  // DOM ID와 불일치
```

### CSS 클래스

**kebab-case**

```css
/* ✅ 정답 */
.gcard-header { }
.member-item { }
.more-menu { }
```

```css
/* ❌ 오답 */
.gcardHeader { }  /* camelCase */
.member_item { }  /* snake_case */
```

### Shell 변수

**snake_case** (ASCII만 사용)

```bash
# ✅ 정답
event_id="..."
c1_gap_choi=$(curl_get ...)
api_base="https://..."
```

```bash
# ❌ 오답
c1_gap_최=$(curl_get ...)  # 한글 사용 금지
eventId="..."              # camelCase
EVENT_ID="..."             # 상수처럼 보임
```

### Firestore 필드

**camelCase**

```javascript
// ✅ 정답
{
  canonicalEventId: "...",
  groupScrapeStatus: "done",
  memberRealName: "홍길동"
}
```

```javascript
// ❌ 오답
{
  canonical_event_id: "...",  // snake_case
  GroupScrapeStatus: "done"   // PascalCase
}
```

## 파일명 규칙

### HTML 파일

**kebab-case.html**

```
✅ 정답:
group.html
ops.html
my.html
report.html
```

### JavaScript 파일

**kebab-case.js**

```
✅ 정답:
scraper.js
backup-firestore.js
pre-deploy-test.sh
```

```
❌ 오답:
Scraper.js      // PascalCase
backupFirestore.js  // camelCase
```

### Markdown 문서

**kebab-case.md**

```
✅ 정답:
api-patterns.md
common-mistakes.md
naming-conventions.md
```

## 함수명 패턴

### 접두사 규칙

**load** - 데이터 가져오기
```javascript
async function loadGroupEvents() { }
async function loadAllMembers() { }
```

**render** - UI 렌더링
```javascript
function renderGroupEvents(events) { }
function renderMemberList() { }
```

**post** - API POST 요청
```javascript
async function postConfirm(event, results) { }
async function postConfirmOne(event, participant) { }
```

**show/hide** - UI 표시/숨김
```javascript
function showToast(message, isError) { }
function hideModal() { }
```

**open/close** - 모달 열기/닫기
```javascript
function openParticipantModal(eventId) { }
function closeRegisterModal() { }
```

## 주석 규칙

### 한글 주석 허용

```javascript
// ✅ 정답: 복잡한 로직은 한글 주석
// 한글 조합 중이면 Enter 무시
if (isComposing) return;

// 오늘 이후 대회만 필터링
const today = new Date();
```

### 영어 주석 지양

```javascript
// ❌ 오답: 의미 전달 안 됨
// Filter events after today
const today = new Date();
```

### 주석이 불필요한 경우

```javascript
// ❌ 나쁜 예: 코드가 이미 명확함
// Get event ID
const eventId = getEventId();

// ✅ 좋은 예: 주석 없이 명확
const eventId = getEventId();
```

## Boolean 변수

**is/has/should** 접두사

```javascript
// ✅ 정답
let isComposing = false;
let isProcessing = false;
const hasPermission = true;
const shouldAutoScrape = false;
```

```javascript
// ❌ 오답
let composing = false;  // Boolean인지 불명확
let processing = false;
```

## 배열/Set 변수

**복수형 (s)**

```javascript
// ✅ 정답
const events = [];
const members = await loadAllMembers();
const selectedMemberIds = new Set();
```

```javascript
// ❌ 오답
const event = [];  // 배열인데 단수형
const member = await loadAllMembers();  // 복수 반환인데 단수형
```

## 임시 변수

**단순 명확하게**

```javascript
// ✅ 정답
const id = event.id;
const name = member.nickname || member.realName;
const q = input.value.trim().toLowerCase();
```

```javascript
// ❌ 오답
const temp = event.id;  // temp는 의미 없음
const x = member.nickname || member.realName;  // x는 의미 없음
```

## 일관성 유지

### 같은 개념은 같은 이름

```javascript
// ✅ 정답: 프로젝트 전체에서 일관
canonicalEventId  // group.html, ops.html, functions/index.js 모두 동일

// ❌ 오답: 파일마다 다름
canonicalEventId  // group.html
eventId           // ops.html
id                // functions/index.js
```

### 약어 사용 최소화

```javascript
// ✅ 정답
const participant = { ... };
const canonicalEventId = "...";

// ❌ 오답
const part = { ... };  // 불명확
const cid = "...";     // 불명확
```

**예외: 널리 알려진 약어**
```javascript
// ✅ 허용
const id = "...";
const url = "...";
const api = "...";
const html = "...";
```

## 체크리스트

새 변수/함수 추가 시:

- [ ] 상수: `UPPER_SNAKE_CASE`
- [ ] 함수: `camelCase` (동사로 시작)
- [ ] 변수: `camelCase`
- [ ] DOM ID: `kebab-case`
- [ ] CSS 클래스: `kebab-case`
- [ ] Shell 변수: `snake_case` (ASCII만)
- [ ] Boolean: `is/has/should` 접두사
- [ ] 배열/Set: 복수형 (`s`)
- [ ] 한글 사용: 주석에만, 변수명 금지
- [ ] 일관성: 기존 코드와 동일한 이름 사용
