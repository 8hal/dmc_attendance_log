# ohmyrace.co.kr 조사 결과 (2026-04-03)

## 기본 정보
- **사이트**: http://record.ohmyrace.co.kr/
- **대회 목록**: http://record.ohmyrace.co.kr/event
- **기록 조회**: http://record.ohmyrace.co.kr/page/event_cate.php

## 군산새만금마라톤 확인
**발견**: ✅ "2026 군산 새만금 마라톤 대회" (2026-04-05)
- **상태**: 예정 (아직 종료 안 됨)
- **링크**: 예정 대회라 직접 링크 없음 (`javascript:alert` 처리)
- **목록 번호**: 31번

## URL 패턴
- 대회 상세: `http://record.ohmyrace.co.kr/event/{id}`
- 종료된 대회 예시:
  - `/event/150` — 최종 군산 Test
  - `/event/143` — 260402_군산 TEST
  - `/event/153`, `/event/144`, `/event/142` 등

## 대회 목록 구조
```html
<li>
  <span class="new_num">31</span>
  <span class="new_cate">마라톤</span>
  <span class="new_sbj">
    <a href="javascript:alert('아직 종료되지 않은 대회입니다.')">
      <span class="admin-button status-button status-3">예정</span>
      2026 군산 새만금 마라톤 대회
    </a>
  </span>
  <span class="new_data">2026. 04. 05</span>
</li>
```

## 대회 상태
- `status-1`: (미확인)
- `status-2`: 종료
- `status-3`: 예정

## 스크래핑 가능 여부
**✅ 가능** (단, 제약 있음)

### 현재 페이지에서 추출 가능 정보
- 대회명
- 개최일
- 카테고리 (마라톤/철인3종/사이클/수영 등)
- 상태 (예정/종료)

### 추출 불가 정보
- **대회 ID**: 예정 대회는 href에 ID 없음
- 포스터 이미지: 목록에 없음
- 상세 정보: 예정 대회 페이지 접근 불가

## discover-events.js 통합 방안

### Option A: 예정 대회도 수집 (추천)
```javascript
async function discoverOhmyrace(year) {
  const res = await fetch("http://record.ohmyrace.co.kr/event");
  const html = await res.text();
  const $ = cheerio.load(html);
  
  const events = [];
  $("li").each((_, el) => {
    const name = $(el).find(".new_sbj a").text().replace(/예정|종료/g, "").trim();
    const dateText = $(el).find(".new_data").text().trim(); // "2026. 04. 05"
    const category = $(el).find(".new_cate").text().trim();
    const status = $(el).find(".status-button").hasClass("status-3") ? "planned" : "ended";
    
    if (name && dateText.startsWith(String(year)) && status === "planned") {
      const date = dateText.replace(/\. /g, "-"); // "2026-04-05"
      events.push({
        source: "ohmyrace",
        sourceId: "", // 예정 대회는 ID 없음
        name,
        date,
        distances: "",
        location: "",
        status: "planned"
      });
    }
  });
  
  return events;
}
```

### Option B: 종료 대회만 수집
- 종료 대회는 `href="event/{id}"` 형태로 ID 추출 가능
- 군산새만금은 대회 후(4/7 이후)에 수집됨

## 결론

### 즉시 활용 가능
1. **discover-events.js에 ohmyrace 추가** (Option A)
2. 예정 대회 목록에 "2026 군산 새만금 마라톤" 표시
3. 대회 후 자동 스크랩은 report.html에서 수동 트리거

### 제약사항
- sourceId 없음: 스크랩 시 대회명으로 검색 필요
- 상세 정보 부족: 포스터, 장소 등 메타데이터 없음

### 권장 사항
**Option A 구현** — 예정 대회도 수집하여 사전 가시성 확보
- 군산새만금마라톤 즉시 "대회 예정" 탭에 표시
- 대회 후 스크랩은 기존 워크플로우 활용
