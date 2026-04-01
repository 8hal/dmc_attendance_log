# DMC Attendance Log — BACKLOG

> 우선순위: P0(오늘) → P1(이번 주) → P2(다음 주) → P3(언젠가)
> 상태: 🔴 TODO / 🟡 진행중 / ✅ 완료

---

## P0 — 오늘 저녁 배포 ✅ 전체 완료 (2026-03-23~24)

- ✅ 중복 job 마이그레이션 스크립트 작성
- ✅ admin/report 비밀번호 서버검증 전환
- ✅ 이미 등록됨 표시 (검색 결과 중복 저장 방지)
- ✅ 검색 일원화 (races.html → my.html 유도)
- ✅ ops.html 배포 (개발자 전용 콘솔)
- ✅ report.html 운영탭 제거
- ✅ 검색 퍼널 로그 강화 (error, no_result, timeout, cancel)
- ✅ 피드백 버튼 (my.html, races.html)

## P1 — 이번 주

- ✅ 검색 시 회원 성별 자동 필터 (filterGender에 members.gender 자동 적용)
- ✅ races.html gender 우선순위 변경 (members > race_results)
- ✅ 동명이인 카드에 페이스 표시 (my.html + races.html)
- ✅ confirmSource 필드 추가 (personal vs event 구분)
- ✅ 춘천마라톤 myresult:132 — 이미 confirmed (헥사 1건)
- ✅ 검색 UX 개선 + PB 카드 리디자인 (2026-03-24)
- ✅ 운영 루틴 룰 + 배포 체크리스트 버저닝 (2026-03-24)
- 🟡 3/30 전환율 비교 (로그 분석) — 스크립트 `scripts/analyze-funnel-windows.js` 추가; **2026-03-29일 프로덕션 로그 이후 트래픽 없음** → 3/30~ 구간 비교는 재방문·로깅 확인 후 재측정
- 🔴 **대회 파이프라인 (예정→참가→기록 자동화)** — 지시서: `_docs/plans/event-pipeline.md`
  - Phase 1: 고러닝 수집 + ops.html 예정 탭 + 모니터링
  - Phase 2: 참가자 목록 입력 (운영자/회원)
  - Phase 3: 자동 스크랩 트리거 + 구멍 탐지
- 🔴 **확정 기록 운영자 편집 기능** — 지시서: `_docs/plans/edit-confirmed-record.md`
  - report.html에서 race_results(SSOT) 직접 조회·수정·삭제
  - scrape_jobs 없는 고아 124건 포함 전체 커버
  - update-record API 신규 추가
- ✅ **"이 대회 뛰셨나요?" 프로액티브 제안 기능** — 구현 완료
  - suggestions API (search_cache 기반, 최근 2주, 이미 확정 제외)
  - my.html suggestionsPanel + 원탭 확정 + dismiss
  - 2026-04-01 코드 확인 기준 배포 상태 점검 필요

## P2 — 다음 주

- ✅ **스크래퍼 피처 수집 구조 통일** (2026-03-25, v0.8.0)
  - 4개 소스 gender/ageGroupRank/splits 스키마 통일
  - spct: overallRank/genderRank/ageGroupRank/splits 파싱
  - smartchip: Total_Rank URL gender= 파싱
  - marazone: Sex/O_rank/G_rank/A_rank/splits 파싱 + rank 버그 수정
- 🔴 **구간 기록(splits) 완전 구현** — 아래 3개를 한 번에 처리
  - smartchip: rawData 배열 포맷 확인 (5K 구간 시간 추정) → 대회 당일 CF 로그로 확인
  - myresult: `/player/${num}` 개별 호출 추가 (동명이인 N명 → N번, 성능 검토 필요)
  - **confirm API**: `genderRank`, `ageGroupRank`, `splits` race_results에 저장 추가
    - 현재 누락 중 — splits 구현과 동시에 처리해야 의미 있음
- 🔴 엑셀 데이터 임포트 (1,944건 중 기존 없는 것만 source:manual)
  - 정회원명단 닉네임→실명 매핑
  - 기존 race_results와 중복 체크 (실명+날짜+종목)
  - 팀 배정 데이터 반영
- ✅ confirmedCount 제거 (2026-04-01) — scrape_jobs.confirmedCount 전면 제거, events API를 race_results 직접 카운트로 교체
- 🔴 회원 프로필에 팀 정보 활용 (엑셀 팀 데이터 기반)
- 🔴 전환율 미개선 시 단톡방 3문항 설문

## P2.5 — 동명이인 딤아웃 (피처 확보 후)

> 선행 조건: 성별 파싱 강화 + 연령대 확보
> 벤치마크: `data/benchmark-results.json`, `data/dimout-benchmark.json`

- 🔴 동명이인 딤아웃 모델 적용 (추천 배지 → 딤아웃으로 전략 변경)
  - GT: 79명 384건, 후보 9,155건 (`data/gt-dataset.json`)
  - 현재 best: gender + 풀하프±50% + 10K±100% (FNR 1.5%)
  - 이은주 463→143건(69%↓), 김종현 522→42건(성별만)
  - **병목: 성별 null 85%, 연령대 0%**
- 🔴 members에 PB 기록 + 출생연도 필드 추가
- 🔴 my.html 온보딩: PB + 출생연도 입력 UI
- 🔴 search 응답에 dimout 점수 포함 (Cloud Function)

## P3 — 언젠가

- 🔴 **confirm API: 기록(net/gun/finish) 없이 확정 허용 vs 서버 검증** (정책만 정리)
  - 참가만 남기고 싶은 경우 빈 기록 확정이 필요할 수 있음 → **막지 않는 쪽**이 요구사항에 맞을 수 있음
  - 선택지: (a) 허용 유지 + UI만 안내, (b) 경고 후 확인, (c) `participationOnly` 플래그 등 스키마로 명시
  - MyResult 등 소스에 시간이 아예 없는 케이스와 별도로 논의
- 🔴 대회 전 BIB 사전 등록
- 🔴 새 대회 결과 수집 시 자동 알림 (카톡 Webhook 등)
- 🔴 index.html 상단 "새 결과 등록됨" 배너
- 🔴 스크래퍼 실패 모니터링/알림
- 🔴 회원 온보딩 가이드 (첫 진입 시)
- 🔴 ops.html 고도화 (일별 활성 사용자, 전환율 차트)
- 🔴 공개 범위 설정 (기록 비공개 옵션)
- 🔴 상용화 검토 (마이크로 SaaS, 다른 클럽 대상)

---

## 완료 기록

### 2026-03-25
- ✅ 스크래퍼 피처 수집 구조 추가 (gender/ageGroupRank/splits) 4개 소스 통일 (v0.8.0)
  - spct: overallRank/genderRank/ageGroupRank + Section 스플릿
  - smartchip: Total_Rank URL에서 gender 파싱
  - marazone: Sex/O_rank/G_rank/A_rank/CP_01~04 — rank_total 버그 수정 포함
  - myresult: 스키마 일관성용 null 필드 추가
  - 정책: 기존 race_results 백필은 Lazy 방식(필요 시 BIB 재조회), splits 미구현 2건은 백로그 등록

### 2026-03-24
- ✅ 검색 UX 개선 + PB 카드 리디자인 (동명이인 경고, 페이스 표시, 필터 칩)
- ✅ 검색 라이브 프리뷰 등록됨 태그 표시
- ✅ 운영 루틴 룰(ops-routine.mdc) + 배포 체크리스트 버저닝 추가
- ✅ 동명이인 딤아웃 모델 연구 — GT 구축, 벤치마크, 전략 전환(배지→딤아웃)
  - 결론: 피처 확보(성별 파싱, 연령대)가 모델 성능보다 우선

### 2026-03-23
- ✅ confirmedCount 덮어쓰기 버그 수정 (긴급 배포)
- ✅ BETA 태그 전 페이지 추가
- ✅ 이벤트 로깅 시스템 구축
- ✅ 기록 삭제 × 버튼 (실명 검증)
- ✅ report.html 도움말 비밀번호 평문 제거
- ✅ 네비게이션 정리 (index→my, races→my)
- ✅ 배포 전 테스트 스크립트 (pre-deploy-test.sh)
- ✅ 배포 전 체크리스트 룰 생성
- ✅ 엠제이 gender F→M 데이터 수정
- ✅ 데이터 사전 + AI 팩트 룰 생성
- ✅ 롤아웃 가이드 문서 작성
- ✅ discoverMyResult 페이지네이션 수정
- ✅ 주간 스크래퍼 foundCount=0 재시도 + 처리 한도 5로 증가
- ✅ verify-admin, event-logs, data-integrity, log API 추가
- ✅ confirmed-races API SSOT 리팩토링 (N+1→단일쿼리, 중복대회 해결)
- ✅ race_results eventDate 누락 4건 보완
- ✅ races.html gender 우선순위 (members > race_results)
- ✅ 페이스 표시 (my.html + races.html 타임라인)
- ✅ confirmSource 필드 추가 (personal/event 구분)
- ✅ 검색 시 회원 성별 자동 필터 적용
- ✅ functions/.env + .gitignore 설정
