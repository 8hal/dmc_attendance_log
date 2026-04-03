# ohmyrace.co.kr 지원 추가 설계

> 작성일: 2026-04-03  
> 우선순위: P1 (긴급 — 군산새만금마라톤 4월 5일)  
> 예상 작업: 1-2시간

---

## 배경

### 문제
**군산새만금마라톤(4/5) 기록을 confirm할 수 없다**
- 공식 기록 사이트: ohmyrace.co.kr
- 현재 시스템: ohmyrace 미지원
- report.html에서 스크랩 불가

### 발견
- ohmyrace.co.kr에 "2026 군산 새만금 마라톤 대회" 등록됨
- 예정 대회 목록 파싱 가능
- **기록 조회 API 존재** (대회 후 사용 가능)

---

## 목표

**ohmyrace.co.kr 완전 지원**
1. 대회 발견 (discover-events.js + functions/lib/scraper.js)
2. 기록 검색 (functions/lib/scraper.js)
3. confirm 워크플로우 (report.html)

---

## 성공 기준

- ✅ discover-events.js에서 ohmyrace 예정 대회 수집
- ✅ functions/lib/scraper.js에 ohmyrace 검색 로직 추가
- ✅ 대회 후 군산새만금 기록 검색 가능
- ✅ report.html에서 정상 confirm 가능

---

## 설계

### 1. discover-events.js — 대회 발견 (로컬)
```javascript
async function discoverOhmyrace(year) {
  const res = await fetch("http://record.ohmyrace.co.kr/event");
  const html = await res.text();
  const $ = cheerio.load(html);
  
  const events = [];
  $("li").each((_, el) => {
    const nameEl = $(el).find(".new_sbj a");
    if (!nameEl.length) return;
    
    const name = nameEl.text()
      .replace(/예정|종료/g, "")
      .trim();
    const dateText = $(el).find(".new_data").text().trim(); // "2026. 04. 05"
    const category = $(el).find(".new_cate").text().trim();
    const status = $(el).find(".status-button");
    const isPlanned = status.hasClass("status-3");
    
    if (name && dateText.startsWith(String(year))) {
      const date = dateText.replace(/\. /g, "-");
      
      // 대회 ID 추출 (종료 대회만 가능)
      const href = nameEl.attr("href") || "";
      const idMatch = href.match(/event\/(\d+)/);
      
      events.push({
        source: "ohmyrace",
        sourceId: idMatch ? idMatch[1] : name, // 예정은 이름, 종료는 ID
        name,
        date,
        distances: "",
        location: "",
        needsManualId: !idMatch,
      });
    }
  });
  
  return events;
}
```

### 2. functions/lib/scraper.js — 기록 검색 (Functions)

#### 2-1. searchOhmyrace() 함수 추가
```javascript
async function searchOhmyrace(eventId, memberName) {
  // Phase 1: API 구조 조사 필요
  // - 종료된 군산 Test(event/150)로 테스트
  // - 요청 형식 확인
  // - 응답 JSON 파싱
  
  // 추정 구현:
  const url = `http://record.ohmyrace.co.kr/api/event/${eventId}/result?name=${encodeURIComponent(memberName)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
    }
  });
  
  if (!res.ok) return [];
  const data = await res.json();
  
  return data.map(r => ({
    name: r.name || memberName,
    bib: String(r.bib || ""),
    distance: normDist(r.distance || ""),
    netTime: r.netTime || "",
    gunTime: r.gunTime || "",
    overallRank: r.overallRank || null,
    gender: r.gender || null,
    ageGroupRank: null,
    splits: [],
    pace: "",
  }));
}
```

#### 2-2. searchMember() 라우터 수정
```javascript
async function searchMember(source, sourceId, memberName, { session = "" } = {}) {
  switch (source) {
    case "spct": return searchSPCT(sourceId, memberName);
    case "smartchip": return searchSmartChip(sourceId, memberName, session);
    case "myresult": return searchMyResult(sourceId, memberName);
    case "marazone": return searchMarazone(sourceId, memberName);
    case "ohmyrace": return searchOhmyrace(sourceId, memberName); // 추가
    default: return [];
  }
}
```

#### 2-3. getEventInfo() 수정
```javascript
async function getEventInfo(source, sourceId) {
  switch (source) {
    case "smartchip": return getSmartChipEventInfo(sourceId);
    case "myresult": return getMyResultEventInfo(sourceId);
    case "marazone": return getMarazoneEventInfo(sourceId);
    case "spct": return getSPCTEventInfo(sourceId);
    case "ohmyrace": return getOhmyraceEventInfo(sourceId); // 추가
    default: return { title: sourceId, date: "" };
  }
}

async function getOhmyraceEventInfo(sourceId) {
  // eventId가 숫자면 API 조회, 아니면 이름 반환
  if (/^\d+$/.test(sourceId)) {
    // 대회 상세 조회 (Phase 1에서 구조 확인)
    return { title: `Ohmyrace Event ${sourceId}`, date: "" };
  }
  return { title: sourceId, date: "" };
}
```

#### 2-4. discoverAllEvents() 수정 (Functions용)
```javascript
async function discoverAllEvents(year) {
  const sources = {
    marazone: discoverMarazone,
    myresult: discoverMyResult,
    spct: discoverSPCT,
    smartchip: discoverSmartChip,
    ohmyrace: discoverOhmyrace, // 추가
  };
  // ... (동일 로직 복사)
}
```

---

## 구현 순서

### Phase 1: API 조사 (30분, 최우선)
1. 종료된 군산 Test(event/150) 기록 조회 방법 확인
2. 실명 검색 API 엔드포인트 파악
3. 응답 JSON 구조 확인
4. 테스트 요청으로 검증

### Phase 2: discover-events.js (10분)
1. `discoverOhmyrace()` 추가
2. sources 객체에 등록
3. 테스트 실행

### Phase 3: functions/lib/scraper.js (30-60분)
1. `discoverOhmyrace()` 복사 (discover-events.js와 동일)
2. `searchOhmyrace()` 구현 (Phase 1 결과 기반)
3. `getOhmyraceEventInfo()` 구현
4. `searchMember()` 라우터 추가
5. `discoverAllEvents()` 수정
6. 로컬 에뮬레이터 테스트

### Phase 4: 배포 및 검증 (30분)
1. pre-deploy-test.sh
2. firebase deploy --only functions
3. 프로덕션에서 군산새만금 스크랩 테스트 (대회 후 4/7)

---

## 제약사항

### 1. 예정 대회 sourceId
**문제**: 예정 대회는 ID가 없음  
**대응**: 
- discover에서는 대회명을 sourceId로 사용
- 대회 후 ID 확정되면 대회명으로도 검색 가능하도록 구현

### 2. API 미확인 (Phase 1 필수)
**위험**: 기록 조회 API 구조가 추측임  
**완화**: 종료된 대회(event/150, event/143)로 먼저 검증

### 3. 배포 타임라인
**긴급성**: 군산 대회가 4/5이므로 대회 후 4/6~4/7 배포 필요  
**대응**: Phase 3까지 4/5 전 완료 권장

---

## 테스트 계획

### 1. API 조사 (Phase 1)
```bash
# 종료된 군산 Test로 테스트
curl "http://record.ohmyrace.co.kr/event/150"
# API 엔드포인트 찾기
```

### 2. 로컬 스크립트 (Phase 2)
```bash
node scripts/discover-events.js --year 2026 --source ohmyrace
# 예상: 군산새만금 포함 대회 목록
```

### 3. Functions 로컬 테스트 (Phase 3)
```bash
firebase emulators:start
# report.html에서 ohmyrace 대회 스크랩 시도
```

### 4. 프로덕션 검증 (Phase 4)
```bash
# 대회 후 실제 기록으로 테스트
# report.html → 군산새만금 검색 → 스크랩 → confirm
```

---

## 롤백 계획

문제 발생 시:
1. `functions/lib/scraper.js`에서 ohmyrace 케이스 제거
2. 이전 버전으로 재배포
3. 수동 워크플로우로 복귀

---

## 참고 문서
- `_docs/investigations/2026-04-03-ohmyrace-investigation.md` — 사이트 조사
- `_docs/investigations/2026-04-03-gunsan-marathon-discovery-issue.md` — 문제 정의
