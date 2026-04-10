# 공통 실수 및 해결 방법

> 이 문서는 dmc_attendance_log 프로젝트에서 자주 발생하는 실수와 해결 방법을 정리합니다.
> 새로운 실수가 발견되면 즉시 추가하여 재발을 방지합니다.

## JavaScript / TypeScript

### 1. API_BASE 함수 호출 (2026-04-10)

**실수:**
```javascript
fetch(`${apiBase()}?action=group-events`)
```

**문제:** `apiBase`는 함수가 아니라 상수입니다.

**오류 메시지:**
```
apiBase is not defined
```

**해결:**
```javascript
fetch(`${API_BASE}?action=group-events`)
```

**근본 원인:** 도메인 지식 부족. 구현 전 기존 코드 패턴 탐색 생략.

**예방:**
1. 구현 전 `explore` 에이전트로 기존 패턴 확인
2. `_docs/development/api-patterns.md` 문서 참조

---

### 2. 한글 변수명 사용 (2026-04-09)

**실수:**
```bash
# qa-group-events.sh
c1_gap_최=$(curl_get ...)
```

**문제:** Bash는 한글 변수명을 지원하지 않습니다.

**오류 메시지:**
```
c1_gap_최={}: command not found
```

**해결:**
```bash
c1_gap_choi=$(curl_get ...)
```

**근본 원인:** 변수명 규칙 미숙지.

**예방:**
1. 모든 변수명은 ASCII만 사용
2. 한글은 주석으로만 사용

---

### 3. curl POST/GET 혼동 (2026-04-09)

**실수:**
```bash
# gap API는 GET인데 curl_post 사용
c1_gap=$(curl_post "${API_BASE}?action=group-events&subAction=gap&canonicalEventId=${c1_id}")
```

**문제:** API는 GET 요청을 기대하는데 POST로 호출.

**해결:**
```bash
c1_gap=$(curl_get "${API_BASE}?action=group-events&subAction=gap&canonicalEventId=${c1_id}")
```

**근본 원인:** API 명세 미확인.

**예방:**
1. `functions/index.js`에서 API 정의 확인
2. GET은 `curl_get`, POST는 `curl_post`

---

### 4. JSON 파싱 공백 처리 (2026-04-09)

**실수:**
```bash
assert_contains "$response" '"confirmed":true'
```

**문제:** `JSON.stringify`는 콜론 뒤에 공백을 넣습니다 (`"confirmed": true`).

**해결:**
```bash
assert_contains "$response" '"confirmed": true'
```

**근본 원인:** JSON 출력 포맷 미숙지.

**예방:**
1. `jq`나 Python으로 JSON 파싱
2. 문자열 매칭은 공백 고려

---

### 5. 한글 IME 이벤트 미처리 (2026-04-10)

**실수:**
```javascript
// 한글 조합 중에도 Enter 키가 동작
document.getElementById("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    // 조합 중에도 실행됨
  }
});
```

**문제:** 한글 입력 중 Enter 키를 누르면 조합이 완료되지 않은 상태에서 이벤트 발생.

**증상:** "게살" 입력 후 Enter → "햇살" 선택됨

**해결:**
```javascript
let isComposing = false;

document.getElementById("input").addEventListener("compositionstart", () => {
  isComposing = true;
});
document.getElementById("input").addEventListener("compositionend", () => {
  isComposing = false;
});
document.getElementById("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    if (isComposing) return;  // 조합 중이면 무시
    // 처리
  }
});
```

**근본 원인:** 한글 IME 동작 미숙지.

**예방:**
1. 한글 입력이 있는 모든 입력창에 `compositionstart/end` 처리
2. Enter 키 이벤트는 `isComposing` 체크 필수

---

### 6. 이벤트 중복 실행 (2026-04-10)

**실수:**
```javascript
// Enter 키 한 번에 2명 선택됨
document.getElementById("input").addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    // 비동기 작업
  }
});
```

**문제:** 비동기 작업 중 다시 Enter 키가 눌리면 중복 실행.

**해결:**
```javascript
let isProcessing = false;

document.getElementById("input").addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    if (isProcessing) return;
    isProcessing = true;
    e.preventDefault();
    e.stopPropagation();  // 이벤트 전파 차단
    
    try {
      // 비동기 작업
    } finally {
      isProcessing = false;
    }
  }
});
```

**근본 원인:** 비동기 작업 중 경쟁 조건(race condition) 미고려.

**예방:**
1. 비동기 작업은 플래그로 중복 실행 방지
2. `e.stopPropagation()`으로 이벤트 전파 차단
3. `try/finally`로 플래그 확실히 해제

---

## HTML / CSS

### 7. align-items: flex-start 오용 (2026-04-10)

**실수:**
```css
.gcard-header {
  display: flex;
  align-items: flex-start;  /* 상단 정렬 */
}
```

**문제:** 버튼이 제목과 같은 높이가 아니라 위쪽에 붙음.

**해결:**
```css
.gcard-header {
  display: flex;
  align-items: center;  /* 중앙 정렬 */
}
```

**근본 원인:** `flex-start`는 여러 줄 컨텐츠용. 한 줄이면 `center`가 자연스러움.

**예방:**
1. 버튼/아이콘은 대부분 `center` 정렬
2. `flex-start`는 텍스트 블록이 여러 줄일 때만

---

## Shell Script

### 8. JSON 응답 파싱 오류 (2026-04-09)

**실수:**
```bash
# 전체 응답에서 gorunningId 검색 (groupEvents에도 포함됨)
assert_not_contains "$response" "$gorunningId"
```

**문제:** `availableGorunning`에서만 제거됐는지 확인해야 하는데 전체 응답을 검색.

**해결:**
```bash
# Python으로 특정 필드만 추출
available=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('availableGorunning',[]))")
assert_not_contains "$available" "$gorunningId"
```

**근본 원인:** JSON 구조 파악 부족.

**예방:**
1. `jq` 또는 Python으로 JSON 필드 추출
2. 문자열 검색은 전체 JSON이 아닌 특정 필드에

---

### 9. set -euo pipefail로 인한 조기 종료 (2026-04-09)

**실수:**
```bash
set -euo pipefail
# curl -sf는 비정상 응답 시 exit code != 0
# 스크립트가 중단됨
```

**문제:** 테스트 실패 시 이후 테스트가 실행되지 않음.

**해결:**
```bash
# curl을 helper 함수로 감싸기
curl_post() {
  local response=$(curl -s -X POST ...)
  echo "$response"
  return 0  # 항상 성공
}

# 테스트에서 응답 체크
assert_contains "$response" "expected"
```

**근본 원인:** `set -e`는 테스트 스크립트와 맞지 않음.

**예방:**
1. 테스트 스크립트는 모든 curl을 helper 함수로
2. 실패를 assert 함수에서 처리

---

## Firebase

### 10. Functions 변경 감지 실패 (2026-04-10)

**실수:**
```bash
firebase deploy --only functions
# ✔ Skipped (No changes detected)
```

**문제:** 코드를 변경했는데 Firebase가 감지하지 못함.

**해결:**
```bash
# 특정 함수 타겟팅
firebase deploy --only functions:race

# 또는 더미 변경 후 재배포
# functions/index.js에 주석 추가 후 재시도
```

**근본 원인:** Firebase CLI 캐시 이슈.

**예방:**
1. 변경이 확실하면 특정 함수 타겟 (`functions:race`)
2. `--force` 옵션은 효과 없음

---

### 11. API 요청 한도 초과 (2026-04-10)

**실수:**
```bash
# 짧은 시간에 여러 번 배포
firebase deploy --only functions
firebase deploy --only functions --force
firebase deploy --only functions:race
# Error: 429 Quota exceeded
```

**문제:** `cloudbilling.googleapis.com` 분당 요청 한도 초과.

**해결:**
```bash
# 1-2분 대기 후 재시도
sleep 120
firebase deploy --only functions:race
```

**근본 원인:** Firebase API 요청 한도.

**예방:**
1. 배포 전 코드 검증 철저히
2. 배포 실패 시 1-2분 대기

---

## 브라우저

### 12. 배포 후 변경사항 미반영 (2026-04-10)

**실수:**
```bash
firebase deploy --only hosting
# ✔ Deploy complete!
# 그런데 브라우저에서 변경사항 안 보임
```

**문제:** 브라우저 캐시.

**해결:**
```
Mac Chrome: Cmd + Shift + R (하드 리프레시)
Mac Safari: Cmd + Option + R
또는 시크릿 모드
```

**근본 원인:** 브라우저가 HTML/CSS/JS를 캐시함.

**예방:**
1. 배포 후 항상 하드 리프레시
2. 검증은 시크릿 모드에서

---

## 프로세스

### 13. 구현 전 패턴 탐색 생략 (2026-04-10)

**실수:**
- 기존 코드를 보지 않고 바로 구현
- `API_BASE` vs `apiBase()` 같은 실수 발생

**해결:**
1. 구현 전 `explore` 에이전트로 기존 패턴 확인
2. `_docs/development/` 문서 참조
3. 유사한 기존 코드 검색 (`Grep`)

**근본 원인:** 도메인 지식 부족 + 서브에이전트 미활용.

**예방:**
1. 모든 구현은 `explore` 에이전트부터
2. 문서 우선, 추론은 최후

---

### 14. 배포 전 로컬 테스트 생략 (2026-04-10)

**실수:**
- 코드 작성 → 바로 배포
- 브라우저 콘솔 오류 확인 안 함

**해결:**
1. 에뮬레이터에서 기능 테스트
2. 브라우저 콘솔 오류 없음 확인
3. 기존 기능 회귀 없음 확인

**근본 원인:** 검증 프로세스 부재.

**예방:**
1. 배포 전 체크리스트 준수
2. `scripts/pre-deploy-check.sh` 자동화

---

### 15. 코드 리뷰 없이 배포 (2026-04-10)

**실수:**
- 구현 → 바로 배포
- 코드 리뷰 생략

**해결:**
1. 구현 후 `code-reviewer` 서브에이전트로 리뷰
2. Critical/Important 이슈 수정 후 배포

**근본 원인:** 시간 압박 + 프로세스 부재.

**예방:**
1. 모든 구현은 코드 리뷰 필수
2. `default` 모델 사용 (fast 금지)

---

## 요약

| 분류 | 실수 | 빈도 | 심각도 |
|------|------|------|--------|
| JavaScript | `apiBase()` 함수 호출 | 1회 | Critical |
| JavaScript | 한글 IME 미처리 | 1회 | Important |
| JavaScript | 이벤트 중복 실행 | 1회 | Important |
| Shell | 한글 변수명 | 1회 | Critical |
| Shell | curl POST/GET 혼동 | 1회 | Important |
| CSS | align-items 오용 | 1회 | Minor |
| Firebase | 변경 감지 실패 | 1회 | Important |
| 프로세스 | 패턴 탐색 생략 | 반복 | Critical |
| 프로세스 | 로컬 테스트 생략 | 반복 | Critical |

**핵심:** 대부분의 실수는 **구현 전 패턴 탐색 생략**에서 발생.

**해결:** `explore` 에이전트 + 문서 참조를 필수 프로세스로.
