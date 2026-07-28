# 춘백 훈련 가이드 v3 정리형 디자인

> 작성일: 2026-07-28  
> 상태: 스펙 리뷰 반영 · 구현 착수  
> 전제: v2 롱스크롤(`/chunbaek/guide/`)을 **같은 브랜치에서 정리**. 문체 SSOT는 계속 DOCX 「이다/한다」.  
> **이 문서가 v2 이후 UX/구조 변경의 SSOT.**  
> v2 (`2026-07-27-chunbaek-training-guide-v2-design.md`)의 내용 이관·4수준 금지·카톡 원문 규칙은 유지.  
> v2의 **`.band-notes` / 구간 차이 / 장 prev·next 네비 / 부록 A+band** 요구는 **이 문서로 superseded**.

## 1. 목표

**성공 기준**
1. `.band-notes` / `data-band` 가 HTML에 **0개**. 「구간 메모」「아래 구간 메모」 등 band를 가리키는 안내 문장도 **제거 또는 공통 본문으로 수정**.
2. 장마다 `guide-topnav` / `guide-bottomnav` / `data-guide-prev|next|position` **없음**.
3. 목차는 **상단 `#toc` 짧은 링크 목록만** (위치: intro-usage·intro-diary **뒤**, 본문 장 **앞** — 현 순서 유지, 카드 과장 없이 단순 리스트).
4. **필수 사례 장** 전부에서 **모든** `.guide-story--raw`(각 raw 직후 `.guide-note` 포함)가, 그 섹션의 **첫 `.guide-table` 또는 첫 `.guide-callout` 중 더 앞에 오는 것**보다 앞에 온다. (원칙 블록 = `.guide-callout`)
5. 동일·유사 문단 중복 감소 (기본 band 복붙, “DOCX 윤문 생략”은 **최대 1회**).
6. DOCX 톤·4수준 처방 금지·SVG 4·me 탭 링크·갱신 스모크 통과.

**실패·롤백**
- 서브3/싱글/330 구간 박스 부활
- 장마다 이전/다음 버튼 부활
- 카톡 원문 윤문 대체
- migrator 재실행 시 band/네비/toc-card/생략문구가 다시 대량 삽입

## 2. 합의

| 항목 | 결정 |
|------|------|
| 접근 | **1 정리형** |
| 목차 | **A** — intro 뒤·본문 앞의 짧은 목록 |
| 몰입 | **B** — 원문 앞 → note → 표/원칙 |
| 구간 나눔 | 하지 않음 |
| 장 네비 | 삭제 |
| 문체 | 이다/한다 |

## 3. 필수 사례 장 (고정)

원문이 있어야 하며, 섹션 내 **모든** raw+note 쌍이 첫 표보다 앞:

`intro-diary`, `ch-7`, `ch-8`, `ch-9`, `ch-10`, `ch-15`

`ch-9`처럼 원문 2개면 **둘 다** 표·긴 원칙보다 앞에 둔다.

## 4. 변경 범위

### 삭제·수정
- 모든 `.band-notes`
- band를 가리키는 본문 (“구간 메모를 따른다” 등) → 삭제하거나 “최근 장거리·회복에 맞게” 등 공통 문장으로 치환
- `guide-topnav`, `guide-bottomnav`, `data-guide-prev/next/toc/position`
- `applyGuideNav` 호출·바인딩 불필요. `guide-nav.js`는 **`GUIDE_SECTIONS` SSOT만** 유지(TOC·테스트). `resolveGuideNav`/`applyGuideNav`는 삭제하거나 no-op 후 테스트에서 제거

### 장 순서 (필수 사례 장)
1. h2  
2. (선택) 짧은 도입 `<p>` 1~2개 — callout/table 아님  
3. **모든** `.guide-story--raw` + 각 `.guide-note`  
4. `.guide-callout` · `.guide-table` · 나머지 본문 · SVG  

`intro-diary`도 동일: 해석 규칙 callout은 원문 **뒤**.

### 중복
- 동일 문구 2회+ → 1회
- “DOCX 윤문 사례 생략” → intro-diary 또는 최초 1회만

### Migrator (`scripts/dev/migrate-guide-docx-to-html.py`)
재생성 시에도 v3를 깨지 않도록:
- `band_notes_default()` / band 삽입 **금지**
- `nav_hooks` top/bottom **금지**
- toc는 단순 `<a>` 리스트
- 「DOCX 윤문 생략」 문구는 한 번만
- 「구간 메모」 문구 생성 금지
- 사례 장은 inject 시 원문을 본문 앞쪽으로 배치

## 5. 테스트

- 앵커·SVG·원문 마커·4수준 금지 유지
- `band-notes` / `data-band` 없음
- `data-guide-prev` / `guide-bottomnav` / `guide-topnav` 없음
- **필수 사례 장 각각:** 섹션 HTML에서 **마지막** `guide-story--raw` 시작 인덱스가, 첫 `guide-table`과 첫 `guide-callout` 중 존재하는 것들의 **최소 인덱스**보다 작다. (둘 다 없으면 raw만 있으면면 OK)
- nav 테스트: `GUIDE_SECTIONS` 길이·순서만 (prev/next 위치 assert 삭제)

## 6. 비범위

- DOCX 장 순서 재편, 접근 2 강한 압축, 접근 3 장면 재구성
- 구간 개인화, CMS, `firebase deploy`

## 7. 구현 순서

1. 테스트 갱신 → fail  
2. HTML 정리 (band·네비·문구·원문 앞)  
3. guide-nav / CSS / migrator 맞춤  
4. 테스트 통과 · 커밋 · 푸시  
