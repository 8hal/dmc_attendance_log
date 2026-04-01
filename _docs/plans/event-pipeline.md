# 작업 지시서: 대회 파이프라인 (예정 → 참가 → 기록)

> 작성일: 2026-04-01
> 우선순위: P1
> 예상 규모: L (2~3주)

---

## 배경 / 문제

현재 시스템은 완전히 사후(reactive)다:
- 어떤 대회가 예정되어 있는지 모름
- 누가 참가하는지 확정 전까지 모름
- 스크랩을 운영자가 매번 수동 트리거
- 기록이 누락된 참가자를 자동으로 탐지 불가

## 목표

대회 일정을 미리 파악하고, 참가자를 등록하고, 기록 수집을 자동화하여
"구멍 없는 출결 관리"를 실현한다.

## 성공 기준

- 예정 대회 목록이 ops.html에 보임
- 단체 대회 참가자 목록을 카페 게시글 기준으로 입력 가능
- 대회일 이후 자동으로 스크랩 트리거됨
- 참가자 중 기록이 없는 사람이 자동으로 표시됨

---

## 3단계 파이프라인

### 1단계: 고러닝 이벤트 수집

- 소스: gorunning.co.kr (향후 2개월 대회 목록)
- 주기: 주 1회 자동 수집 (Cloud Scheduler)
- 결과: `race_events { status: "planned" }` 생성
- 운영자 작업: 불필요한 대회 삭제 (정제) + source 매핑 지정
  - "이 대회는 smartchip_202650XXXXX" 형태로 운영자가 수동 연결
  - source 매핑이 있어야 3단계 자동 스크랩 가능

### 2단계: 참가자 목록 입력

- 단체 대회: 운영자가 카페 게시글 기준으로 실명 리스트 붙여넣기
  - `race_events.participants[{ realName, bibNumber? }]`
  - members 컬렉션과 실명 매핑 자동 검증
- 개인 참가: 회원이 my.html에서 "나 이 대회 나가요" 직접 등록
  - `race_events.selfRegistered[]`

### 3단계: 자동 스크랩 + 구멍 탐지

- 트리거: 대회일 + 2일, source 매핑이 있는 race_events에 대해 자동 실행
- 스크랩 완료 후: participants vs 실제 race_results 비교
  - 참가 등록됐는데 기록 없음 → 🔴 구멍
  - 기록 있는데 참가 등록 안 됨 → 🟡 미등록 참가자

---

## 스키마 변경

### race_events 추가 필드

```
status: "planned" | "scraped" | "confirmed"
participants: [{ realName: string, bibNumber?: string }]
selfRegistered: [{ realName: string, registeredAt: string }]
autoScrapeAfterDays: number (default: 2)
scrapeTriggeredAt?: string
gorunningId?: string  ← 고러닝 원본 ID (중복 방지용)
```

---

## 구현 순서

### Phase 1 — 예정 대회 등록 + 모니터링 (핵심 고통 해결)
1. `race_events.status` 필드 추가
2. ops.html "예정" 탭: 목록 조회 + source 매핑 UI + 삭제
3. 모니터링: 대회일 지났는데 스크랩 안 된 것 🔴 표시

### Phase 2 — 참가자 입력
4. ops.html 참가자 붙여넣기 UI (실명 검증 포함)
5. my.html "이 대회 나가요" 버튼

### Phase 3 — 자동화
6. 고러닝 스크래퍼 작성
7. Cloud Scheduler 자동 스크랩 트리거
8. 구멍 탐지 알림 (ops.html)

---

## 관련 파일

- `functions/index.js` — 이벤트 관련 API 확장
- `functions/lib/scraper.js` — 고러닝 스크래퍼 추가
- `ops.html` — 예정 대회 탭 + 모니터링
- `my.html` — 개인 참가 등록 UI
- `_docs/knowledge/data-dictionary.md` — race_events 스키마 업데이트

---

## 보류 조건

- 고러닝 사이트 구조가 스크래핑 불가한 경우 → Phase 3 일정 조정
- 카페 API 접근 가능 여부 확인 필요 (자동화 vs 수동 붙여넣기)
