# 춘백 시즌3 — 확정 사항 기록 (Decision Log)

> **작성일:** 2026-07-12  
> **상태:** 구현 진행 중 — **본 문서가 확정 정책의 단일 요약본**  
> **갱신:** 결정이 바뀌면 이 문서 + PRD(해당 절)를 함께 수정한다.

---

## 관련 문서 (역할 분담)

| 문서 | 역할 |
|------|------|
| **본 문서** | 지금까지 **확정된 결정** 한곳에 모음 (운영·개발 공통 참조) |
| [PRD](./2026-07-12-chunbaek-season3-attendance-design.md) | 제품·도메인·데이터 모델·API 계약 (상세 SSOT) |
| [FE Tech Spec](./2026-07-12-chunbaek-season3-fe-tech-spec.md) | 화면·디자인·FE 구조·PRD와의 UI 차이 |
| [구현 계획](../plans/2026-07-12-chunbaek-season3-mvp-impl.md) | Task 1~12 개발 체크리스트 |
| [Admin API 스펙](./2026-07-12-chunbaek-season3-admin-api.md) | 운영자 API request/response SSOT |
| [스펙 리뷰](../reviews/2026-07-12-chunbaek-season3-spec-review.md) | 초기 리뷰 (Critical 4건) |

---

## 1. 프로젝트·인프라

| 항목 | 확정 |
|------|------|
| Firebase | **별도 프로젝트 없음** — 기존 `dmc-attendance` |
| 웹앱 URL | `https://dmc-attendance.web.app/chunbaek/` |
| API | `/api/chunbaek` → Cloud Functions `chunbaek` |
| 정적 파일 | repo 루트 `chunbaek/` |
| Repo | DMC attendance log monorepo |

---

## 2. 제품 범위 (MVP)

| 포함 | 제외 (Phase 2+) |
|------|----------------|
| 100슬롯 출석·온보딩·팀 집계 | 마일리지·몸무게·대회 PB 연동 |
| 회원 모바일 SPA (4탭) | 카카오 로그인 (Phase 1.5) |
| 운영진 admin 그리드 (계획) | 카톡 API 연동 |
| session token 인증 | 사진 필수 (`photoRequired` 기본 false) |

**코어:** 매일 10초 이내 출석. 시즌 경과(일차) vs 출석 횟수 vs 출석률 **구분 표시**.

---

## 3. 명단·가입 정책 (2026-07-12 확정)

### 3.1 참가자 명단

| 항목 | 확정 |
|------|------|
| 방식 | **운영진 사전 지정** — `members.chunbaekS3.participant: true` |
| 규모 | 약 40명 (DMC `members` 부분집합) |
| 시즌 중 추가 | **가능** — 운영진이 `participant: true` 추가 → 다음 roster API부터 노출 |
| 자가 등록 | **하지 않음** — 동마클 전체 명단 표시 후 자동 participant 방식 **채택 안 함** |
| 비참가자 | `participant` 없음/false → 명단·API 접근 불가 |

### 3.2 운영진 작업 (명단)

**시즌 전·중 추가 시** (`members/{memberId}` merge):

```javascript
chunbaekS3: {
  participant: true,
  profileComplete: false,  // 신규 합류 시
}
```

**시즌 중 제외 시:** `participant: false` 또는 운영진 admin에서 처리 (admin API 구현 후).

### 3.3 온보딩 5단계

```
① 환영 → ② 명단 → ③ 프로필 → ④ 가이드 → ⑤ 홈
```

| 구분 | 흐름 |
|------|------|
| 신규 | ② 선택 → ③ `create-profile` → ④ → ⑤ + **token 발급** |
| 재로그인 | ② 본인 선택(가입됨 배지) → ③④ **생략** → `link-device` → ⑤ + **token 재발급** |
| token 유지(같은 기기) | ①~④ 생략, 바로 ⑤ |

**재로그인:** 비밀번호 없음. 명단 재확인 + 서버 token 재발급.

**「다른 사람으로」:** token 삭제 → ①부터.

---

## 4. 인증 (API 신원 C1)

| 항목 | 확정 |
|------|------|
| MVP 로그인 UX | DMC와 동일 **명단 선택** |
| API 신원 | `memberId` 쿼리만으로 저장/조회 **불가** |
| token 발급 | `create-profile`, `link-device` 성공 시 |
| token 저장 | `localStorage.chunbaekSessionToken` |
| 이후 요청 | `Authorization: Bearer` 또는 `?token=` |
| token 저장소 | `chunbaek_sessions` (Firestore) |

---

## 5. 출석·집계 규칙

### 5.1 슬롯·상태

| 개념 | 필드/의미 |
|------|-----------|
| 프로그램 휴무일 | `isProgramOff: true` — 집계 제외 |
| 출석 | 회원 `[출석하기]`, `attended: true` |
| 예외 | **운영진만** 설정, 회원 UI 없음 |
| 미출석 | 훈련일인데 미표시 |

**예외 흐름:** 단톡 사전 알림 → 운영진 admin에서 예외 처리.

### 5.1 슬롯·훈련 필드

| 필드 | 설명 |
|------|------|
| `trainingTitle` | 훈련 **제목** (80자) |
| `trainingContent` | 훈련 **내용** (500자, 선택) |
| `isProgramOff` | 프로그램 휴무일 |

운영진은 주차별 `admin-save-week-slots`로 제목·내용 입력.

### 5.2 주 3회

- 대상: 해당 주 **훈련일** 슬롯 (`!isProgramOff`, `!exception`)
- 목표: `min(3, 해당 주 훈련일 수)` (I1)
- 회원 소급 수정: 해당 주 **일요일 23:59 KST**까지 (I2)

### 5.3 동마클 토요 정모 vs 춘백 (2026-07-12 확정)

| | 동마클 정모 | 춘백 100일 |
|--|------------|-----------|
| 앱 | `/attendance-v2.html` | `/chunbaek/` |
| DB | `attendance` | `chunbaek_attendance` |

- **별도 시스템** — 자동 연동·동기화 **없음** (MVP).
- 토요 정모일: **동마클 출석 + 춘백 [출석하기] 둘 다** 필요.
- **UI:** 춘백 홈에서 **토요일 슬롯**일 때 안내 문구 + 동마클 출석 링크.

안내 문구 (확정):

> 오늘은 **토요일 동마클 정모**입니다. **동마클 출석**과 **춘백 출석**을 각각 해 주세요.

---

## 6. UI·브랜딩·카피 (FE 확정)

| 영역 | 확정 |
|------|------|
| 브랜드명 | **춘백 S3** (한글) |
| 탭 1 라벨 | **홈** (`data-tab="today"`) |
| 가이드 출석 위치 | **[춘백 홈]** |
| 가이드에서 제거 | 사진 필수·프로그램 휴무일 항목 |
| 예외 안내 | 「부상·출장·경조사는 단톡방에서 미리… 운영진이 예외 처리」 |
| 프로필 | `goalMarathonNetTime` 필수, `existingPbNetTime`·**`resolutionText`** 선택 |
| 프로필 안내 | 「가을 시즌 목표와 간단한 각오·자기소개」 |
| 홈 인사 | **닉네임** (`김러너님`) |
| 하단 탭 | **흰 배경**, 활성 탭 오렌지 |
| 주간 요약 | 연한 카드 `이번 주 N/3회` (버튼 아님) |
| 디자인 톤 | 춘천마라톤 — 오렌지 `#ff3214`, 시안 `#70d1f4` |

### 팀 화면 공개 범위

| 필드 | 팀 | 나 |
|------|-----|-----|
| `goalMarathonNetTime` | 공개 | 표시 |
| `existingPbNetTime` | 비공개 | 표시 |
| `resolutionText` | **미정** | 표시 |
| 출석·주간 달성 | 공개 | 표시 |

---

## 7. API 구현 현황 (2026-07-12)

### 7.1 구현 완료 (코드)

| action | 용도 |
|--------|------|
| `ping` | 헬스체크 |
| `members-roster` | ② 명단 |
| `create-profile` | ③ 신규 가입 |
| `link-device` | 재로그인 |
| `my-profile` | 프로필·통계 |
| `today-slot` | ⑤ 홈 오늘 슬롯 |
| `save-attendance` | 출석 저장 |
| `my-timeline` | 내 100일 |
| `team-summary` | 팀 탭 |

### 7.2 미구현

상세 스펙: [Admin API 스펙](./2026-07-12-chunbaek-season3-admin-api.md)

| action | 용도 | MVP |
|--------|------|-----|
| `verify-admin` | 운영진 인증 | 필수 |
| `admin-grid` | 출석 그리드 | 필수 |
| `admin-set-attendance` | 예외·대리 출석 | 필수 |
| `admin-week-slots` | 주차별 훈련 조회 | 필수 |
| `admin-save-week-slots` | 주차별 훈련 저장 | 필수 |
| `admin-import-slots` | 100슬롯 일괄 import (골격) | 필수(부트스트랩) |
| `admin-set-participant` | 참가자 추가·제외 | 확장 (권장) |
| `admin-reset-profile` | 프로필 초기화·세션 revoke | 확장 (권장) |
| `admin-update-profile` | 목표·PB·각오 수정 | 확장 (권장) |

### 7.3 배포 현황

| 구성 | 프로덕션 |
|------|----------|
| Hosting (`chunbaek/`) | ✅ 배포됨 |
| Functions (`chunbaek`) | ❌ **미배포** |
| Firestore 시드 (40명·슬롯) | ❌ 미적용 |

**실서비스 전 필수:** Functions 배포 + participant·슬롯 시드.

---

## 8. 목업·공유 (방장 검토용)

| URL | 용도 |
|-----|------|
| `/chunbaek/gallery.html` | 스크린샷 8장 한 페이지 |
| `/chunbaek/?preview=1` | 인터랙티브 목업 (가상 데이터) |
| 우측 「화면 전환」 | preview 모드에서 8화면 점프 (개발용) |

목업은 API 없이 동작. 방장 피드백 수집용으로 **Hosting만 배포**로 충분했음.

---

## 9. 구현 진행 (Milestone)

| Milestone | 상태 |
|-----------|------|
| M1 인프라·auth·온보딩 API | ✅ |
| M2 출석·집계 API | ✅ (코드) |
| M3 admin API | ❌ |
| M4 회원 SPA | △ 스켈레톤·API 호출 코드 있음, 실데이터 미연동 |
| M5 admin.html + pre-deploy | ❌ |

**다음 구현 우선순위 (합의):**

1. Functions `chunbaek` 배포  
2. 참가 40명 `participant` + 100슬롯 시드  
3. preview 없이 E2E (온보딩 → 출석 → 팀)  
4. admin API·화면  
5. pre-deploy smoke  

---

## 10. 미결정 (보류)

| 항목 | 비고 |
|------|------|
| 가이드 CTA 파이팅 문구 | `100일 시작하기` 유지, 대안만 제안 |
| 팀 화면 `resolutionText` 공개 | 목표만 공개 확정, 각오는 미정 |
| 사진 업로드 | Task 13 선택 |
| 카카오 로그인 | Phase 1.5 |

---

## 11. 변경 이력

| 일자 | 변경 |
|------|------|
| 2026-07-12 | 본 확정 사항 문서 최초 작성 |
| 2026-07-12 | 명단: 사전 지정 + 시즌 중 추가 확정 |
| 2026-07-12 | 토요: 자동 연동 없음, 홈 안내 문구 확정 |
| 2026-07-12 | FE 스켈레톤·갤러리·Hosting 배포 |
| 2026-07-12 | 회원 API Task 1~5 코드 완료 |

---

## 12. 한 페이지 요약

```
춘백 S3 = dmc-attendance 위 /chunbaek/
명단 = 운영진이 participant:true (40명, 중간 추가 가능)
로그인 = 명단 선택 + session token (재로그인 = link-device)
출석 = chunbaek_attendance (토요 = 동마클 출석도 별도)
MVP = 회원 앱 E2E 먼저, admin 나중
지금 = Hosting OK, Functions·시드 필요
```
