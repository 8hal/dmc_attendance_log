# DMC Attendance Log — BACKLOG

> 우선순위: P0(오늘) → P1(이번 주) → P2(다음 주) → P3(언젠가)
> 상태: 🔴 TODO / 🟡 진행중 / ✅ 완료

---

## P0 — 오늘 저녁 배포

- 🔴 중복 job 마이그레이션 (백업 → dry-run → 실행)
- 🔴 admin/report 비밀번호 서버검증 전환
- 🔴 이미 등록됨 표시 (검색 결과 중복 저장 방지)
- 🔴 검색 일원화 (races.html → my.html 유도)
- 🔴 ops.html 배포 (개발자 전용 콘솔)
- 🔴 report.html 운영탭 제거
- 🔴 검색 퍼널 로그 강화 (error, no_result, timeout, cancel)
- 🔴 피드백 버튼 (my.html, races.html)
- 🔴 커밋 + 푸시

## P1 — 이번 주

- 🔴 검색 시 회원 성별 자동 필터 (내일 아침 배포)
- 🔴 races.html gender 우선순위 변경 (members > race_results)
- 🔴 동명이인 카드에 페이스 표시
- 🔴 춘천마라톤 스크랩 (myresult:132) + 회원 워밍업
- 🔴 3/30 전환율 비교 (로그 분석)

## P2 — 다음 주

- 🔴 엑셀 데이터 임포트 (1,944건 중 기존 없는 것만 source:manual)
  - 정회원명단 닉네임→실명 매핑
  - 기존 race_results와 중복 체크 (실명+날짜+종목)
  - 팀 배정 데이터 반영
- 🔴 회원 프로필에 팀 정보 활용 (엑셀 팀 데이터 기반)
- 🔴 confirmedCount 일괄 재계산 스크립트
- 🔴 전환율 미개선 시 단톡방 3문항 설문

## P3 — 언젠가

- 🔴 과거 기록 기반 동명이인 자동 추론 (모델)
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
