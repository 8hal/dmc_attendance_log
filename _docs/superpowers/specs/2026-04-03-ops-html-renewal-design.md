# ops.html 리뉴얼 설계 문서

> 작성일: 2026-04-03  
> 목표: 스크래핑 모니터링 강화 + 모범 사례 적용 + 주말 대회 자동 알림

## 1. 배경 및 목표

### 문제 정의

**현재 ops.html의 한계:**
1. **스크래핑 건강도 blind spot** — 소스별 success rate, stale detection 없음
2. **모범 사례 미준수** — 15+ 메트릭 표시 (권장: 5-7 KPI)
3. **액션 불가능한 정보** — "다음 실행 시" 섹션 (자동 스크랩 없음)
4. **수동 점검 의존** — 주말 대회 전 스크래핑 상태 직접 확인 필요

**실제 사례 (2026-04-03):**
- 스마트칩 스크래퍼 "결과 안 오는 것 같다" 제보
- 수동 조사 결과: False Alarm (실제로는 정상 동작)
- → 자동 건강도 모니터링 필요성 확인

### 설계 목표

1. **스크래핑 모니터링 강화**
   - Success rate, stale jobs, 소스별 건강도 표시
   - 주말 대회 전 자동 점검 (목/금 18:00)

2. **모범 사례 적용**
   - 5-7 KPI 원칙 (6개 핵심 섹션으로 재구성)
   - 액션 가능한 메트릭만 표시

3. **자동 알림 시스템**
   - 이메일 알림 (목/금 저녁, 이슈 발견 시)
   - 모바일에서 확인 가능

### 성공 기준

- [ ] 소스별 success rate 실시간 확인 가능
- [ ] 목/금 18:00 자동 체크 + 이메일 알림 (주말 직전 점검)
- [ ] ops.html 메트릭 6개 이하로 단순화
- [ ] 주말 대회 직전(목/금) 이슈 조기 발견

---

## 2. 시스템 아키텍처

### 2.1 신규 컴포넌트

#### Backend: 3개 신규 항목

**1. Cloud Function: `weekendScrapeReadinessCheck`**
```javascript
exports.weekendScrapeReadinessCheck = onSchedule({
  schedule: "0 18 * * 4,5", // 목/금 18:00 KST
  timeZone: "Asia/Seoul",
  timeoutSeconds: 120,
  memory: "512MiB",
  region: "asia-northeast3"
}, async () => {
  // 1. 스크래핑 건강도 체크 (최근 7일)
  // 2. 주말 대회 목록 확인 (토/일 개최)
  // 3. 소스별 건강도 평가
  // 4. 이슈 발견 시 이메일 발송
  // 5. 결과를 ops_meta 저장
  // 6. event_logs에 weekend_check 이벤트 기록 (Section 5용)
  
  await db.collection("event_logs").add({
    type: "weekend_check",
    severity: overallStatus, // "info" | "warning" | "error"
    message: `주말 준비 체크 완료: ${upcomingCount}개 대회, ${overallSuccessRate}% 건강도`,
    checkedAt: new Date().toISOString(),
    upcomingWeekend: weekendEvents,
    healthSummary: { overall, bySource },
    emailSent: true,
    timestamp: FieldValue.serverTimestamp()
  });
})
```

**기존 `scrapeHealthCheck`와의 역할 구분:**
- **`scrapeHealthCheck`** (매시간): `stuck_job`, `zero_results` 등 즉시 대응 필요한 긴급 이슈
- **`weekendScrapeReadinessCheck`** (목/금 18:00): 주말 대회 준비 상태 종합 점검 + 이메일 알림

**2. HTTP API: `ops-scrape-health`**
```javascript
// GET /race?action=ops-scrape-health
if (action === "ops-scrape-health") {
  // 최근 7일 scrape_jobs 분석
  // - overall success rate
  // - failed/stale/stuck jobs
  // - 소스별 success rate
  // - 최근 트렌드 (전주 대비)
  
  return res.json({
    ok: true,
    period: { start, end },
    overall: { total, success, failed, stale, stuck, rate },
    bySource: {
      smartchip: { total, success, rate },
      myresult: { total, success, rate },
      spct: { total, success, rate },
      marazone: { total, success, rate },
      manual: { total }
    },
    upcomingWeekend: [
      { date, eventName, source }
    ],
    lastCheck: timestamp
  });
}
```

**3. Email Service: `sendEmail` 헬퍼 함수**
```javascript
const nodemailer = require("nodemailer");

async function sendEmail({ to, subject, html }) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
  
  await transporter.sendMail({ from, to, subject, html });
}
```

**환경 변수 추가 (functions/.env):**
```bash
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
ADMIN_EMAIL=taylor@example.com
```

**주의사항:**
- `emailSent: true` 플래그는 발송 시도 시점에 기록
- 실패 시 `event_logs`에 `severity: "error"` + `emailSent: false` 기록
- 재시도는 다음 스케줄 실행 시 자동 (별도 재시도 로직 불필요)

#### Frontend: ops.html 재설계

**6개 섹션 구성:**

1. **시스템 건강도** (요약 카드)
2. **스크래핑 건강도** (신규 - 핵심)
3. **주말 준비 상태** (목/금만 표시)
4. **전환율 & 퍼널** (기존 유지)
5. **최근 알림** (기존 개선)
6. **이벤트 로그** (기존 축소)

**제거:**
- ❌ "다음 실행 시 먼저 스크랩될 후보"
- ❌ "오늘 개최일 대회" (report.html로 이동)

---

## 3. 상세 설계

### 3.1 스크래핑 건강도 메트릭

#### 정의

| 메트릭 | 정의 | 임계치 |
|--------|------|--------|
| **Success Rate** | `(complete + confirmed) / (total - queued)` | ⚠️ <90%, 🔴 <80% |
| **Failed Jobs** | `status === "failed"` | ⚠️ ≥3건, 🔴 ≥5건 |
| **Stale Jobs** | `status === "complete"` + `completedAt` 3일 이상 (즉, 스크랩 완료했으나 운영자가 확정 안 한 잡) | ⚠️ ≥5건 |
| **Stuck Jobs** | `status === "running"` + `createdAt` 1시간 이상 (기존 `scrapeHealthCheck`와 동일) | 🔴 ≥1건 (긴급) |

**데이터 기간:**
- Success Rate: 최근 7일 (`createdAt` 또는 `completedAt` 기준)
- Failed/Stale/Stuck: 전체 (시간 제한 없음, 단 Stale은 `completedAt` 3일 이상)

**Stale Jobs 쿼리 로직:**
```javascript
const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
const staleSnap = await db.collection("scrape_jobs")
  .where("status", "==", "complete")
  .where("completedAt", "<=", threeDaysAgo)
  .get();

// completedAt 없는 오래된 문서는 제외 (백필 불필요)
const staleJobs = [];
staleSnap.forEach(doc => {
  const d = doc.data();
  if (d.completedAt) {
    staleJobs.push({ jobId: doc.id, ...d });
  }
});
```

**Stuck Jobs 쿼리 로직 (기존 `scrapeHealthCheck`와 동일):**
```javascript
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const stuckSnap = await db.collection("scrape_jobs")
  .where("status", "==", "running")
  .where("createdAt", "<=", oneHourAgo)
  .get();
```

**데이터 기간**: 최근 7일 (rolling window)

#### 소스별 건강도

**통합 색상 규칙 (모든 소스 공통):**
- ✅ 초록: ≥90%
- ⚠️ 노랑: 80-89%
- 🔴 빨강: <80%

**소스별 특이사항:**

| 소스 | 참고 |
|------|------|
| smartchip | 세션 이슈 민감 (95% 이상 권장, 단 90% 이상이면 ✅) |
| myresult | API 변경 빈번 |
| spct | — |
| marazone | — |
| manual | 수동 입력 (건강도 미측정) |

### 3.2 주말 준비 체크 로직

#### 트리거 조건

**목/금 18:00 KST 실행 시:**
1. 다가오는 토/일 대회 목록 조회 (`ops-scrape-preview` 활용)
2. 해당 대회 소스의 최근 7일 건강도 확인
3. 이슈 평가 (아래 규칙)

#### 이슈 판정 규칙

**🔴 Critical (즉시 조치 필요):**
- 주말 대회 소스의 Success Rate <80%
- Stuck jobs ≥1건
- 해당 소스에서 최근 3일 내 Failed ≥3건

**🟡 Warning (모니터링 필요):**
- 주말 대회 소스의 Success Rate <90%
- Stale jobs ≥5건

**✅ OK:**
- 모든 메트릭 정상

### 3.3 이메일 알림 설계

#### 발송 조건

1. **정기 발송**: 목/금 18:00 (이슈 유무 관계없이)
2. **긴급 발송**: Critical 이슈 발견 시 즉시

#### 이메일 템플릿

**제목:**
```
[DMC Ops] 주말 대회 준비 체크 - {상태}
```
- `✅ 정상` / `⚠️ 주의` / `🔴 긴급`

**본문 (HTML):**
```html
<h2>🏃 주말 대회 스크래핑 준비 상태</h2>

<div style="background: #f0f0f0; padding: 15px; border-radius: 8px;">
  <h3>체크 시각: 2026-04-03 18:00</h3>
  <p><strong>주말 예정 대회:</strong> 3개</p>
</div>

<h3>📊 스크래핑 건강도 (최근 7일)</h3>
<table>
  <tr><th>소스</th><th>Success Rate</th><th>상태</th></tr>
  <tr><td>SmartChip</td><td>98% (145/148)</td><td>✅ 정상</td></tr>
  <tr><td>MyResult</td><td>85% (34/40)</td><td>⚠️ 주의</td></tr>
  <tr><td>SPCT</td><td>100% (15/15)</td><td>✅ 정상</td></tr>
</table>

<h3>⚠️ 발견된 이슈</h3>
<ul>
  <li>🟡 MyResult success rate 85% (임계치: 90%)</li>
  <li>🟡 Stale jobs 7건 (임계치: 5건)</li>
</ul>

<h3>🔗 액션</h3>
<ul>
  <li>ops.html 확인: <a href="https://dmc-attendance.web.app/ops.html">바로가기</a></li>
  <li>report.html에서 stale jobs 확정: <a href="https://dmc-attendance.web.app/report.html">바로가기</a></li>
</ul>

<hr/>
<p style="color: #999; font-size: 12px;">
  이 알림은 매주 목/금 18:00에 자동 발송됩니다.<br/>
  문제가 있으면 ops.html에서 상세 내역을 확인하세요.
</p>
```

### 3.4 데이터 저장

**`ops_meta` 컬렉션에 체크 결과 저장:**
```javascript
await db.collection("ops_meta").doc("last_weekend_check").set({
  checkedAt: timestamp,
  dayOfWeek: "목요일" | "금요일",
  upcomingWeekend: { saturday, sunday },
  overall: { successRate, issues },
  bySource: { smartchip, myresult, ... },
  emailSent: true,
  emailRecipient: "taylor@example.com"
}, { merge: true });
```

**히스토리 보관 (`ops_meta_history` 서브컬렉션):**
```javascript
await db.collection("ops_meta")
  .doc("weekend_checks")
  .collection("history")
  .add({ ...checkData, timestamp });
```

---

## 4. UI 상세 설계

### 4.1 Section 1: 시스템 건강도

**위치**: 최상단 요약 카드

**레이아웃:**
```
┌──────────────────────────────────────────────────────────┐
│ ✅ 시스템 정상 운영 중                                     │
│ 총 Jobs: 245 | 총 Records: 3,421 | Phantom Jobs: 0       │
└──────────────────────────────────────────────────────────┘
```

**상태 표시 규칙:**
- ✅ 정상: Phantom Jobs = 0
- ⚠️ 주의: Phantom Jobs 1-5건
- 🔴 긴급: Phantom Jobs ≥6건

**데이터 소스**: `GET /race?action=data-integrity`

**액션**: Phantom Jobs > 0 시 하단 "데이터 무결성" 섹션으로 스크롤

### 4.2 Section 2: 스크래핑 건강도 (신규 - 가장 중요)

**위치**: Section 1 바로 아래

**레이아웃:**
```
┌──────────────────────────────────────────────────────────┐
│ 🔍 스크래핑 건강도 (최근 7일)               [새로고침 ↻] │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  전체 Success Rate: 94% (200/213 jobs)                   │
│  Failed: 3건 | Stale: 2건 | Stuck: 0건                   │
│                                                           │
├──────────────────────────────────────────────────────────┤
│  소스별 건강도:                                           │
│                                                           │
│  • SmartChip:  ✅ 98% (145/148 jobs)                    │
│  • MyResult:   ⚠️  85% (34/40 jobs)   ← 점검 필요       │
│  • SPCT:       ✅ 100% (15/15 jobs)                     │
│  • Marazone:   ✅ 100% (6/6 jobs)                       │
│  • Manual:     — (수동 입력)                             │
│                                                           │
│  마지막 업데이트: 2026-04-03 18:23                       │
└──────────────────────────────────────────────────────────┘
```

**색상 코딩:**
- ✅ 초록: ≥90%
- ⚠️ 노랑: 80-89%
- 🔴 빨강: <80%

**데이터 소스**: `GET /race?action=ops-scrape-health` (신규)

**인터랙션:**
- 소스 클릭 → 해당 소스 최근 failed jobs 상세 표시 (모달)
- [새로고침] 버튼 → API 재호출

**액션:**
- ⚠️/🔴 소스 발견 시 → report.html에서 해당 소스 jobs 확인

### 4.3 Section 3: 주말 준비 상태

**위치**: Section 2 아래

**표시 조건**: **목/금요일만** (다른 요일은 숨김)

**레이아웃:**
```
┌──────────────────────────────────────────────────────────┐
│ 🏃 주말 대회 준비 상태                                    │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  다가오는 주말 대회: 3개                                  │
│                                                           │
│  • 2026-04-05 (토) 춘천마라톤         [smartchip ✅]    │
│  • 2026-04-06 (일) 서울숲10K          [myresult ⚠️]     │
│  • 2026-04-06 (일) 한강야간러닝       [spct ✅]         │
│                                                           │
│  전체 준비 상태: ⚠️ 주의 (MyResult 점검 필요)           │
│                                                           │
│  📧 마지막 이메일 알림: 2026-04-03 18:00 (금)           │
└──────────────────────────────────────────────────────────┘
```

**데이터 소스**: 
- 대회 목록: `ops-scrape-health.upcomingWeekend`
- 소스 건강도: Section 2 데이터 재사용

**액션:**
- ⚠️/🔴 소스가 있는 대회 → 사전 수동 점검 권장

### 4.4 Section 4: 전환율 & 퍼널

**위치**: Section 3 아래

**변경사항**: 기존 `member-stats` 유지, 단 불필요한 상세는 축소

**유지:**
- 배포 후 전환율
- 퍼널 (page_load → search_save)
- 확정 경로 (personal / operator / other)

**제거:**
- "검색했지만 결과 없음" (운영 액션 없음)

### 4.5 Section 5: 최근 알림

**위치**: Section 4 아래

**레이아웃:**
```
┌──────────────────────────────────────────────────────────┐
│ 🚨 최근 알림 (10건)                                       │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  🔴 04-03 14:23  MyResult 세션 실패 의심                 │
│  🟡 04-02 09:15  스크랩 잡 1시간 멈춤 (jobId: xxx)       │
│  ✅ 04-01 18:00  주말 준비 체크 완료                     │
│  🟡 03-31 16:45  Stale jobs 7건 (확정 필요)             │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

**데이터 소스**: `GET /race?action=event-logs` 필터링
- `type === "scrape_alert"` 또는 `type === "weekend_check"`
- 최근 10건

**색상:**
- 🔴 `severity: "error"`
- 🟡 `severity: "warning"`
- ✅ `severity: "info"`

### 4.6 Section 6: 이벤트 로그

**위치**: 최하단

**변경사항**: 기존 일별 요약 유지, 단 간소화

**레이아웃:**
```
┌──────────────────────────────────────────────────────────┐
│ 📋 이벤트 로그 (최근 7일 요약)                            │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  2026-04-03  page_load:45  search_save:12  2명           │
│  2026-04-02  page_load:67  search_save:18  5명           │
│  ...                                                      │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

**제거**: 이벤트 상세 (과도한 정보)

---

## 5. 구현 우선순위

### Phase 1: Core (필수 - 1주)

1. **Backend API: `ops-scrape-health`**
   - 최근 7일 scrape_jobs 분석
   - 소스별 success rate 계산
   - 주말 대회 목록 조회

2. **Cloud Function: `weekendScrapeReadinessCheck`**
   - 목/금 18:00 스케줄
   - ops-scrape-health 로직 재사용
   - 이메일 발송 (Nodemailer)

3. **ops.html 리뉴얼**
   - Section 1, 2, 3 구현 (핵심)
   - Section 4, 5, 6 기존 코드 정리
   - "다음 실행 시" 섹션 제거

### Phase 2: Polish (선택 - 3일)

4. **이메일 템플릿 고도화**
   - HTML 스타일링
   - 모바일 최적화

5. **ops.html UX 개선**
   - 소스별 failed jobs 상세 모달
   - 자동 새로고침 (30초 간격)

6. **히스토리 보관**
   - `ops_meta_history` 서브컬렉션
   - 주간 트렌드 차트 (선택)

---

## 6. 의존성 및 제약사항

### 기술 스택

**Backend:**
- Firebase Functions v2
- Node.js 18+
- Nodemailer 6.9+

**Frontend:**
- Vanilla JS (기존 유지)
- 차트 라이브러리 불필요 (텍스트 기반)

### 환경 변수

**functions/.env 추가 필요:**
```bash
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
ADMIN_EMAIL=taylor@example.com
```

**Gmail 앱 비밀번호 생성:**
1. Google 계정 → 보안 → 2단계 인증 활성화
2. 앱 비밀번호 생성 → "메일" 앱 선택
3. 16자리 비밀번호 복사 → `.env`에 저장

### 제약사항

1. **이메일 발송 제한**: Gmail 하루 500통 (충분)
2. **Cloud Scheduler 비용**: 월 $0.10 (무시 가능)
3. **Firestore 읽기**: 주당 ~1,000 reads 추가 (무료 할당 내)

---

## 7. 테스트 계획

### 단위 테스트

**Backend:**
```javascript
// functions/__tests__/ops-scrape-health.test.js
describe("ops-scrape-health", () => {
  test("소스별 success rate 계산", async () => {
    // Given: 최근 7일 scrape_jobs 샘플 데이터
    // When: ops-scrape-health API 호출
    // Then: smartchip 98%, myresult 85% 반환
  });
  
  test("주말 대회 목록 조회", async () => {
    // Given: 토/일 개최 대회 3개
    // When: upcomingWeekend 조회
    // Then: 3개 대회 반환 (source 포함)
  });
});
```

**Email Service:**
```javascript
describe("weekendScrapeReadinessCheck", () => {
  test("Critical 이슈 발견 시 긴급 이메일", async () => {
    // Given: MyResult success rate 75%
    // When: 목요일 18:00 실행
    // Then: 제목에 "🔴 긴급" 포함
  });
  
  test("정상 상태 시 일반 이메일", async () => {
    // Given: 모든 소스 >90%
    // When: 금요일 18:00 실행
    // Then: 제목에 "✅ 정상" 포함
  });
});
```

### 통합 테스트

**로컬 에뮬레이터:**
```bash
# 1. 에뮬레이터 시작
firebase emulators:start --only functions,firestore

# 2. 테스트 데이터 시드
node scripts/seed-scrape-jobs.js

# 3. API 호출 테스트
curl "http://localhost:5001/dmc-attendance/asia-northeast3/race?action=ops-scrape-health"

# 4. 스케줄 함수 수동 트리거 (HTTP 래퍼 생성 필요)
# 방법 1: 임시 HTTP 엔드포인트 추가
# exports.testWeekendCheck = onRequest(async (req, res) => {
#   await weekendScrapeReadinessCheck(); // 로직 재사용
#   res.json({ ok: true });
# });

# 방법 2: Firebase Console에서 Functions → weekendScrapeReadinessCheck → "함수 실행" 버튼
# 방법 3: scripts/test-weekend-check.js 작성 (Admin SDK 사용)
```

**프로덕션 검증:**
1. 목요일 17:55에 배포
2. 18:00 자동 실행 대기
3. 이메일 수신 확인
4. ops.html에서 Section 2, 3 확인

---

## 8. 롤백 계획

### 문제 발생 시

**Backend 이슈:**
- 신규 API 오류 → `ops-scrape-health` 비활성화
- 기존 `ops-scrape-preview` 사용 가능 (부분 기능)

**Email 발송 실패:**
- Gmail 인증 문제 → `.env` 재확인
- 발송 실패해도 ops.html은 정상 동작

**Frontend 이슈:**
- Section 2, 3 렌더링 오류 → 해당 섹션만 숨김
- 기존 Section 4, 5, 6은 독립적으로 동작

### 완전 롤백

```bash
# 1. 이전 버전으로 되돌리기
git revert <commit-hash>

# 2. 재배포
firebase deploy --only functions,hosting

# 3. 스케줄 함수 비활성화 (필요 시)
# Firebase Console → Functions → weekendScrapeReadinessCheck → 사용 중지
```

---

## 9. 향후 개선 방향

### Phase 3: 고급 기능 (백로그)

1. **트렌드 분석**
   - 주간 success rate 추이 차트
   - 소스별 장애 패턴 분석

2. **알림 채널 확장**
   - 슬랙 Webhook (선택)
   - SMS (긴급 시)

3. **역할 기반 대시보드**
   - ops.html (시스템 관리자)
   - report.html에 간소 대시보드 추가 (운영진)

4. **자동 복구**
   - SmartChip 세션 자동 갱신
   - Stuck jobs 자동 재시작

---

## 10. 참고 자료

### 외부 모범 사례
- [Operations Dashboard Best Practices 2026](https://dev.to/godofgeeks/building-operational-dashboards-20h2)
- [Web Scraping Monitoring Guide](https://scrapeops.io/docs/monitoring/overview/)
- [Data Integrity Monitoring Patterns](https://metaplane.dev/data-observability/continuous-data-monitoring)

### 내부 문서
- `_docs/api/http-api-actions.md` — API 명세
- `_docs/api/user-scenarios-api-map.md` — 역할별 시나리오
- `_docs/knowledge/data-dictionary.md` — 데이터 스키마
- `functions/index.js` lines 652-751 — 기존 `scrapeHealthCheck`

---

## 변경 이력

| 날짜 | 작성자 | 변경 내역 |
|------|--------|----------|
| 2026-04-03 | AI + taylor | 초안 작성 |
