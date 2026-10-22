# 춘백 S3 시즌 마감 — 개인 성과(결산) 페이지 및 대회 기록 OCR 설계

**날짜:** 2026-10-22  
**상태:** 사용자 설계 승인 완료  
**관련 문서:**
- `_docs/superpowers/specs/2026-07-12-chunbaek-season3-attendance-design.md`
- `_docs/superpowers/specs/2026-07-29-chunbaek-attendance-score-design.md`
- `_docs/superpowers/specs/2026-08-11-chunbaek-marathon-dday-design.md`

---

## 1. 배경 및 목표

춘백 시즌3(100일 프로그램, 2026-07-20 ~ 2026-10-27) 마감을 앞두고, 참가 회원이 100일 동안 목표했던 바를 달성했는지 한눈에 확인하고 시즌 최종 대회 결과를 등록하는 **개인 성과(결산) 페이지**를 제공한다.

### 핵심 목표
1. **진입 동선**: `/chunbaek/` 앱 내 **개인 성과 요약 뷰(`#view-report`)**를 추가하고, 시즌 종료/마감 시점 **홈(`#view-today`) 배너**와 **`[나]` 탭(`#view-me`)**에서 바로 이동할 수 있게 한다.
2. **대회 기록 필수 등록 (단일 최고 기록 대회 모델)**:
   - 가장 기록이 좋은 대회 1개(`춘천 마라톤` / `JTBC 서울마라톤` / `기타`)에 대해 결과를 등록한다.
   - 참가 결과 상태: **`완주 (finisher)` / `DNF (중도 포기)` / `DNS (미출전)`** 필수 선택.
   - `완주` 선택 시 완주 Net Time(`시:분:초`) 필수 입력. `DNF` / `DNS` 선택 시 시간 입력 없이 저장 가능.
   - 출정식에서 설정한 `풀 코스 목표 기록(goalMarathonNetTime)` 및 `기존 풀 PB(existingPbNetTime)`와 비교하여 **목표 달성 여부**와 **PB 경신 여부**를 판정·표시한다.
3. **기록증 사진 업로드 및 클라이언트 OCR (1번 안 프로토타입 + 모듈형 구조)**:
   - 기록증/워치/스마트칩 캡처 사진을 첨부하면 브라우저 내장 OCR(`Tesseract.js` + 이미지 전처리 + 마라톤 시간 정규식 파서)이 자동으로 시간을 추출해 `시:분:초` 입력란과 후보 칩(Chip)으로 제시한다.
   - OCR 소요 시간(ms)과 추출 원문/후보를 확인해 성능을 검증할 수 있도록 하며, 추후 서버 Vision AI(2번 안)로 쉽게 교체할 수 있도록 OCR 어댑터(`chunbaek/js/ocr.js`)를 독립 모듈로 분리한다.
4. **100일 출석 성과 리포트 (A안)**:
   - **시즌 총 출석 일수(`seasonAttendCount`)**, **시즌 출석률(`seasonAttendRate %`)**, **주간 목표(3.0점) 달성 주차 수(`seasonWeeksMetCount / seasonWeeksCount`)**를 종합 요약한다.
5. **체중 제외 (YAGNI)**:
   - 목표 체중은 개인 성과 리포트에서 제외한다.

---

## 2. 화면 설계 및 사용자 동선

### 2.1 진입점
1. **홈 화면(`#view-today`) 시즌 마감 배너**:
   - 시즌 종료 카드(`#after-season-card`) 내부 및 홈 상단/하단에 **「🏁 시즌3 성과 리포트 & 대회 기록 등록」** 배너 카드를 노출한다.
   - 아직 `seasonResult`를 등록하지 않은 경우: *"시즌 목표 대회 결과(완주 기록 / DNF / DNS)를 등록하고 100일 성과표를 확인하세요"* 문구와 **「결과 등록하기 →」** CTA 표시.
   - 이미 등록한 경우: *"내 시즌3 성과 리포트 확인하기 →"* 표시.
2. **`[나]` 탭(`#view-me`) 진입 버튼**:
   - 프로필 요약 상단 또는 하단에 **「🏆 내 시즌3 성과 리포트」** 버튼을 배치하여 언제든 접근 가능하게 한다.

### 2.2 개인 성과 요약 뷰 (`#view-report`, 해시 `#/report`)

하단 탭 바(`tab-bar`)는 유지하며 `[나]` 탭 활성 표시(또는 뒤로가기 버튼 제공)로 자연스러운 탐색을 지원한다.

#### (1) 상단 히어로 요약 카드
- **헤더**: `{닉네임}님의 춘백 S3 리포트`
- **달성 배지 리스트**:
  - `🎯 목표 기록 달성` (`status === "finisher"` && `netTimeSec <= goalMarathonNetTime`)
  - `🔥 풀코스 PB 경신` (`status === "finisher"` && `existingPbNetTime` 존재 && `netTimeSec < existingPbNetTime`)
  - `🏁 풀코스 완주` (`status === "finisher"`)
  - `🏅 주간 출석 우수` (주간 목표 달성률 ≥ 80% 또는 시즌 출석률 ≥ 70%)
- **출정식 각오 리마인드**: 온보딩 당시 작성한 `resolutionText` 인용 표시.

#### (2) 대회 기록 성과 카드 (필수 등록 영역)
- **등록 완료 상태**:
  - 출전 대회명 (`춘천 마라톤` / `JTBC 서울마라톤` / `기타: {대회명}`)
  - 결과 상태 배지: `완주` (초록) / `DNF` (주황) / `DNS` (회색)
  - **기록 비교 그리드**:
    - `목표 기록`: `4:30:00`
    - `최종 기록`: `4:25:48` (또는 `DNF` / `DNS`)
    - `목표 대비`: `-4분 12초 (목표 달성!)` 또는 `+3분 10초`
    - `기존 PB 대비` (PB 있는 경우): `-26분 42초 단축!`
  - 첨부한 기록증 사진 썸네일 (탭하면 라이트박스 확대) + 한 줄 회고 메모(`note`)
  - **[대회 결과 수정]** 버튼
- **미등록 상태 (또는 수정 모드)**:
  - 바로 입력 가능한 **대회 결과 업로드 폼** 노출:
    1. **출전 대회 선택**: `춘천 마라톤` / `JTBC 서울마라톤` / `기타` (기본값: 프로필의 `goalRace`)
    2. **완주 여부 선택 (필수)**:
       - `완주 (Finisher)` / `DNF (중도 포기)` / `DNS (미출전)` 세그먼트 버튼
    3. **기록증/결과 사진 업로드 + OCR 자동 인식 (`완주` 선택 시 노출)**:
       - 파일 선택 시 썸네일 미리보기 + **OCR 자동 실행**
       - OCR 상태 표시: `🔍 기록증에서 시간을 읽는 중… (진행률 %)` → 완료 시 `✅ 인식 완료 (1,240ms): 4:25:48 자동 입력됨`
       - 사진 내에 여러 시간(예: Net Time, Gun Time, 구간 기록)이 발견되면 **인식된 시간 후보 칩**(`4:25:48`, `4:28:10`)을 표시하여 원탭으로 선택 가능
       - OCR 실패 또는 오인식 시에도 사용자가 직접 시/분/초를 입력·수정 가능
    4. **완주 기록 입력 (`완주` 선택 시 필수)**:
       - `[시] 시간 [분] 분 [초] 초` (범위: `2:00:00` ~ `8:00:00`)
       - 입력 즉시 실시간으로 목표 기록 대비 달성 여부 미리보기 표시
    5. **시즌 마감 한 줄 소감 (선택, 최대 200자)**:
       - 완주 소감이나 DNF/DNS 사유 메모
    6. **[시즌 결과 저장하기]** 버튼

#### (3) 100일 출석 성과 카드 (A안)
- **3대 핵심 지표**:
  1. **시즌 출석 일수**: `{seasonAttendCount}일` (전체 훈련일 `{seasonDenom}일` 중, 예외 `{seasonExceptionCount}일`)
  2. **시즌 출석률**: `{seasonAttendRate}%` + 프로그레스 바
  3. **주간 목표(3점) 달성**: `{seasonWeeksMetCount} / {seasonWeeksCount}주 달성` (`{weekMetRate}%`)
- **주차별 달성 미니 보드**:
  - 1주차 ~ 15주차 각 주차의 점수 달성 여부(`✓` 달성 / `·` 미달)를 한눈에 보여주는 요약 그리드.

---

## 3. OCR 아키텍처 및 성능 테스트 설계 (`chunbaek/js/ocr.js`)

1번 안(클라이언트 OCR)의 실제 성능을 측정하고, 필요 시 2번 안(서버 Vision AI)으로 즉시 교체할 수 있도록 플러그인 인터페이스로 설계한다.

### 3.1 모듈 인터페이스
```javascript
// chunbaek/js/ocr.js
window.ChunbaekOcr = {
  /**
   * 이미지 파일/Blob에서 마라톤 기록(초, 시/분/초 후보 목록, 소요시간 ms)을 추출한다.
   * @param {File|Blob} imageFile
   * @param {{ onProgress?: (pct: number) => void }} options
   * @returns {Promise<{
   *   ok: boolean,
   *   provider: "tesseract" | "vision-api",
   *   elapsedMs: number,
   *   rawText: string,
   *   bestMatch: { h: number, m: number, s: number, totalSec: number, label: string } | null,
   *   candidates: Array<{ h: number, m: number, s: number, totalSec: number, label: string }>,
   *   error?: string
   * }>}
   */
  extractRaceRecord(imageFile, options = {}),

  /**
   * 순수 함수: OCR 텍스트에서 마라톤 완주 시간 후보를 추출하고 우선순위를 매긴다 (단위 테스트 대상).
   * @param {string} text
   */
  parseMarathonTimesFromText(text),
};
```

### 3.2 텍스트 내 마라톤 시간 추출 규칙 (`parseMarathonTimesFromText`)
스마트칩, 마라존, 오마이레이스, 가민, 스트라바, 대회 문자 등 다양한 포맷을 대응한다:
1. **콜론/점 구분 포맷**: `\b([0]?[2-7])\s*[:.;]\s*([0-5]\d)\s*[:.;]\s*([0-5]\d)\b` (예: `03:45:12`, `4:12:05`, `04.25.48`)
2. **한글 시/분/초 포맷**: `([0]?[2-7])\s*시간\s*([0-5]?\d)\s*분\s*([0-5]?\d)\s*초?` (예: `3시간 45분 12초`, `4시간 05분`)
3. **우선순위 스코어링**:
   - `NET`, `넷타임`, `순수`, `완주`, `기록`, `TIME`, `FINISH` 키워드 근처에 위치한 시간을 최우선(`bestMatch`)으로 선택
   - 마라톤 풀코스 합리 범위(`2:00:00` = 7,200초 ~ `7:59:59` = 28,799초) 필터링
   - 중복 후보 제거 후 `candidates` 배열로 반환

### 3.3 이미지 전처리 (Canvas Preprocessing)
- `Tesseract.js` 인식률과 속도를 높이기 위해 긴 변 1600px 이하로 리사이즈 후 그레이스케일 + 대비(Contrast) 강화 전처리를 수행한 뒤 워커에 전달한다.
- CDN 스크립트는 사용자가 기록증 사진을 첨부할 때 **Lazy Load**하여 초기 앱 로딩 속도(FCP)에 영향을 주지 않는다.

---

## 4. 데이터 모델 및 백엔드 API 설계

### 4.1 신규 API 추가 없이 기존 API 확장 (`new-api-validation.mdc` 준수)
회원당 시즌 최종 결과는 1건(`members.chunbaekS3.seasonResult`)이므로, 별도 API 엔드포인트를 신설하지 않고 기존 `my-profile`, `update-profile`, `team-summary`를 확장한다.

### 4.2 Firestore 스키마 (`members/{memberId}.chunbaekS3.seasonResult`)
```javascript
chunbaekS3: {
  // 기존 프로필 필드 유지...
  seasonResult: {
    status: "finisher" | "dnf" | "dns", // 필수
    race: "chuncheon" | "jtbc" | "other", // 필수
    raceNote: "경주 마라톤" | null,       // race === "other"일 때
    raceLabel: "춘천 마라톤",             // 포맷된 대회 라벨
    netTimeSec: 15948 | null,            // status === "finisher"일 때 필수 (7200 ~ 28800초)
    photoUrl: "https://..." | null,      // 기록증 사진 URL (선택)
    note: "끝까지 달렸습니다!" | null,   // 소감 (최대 200자, 선택)
    updatedAt: Timestamp
  }
}
```

### 4.3 `computeMemberStats` 확장 (`functions/lib/chunbaek-stats.js`)
기존 `computeMemberStats` 반환값에 개인 성과 리포트(A안)용 시즌 누적 지표를 추가한다:
- `seasonTrainingDays`: 오늘까지(또는 시즌 전체) 프로그램 휴무 제외 훈련일 수
- `seasonExceptionCount`: 시즌 중 예외 승인된 슬롯 수
- `seasonWeeksCount`: 지금까지 진행된 본시즌 주차 수 (`week >= 1`)
- `seasonWeeksMetCount`: 주간 목표(`weekScore >= weekTarget`)를 달성한 주차 수
- `seasonWeekSummaries`: 주차별 `{ week, weekScore, target, met, attendCount, exceptionCount }` 배열

### 4.4 `update-profile` 확장 (`functions/lib/chunbaek-handlers.js`)
- `POST /api/chunbaek?action=update-profile` 요청 시:
  - 기존 프로필 수정 요청(`goalMarathonNetTime` 등)은 그대로 동작
  - `body.seasonResult`가 전달된 경우:
    - `seasonResult` 유효성 검증 (`status` in `["finisher", "dnf", "dns"]`, `finisher`일 때 `netTimeSec` 7200~28800 필수, `dnf`/`dns`일 때 `netTimeSec = null`)
    - `body.seasonResult.imageBase64`가 포함된 경우 서버에서 기존 `saveAttendancePhotoToStorage` 헬퍼를 재사용해 `chunbaek/season-results/chunbaek-s3/${memberId}.jpg` 경로에 업로드하고 `photoUrl` 생성
    - `chunbaekS3.seasonResult` 필드를 업데이트하고 갱신된 `memberProfilePayload` 반환

---

## 5. 에러 처리 및 엣지 케이스

| 케이스 | 처리 방식 |
|--------|-----------|
| `완주` 선택 후 기록 미입력 | 저장 차단 + `"완주 기록(시·분·초)을 입력해 주세요"` 토스트 |
| `DNF` / `DNS` 선택 | 기록 입력란 숨김, `netTimeSec: null`로 저장, 목표 달성 배지 미부여 |
| OCR 인식 실패 / 시간 미검출 | `"사진에서 기록을 찾지 못했습니다. 직접 시간을 입력해 주세요"` 안내 후 수동 입력 유도 (사진 자체는 정상 첨부 유지) |
| 네트워크 오프라인 시 OCR | Tesseract 로드 실패 시 에러 없이 수동 입력 안내로 폴백 |
| 기존 PB가 없는 회원 | 목표 기록 달성 여부만 판정하고 PB 비교 행은 `"기존 PB 없음 (첫 풀코스 기록!)"`으로 표시 |
| 프리뷰 모드 (`?preview=1`) | `MOCK.profile` 및 시나리오에 시즌 마감 프리뷰 시나리오(`season-end`) 추가하여 서버 없이도 즉시 테스트 가능 |

---

## 6. 테스트 계획

1. **단위 테스트 (`scripts/test/chunbaek-season-report.test.js`)**:
   - `parseMarathonTimesFromText`: 다양한 기록증 텍스트(스마트칩, 마라존, 가민, 한글 시간 표기, 다중 시간 중 Net Time 우선 추출) 파싱 검증
   - `parseSeasonResult`: `finisher` / `dnf` / `dns` 검증, 범위 밖 시간(2시간 미만/8시간 초과) 거부, `dnf`/`dns` 시 `netTimeSec: null` 정규화 검증
   - `computeMemberStats`: `seasonWeeksCount`, `seasonWeeksMetCount`, `seasonExceptionCount`, `seasonWeekSummaries` 계산 정확성 검증
2. **OCR 성능/정확도 테스트**:
   - 합성 기록증 이미지(Canvas로 생성한 스마트칩/워치 스타일 기록증 이미지)에 대해 `Tesseract.js` OCR 실행 속도(ms) 및 추출 정확도 검증
3. **통합 테스트**:
   - `npm run test:members-sync` 및 `node --test scripts/test/chunbaek-*.test.js` 전체 통과 확인
