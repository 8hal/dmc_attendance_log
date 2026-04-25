# group_scrape_jobs 분리 마이그레이션 계획

**작성일**: 2026-04-20  
**목표**: report.html과 group.html의 데이터 레이어 완전 분리

---

## 📊 현재 문제점

```
report.html (개인 대회)
   ↓ scrape
scrape_jobs ← 공유 (충돌 위험)
   ↑ 단체 스크랩
group.html (단체 대회)
```

**문제**:
1. 같은 대회를 양쪽에서 처리 시 scrape_jobs 충돌
2. 워크플로우 의미 충돌 (전체 회원 vs 참가자 명단)
3. 데이터 덮어쓰기 리스크

---

## 🎯 목표 아키텍처

```
report.html (개인 대회)
   ↓ scrape
scrape_jobs (개인 전용)
   ↓ confirm
race_results ← SSOT

group.html (단체 대회)
   ↓ group-scrape
group_scrape_jobs (단체 전용)
   ↓ gap 분석
   ↓ confirm (개별)
race_results ← SSOT
```

---

## 📦 새로운 컬렉션 스키마

### group_scrape_jobs

```javascript
group_scrape_jobs/{canonicalEventId}
{
  // 메타
  canonicalEventId: string,        // race_events.id
  eventName: string,
  eventDate: "YYYY-MM-DD",
  groupSource: {                    // race_events.groupSource 복사
    source: "smartchip" | "spct" | ...,
    sourceId: string
  },
  
  // 참가자 명단
  participants: [
    {
      memberId: string,
      realName: string,
      nickname: string
    }
  ],
  
  // 스크랩 결과
  scrapedResults: [
    {
      memberRealName: string,
      memberNickname: string,       // 매칭 시 채움
      distance: string,
      netTime: string,
      gunTime?: string,
      bib?: string,
      overallRank?: number,
      genderRank?: number,
      pace?: string,
      memberGender?: string
    }
  ],
  
  // 갭 분석 결과
  gap: [
    {
      memberId: string,
      realName: string,
      nickname: string,
      gapStatus: "ok" | "ambiguous" | "missing",
      
      // ok: 자동 매칭됨
      matchedResult?: {
        distance, netTime, bib, ...
      },
      
      // ambiguous: 동명이인 (여러 후보)
      candidates?: [
        { distance, netTime, bib, ... }
      ],
      
      // missing: 기록 미발견
      
      // 확정 여부
      confirmed: boolean,
      confirmedAt?: ISO string,
      confirmedResult?: {
        distance, netTime, bib, pbConfirmed, note, ...
      }
    }
  ],
  
  // 상태
  status: "pending" | "scraping" | "complete" | "partial_failure" | "failed",
  progress?: {
    searched: number,
    total: number,
    found: number
  },
  
  // 타임스탬프
  createdAt: ISO string,
  lastScrapedAt?: ISO string,
  error?: string
}
```

---

## 🔧 마이그레이션 단계

### Phase 1: 백엔드 API 추가 (함수 추가, 기존 코드 유지)

**목표**: group_scrape_jobs 기반 새 API 구현, 기존 API는 그대로

#### 1.1 새 API 엔드포인트

```javascript
// functions/index.js

// 새 API: 단체 대회 스크랩
exports.race.post('?action=group-scrape', async (req, res) => {
  const { canonicalEventId, participants, groupSource } = req.body;
  
  // 1. group_scrape_jobs 문서 생성 (status: scraping)
  // 2. 참가자 실명 기반 스크랩
  // 3. 갭 분석 (ok/ambiguous/missing)
  // 4. group_scrape_jobs 업데이트 (status: complete)
  
  return res.json({ ok: true, jobId: canonicalEventId, gap });
});

// 새 API: 단체 스크랩 잡 조회
exports.race.get('?action=group-job&canonicalEventId=xxx', async (req, res) => {
  const { canonicalEventId } = req.query;
  const jobSnap = await db.collection('group_scrape_jobs').doc(canonicalEventId).get();
  
  if (!jobSnap.exists) {
    return res.json({ ok: false, error: 'Job not found' });
  }
  
  return res.json({ ok: true, job: jobSnap.data() });
});

// 새 API: 단체 대회 개별 확정
exports.race.post('?action=group-confirm', async (req, res) => {
  const { canonicalEventId, memberId, result } = req.body;
  
  // 1. race_results에 저장 (기존 confirm 로직 재사용)
  // 2. group_scrape_jobs.gap[memberId].confirmed = true
  
  return res.json({ ok: true });
});
```

#### 1.2 functions/race.js 구조화

```
functions/
├─ index.js                    # 라우팅
├─ race/
│  ├─ individual/              # report.html용 (기존)
│  │  ├─ scrape.js             # scrape_jobs 생성
│  │  ├─ job.js                # scrape_jobs 조회
│  │  └─ confirm.js            # race_results 저장
│  ├─ group/                   # group.html용 (신규)
│  │  ├─ groupScrape.js        # group_scrape_jobs 생성
│  │  ├─ groupJob.js           # group_scrape_jobs 조회
│  │  └─ groupConfirm.js       # race_results 저장 + gap 업데이트
│  └─ shared/
│     ├─ scraper.js            # 공통 스크래퍼 로직
│     └─ raceResults.js        # race_results 저장 로직
```

**작업 항목**:
- [ ] `functions/race/group/groupScrape.js` 작성
- [ ] `functions/race/group/groupJob.js` 작성
- [ ] `functions/race/group/groupConfirm.js` 작성
- [ ] `functions/index.js`에 라우팅 추가
- [ ] 로컬 에뮬레이터 테스트

**예상 소요**: 1일

---

### Phase 2: 프론트엔드 전환 (group-detail.html만 수정)

**목표**: group-detail.html을 새 API로 전환, report.html은 그대로

#### 2.1 group-detail.html 수정

```javascript
// 기존: scrape_jobs 조회
const res = await fetch(`${API}?action=job&jobId=${jobId}`);

// 변경: group_scrape_jobs 조회
const res = await fetch(`${API}?action=group-job&canonicalEventId=${canonicalEventId}`);
```

#### 2.2 group.html 수정

```javascript
// 스크랩 버튼 클릭 시
async function scrapeGroupEvent(canonicalEventId) {
  const res = await fetch(`${API}?action=group-scrape`, {
    method: 'POST',
    body: JSON.stringify({
      canonicalEventId,
      participants: event.participants,
      groupSource: event.groupSource
    })
  });
  
  // 완료 후 group-detail.html로 이동
  window.location.href = `group-detail.html?eventId=${canonicalEventId}`;
}
```

**작업 항목**:
- [ ] group-detail.html API 호출 변경
- [ ] group.html 스크랩 버튼 로직 변경
- [ ] 갭 분석 UI 유지 (기존과 동일)
- [ ] 확정 버튼 → `action=group-confirm` 호출로 변경
- [ ] 로컬 테스트 (에뮬레이터)

**예상 소요**: 0.5일

---

### Phase 3: 기존 데이터 마이그레이션 (선택)

**목표**: 기존 단체 대회 scrape_jobs → group_scrape_jobs 이관

#### 3.1 마이그레이션 스크립트

```javascript
// scripts/migrate-group-scrape-jobs.js

async function migrate() {
  // 1. race_events에서 단체 대회 목록 가져오기
  const groupEventsSnap = await db.collection('race_events')
    .where('type', '==', 'group')
    .get();
  
  for (const eventDoc of groupEventsSnap.docs) {
    const event = eventDoc.data();
    const canonicalEventId = eventDoc.id;
    
    // 2. 해당 대회의 scrape_jobs 찾기 (source_sourceId)
    const jobId = `${event.groupSource.source}_${event.groupSource.sourceId}`;
    const jobSnap = await db.collection('scrape_jobs').doc(jobId).get();
    
    if (!jobSnap.exists) continue;
    
    const job = jobSnap.data();
    
    // 3. group_scrape_jobs로 변환
    const groupJob = {
      canonicalEventId,
      eventName: event.eventName || event.primaryName,
      eventDate: event.eventDate,
      groupSource: event.groupSource,
      participants: event.participants || [],
      scrapedResults: job.results || [],
      gap: [], // 재계산 필요
      status: job.status === 'confirmed' ? 'complete' : job.status,
      createdAt: job.createdAt || new Date().toISOString()
    };
    
    // 4. 갭 분석 재실행
    groupJob.gap = analyzeGap(groupJob.participants, groupJob.scrapedResults);
    
    // 5. group_scrape_jobs에 저장
    await db.collection('group_scrape_jobs').doc(canonicalEventId).set(groupJob);
    
    console.log(`✓ Migrated: ${canonicalEventId}`);
  }
}
```

**작업 항목**:
- [ ] 마이그레이션 스크립트 작성
- [ ] dry-run 테스트
- [ ] 프로덕션 실행
- [ ] 검증: group-detail.html에서 기존 대회 확인

**예상 소요**: 0.5일

---

### Phase 4: 클린업 (장기)

**목표**: 불필요한 코드 제거, 문서 정리

#### 4.1 코드 정리

- [ ] group-detail.html에서 scrape_jobs 관련 코드 제거
- [ ] 주석 업데이트: "group.html은 group_scrape_jobs 사용"
- [ ] 혼란 방지 주석 추가

#### 4.2 문서 업데이트

- [ ] `dmc-firestore-schema.mdc`: group_scrape_jobs 스키마 추가
- [ ] `DATA_MODEL.md`: 아키텍처 다이어그램 업데이트
- [ ] 이 플랜 문서를 `_docs/decisions/`로 이동 (완료 후)

**예상 소요**: 0.5일

---

## 📅 전체 일정

| Phase | 작업 | 소요 | 의존성 |
|-------|------|------|--------|
| Phase 1 | 백엔드 API 추가 | 1일 | - |
| Phase 2 | 프론트엔드 전환 | 0.5일 | Phase 1 |
| Phase 3 | 데이터 마이그레이션 | 0.5일 | Phase 2 |
| Phase 4 | 클린업 | 0.5일 | Phase 3 |
| **합계** | | **2.5일** | |

---

## ✅ 성공 기준

1. ✅ group.html/group-detail.html이 group_scrape_jobs만 사용
2. ✅ report.html은 scrape_jobs만 사용 (변경 없음)
3. ✅ 기존 단체 대회 데이터가 정상 표시
4. ✅ 새로운 단체 대회 스크랩/확정 정상 동작
5. ✅ race_results는 양쪽에서 동일하게 저장 (SSOT 유지)

---

## 🚨 리스크 & 대응

| 리스크 | 영향 | 대응 방안 |
|--------|------|-----------|
| 기존 데이터 손실 | 높음 | Phase 1~2는 추가만 (기존 코드 유지), 마이그레이션 전 백업 |
| API 호환성 깨짐 | 중간 | 새 API 추가만, 기존 API 유지 |
| 갭 분석 로직 버그 | 중간 | 로컬 에뮬레이터 충분한 테스트, dry-run |
| 배포 중 서비스 중단 | 낮음 | 점진적 배포 (Phase별 배포) |

---

## 📝 참고 문서

- [dmc-firestore-schema.mdc](/Users/taylor/.cursor/rules/dmc-firestore-schema.mdc)
- [group-detail.html](/Users/taylor/git/dmc_attendance_log/group-detail.html)
- [report.html](/Users/taylor/git/dmc_attendance_log/report.html)

---

## 🔄 변경 이력

- 2026-04-20: 초안 작성
