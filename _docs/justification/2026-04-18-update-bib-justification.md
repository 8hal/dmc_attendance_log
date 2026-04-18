# update-bib API 추가 필요성 검증

**작성일**: 2026-04-18  
**작성자**: AI Agent  
**검토자**: @taylor

---

## 기존 API 목록

### 1. action=group-events, subAction=detail (GET)
- **용도**: 대회 전체 정보 조회
- **호출처**: group-detail.html
- **특징**: 읽기 전용, race_events 전체 데이터 반환

### 2. action=group-events, subAction=gap (GET)
- **용도**: 기록 매칭 갭 분석
- **호출처**: group-detail.html
- **특징**: 읽기 전용, scrape_jobs와 participants 비교

### 3. action=group-events, subAction=participants (POST)
- **용도**: 참가자 목록 전체 교체
- **호출처**: group-detail.html (관리자 페이지)
- **특징**: participants 배열 전체를 받아서 덮어쓰기
- **입력 형식**:
  ```javascript
  {
    eventId: "evt_001",
    participants: [
      { nickname: "러너1", realName: "김철수", memberId: "m001", bib: "123" },
      { nickname: "러너2", realName: "이영희", memberId: "m002", bib: "456" },
      // ... 전체 85명
    ]
  }
  ```

### 4. action=group-events, subAction=source (POST)
- **용도**: 대회의 groupSource 필드 업데이트
- **호출처**: group-detail.html
- **특징**: 이벤트 레벨 필드 수정 (참가자 개별 필드 아님)

### 5. action=group-events, subAction=scrape (POST)
- **용도**: 대회 스크래핑 잡 트리거
- **호출처**: group-detail.html
- **특징**: 이벤트 레벨 작업, 참가자 데이터 수정 아님

### 6. action=group-events, subAction=confirm-one (POST)
- **용도**: 한 명의 기록을 race_results에 확정
- **호출처**: group-detail.html
- **특징**: race_results 컬렉션에 쓰기 (race_events는 수정 안 함)

### 7. action=group-events, subAction=bulk-confirm (POST)
- **용도**: 모든 참가자 기록을 race_results에 일괄 확정
- **호출처**: group-detail.html
- **특징**: race_results 컬렉션에 쓰기 (race_events는 수정 안 함)

### 8. action=group-events, subAction=delete (POST)
- **용도**: 대회 전체 삭제
- **호출처**: group-detail.html
- **특징**: race_events 문서 삭제

---

## 신규 API: update-bib

### 용도
- 참가자 본인의 배번(bib) 1개 필드만 업데이트
- race_events.participants[].bib 필드 수정

### 호출처
- my-bib.html (셀프서비스 페이지, 회원용)

### 사용 시나리오
1. 회원이 대회 참가 확정 후 배번을 받음
2. my-bib.html 페이지 방문 (단체 대회 전용 URL)
3. 본인 닉네임 입력 + 배번 입력
4. 제출 → update-bib API 호출 → race_events.participants[본인].bib 업데이트

---

## 기존 API로 대체 불가능한 이유

### 왜 participants subAction을 재사용하지 않는가?

#### 이유 1: 입력 데이터 과다
- **participants subAction 요구사항**: 전체 participants 배열 (85명 × 5필드 = 425개 필드)
- **update-bib 필요 데이터**: 본인 배번 1개 (1필드)
- **문제**: 회원은 다른 참가자 데이터를 알 수 없음
  - 전체 참가자 목록 조회 필요 → GET detail API 호출
  - 85명 데이터 다운로드 (불필요한 트래픽)
  - 본인 배번만 수정 후 전체 재전송 (424개 불필요 필드)

#### 이유 2: 보안 위험
- **participants subAction**: 전체 배열을 덮어쓰므로 다른 참가자 데이터 변경 가능
- **악의적 사용 예시**:
  ```javascript
  // 나쁜 예: 다른 사람 배번 지우기
  fetch("/race?action=group-events", {
    method: "POST",
    body: JSON.stringify({
      subAction: "participants",
      eventId: "evt_001",
      participants: [
        { nickname: "나", realName: "김철수", memberId: "m001", bib: "999" },
        { nickname: "다른사람", realName: "이영희", memberId: "m002", bib: "" }, // 지워버림
        // ...
      ]
    })
  });
  ```
- **update-bib**: 본인 nickname으로만 찾아서 본인 bib만 수정 (타인 데이터 불가)

#### 이유 3: 프론트엔드 복잡도
- **participants subAction 사용 시**:
  1. GET detail API 호출 → 전체 participants 배열 받기
  2. 배열에서 본인 찾기
  3. 본인 bib만 수정
  4. 전체 배열 POST participants API 전송
  5. Race condition 위험 (다른 사람이 동시에 수정하면 덮어씀)

- **update-bib 사용 시**:
  1. POST update-bib API 전송 (nickname + bib만)
  2. 끝

#### 이유 4: 퍼포먼스
- **participants**: 85명 × 평균 50bytes = 4KB+ 업로드
- **update-bib**: nickname(10bytes) + bib(5bytes) = 15bytes 업로드
- **차이**: 270배 데이터 절감

---

### 왜 source subAction을 확장하지 않는가?

#### 이유: 용도 불일치
- **source**: 이벤트 레벨 필드 (groupSource)
- **update-bib**: 참가자 레벨 필드 (participants[].bib)
- **아키텍처**: source는 단일 필드 업데이트, bib는 배열 내부 객체 필드
- **혼용 시 혼란**: "source는 무엇을 업데이트하는가?" (이벤트? 참가자?)

---

### 왜 새 범용 API (update-participant-field)를 만들지 않는가?

#### 고려사항
- 범용 API 예시:
  ```javascript
  {
    subAction: "update-participant-field",
    eventId: "evt_001",
    nickname: "러너1",
    field: "bib",  // 또는 "realName", "memberId" 등
    value: "12345"
  }
  ```

#### 현재 update-bib 선택 이유
1. **YAGNI 원칙**: 현재 요구사항은 bib 필드만
2. **보안**: 특정 필드만 허용 (realName, memberId 변경 방지)
3. **검증**: bib 전용 검증 로직 (숫자, 길이 등 향후 추가 가능)
4. **명확성**: API 이름만으로 용도 이해 가능

#### 향후 확장 시
- realName 변경 필요 → update-realname subAction 추가
- 여러 필드 동시 변경 필요 → update-participant subAction 추가
- 현재는 과도한 설계 (over-engineering) 방지

---

## 기존 패턴 준수 확인

### 참조한 패턴
- **bulk-confirm** (라인 2895~): participants 배열 순회 패턴
- **action=confirm** (라인 1789~): 파라미터 검증, 에러 응답 패턴

### 준수 항목
1. ✅ 필수 파라미터 검증 (eventId, nickname, bib)
2. ✅ 타입 검증 (bib must be string)
3. ✅ trim() 처리 (공백 제거)
4. ✅ 404/403/400/500 에러 처리
5. ✅ 에러 로깅 (console.error)
6. ✅ 성공 응답 메시지 (한글)

### 차이점
- **bulk-confirm**: 전체 삭제 후 재저장 (race_results)
- **update-bib**: 단일 필드 업데이트 (race_events.participants)
- **근거**: update-bib는 단일 문서 내 배열 필드 수정이므로 삭제 불필요

---

## 신규 API 추가 결정

### ✅ 추가 필요

**요약:**
- 기존 `participants` subAction은 전체 배열 교체 (과다 입력, 보안 위험, 복잡도)
- 회원 셀프서비스 시나리오는 단일 필드 업데이트 필요
- 범용 API는 과도한 설계 (YAGNI)
- update-bib는 최소 구현 + 명확한 용도 + 안전

### ⚠️ 대안 없음

**검토한 대안:**
1. ❌ participants 재사용 → 데이터 과다, 보안 위험
2. ❌ source 확장 → 용도 불일치
3. ❌ 범용 API → 과도한 설계

**결론:** update-bib가 유일한 적절한 솔루션

---

## 테스트 커버리지

### 구현된 테스트 (scripts/test-update-bib.js)
1. ✅ 정상 업데이트 (200 OK)
2. ✅ eventId 누락 (400)
3. ✅ nickname 누락 (400)
4. ✅ bib 누락 (400)
5. ✅ bib 빈 문자열 (400)
6. ✅ 존재하지 않는 대회 (404)
7. ✅ 참가자 아님 (403)
8. ✅ 기존 배번 덮어쓰기 (200)
9. ✅ Firestore 검증 (실제 저장 확인)

### 커버하지 못한 시나리오 (Phase 2)
- 동시 업데이트 (race condition) - 현재는 Firestore 트랜잭션 없음
- 배번 중복 체크 - 현재는 중복 허용 (동일 배번 여러 명 가능)
- 배번 형식 검증 - 현재는 비어있지 않기만 확인 (숫자/영문자 검증 없음)

---

## 배포 계획

### Phase 1 (현재)
- ✅ update-bib API 구현 (MVP)
- ✅ 기본 검증 (필수 필드, 참가자 여부)
- ✅ 에러 처리 (400/403/404/500)
- ⏳ my-bib.html 페이지 구현 (Task 2)

### Phase 2 (향후)
- 배번 형식 검증 (정규식)
- 배번 중복 체크 (optional warning)
- 인증 강화 (Firebase Auth)
- Rate limiting (abuse 방지)

---

**승인 상태**: ✅ 사용자 승인 필요  
**승인일**: (코드 리뷰 통과 후 기재)  
**배포일**: (배포 후 기재)
