# events 컬렉션 신설 및 gorunning.kr 통합 설계

> 상태: 미착수 | 작성일: 2026-03-22

## 배경

- 현재 대회 정보가 `scrape_jobs`에 작업 상태와 함께 혼재
- SmartChip 대회의 날짜가 null인 문제 (9/71건)
- "대회 예정" 탭이 사실상 비어있음 (미래 대회 데이터 부족)
- DATA_MODEL.md에서 `events` 컬렉션 신설을 "불필요"로 판단했었으나, gorunning.kr 통합 시 필요성 재확인

### 검증 데이터 (2026-03-22 기준)

- gorunning.kr 3월 과거 대회 37개 중 **30개(81%)** 가 4개 타이밍사이트에 기록 존재
- 날짜 정확도: 매칭된 30건 중 **29건(97%)** 일치 (1건은 +-1일 차이)
- 미매칭 7건: 이벤트성 펀런, 소규모 지역대회, 자체 타이밍 사용 대회

## 핵심 설계 원칙

**모든 필드의 오버라이드 최우선순위는 타이밍사이트**

```
1. manualOverride (수동 보정, 최우선)
2. 타이밍사이트 (smartchip/spct/myresult/marazone)
3. gorunning.kr
4. DATE_HINTS (하드코딩 fallback, 점진적 제거)
```

gorunning.kr은 타이밍사이트 정보가 없을 때만 fallback으로 사용.

## `events` 컬렉션 스키마

- **Doc ID**: `{date}_{normalizedName}` (예: `2026-03-28_태화강마라톤`)
- `canonicalName`: string — 정규화된 대회명
- `displayName`: string — 표시용 대회명 (타이밍사이트명 우선, 없으면 gorunning.kr명)
- `date`: string — YYYY-MM-DD
- `location`: string — 장소
- `distances`: string — 종목 (풀/하프/10K 등)
- `sources`: map — 소스별 매칭 정보
  - `gorunning`: `{ id, name, url }` 또는 null
  - `smartchip`: `{ sourceId, name }` 또는 null
  - `spct`: `{ sourceId, name }` 또는 null
  - `myresult`: `{ sourceId, name }` 또는 null
  - `marazone`: `{ sourceId, name }` 또는 null
- `manualOverride`: map | null — 수동 보정 필드 (오매칭 수정용)
- `updatedAt`: Timestamp

## 이벤트 매칭 (하이브리드)

### 자동 퍼지 매칭

1. **날짜 일치** (+-1일 허용)
2. **이름 유사도**: 숫자/회차 제거 + 공백/특수문자 정규화 후 비교
   - `제23회 태화강 마라톤` → `태화강마라톤`
   - `제23회 태화강마라톤` → `태화강마라톤` → 일치
3. 유사도 임계값 이상이면 자동 매칭

### 수동 오버라이드

- `manualOverride` 필드로 오매칭 수정
- 예: 같은 날짜에 "벚꽃마라톤" 2개가 다른 지역에 있을 때

## gorunning.kr 스크래퍼

`functions/lib/scraper.js`에 `discoverGoRunning()` 함수 추가:

- URL: `https://gorunning.kr/races/monthly/{year}-{MM}/` (현재월 + 다음달, 최대 2페이지)
- 범위: 과거 2주 ~ 미래 2주 (기존 discover API와 동일한 윈도우)
- 반환: `{ name, date, location, distances, gorunningId, gorunningUrl }`
- **discover API에서 직접 호출** (별도 배치 불필요)

## discover API 플로우 (변경 후)

```
discover API 요청
├── 타이밍사이트 4개 병렬 호출 → 타이밍사이트 이벤트
├── gorunning.kr 병렬 호출 (현재월+다음달) → gorunning 이벤트
└── 퍼지 매칭 + 머지 → 오버라이드 규칙 적용 → 통합 이벤트 목록
                                                   ├── 수집 가능 탭 (과거, 타이밍소스 있음)
                                                   └── 대회 예정 탭 (미래, gorunning 보강)
```

5개 소스를 병렬 호출하므로 응답 시간은 가장 느린 소스 기준. gorunning.kr은 HTML 1~2페이지라 부담 없음.

## scrape_jobs와의 관계 (C안: 느슨한 연결)

- `scrape_jobs`는 **기존 구조 그대로 유지** (source, sourceId, eventName, eventDate, status)
- `race_results`는 그대로 유지 (SSOT)
- `events`는 **discover/표시 레이어 전용** — scrape_jobs를 직접 참조하거나 변경하지 않음
- 스크래핑 가능 여부는 **타이밍사이트 매칭 유무**로 결정:
  - gorunning.kr 전용 대회 (타이밍사이트 미등록) → "기록 없는 대회" 표시, 스크래핑 불가
  - 타이밍사이트 매칭된 대회 → 기존 스크래핑 플로우 그대로 (source+sourceId)

## 단계별 구현

### Phase 1
- gorunning.kr 스크래퍼 함수 구현 (discoverGoRunning)
- 이벤트 퍼지 매칭 유틸 구현 (이름 정규화 + 날짜 +-1일 + 유사도 계산)

### Phase 2
- events 컬렉션 스키마 확정 + discover API 내 실시간 매칭/머지 로직 구현
- 필드별 오버라이드 규칙 구현

### Phase 3
- discover API에서 events 컬렉션 참조하도록 변경 + report.html 대회 예정 탭 복원
- DATA_MODEL.md 업데이트

## 관련 TODO

- [ ] 캐싱 우선순위: race_results 보유 건수가 많은 회원(활동적)을 먼저 프리워밍 처리 (prewarm-search-cache.js)
