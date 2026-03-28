# Canonical Event 설계 (초안)

> 목적: **실제 대회(동일 이벤트)당 하나의 식별자**를 두고, `source`/`sourceId` 조합이 여러 개여도 UI·집계에서 한 대회로 묶을 수 있게 한다.  
> 상태: **설계만** — 구현·마이그레이션은 PC/별도 작업에서 진행.

---

## 1. 문제 정의

- `race_results`는 **기록 단위 SSOT**로 적합하다.
- 다만 현재 **대회 단위 식별**이 암묵적으로 `source` + `sourceId`(및 `eventName` 문자열)에 의존한다.
- 같은 실제 대회에 대해 **여러 job / 여러 표기**(예: 서울마라톤 vs 서울마라톤 (동아), canonical vs old job)가 공존하면 **목록에서 대회가 중복**되고, “한 이벤트”라는 도메인 개념이 **단일 ID로 표현되지 않는다**.
- **SSOT 원칙**(하나의 진실)을 **이벤트(대회) 차원**까지 확장하려면, 기록 SSOT와 별도로 **canonical event 식별자**가 필요하다.

---

## 2. 목표 / 비목표

**목표**

- 사용자에게 보이는 **“대회” 카드**는 `canonicalEventId`(가칭) 기준으로 **한 덩어리**로 묶인다.
- `source` / `sourceId`는 **출처·딥링크·수집 파이프라인**용으로 유지; 동일 이벤트에 **여러 매핑**이 가능하다.
- 기존 `race_results` 문서는 **당장 삭제하지 않고** 점진적으로 `canonicalEventId`를 채운다.

**비목표 (초안 단계)**

- 외부 타이밍 사이트 스키마 변경.
- 완전한 이벤트 마스터(코스 지도, 주최 등) — 필요 시 2단계.

---

## 3. 데이터 모델 옵션

### A. 최소: `race_results`에 필드만 추가

- 각 문서에 `canonicalEventId: string` (또는 `eventKey`).
- 장점: 컬렉션 하나, 쿼리 단순.
- 단점: 이벤트 메타(공식명, 날짜, 별칭) 중복·불일치 가능 → **별도 레지스트리** 없으면 관리가 어려움.

### B. 권장: `race_events` (또는 `events`) 컬렉션 + `race_results` 참조

- **`race_events` 문서**
  - `id`: `canonicalEventId` (예: `evt_2026-03-15_seoul_marathon` — 규칙은 아래 “ID 규칙 후보”).
  - `primaryName`: 표시용 정본 대회명.
  - `eventDate`: `YYYY-MM-DD` (복수 일정 대회는 후속 설계).
  - `aliases`: 문자열 배열 (검색·매칭용).
  - `sourceMappings`: `{ source, sourceId }[]` — **같은 이벤트에 연결된 외부 ID 전부**.
  - 선택: `location`, `createdAt`, `updatedAt`, `notes`.

- **`race_results`**
  - `canonicalEventId`: 위 문서 `id`를 참조 (필수로 갈 때 단계적 NOT NULL).
  - 기존 `source`, `sourceId`, `eventName`, `eventDate`는 **호환·감사**를 위해 유지.

**권장 이유:** “한 이벤트 = 한 문서”가 되어 **이벤트 차원 SSOT**가 명확해지고, 별칭·매핑을 한곳에서 관리할 수 있다.

---

## 4. ID 규칙 후보 (결정 필요)

| 방식 | 예 | 장단점 |
|------|-----|--------|
| 날짜 + 슬러그 | `evt_2026-03-15_seoul_marathon` | 읽기 쉬움; 동일 날짜 다른 대회는 슬러그로 구분. |
| UUID | `evt_a1b2c3d4-...` | 충돌 없음; 사람이 읽기 어려움. |
| 해시(이름+날짜) | 짧은 해시 | 자동화에 좋음; 재현성·충돌 처리 필요. |

**원칙:** 한 번 발급한 `canonicalEventId`는 **불변**; 병합 시에는 한 ID로 합치고 매핑만 이전.

---

## 5. API / UI

- **`confirmed-races` (또는 후속 `events` 액션):**
  - 그룹핑 키를 `source_sourceId` → **`canonicalEventId`** (없으면 fallback: 기존 키 또는 “미매핑” 버킷).
- **정렬:** `eventDate` 내림차순, 그다음 `primaryName`.
- **미매핑 행:** `canonicalEventId` 없는 기록은 별도 섹션 또는 기존 동작 유지 + 관리자에게 “매핑 필요” 표시.

---

## 6. 마이그레이션 단계 (고수준)

1. **스키마 추가:** `race_events` 생성, `race_results.canonicalEventId` 옵션 필드.
2. **시드:** 알려진 중복(서울마라톤 등) 수동으로 `race_events` 1건 + `sourceMappings` 여러 개.
3. **백필 스크립트:** `(source, sourceId)` 또는 `(eventDate + normalizedName)`으로 매핑 규칙 적용; 실패 목록 리포트.
4. **API 전환:** 목록이 `canonicalEventId` 우선.
5. **입력 경로:** confirm / 엑셀 / 수동 저장 시 매핑 테이블 조회 또는 자동 제안.

---

## 7. SSOT 문구 정리 (문서용)

- **`race_results`:** 회원 기록(행)의 SSOT — 유지.
- **`race_events` (도입 시):** 실제 대회(이벤트) 단위 식별·표시명·외부 ID 매핑의 SSOT.
- **`scrape_jobs`:** 수집 작업/이력; 이벤트 SSOT가 아님.

---

## 8. 열린 결정 사항 (PC에서 논의)

- [ ] `canonicalEventId` 생성 규칙 확정.
- [ ] 하루에 두 번 열리는 대회·연기·코스만 다른 경우 처리.
- [ ] 관리 UI(최소: 두 job 병합) 필요 시점.
- [ ] `race_results`에 ID 없을 때의 fallback 정책(기존 카드 유지 vs 강제 숨김).

---

## 9. 참고 (코드)

- 대회 목록: `functions/index.js` — `action=confirmed-races`, `race_results` `status==confirmed`.
- 프론트: `races.html` — `confirmed-races` 응답으로 카드 렌더.

이 파일만으로도 PC에서 구현 플랜을 세울 수 있도록 유지한다.
