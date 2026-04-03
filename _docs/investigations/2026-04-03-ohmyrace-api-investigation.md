# ohmyrace.co.kr API 조사 결과

> 작성일: 2026-04-03  
> 목적: searchOhmyrace() 구현을 위한 기록 검색 API 파악

---

## 조사 대상

- **군산새만금마라톤**: event/118 (2026-04-05 예정)
- **군산 Test**: event/150 (종료, 테스트용)

---

## 발견 사항

### 1. 대회 페이지 구조
```
http://record.ohmyrace.co.kr/event/{id}
```

**예시:**
- `http://record.ohmyrace.co.kr/event/118` — 2026 군산 새만금 마라톤 대회
- `http://record.ohmyrace.co.kr/event/150` — 최종 군산 Test

**특징:**
- 정적 HTML 페이지
- 대회명, 날짜, 공식 홈페이지 링크 표시
- **직접 검색 기능 없음** (기록조회 페이지로 유도)

---

### 2. 기록 조회 페이지
```
http://record.ohmyrace.co.kr/page/event_cate.php
```

**기능:**
- 마라톤/철인3종/사이클/수영 카테고리 선택
- 대회별 기록 검색

**문제:**
- `curl` / WebFetch로는 검색 폼 내부 구조 파악 불가
- JavaScript 기반 검색 가능성 (동적 로딩)

---

### 3. API 존재 여부
**조사 방법:**
- `curl "http://record.ohmyrace.co.kr/page/event_cate.php?id=150&search=김"`
- `grep`으로 API 엔드포인트 탐색

**결과:**
- ❌ 공개 REST API 없음
- ❌ JSON 응답 엔드포인트 없음
- ⚠️ HTML 페이지 기반 검색 (서버 사이드 또는 JavaScript)

---

## 제약사항

### 1. API 미제공
**현상:**  
ohmyrace.co.kr은 REST API를 제공하지 않음

**대응 전략:**
1. **HTML 스크래핑** — 검색 결과 페이지 파싱
2. **브라우저 자동화** — Puppeteer/Playwright (비권장, 복잡)
3. **수동 입력** — 대회 후 엑셀로 임포트 (fallback)

### 2. 검색 폼 구조 불명
**필요 정보:**
- POST/GET 요청 형식
- 필드명 (`name`, `event_id`, `search` 등)
- 응답 HTML 구조

**조사 방법:**
- 브라우저 DevTools로 네트워크 탭 확인
- 실제 검색 요청 캡처 필요

---

## 다음 단계

### Phase 1-2: 브라우저 기반 조사
```bash
# Chrome DevTools로 수동 확인
1. http://record.ohmyrace.co.kr/page/event_cate.php 접속
2. "마라톤" 카테고리 선택
3. 대회 선택 (event/150 또는 event/143)
4. 이름 검색 ("김철수" 등)
5. Network 탭에서 요청 확인
   - URL
   - Method (GET/POST)
   - Parameters
   - Response HTML 구조
```

### Phase 1-3: 구현 결정
**옵션 A: HTML 스크래핑**
- 검색 결과 페이지 fetch + cheerio 파싱
- 구현 복잡도: 중간
- 유지보수: 사이트 구조 변경 시 취약

**옵션 B: 수동 입력 (단기)**
- 대회 후 엑셀로 일괄 임포트
- 구현 복잡도: 낮음
- 장기 유지: 자동화 필요

**권장:** 
- 긴급(4/5) → 옵션 B (수동)
- 장기 → 옵션 A (스크래핑)

---

## 결론

**API 조사 결과:**
- ❌ REST API 없음
- ⚠️ HTML 기반 검색만 가능
- ⏰ 브라우저 기반 조사 필요 (Phase 1-2)

**구현 계획 수정 필요:**
- `searchOhmyrace()`는 HTML 파싱으로 구현
- 또는 discover만 지원하고 기록은 수동 입력

---

## 참고

- `_docs/superpowers/specs/2026-04-03-ohmyrace-scraper-design.md` — 원래 설계
- `_docs/investigations/2026-04-03-ohmyrace-investigation.md` — 사이트 구조 조사
