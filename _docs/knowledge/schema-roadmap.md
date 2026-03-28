# 스키마 로드맵 (초안)

> **목적:** `product-vision.md` Phase 0~3·`system-architecture.md` 진화 방향과 **Firestore 스키마**를 한 줄로 연결해, 확장 시 무엇을 언제 넣을지 공유한다.  
> **상태:** 초안 — 구현 전 합의용. 코드·규칙의 정본은 배포된 Functions·`data-dictionary.md`가 우선.

---

## 상위 로드맵 (제품)

| Phase | 제품 초점 (`product-vision.md`) | 스키마에 요구되는 것 |
|-------|----------------------------------|----------------------|
| 0 | 기록 수집 마찰 제거 | `race_results`·`scrape_jobs`·`search_cache` 등 현 구조 유지·다듬기 |
| 1 | 행동 데이터 → 리텐션 변수 | **대회 단위 키**로 참가·서비스 이용을 묶을 수 있어야 함 |
| 2 | 개입 효과 | Phase 1 엔티티에 **감사·세그먼트** 필드 여지 |
| 3 | 타 클럽 전이 | **테넌트 경계(`clubId` 또는 경로)** 없으면 비용 폭발 |

---

## SSOT 층 (고정 원칙)

| 층 | SSOT | 비고 |
|----|------|------|
| 회원 프로필 | `members` | `members.gender` > `race_results.gender` |
| 기록(행) | `race_results` | 확정/자동/ambiguous |
| 수집 작업 | `scrape_jobs` | doc id ≈ `canonicalJobId` = `{source}_{sourceId}` |
| 통합 대회(논리 이벤트) | `race_events` (**도입 예정**) | 표시명·날짜·`sourceMappings[]`; **권한자 생성·수정** → 이후 외부 이벤트 SSOT 연동 시 자동 보강 |

**용어 (커뮤니케이션):** job → `scrape_jobs`; **result_candidate** → `scrape_jobs.results[]` 원소; **race_result** → `race_results` 문서.

**소스:** `smartchip` · `myresult` · `spct` · `marazone` · `manual` (5개) — `_docs/knowledge/data-dictionary.md` 정본.

---

## 트랙 A — 통합 이벤트 (`race_events`)

| 단계 | 내용 |
|------|------|
| A.1 | `race_events` 컬렉션 추가, `race_results.canonicalEventId` **옵션** 필드 |
| A.2 | `confirmed-races` 등: `canonicalEventId` 있으면 그걸로 그룹, 없으면 `source_sourceId` fallback |
| A.3 | 운영 UI/API: 권한자만 `race_events` 생성·`sourceMappings` 편집 |
| A.4 | 외부 **이벤트 SSOT** 서비스 연동 시: 동기화로 `race_events` 자동 생성·갱신 (수동 병합·오버라이드는 유지) |

**설계 상세:** `_docs/knowledge/canonical-events-design.md`

**열린 결정:** `canonicalEventId` 발급 규칙(날짜+슬러그 vs UUID), `race_results` **문서 id**를 이벤트 도입과 함께 바꿀지·이관 전략.

---

## 트랙 B — Phase 1 도메인 (`system-architecture.md`)

아래 컬렉션은 **“대회×회원”** 또는 **“대회×서비스”** 집계가 핵심이다. **통합 대회 키**는 원칙적으로 **`canonicalEventId`(또는 `race_events` 문서 id)** 를 우선 참조하고, 미매핑 시에만 `(source, sourceId)` fallback을 문서에 명시한다.

| 컬렉션 (예정) | 스키마 로드맵에서의 위치 |
|---------------|---------------------------|
| `event_participation` | `canonicalEventId` + `memberId`(또는 닉/실명 FK 도입 시) + 의사 상태 |
| `pace_groups` | `canonicalEventId` + 페이스 키 + 회원 참조 |
| `bus_reservations` | `canonicalEventId` + 좌석/회원 참조 |
| `member_milestones` | 회원 참조 + 필요 시 `canonicalEventId` 또는 `race_results` doc 참조 |

**전제:** Phase 1 착수 전 **트랙 A 최소 A.1~A.2** 또는 “미매핑 허용 규칙”을 문서·API에 고정하는 것이 안전하다.

---

## 트랙 C — 멀티테넌트 (Phase 2~3)

`system-architecture.md` 방향: `clubs/{clubId}/` 하위 구조.

| 단계 | 내용 |
|------|------|
| C.1 | **테넌트 스코프가 필요한 컬렉션**에 `clubId` 필드 또는 경로 이관 대상 목록 확정 (`members`, `race_results`, `scrape_jobs`, Phase 1 테이블 등) |
| C.2 | **`race_events` 스코프 결정:** 글로벌(한국 대회 마스터) vs 클럽별 복제 — 네트워크 집계 비전이면 **글로벌 + 매핑**이 유리 |
| C.3 | `runners` 등 클럽 독립 프로필 도입 시 `members`와의 관계(1:1, 이관) 정의 |

---

## 트랙 D — 분석 (Phase 2~3)

- Firestore → BigQuery export 시 **`canonicalEventId`** 가 있으면 **교차 클럽·교차 소스 집계**가 단순해진다.
- 운영 메트릭은 기존 `event_logs`와 병행; 스키마 버전 필드를 두면 피벗 시 비교가 쉬움.

---

## API·코드 경계 (비스키마이지만 확장성)

- 현재 `race` 단일 엔드포인트 + `action` 분기는 Phase 1 이후 **모듈 분리 또는 리소스별 라우트**를 검토할 시점에 포함한다.
- Firestore는 **FK 제약 없음** — ERD는 “논리 모델”; 정합성은 Functions·테스트·점검 스크립트로 맞춘다.

---

## 관련 문서

- `_docs/knowledge/product-vision.md` — Phase 0~3·네트워크 비전
- `_docs/knowledge/system-architecture.md` — 컬렉션 목록·Phase 1~3 기술 진화
- `_docs/knowledge/canonical-events-design.md` — 통합 이벤트 상세 설계 초안
- `_docs/knowledge/data-dictionary.md` — enum·`canonicalJobId`
- `BACKLOG.md` — 단기 실행 항목

---

## 개정 이력

| 날짜 | 내용 |
|------|------|
| 2026-03-28 | 초안 작성 — 제품 로드맵·대화 합의(통합 이벤트·권한·외부 SSOT 예정) 반영 |
