# TASK 01: "이 대회 뛰셨나요?" 프로액티브 제안

> Priority: P1 | Est: 1일 | 이번 주말(3/29) 전 배포 목표

## 목적

검색 퍼널(17% 전환율)을 우회하여, 주간 스크래퍼가 발견한 기록을 원탭으로 확정하게 한다.

## 배경 데이터

- 현재 search_cache에 미확정 기록 15,736건 (152명)
- 주간 스크래퍼: 토/일 15:00 KST 자동 실행
- 검색 퍼널 전환율: start 19명 → save 3명 (17%)
- 핵심 이탈 원인: 동명이인 130건+ 에 압도되어 포기

## 구현 범위

### Step 1: `suggestions` API (Cloud Function)

**엔드포인트:** `GET /race?action=suggestions&member={realName}`

**로직:**
```
1. search_cache에서 realName이 일치하고 found:true인 문서 조회
2. 최근 2주 이내 대회만 필터 (eventDate 기준)
3. 이미 race_results에 confirmed된 기록 제외
4. dismissed 목록 제외 (로컬스토리지 또는 Firestore)
5. 남은 기록을 대회별로 그룹핑하여 반환
```

**응답 형식:**
```json
{
  "ok": true,
  "suggestions": [
    {
      "eventName": "제17회 여의도벚꽃마라톤",
      "eventDate": "2026-03-29",
      "source": "spct",
      "sourceId": "2026032901",
      "candidates": [
        {
          "distance": "half",
          "netTime": "01:26:47",
          "pace": "4:05",
          "gender": "F",
          "bib": "1234",
          "dimout": false
        },
        {
          "distance": "half",
          "netTime": "02:15:30",
          "pace": "6:25",
          "gender": null,
          "bib": "5678",
          "dimout": true
        }
      ]
    }
  ]
}
```

**dimout 판정:** 회원 PB가 있으면 Riegel 예측 대비 ±50%(풀/하프), ±100%(10K) 벗어나면 dimout=true. PB 없으면 전부 dimout=false.

### Step 2: my.html 배너 UI

**트리거:** 멤버 드롭다운에서 이름 선택 직후 suggestions API 호출

**UI 구조:**
```
┌──────────────────────────────────────────────────┐
│ 🏃 지난 주말 대회 기록이 발견됐어요!              │
│                                                    │
│ ┌─ 제17회 여의도벚꽃마라톤 (3/29) ─────────────┐  │
│ │  하프  01:26:47  (4:05/km)  BIB#1234         │  │
│ │  [내 기록이에요 ✓]  [아니에요 ✗]              │  │
│ └──────────────────────────────────────────────┘  │
│                                                    │
│ ┌─ (흐리게) ──────────────────────────────────┐  │
│ │  하프  02:15:30  (6:25/km)  BIB#5678         │  │
│ │  [내 기록이에요 ✓]  [아니에요 ✗]              │  │
│ └──────────────────────────────────────────────┘  │
│                                                    │
│ 💡 위 기록이 보이지 않으면 [직접 검색하기]        │
└──────────────────────────────────────────────────┘
```

- dimout=true 카드는 opacity:0.4 + 접힘 (토글 열기)
- "내 기록이에요" → confirm API 호출 → race_results에 저장 → 배너에서 제거
- "아니에요" → dismissed 목록에 추가 → 배너에서 제거
- 모든 제안 처리 완료 → 배너 숨김

### Step 3: confirm 저장

기존 `search_save` 이벤트 로깅 + `race_results` 저장 로직 재사용.

**추가 필드:** `confirmSource: "suggestion"` (기존 "personal", "event"와 구분)

### Step 4: 이벤트 로깅

```
suggestion_shown     — 제안 배너 표시
suggestion_confirm   — "내 기록이에요" 클릭
suggestion_dismiss   — "아니에요" 클릭
suggestion_search    — "직접 검색하기" 클릭
```

## 테스트 계획

1. 본인(문광명) 계정으로 suggestions API 호출 → 미확정 기록 반환 확인
2. confirm → race_results 저장 확인
3. dismiss → 재접속 시 안 보이는지 확인
4. 기록 0건인 멤버 → 배너 미노출 확인

## 선행 수정: 주간 스크래퍼 → search_cache 연결

> ⚠️ **현재 주간 스크래퍼(weeklyDiscoverAndScrape)는 search_cache에 쓰지 않음.**
> scrape_jobs.results[]에만 저장하고 search_cache는 갱신하지 않는다.
> search_cache에 있는 15,736건은 전부 프리워밍 스크립트 또는 사용자 검색으로 쌓인 것.

### 수정 위치: `functions/lib/scraper.js` — `scrapeEvent()`

현재 `scrapeEvent()`는 `searchMember()` 결과를 `results[]`에만 push한다.
Firestore `db` 인스턴스를 파라미터로 받아 search_cache에도 동시에 쓰도록 변경.

```javascript
// scrapeEvent() 내부, searchMember() 호출 직후 추가:
if (db) {
  const cacheKey = `${source}_${sourceId}_${m.realName}`.substring(0, 1500);
  db.collection("search_cache").doc(cacheKey).set({
    realName: m.realName,
    source,
    sourceId,
    found: found && found.length > 0,
    result: (found && found.length > 0) ? {
      eventName: info.title,
      eventDate: info.date,
      source,
      sourceId,
      records: found.map(r => ({
        ...r,
        memberRealName: m.realName,
        memberNickname: m.nickname,
        memberGender: m.gender || "",
      })),
    } : null,
    cachedAt: admin.firestore.FieldValue.serverTimestamp(),
  }).catch(() => {});
}
```

**호출부 수정:** `weeklyDiscoverAndScrape`에서 `scrapeEvent()` 호출 시 `db` 전달.

### 옵션 B (대안): suggestions API를 scrape_jobs에서 직접 조회

scrape_jobs.results[]에서 memberRealName으로 필터해도 동작은 하지만,
데이터 구조가 대회 단위(하나의 문서에 전 회원 혼합)라 쿼리 비효율적.
→ **옵션 A(search_cache 동시 쓰기) 추천.**

## 의존성

- **주간 스크래퍼 → search_cache 연결 (Step 0)** 이 선행되어야 새 대회 제안 가능
- 기존 confirm 로직 재사용

## 성공 지표

- 제안 확정율: suggestion_confirm / suggestion_shown ≥ 30%
- 검색 없이 기록 추가하는 회원 수 ≥ 5명/주
