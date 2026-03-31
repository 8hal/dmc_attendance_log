# 집행 층 점검표 + 갭 (Firestore 스키마 대체)

> 플랜 MVP — 축 C 필수 산출물 (코드 변경 없음)  
> 작성일: 2026-03-30

## 네 층 체크리스트

| 층 | 질문 | 상태 | 근거·비고 |
|----|------|------|-----------|
| **앱** | 잘못된 payload를 보내기 전에 UI에서 막는가? | 갭 | HTML 폼은 브라우저 검증 수준; 필수 필드·거리 정규화는 대부분 서버에 의존 |
| **앱** | `confirm` body가 화면마다 동일 계약인가? | 부분 | `my` / `report` / `races` 각각 fetch 조립 — 통합 DTO·공유 모듈 없음 |
| **함수** | 확정·삭제·수동 잡 생성이 한 곳에서 불변식을 집행하는가? | 부분 | `confirm`·`delete-record`·`create-job`·`scrape`가 `index.js`에 있으나 엑셀 등은 우회 |
| **함수** | `docId`·`canonicalJobId`·`canonicalEventId` 규칙이 문서화되어 같은가? | 부분 | `data-dictionary`·race-events 플랜에 있음; 코드 주석·단일 모듈화는 미흡 |
| **Rules** | 클라이언트가 Firestore에 직접 쓸 수 있는가? | OK | `firestore.rules`: `race_results`·`scrape_jobs`·`race_events`·`members` 전부 **write: false** (읽기만 공개) |
| **운영** | 일괄 스크립트가 `data-write-safety`·dry-run을 거치는가? | 갭 | 스크립트마다 다름; `manual_import_excel.js` 등은 주석·`--dry-run` 있음 — 런북 통합 없음 |
| **운영** | 엑셀/수동 유형이 `confirm`과 동일 필드를 쓰는가? | 갭 | Admin 직접 `set` 시 `jobId`·`scrape_jobs` 카운트와 어긋날 수 있음 (`data-integrity` 이슈 다수 원인 후보) |

## 수동 입력 유형 vs 공식 관문 (요약)

| 유형 | 경로 | scrape_jobs / 카운트 |
|------|------|----------------------|
| 리포트 create-job → confirm | HTTP | 갱신됨 |
| my/races confirm | HTTP | 갱신됨 |
| 엑셀·fix 스크립트 | Admin SDK | **우회 가능** → 갭 |

## 다음 주 백로그 (한 페이지 요약)

1. **`data-integrity` 이슈 해석:** ✅ 67건 — `2026-03-30-data-integrity.json` 내 `issues.length` (production API 응답 파싱). `claimed` vs `actual` 불일치는 **병합 잡·`jobId` 재지정·비정규 카운트 누적** 등과 겹칠 수 있음 — **API 한계:** `scrape_jobs.status === 'complete'` 는 비교 제외(플랜·코드 주석 참고).
2. **Rules:** 직접 쓰기 차단은 충분 — **남은 리스크는 Admin·로컬 스크립트**.
3. **앱:** 공통 `confirm` 페이로드 빌더 또는 최소 필드 표를 `_docs/knowledge`에 두고 화면 3곳과 대조.
4. **운영:** 엑셀/마이그레이션 시 `confirmedCount` 재계산 또는 잡 상태 정리 런북(승인 후 배치).

## 관련 파일

- `firestore.rules` — 쓰기 전부 Functions/Admin
- `functions/index.js` — `confirm`, `create-job`, `delete-record`, `scrape`, `data-integrity`
- `scripts/manual_import_excel.js` — 운영 예외 샘플
