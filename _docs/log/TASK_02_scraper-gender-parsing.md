# TASK 02: 스크래퍼 성별 파싱 강화

> Priority: P2 | Est: 0.5일 | 딤아웃 모델 선행 과제

## 목적

search_cache 기록의 gender null 비율(85%)을 줄여, 성별 기반 딤아웃/필터 효과를 극대화한다.

## 배경 데이터

- 이은주 후보 463건 중 gender null: **397건 (85%)**
- 김종현 후보 522건 중 gender null: **445건 (85%)**
- 성별 필터만으로 제거율: 현재 1.7% → 목표 40%+

## 현재 소스별 성별 파싱 상태

| 소스 | 현재 파싱 | gender null 비율 | 개선 여지 |
|------|----------|----------------|----------|
| smartchip | 미파싱 | ~100% | **조사 필요** |
| myresult | API 응답에 없음 | ~100% | **조사 필요** |
| spct | `.name span`에서 "M/F" 추론 | ~50% | 이미 부분 파싱 |
| marazone | 미파싱 | ~100% | **조사 필요** |

## 구현 범위

### Step 1: 각 소스 HTML/API 분석 (조사)

**smartchip (`scraper.js:135~213`)**
```
현재: return_data_livephoto.asp → parseSmartChipResult()
확인할 것:
  - 결과 페이지 HTML에 성별 칼럼 있는가?
  - name_search_result.asp 동명이인 목록에 성별 표시되는가?
  - BIB 번호 앞자리로 성별 추론 가능한가? (대회마다 다를 수 있음)
```

**myresult (`scraper.js:217~240`)**
```
현재: /api/event/{id}/player?q={name} → JSON 응답
확인할 것:
  - API 응답에 gender/sex 필드가 있는가?
  - course_cd에 성별 정보 포함되는가? (예: "남자하프")
  - 별도 상세 페이지에 성별 있는가?
```

**marazone (`scraper.js:245~265`)**
```
현재: searchMarazone() → HTML 파싱
확인할 것:
  - 결과 테이블에 성별 칼럼 있는가?
  - 종목명에 성별 포함되는가? (예: "여자 10km")
```

### Step 2: parseSmartChipResult 개선 (`scraper.js:118~160`)

현재 코드:
```javascript
// scraper.js:141
const gender = inferGender(name); // 이름으로 추론 — 부정확
```

개선:
- HTML에서 성별 칼럼이 있으면 직접 파싱
- 없으면 종목명/카테고리에서 "남자"/"여자" 추출
- 최후 수단으로만 inferGender(name) 사용

### Step 3: 다른 소스에도 동일 패턴 적용

각 소스의 조사 결과에 따라 parseMyResultPlayer, parseMarazoneResult 등에 성별 추출 로직 추가.

### Step 4: search_cache 재워밍

변경된 스크래퍼로 기존 캐시를 갱신해야 효과가 반영됨.
```bash
node scripts/prewarm-search-cache.js --resume
```
→ 캐시 TTL(7일) 만료된 것부터 자동 갱신됨. 또는 TTL 무시하고 전체 재실행.

## 테스트 계획

1. 각 소스에서 "이은주" 1건씩 검색 → gender 반환 확인
2. 이은주 전체 후보 gender null 비율 재측정 → 85% → 목표 30% 이하
3. 딤아웃 벤치마크 재실행 (`node scripts/eval-dimout-model.js`)

## 의존성

- Step 1(조사) 결과에 따라 Step 2~3 범위 변동

## 성공 지표

- gender null 비율: 85% → 30% 이하
- 딤아웃 제거율: 1.7% → 30%+
