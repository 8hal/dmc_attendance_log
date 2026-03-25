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
- 🔴 3/30 전환율 비교 (로그 분석)
- 🔴 **"이 대회 뛰셨나요?" 프로액티브 제안 기능** (P1 승격 검토)
  - 주간 스크래퍼 결과(search_cache) 기반, 검색 퍼널 완전 생략
  - my.html 접속 시 최근 2주 미확정 기록 자동 제안 → 원탭 확정
  - 이미 search_cache에 15,736건 미확정 기록 존재 (152명)
  - 구현: suggestions API + 배너 UI + confirm 원탭 + dismiss

## P2 — 다음 주

- ✅ **스크래퍼 피처 수집 구조 통일** (2026-03-25, v0.8.0)
  - 4개 소스 gender/ageGroupRank/splits 스키마 통일
  - spct: overallRank/genderRank/ageGroupRank/splits 파싱
  - smartchip: Total_Rank URL gender= 파싱
  - marazone: Sex/O_rank/G_rank/A_rank/splits 파싱 + rank 버그 수정
- 🔴 **smartchip splits 파싱** (rawData 배열 포맷 확인 필요)
  - rawData = `[rank, ...]` — 나머지 원소 의미 불명 (5K 구간 시간 추정)
  - 확인 방법: Cloud Functions 로그 또는 대회 당일 console.log 찍기
- 🔴 **myresult splits 파싱** (추가 API 호출 필요)
  - 이름 검색 API에는 splits 없음 → `/player/${num}` 개별 호출 필요
  - 동명이인 N명 → N번 추가 호출 (성능 비용 고려)
  - 선행 조건: splits가 딤아웃 모델에 실제 도움이 되는지 확인 후 진행
- 🔴 엑셀 데이터 임포트 (1,944건 중 기존 없는 것만 source:manual)
  - 정회원명단 닉네임→실명 매핑
  - 기존 race_results와 중복 체크 (실명+날짜+종목)
  - 팀 배정 데이터 반영
- 🔴 confirmedCount 일괄 재계산 스크립트
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
