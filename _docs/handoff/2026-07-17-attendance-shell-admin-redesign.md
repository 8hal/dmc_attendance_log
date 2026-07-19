# 핸드오프: 출석 앱 셸 + 운영 허브 리뉴얼 (스펙·목업)

> 작성: 2026-07-17  
> 브랜치: `cursor/attendance-shell-redesign-spec-78e6`  
> PR: https://github.com/8hal/dmc_attendance_log/pull/26 (draft)  
> **프로덕션 미배포** — 문서·정적 목업만. Shell-1 / Admin-1a 코드 미착수

---

## 1. 목표 (한 줄)

춘백식 **회원 출석 앱 셸** + **출석 운영 허브**를 설계·목업까지 잠그고, 디자인 컨펌 후 Shell-1 / Admin-1a 구현으로 넘긴다.

---

## 2. 오늘까지 잠긴 결정 (핵심)

### 회원 앱 셸

| 항목 | 결정 |
|------|------|
| 접근 | **A** — 기존 `attendance-v2.html`/`.js` 셸 래핑 (신규 SPA 폴더 아님) |
| 탭 | `오늘 \| 내 출석 \| 팀 출석 \| 더보기` |
| 상단 | brand-bar + **대회 기록 → races.html** (더보기 중복 금지) |
| 키오스크 | 더보기 **메인 목록 제외** → **이용 안내 시트 안**만. URL `?mode=kiosk` 북마크 유지 |
| 오늘 탭 기본 정모 | `docs/MEETING_INFO.md` / `resolveDefaultMeeting`과 **동일** (월→토요 −2일 등) |
| 개인 출석 취소 | **내 출석** 탭만. **활성 세션(A안)** = `resolveDefaultMeeting` `(date,type)`만. 달력 당일 아님. 오늘 CTA 교체 금지 |
| 팀 출석 | 조회 전용. 정모=`TUE\|THU\|SAT`. 출석률=`attended/roster` |
| index 컷오버 | **Shell-4**만 (운영진 공지 후) |
| 시각 | DMC blue · 1차 system-ui |

### 운영 허브

| 항목 | 결정 |
|------|------|
| 진입 | `attendance-admin.html` 신규 · `admin.html` → `#members` 리다이렉트 |
| 탭 | **출석 관리 \| 회원 \| 정모 훈련** |
| 출석 관리 | 당일 / 월 집계·출석왕 / 기간 CSV |
| 인증 | 기존 `verify-admin` body `{ pw }` |
| 훈련 입력 | 카페 공지 **붙여넣기 파싱(A)** → 검토 → 저장 (URL fetch는 이후) |
| 삭제 API | self `delete-attendance` + admin `admin-delete-attendance` **필수** (구현 전 justification+승인) |
| self-delete 서버 | **활성 세션** + memberId (셸과 동일) |

---

## 3. SSOT 문서

| 종류 | 경로 |
|------|------|
| 셸 설계 | `_docs/superpowers/specs/2026-07-17-attendance-shell-redesign-design.md` |
| 셸 계획 | `_docs/superpowers/plans/2026-07-17-attendance-shell-redesign.md` |
| 허브 설계 | `_docs/superpowers/specs/2026-07-17-attendance-admin-hub-design.md` |
| 허브 계획 | `_docs/superpowers/plans/2026-07-17-attendance-admin-hub.md` |
| 정모 요일 규칙 | `docs/MEETING_INFO.md` |
| 회원 목업 | `attendance-v2-shell-mockup.html` |
| 운영 목업 | `attendance-admin-mockup.html` |

목업 미리보기 (로컬):

```bash
cd /workspace && python3 -m http.server 8765
# http://127.0.0.1:8765/attendance-v2-shell-mockup.html
# http://127.0.0.1:8765/attendance-admin-mockup.html
```

---

## 4. 구현 상태

| 작업 | 상태 |
|------|------|
| 설계·계획·목업 | ✅ |
| 디자인 컨펌 (사용자) | ✅ 2026-07-17 «목업 확인 · 개발 진행» (내일 재확인 예정) |
| **Shell-1 코드** | ✅ 브랜치에 있음 (`attendance-v2` 셸·라우터·더보기→이용안내→키오스크) |
| **Admin-1a 코드** | ✅ 브랜치 (`attendance-admin.html` · 회원 이식 · `admin.html`→`#members`) |
| Delete-1 / 훈련 API | ✅ Delete-1 완료. **Admin-1b 승인·구현** (`meeting-training` get/save + 붙여넣기 파서) |
| Shell-2 / Shell-3 MVP | ✅ 내 출석 stats+목록 · 팀 출석(members+status 조인) |
| 오늘 탭 훈련 공지 | ✅ `meeting-training` 단일 조회 표시 |
| pre-deploy-test 전체 | ⚠ Functions 에뮬 hang 가능 — Hosting assert에 training 헬퍼 추가 |
| `firebase deploy` | ❌ 금지 |

### Delete-1 (2026-07-19)

- justification 승인 후 구현
- `POST ?action=delete-attendance` — 활성 세션 + memberId
- `POST ?action=admin-delete-attendance` — `{ pw, docId }` + event_logs
- 셸 «내 출석» 취소 버튼 / 허브 출석 관리 삭제 버튼
- 단위 테스트: `npm run test:attendance-shell` (router + active-session)


### Shell-2 / Shell-3 (2026-07-19)

- Shell-2: `stats`+`history` 요약(출석·률·연속) + 목록·취소
- Shell-3 MVP: `assets/attendance-team-month.js` + `status` 월간 조인 (정모 TUE/THU/SAT)
- `team-month-attendance` 전용 API는 **미추가** (필요 시 별도 justification)

### Admin-1b (2026-07-19)

- justification 승인 후 구현
- `GET/POST ?action=meeting-training` · 컬렉션 `meeting_training`
- 카페 붙여넣기 파서 (`assets/meeting-training.js` / `functions/lib/meeting-training.js`)
- 허브 `#training` 주간 보드 · 셸 `#today` 공지 표

### Admin-1b 게이트

- 문서: `_docs/justification/2026-07-19-meeting-training-justification.md` ✅ 승인됨


### Shell-1 수동 확인 (내일)

- [ ] `#today` 체크인 (프로필 유/무)
- [ ] stub: 내 출석 / 팀 출석
- [ ] 더보기 → 이용 안내 → 키오스크 → 종료 → `#more`
- [ ] 상단 대회 기록
- [ ] `?mode=kiosk` 북마크


---

## 5. 다음 세션 권장 순서

1. 로컬/에뮬에서 훈련 붙여넣기→저장→오늘 탭 표시 수동 확인  
2. (선택) `team-month-attendance` justification — Shell-3 성능 이슈 시  
3. Shell-4 `index.html` 컷오버 (운영진 공지 후)  
4. pre-deploy Functions 에뮬 hang 원인 점검 · **배포는 사용자**  

---

## 6. 재개 시 체크

- [ ] 이 핸드오프 + 셸/허브 스펙 §확정 결정 표 읽기  
- [ ] 목업 하드 리프레시로 키오스크=이용 안내 안 · 오늘 탭=요일 규칙 · 취소=활성 세션 확인  
- [ ] 「디자인 컨펌」 명시적 승인 받기  
- [ ] 승인 없으면 Shell-1/Admin-1a 코드 쓰지 말 것  

---

## 7. AI 금지·주의

- **`firebase deploy` 실행 금지**  
- 신규 API는 승인 없이 구현 금지  
- 키오스크를 더보기 메인/오늘 탭에 다시 두지 말 것  
- 개인 취소를 «달력 당일만»으로 되돌리지 말 것 (A안 잠금)
