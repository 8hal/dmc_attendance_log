# PRD: 출석 페이지 개편 Phase 1 (MVP)

> 작성일: 2026-04-17  
> 업데이트: 2026-04-17 (Phase 분리 - 자봉 모드 제외)  
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

**핵심 고통**: 사용자가 매번 3단계를 거쳐야 하며, 재방문자에게 불필요한 반복 작업이 발생한다.

---

## 2. 목표 및 성공 기준

| 목표 | 성공 기준 |
|---|---|
| 원클릭 출석 | 재방문자는 1번의 터치로 출석 완료 (< 5초) |
| 중요 정보 강조 | 출석 인원, 개인 통계를 크게 표시 |
| 게스트 출석 지원 | 비정회원도 출석 입력 가능 |
| 서버 중복 방지 | 같은 날짜 + 닉네임 중복 출석 차단 |

---

## 3. 범위

### Phase 1 (MVP) - In Scope

- **2가지 뷰 모드**:
  - **C안 (대시보드)**: 재방문자 본인 출석 (원클릭)
  - **B안 (검색)**: 첫 방문자 환영 + 가이드 + 검색
- **게스트 출석**: B안에서 모달로 처리
- **localStorage 프로필 저장**: 재방문자 자동 인식
- **서버 중복 체크**: 같은 날짜 + 닉네임 중복 방지
- **정회원 명단 연동**: `members` 컬렉션에서 실시간 로드
- **출석 통계 API**: 현재 달 기준 출석 횟수, 출석률, 연속 출석
- **팀 정보 변경**: 프로필 카드에서 팀 변경 모달
- **출석 후 통계 표시**: 축하 화면 + 이번 달 통계

### Phase 1 - Out of Scope (Phase 2로 이동)

- **A안 (자봉 모드)**: 여러 사람 대신 출석 체크 → **Phase 2**
- **출석 취소/수정**: 실수 보정 기능 → **Phase 2**
- **85명 브라우징**: 팀별 필터, 미출석만 필터 → **Phase 2**

### 완전 Out of Scope

- 카카오톡 등 외부 알림 연동
- QR 코드 출석 체크
- 4자리 출석 번호 시스템
- `history.html` 기능 변경 (현행 유지)
- 비정모일 처리 변경 (기존 레거시 따름)

---

## 4. 등장인물 (Actor)

| Actor | 사용 뷰 | 시나리오 |
|---|---|---|
| 재방문자 (정회원) | C안 (대시보드) | localStorage 프로필 보유, 원클릭 출석 |
| 첫 방문자 (정회원) | B안 (검색) | 환영 + 가이드 → 검색 → 출석 |
| 게스트 (비정회원) | B안 (모달) | "게스트로 출석하기" 버튼 클릭 |

---

## 5. 유저 시나리오

### 시나리오 A: 재방문자 본인 출석 (C안 - 대시보드)

**출석 전**:
1. 페이지 로드 → localStorage에 `myProfile` 존재
2. **C안 (대시보드)** 자동 표시:
   - 프로필 카드 (닉네임, 팀, "변경" 버튼)
   - 오늘 정모 정보 (날짜, 정모명, 현재 출석 인원)
   - 큰 "✅ 출석 체크하기" 버튼 (72px 높이)
3. 버튼 클릭 → API 호출 → 중복 체크

**출석 후**:
4. **축하 화면** 자동 표시:
   - 🎉 출석 완료 애니메이션
   - 출석 시각 + 오늘 N번째 출석
   - 이번 달 통계 카드 (출석 횟수, 출석률, 연속 출석)
5. 5초 후 자동 닫힘 또는 "닫기" 버튼
6. **원클릭 완료**

### 시나리오 B: 첫 방문자 본인 출석 (B안 - 검색)

1. 페이지 로드 → localStorage에 `myProfile` 없음
2. **B안 (검색 UI)** 자동 표시:
   - 환영 배너: "동마클에 오신 걸 환영합니다!"
   - 가이드 카드: 3단계 안내 (검색 → 저장 → 출석)
   - 거대한 검색 바 (64px 높이, 정회원 닉네임 자동완성)
3. 사용자가 검색창에 이름 입력 → 자동완성 결과 최대 5개
4. 본인 선택 → 선택 확인 카드 표시
5. "나로 저장하기" 체크박스 (기본값: unchecked)
6. 출석 버튼 클릭 → API 호출 → 성공
7. "나로 저장하기" 체크 시 → localStorage에 프로필 저장
8. 다음 방문 시 → C안 (대시보드) 자동 표시

### 시나리오 C: 게스트 출석 (B안 - 모달)

1. B안 또는 C안 표시 중
2. 하단 "게스트로 출석하기" 링크 클릭
3. **게스트 출석 모달** 팝업:
   - 닉네임 입력 필드 (자유 텍스트)
   - 안내: "게스트는 통계에 포함되지 않으며, 같은 이름으로 여러 번 출석 가능합니다."
4. 출석 버튼 클릭 → API 호출 (`isGuest: true`) → 성공
5. 모달 닫힘

### 시나리오 D: 팀 정보 변경 (C안)

1. C안 (대시보드) 표시 중
2. 프로필 카드 "변경" 버튼 클릭
3. **팀 변경 모달** 팝업:
   - 현재 팀 표시
   - 새 팀 선택 (Team 1, 2, 3, 4 버튼)
4. 변경 버튼 클릭 → localStorage 업데이트
5. 프로필 카드 즉시 반영

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
  "memberId": "members_doc_id_123",
  "team": "T1",
  "meetingType": "SAT",
  "meetingDate": "2026/04/19",
  "isGuest": false
}
```

**신규 필드**:
- `memberId`: 정회원 Doc ID (`members` 컬렉션의 Firestore ID, 게스트는 `null`)
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
  
  // 🆕 memberId, isGuest 필드 추가
  const memberId = req.body.memberId || null;
  
  await db.collection(COLLECTION).add({
    nickname: nicknameStored,
    nicknameKey: nicknameStored.toLowerCase(),
    memberId,  // 🆕 추가 (정회원: Doc ID, 게스트: null)
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
    }
  ]
}
```

**프론트엔드 사용**:
```javascript
// 사용자가 검색에서 회원 선택 시
const selectedMember = members.find(m => m.nickname === "게살볶음밥");

// 출석 API 호출 시 memberId 포함
await fetch('/attendance', {
  method: 'POST',
  body: JSON.stringify({
    nickname: selectedMember.nickname,
    memberId: selectedMember.id,  // 🆕 members Doc ID
    team: selectedMember.team,
    // ...
  })
});
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
  "records": [
    {
      "nickname": "쌩메",
      "team": "T2",
      "teamLabel": "Team 2",
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

---

## 7. 배포 전략

### 7.1 파일 구조

```
/Users/taylor/git/dmc_attendance_log/
├── index.html                  # 기존 출석 페이지 (Phase 1: 유지)
├── attendance-v2.html          # 🆕 새 출석 페이지 (베타)
├── index-legacy.html           # (Phase 2: index.html 백업본)
└── functions/
    └── index.js                # API 확장 (중복 체크, isGuest, stats)
```

### 7.2 배포 단계

**Phase 1: 베타 배포 (2주)**
1. 백엔드 배포 (중복 체크, `isGuest`, `stats` API)
2. Firestore 인덱스 생성
3. `attendance-v2.html` 배포
4. `index.html` 상단에 베타 안내 배너 추가
5. 베타 테스터 모집 (운영진 5명 + 희망자)
6. 피드백 수집 (Firestore `feedback` 컬렉션)

**Phase 2: 정식 전환 (1주)**
1. 베타 피드백 반영 완료
2. `index.html` → `index-legacy.html` 백업
3. `attendance-v2.html` → `index.html` 교체
4. 첫 정모일 실시간 모니터링

**Phase 3: 레거시 제거 (1개월 후)**
1. 1개월간 안정화 확인
2. `index-legacy.html` 삭제

### 7.3 롤백 계획

- **트리거**: 출석 실패율 > 10%
- **방법**: `index.html` ← `index-legacy.html` 복구
- **소요 시간**: 5분 (Firebase Hosting 재배포)

---

## 8. 성공 지표 (KPI)

| 지표 | 목표 | 측정 방법 |
|---|---|---|
| 출석 성공률 | > 95% | Cloud Function 로그 |
| 평균 출석 소요 시간 | < 5초 (재방문자) | 프론트엔드 로깅 |
| 페이지 로딩 속도 | < 2초 | Lighthouse 점수 |
| 사용자 만족도 | > 80% | 피드백 설문 |
| 중복 출석 차단 | 100% | 수동 검증 |

---

## 9. Phase 2 (차기) 범위

**자봉 모드 (A안)**:
- 여러 사람 대신 출석 체크
- 85명 카드 그리드 + 팀별 필터
- 출석 취소/수정 API
- 게스트 출석 대행

**조건**: Phase 1 성공 후 (사용자 만족도 > 85%)

---

## 10. 예상 공수

| 작업 | 예상 시간 |
|---|---|
| 백엔드 API 확장 | 4시간 |
| B안 (검색 UI) 구현 | 6시간 |
| C안 (대시보드) 구현 | 5시간 |
| 게스트 모달 + 통계 | 3시간 |
| 모드 전환 로직 | 2시간 |
| 로컬 테스트 + 버그 수정 | 4시간 |
| **합계** | **24시간 (3일)** |
