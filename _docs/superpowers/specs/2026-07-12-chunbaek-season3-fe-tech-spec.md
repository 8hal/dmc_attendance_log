# Tech Spec: 춘백 시즌3 FE (디자인·구현 기록)

> 작성일: 2026-07-12  
> PRD: [`2026-07-12-chunbaek-season3-attendance-design.md`](./2026-07-12-chunbaek-season3-attendance-design.md)  
> 구현 계획: [`2026-07-12-chunbaek-season3-mvp-impl.md`](../plans/2026-07-12-chunbaek-season3-mvp-impl.md)  
> 상태: **스켈레톤 확정 → API 연동 진행 중**

---

## 1. 테크 스펙이 필요한가?

**전체 테크 스펙을 처음부터 다시 쓸 필요는 없습니다.**

| 문서 | 역할 | 상태 |
|------|------|------|
| PRD | 제품·도메인·API 계약 | ✅ 확정 |
| 구현 계획 | 백엔드·FE·시드·테스트 Task 1~12 | ✅ 확정 |
| **본 문서 (FE Tech Spec)** | **스켈레톤 UI 확정 사항·PRD 차이·파일 구조** | ✅ 기록용 |

본 문서는 **디자인 스켈레톤 피드백을 반영한 FE 결정**과 **구현 진행 상태**만 기록한다. API·Firestore 상세는 PRD §9·§16과 구현 계획을 SSOT로 둔다.

---

## 2. 시스템 아키텍처 (FE)

```
chunbaek/index.html (SPA 셸)
  ├─ 온보딩: welcome → pick → profile → guide
  ├─ 메인 탭: today(홈) | timeline(내 100일) | team | me
  ├─ chunbaek/js/api.js      — API_BASE, token, 목업 fallback
  ├─ chunbaek/js/app.js      — hash 라우팅, 뷰 렌더 (MVP: 단일 파일)
  └─ chunbaek/css/chunbaek.css — 춘천마라톤 톤

chunbaek/admin.html (Task 11, 미구현)
  └─ chunbaek/js/admin.js
```

**라우팅:** hash — `#/welcome`, `#/pick`, `#/profile`, `#/guide`, `#/today`, `#/timeline`, `#/team`, `#/me`

**인증 저장:** `localStorage.chunbaekSessionToken` (opaque token, C1)

**미리보기:** `?preview=1` 또는 localhost → `api.js` 목업 데이터 (`useMock()`)

---

## 3. 디자인 시스템 (확정)

춘천마라톤 공식 톤 — `chunbaek/css/chunbaek.css` `:root`

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--chun-orange` | `#ff3214` | 히어로·CTA·활성 탭 |
| `--chun-cyan` | `#70d1f4` | 브랜드 강조·상단 서브 |
| `--chun-black` | `#000000` | 상단 브랜드 바, body 베젤 |
| `--chun-white` | `#ffffff` | 카드·하단 탭 배경 |

### 컴포넌트

| 컴포넌트 | 클래스 | 비고 |
|----------|--------|------|
| 상단 브랜드 바 | `.brand-bar` | 검정 배경, 탭 클릭 시 홈 |
| 히어로 (환영) | `.welcome-hero` | 오렌지 풀폭, Bebas Neue 연도 |
| 카드 | `.card` | 흰 배경, 라운드 |
| CTA | `.btn-primary` | 오렌지 |
| 하단 탭 | `.tab-bar` | **흰 배경** (2026-07-12 가시성 수정) |
| 주간 요약 | `.week-summary` | 연한 카드, `N/3회` (버튼 아님) |
| 토스트 | `.toast` | 성공/오류 |

### 모바일

- `max-width: 480px` 중앙 정렬 `.app`
- `safe-area-inset-bottom` 하단 탭 패딩
- `theme-color: #ff3214`

---

## 4. 화면별 UI·카피 (PRD 대비 확정)

| 화면 | PRD | 스켈레톤 확정 |
|------|-----|---------------|
| 브랜드명 | CHUN100 등 검토 | **춘백 S3** (한글) |
| 탭 1 | 오늘 | **홈** (`data-tab="today"`, 라벨만 변경) |
| 가이드 출석 위치 | 오늘 탭 | **[춘백 홈]** |
| 가이드 항목 | 사진·프로그램 휴무일 | **제거** (MVP 단순화) |
| 예외 안내 | 운영진 처리 | 단톡 사전 알림 → 운영진 예외 처리 (문구 확정) |
| 프로필 | 목표·PB | **+ `resolutionText`** (각오·자기소개, 200자, 선택) |
| 홈 인사 | — | **닉네임** (`김러너님`) |
| 가이드 CTA | 100일 시작하기 | 유지 (파이팅 문구 **미확정**) |

### 온보딩 플로우 (동일)

1. 환영 → 2. 명단 → 3. 프로필 → 4. 가이드 → 5. 홈  
재로그인: `profileComplete` 있으면 ③④ 생략, `link-device` 후 홈.

---

## 5. 데이터 필드 (FE 관점)

### `members.chunbaekS3` (온보딩·나 탭)

```javascript
{
  participant: true,           // 명단 노출
  profileComplete: boolean,
  goalMarathonNetTime: number, // 초, 7200~25200
  existingPbNetTime: number | null,
  resolutionText: string | null  // FE 추가 — PRD §16 create-profile에 반영 예정
}
```

### API 응답 (회원)

- `my-profile.stats`: `seasonDayIndex`, `seasonAttendCount`, `seasonAttendRate`, `weekAttendCount`, `weekTarget`
- `today-slot`: `dayIndex`, `date`, `trainingLabel`, `isProgramOff`, `attended`

상세 스키마: PRD §9, API 표: PRD §16.7

---

## 6. 파일 구조·책임

| 파일 | 상태 | 책임 |
|------|------|------|
| `chunbaek/index.html` | ✅ 스켈레톤 | SPA 마크업 8 view + 탭 |
| `chunbaek/css/chunbaek.css` | ✅ 스켈레톤 | 디자인 토큰·레이아웃 |
| `chunbaek/js/api.js` | ✅ 스켈레톤 | API 클라이언트 + 목업 |
| `chunbaek/js/app.js` | ✅ 스켈레톤 | 라우팅·렌더 (뷰 분리는 Task 9~10) |
| `chunbaek/js/views-*.js` | ❌ | 탭별 모듈 분리 (연동 시) |
| `chunbaek/admin.html` | ❌ | 운영진 그리드 |

구현 계획은 `views-today.js` 등 분리를 권장하나, 스켈레톤 단계에서는 `app.js` 단일 파일로 유지. API 연동 후 분리해도 됨.

---

## 7. API 클라이언트 패턴

`_docs/development/api-patterns.md` 준수:

```javascript
const API_BASE = IS_LOCAL
  ? `http://${location.hostname}:5001/dmc-attendance/asia-northeast3/chunbaek`
  : "/api/chunbaek";
```

- GET: `?action=X&token=...`
- POST: `?action=X`, body JSON, `Authorization: Bearer` (token 필요 시)
- 오류: `data.ok` 체크 → `showToast(msg, true)`
- 중복 방지: `isProcessing` 플래그 (출석 버튼)

---

## 8. 구현 진행 상태 (2026-07-12)

| Milestone | 항목 | 상태 |
|-----------|------|------|
| M1 | firebase rewrite, `exports.chunbaek`, rules, ping | ✅ Task 1 |
| M1 | session token (C1) | 🔄 Task 2 |
| M1 | 온보딩 API | 🔄 Task 3 |
| M2 | 집계·출석 API | ❌ Task 4~5 |
| M3 | admin API | ❌ Task 6 |
| M4 | FE 스켈레톤 (목업) | ✅ |
| M4 | FE ↔ 실 API 연동 | ❌ Task 8~10 |
| M5 | pre-deploy smoke | ❌ Task 12 |

---

## 9. 로컬 확인

```bash
# FE만 (목업)
python3 -m http.server 8765
# http://localhost:8765/chunbaek/?preview=1

# API 연동 (에뮬)
firebase emulators:start  # 또는 pre-deploy-test.sh
# http://127.0.0.1:5000/chunbaek/
```

---

## 10. 미결정 (기록)

| 항목 | 비고 |
|------|------|
| 가이드 CTA 파이팅 문구 | `100일, 달려요!` 등 제안만 |
| 팀 화면 `resolutionText` 공개 여부 | PRD는 목표만 공개 확정 |
| 사진 업로드 | Task 13 (선택) |

---

## 11. 변경 이력

| 일자 | 변경 |
|------|------|
| 2026-07-12 | 스켈레톤 FE 확정, 본 테크 스펙 작성 |
| 2026-07-12 | 하단 탭 흰 배경, 주간 요약 카드형 |
| 2026-07-12 | `resolutionText` 프로필 필드 추가 |
