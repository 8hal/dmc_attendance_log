# TASK 03: 소스 사이트 연령대 데이터 조사

> Priority: P2 | Est: 2시간 | 리서치 태스크 (코드 변경 없음)

## 목적

4개 소스 사이트에서 연령대/출생연도 데이터를 파싱할 수 있는지 조사한다. Athlinks(미국 최대)가 Name + State + Gender + **Age** 4피처로 러너 매칭을 하는 것이 확인됨. 연령대는 딤아웃 정확도를 대폭 올릴 핵심 피처.

## 배경

- 딤아웃 모델 벤치마크에서 성별+페이스만으로는 김종현(522건→42건) 수준이 한계
- 연령대 추가 시 42건 → ~5건 수준으로 줄일 수 있을 것으로 추정
- 현재 연령대 데이터: **0%** (전혀 수집 안 함)

## 조사 대상

### 1. smartchip.co.kr

**조사 포인트:**
- `return_data_livephoto.asp` 응답 HTML에 연령 구간 칼럼이 있는가?
- 결과 페이지에 "M40", "F30" 같은 카테고리 표시가 있는가?
- `name_search_result.asp` 동명이인 목록에 연령/나이 표시가 있는가?

**조사 방법:**
```bash
# smartchip 대회 하나에서 실제 HTML 받아보기
curl -X POST "https://www.smartchip.co.kr/return_data_livephoto.asp" \
  -d "nameorbibno=김종현&usedata=202650000006" \
  -o smartchip_sample.html
```

### 2. myresult.co.kr

**조사 포인트:**
- `/api/event/{id}/player?q={name}` JSON 응답에 age/birth/category 필드 존재 여부
- 선수 상세 페이지에 연령대 정보가 있는가?
- API 문서가 공개되어 있는가?

**조사 방법:**
```bash
curl "https://myresult.co.kr/api/event/138/player?q=김종현" \
  -H "Accept: application/json" | python3 -m json.tool
```

### 3. time.spct.kr

**조사 포인트:**
- 결과 페이지 HTML에 연령 구간이 표시되는가?
- `m2.php` 상세 페이지에 연령대 정보가 있는가?
- `var rawData` JS 변수에 추가 필드가 있는가?

**조사 방법:**
```bash
curl "https://time.spct.kr/m1.php?TargetYear=2026&EVENT_NO=2026030801&currentPage=1&searchResultsName=김종현" \
  -o spct_sample.html
```

### 4. marazone.com

**조사 포인트:**
- 결과 테이블에 연령대/나이 칼럼이 있는가?
- 종목 구분에 연령 카테고리가 포함되는가? (예: "M40 풀코스")

**조사 방법:** 브라우저에서 직접 확인 + curl

## 산출물

| 소스 | 연령대 제공 여부 | 데이터 형식 | 파싱 난이도 |
|------|---------------|-----------|-----------|
| smartchip | ? | ? | ? |
| myresult | ? | ? | ? |
| spct | ? | ? | ? |
| marazone | ? | ? | ? |

## 후속 조치

- **1개라도 제공하면:** 해당 소스 스크래퍼에 연령대 파싱 추가 (TASK_02와 동시 진행 가능)
- **전부 미제공이면:** members에 birthYear 직접 수집하는 온보딩 UI로 전환 (P2.5)
- **부분 제공이면:** 제공하는 소스 우선 적용 + 미제공 소스는 온보딩 보완

## 의존성

- 없음 (순수 리서치)
- 결과에 따라 TASK_02 범위가 확장됨
