# 테스트 계획: 춘백 S3 — 출정식(7/16) 전 완료

> **작성:** 2026-07-12  
> **갱신:** 2026-07-12 (v0.1.0-alpha.1)  
> **마감:** **2026-07-16(목) 출정식·발대식 이전**  
> **공식 개시:** 2026-07-20(월) 1일차  
> **근거 문서:** [ops-prep](../superpowers/specs/2026-07-16-chunbaek-season3-ops-prep.md), [confirmed-decisions](../superpowers/specs/2026-07-12-chunbaek-season3-confirmed-decisions.md), [admin-api §7](../superpowers/specs/2026-07-12-chunbaek-season3-admin-api.md)

---

## 1. 목표

| 항목 | 내용 |
|------|------|
| **배포 목표** | 출정식(7/16)에서 회원·운영진이 **실 API**로 온보딩·훈련 확인·출석 리허설 가능 |
| **성공 기준** | 아래 **Go 체크리스트(§8)** 전항 통과 + 결함 0건(Critical/Blocker) |
| **실패 기준** | 시드 미적용, 명단 0명, 온보딩·출석·admin 그리드 중 1개라도 불가 → **출정식에서 실서비스 URL 공유 보류** |
| **범위** | MVP — 회원 SPA E2E, admin 6 API, Firestore 시드, 1주차 훈련표 |
| **범위 밖** | 카카오 로그인, 사진 필수, admin 확장 3 API, 홈 「이번 주 훈련」 A |

---

## 2. 일정 (출정식 전 4일)

```
7/12(토)~7/13(일)  Phase 0·1 — 자동 테스트 + 시드 dry-run
7/14(월)~7/15(화)  Phase 2·3 — 프로덕션 시드 + 수동 E2E + 파일럿
7/16(수) 전        Phase 4 — 출정식 리허설 + Go/No-Go
7/16(목) 저녁      출정식 — URL 안내·온보딩 권장 (실출석은 7/20부터)
7/20(월)           1일차 — today-slot·출석 실운영
```

| 일자 | 담당 | 할 일 |
|------|------|--------|
| **7/12~13** | AI/개발 | 에뮬 `verify-chunbaek-emulator` 통과 확인, `pre-deploy-test` chunbaek smoke 여부 점검 |
| **7/12~13** | 운영진 | 참가자 실명 **41명** → `chunbaek-s3-names.txt` ✅ |
| **7/14** | 운영진 승인 | season·participant 시드 **dry-run** 검토 → **실행** |
| **7/14~15** | 운영진+개발 | 수동 TC(C·D·E) 전항, 1주차 훈련표 admin 입력 |
| **7/15** | 운영진 | 파일럿 2~3명 실기기 온보딩 |
| **7/16 오전** | 전원 | 출정식 리허설(E1~E3), Go 체크리스트 서명 |

---

## 3. 사전 준비 (테스트 블로커)

아래가 없으면 **수동 E2E는 시작하지 않는다.**

| # | 항목 | 확인 방법 | 상태 |
|---|------|-----------|------|
| P1 | Functions `chunbaek` | ping API | [x] |
| P2 | Hosting | HTTP 200 | [x] |
| P3 | Firestore 백업 | `backup/2026-07-12` | [x] |
| P4 | season_config + slots | 시드 실행 | [x] |
| P5 | participant 41명 | roster API = 41 | [x] |
| P6 | **알파 1 코드 배포** | `deploy-chunbaek.sh` (Node 22) | [ ] |
| P7 | 1주차 훈련표 | admin week=1 | [ ] |
| P8 | 테스트 기기 | iOS/Android | [ ] |

**시드 순서:** [ops-prep §4](../superpowers/specs/2026-07-16-chunbaek-season3-ops-prep.md) — 반드시 `--dry-run` → 승인 → 실행.

---

## 4. Phase 0 — 자동 테스트 (로컬·CI)

### 4.1 에뮬 통합 (`verify-chunbaek-emulator.js`)

**실행 (에뮬 안):**

```bash
cd functions && npm ci
firebase emulators:exec --only functions,firestore \
  "node ../scripts/seed-emulator-chunbaek.js && node ../scripts/verify-chunbaek-emulator.js"
```

**커버리지 (자동):**

| # | 시나리오 | 기대 |
|---|----------|------|
| A01 | `ping` | `ok: true` |
| A02 | `members-roster` | ≥2명 |
| A03 | `create-profile` + `goalRace` | token 발급 |
| A04 | `save-attendance` | seasonAttendCount +1 |
| A05 | `my-profile` without token | 401 |
| A06 | `verify-admin` wrong pw | 401 |
| A07 | `admin-grid` week=1 | slots·members·cells |
| A08 | `admin-set-attendance` | attended true |
| A09 | `admin-week-slots` / `admin-save-week-slots` | saved ≥1 |
| A10 | `admin-import-slots` merge | imported ≥1 |

**통과:** 마지막 줄 `verify-chunbaek-emulator: OK`

### 4.2 pre-deploy (선택·권장)

```bash
bash scripts/pre-deploy-test.sh
```

**통과:** `✅ 전체 통과 — 배포 가능`  
(chunbaek smoke가 runner에 미통합이면 A01~A10만으로 Phase 0 완료 가능 — Task 12 백로그)

---

## 5. Phase 1 — 프로덕션 데이터 검증

시드 실행 **직후** curl·콘솔로 확인.

| # | 검증 | 명령/URL | 기대 | 통과 |
|---|------|----------|------|------|
| B01 | API 헬스 | `curl -s '.../api/chunbaek?action=ping'` | `ok:true` | [x] |
| B02 | 명단 규모 | `curl -s '.../api/chunbaek?action=members-roster'` | `members.length` = **41**, 가나다순 | [x] |
| B03 | 비참가자 제외 | roster에 `participant:false` 인원 없음 | — | [ ] |
| B04 | 시즌 시작일 | Firestore `chunbaek_season_config` | `startDate: 2026-07-20` | [ ] |
| B05 | 1일차 슬롯 | `today-slot`은 **7/20 이전**에 404 또는 「시즌 전」 UX | 앱에서 「아직 시작 전」 등 | [ ] |
| B06 | 98일차 날짜 | slots dayIndex=98 | `date: 2026-10-25` | [ ] |

---

## 6. Phase 2 — 회원 앱 수동 TC

**URL:** https://dmc-attendance.web.app/chunbaek/ (**`?preview=1` 없이**)  
**브라우저:** 시크릿 모드 권장 (캐시·token 초기화)

| TC | 시나리오 | 실행 | 기대 결과 | 통과 |
|----|----------|------|-----------|------|
| **C01** | ① 환영 | 첫 방문 | 환영 화면, 콘솔 에러 없음 | [ ] |
| **C02** | ② 명단 | 스크롤·검색 | participant만 노출, 가나다순 | [ ] |
| **C03** | ② 비참가자 | (가능 시) 비participant doc id 직접 API | create-profile 403/거부 | [ ] |
| **C04** | ③ 프로필·목표 대회 | 춘천/JTBC/기타 각 1회(테스트 계정 3개 또는 reset 후) | `goalRace` 저장, 기타 시 note 표시 | [ ] |
| **C05** | ③ 목표 기록 필수 | 목표 시간 비우고 제출 | 검증 메시지, 저장 안 됨 | [ ] |
| **C06** | ④ 가이드 | 프로필 완료 후 | 가이드 카드, 토요 안내 문구 포함 | [ ] |
| **C07** | ⑤ 홈·시즌 전 | 7/20 이전 | 「시즌 시작 전」 또는 슬롯 없음 UX (깨짐 없음) | [ ] |
| **C08** | 재로그인 | token 삭제 → ② 본인 선택 | ③④ 생략, `link-device` 후 홈 | [ ] |
| **C09** | 다른 사람으로 | 홈에서 전환 | token 삭제, ①부터 | [ ] |
| **C10** | 내 100일 | ③ 완료 후 탭 | 주차 펼침, 1주차 제목·내용(admin 입력분) 표시 | [ ] |
| **C11** | 팀 탭 | 동료 1명 이상 가입 후 | 닉네임·목표·goalRaceLabel·출석 막대 | [ ] |
| **C12** | 나 탭 | 프로필 조회 | goalRaceLabel, 목표 기록, 각오 | [ ] |
| **C13** | 토요 안내 (UI) | preview=1 또는 7/25 토 슬롯 목업 | 동마클+춘백 이중 출석 문구 + 링크 | [ ] |
| **C14** | 모바일 반응형 | iOS/Android 실기기 | 탭·버튼 터치, 키보드 가림 없음 | [ ] |

### 7/20 당일 추가 TC (출정식 이후·개시 전 등록)

| TC | 시나리오 | 기대 | 통과 |
|----|----------|------|------|
| **C15** | 1일차 홈 | `today-slot` dayIndex=1, 훈련 제목 표시 | [ ] |
| **C16** | 출석하기 | `[출석하기]` → 토스트 성공, 주간 N/3 갱신 | [ ] |
| **C17** | 출석 취소·재출석 | 같은 날 토글(정책 허용 시) 또는 재방문 시 attended 유지 | [ ] |
| **C18** | 주간 마감 | 해당 주 일요일 23:59 KST 이후 소급 수정 | 403 또는 UI 비활성 | [ ] |

> **출정식(7/16) 전 필수:** C01~C14. C15~C18은 7/20 전날 또는 당일 오전 재검증.

---

## 7. Phase 3 — 운영진 admin 수동 TC

**URL:** https://dmc-attendance.web.app/chunbaek/admin.html (**preview 없이**)  
**비밀번호:** DMC admin pw (`dmc2008`)

| TC | 시나리오 | 실행 | 기대 결과 | 통과 |
|----|----------|------|-----------|------|
| **D01** | 로그인 | 잘못된 pw → 올바른 pw | 401 후 그리드 진입 | [ ] |
| **D02** | 출석 그리드 week=1 | 1주차 선택 | 참가자 열·7일 슬롯 로드 | [ ] |
| **D03** | 대리 출석 | 미가입자 셀 → 출석 | `admin-set-attendance` 성공, 셀 갱신 | [ ] |
| **D04** | 예외 처리 | 셀 → 예외 | `weekAttendCount`에서 제외(회원 앱 반영) | [ ] |
| **D05** | 훈련 입력 week=1 | [ops-prep §6](../superpowers/specs/2026-07-16-chunbaek-season3-ops-prep.md) 템플릿 입력·저장 | 7행 saved, 회원 `my-timeline` 반영 | [ ] |
| **D06** | 훈련 수정 | 제목 1건 변경 후 재저장 | 회원 홈/내100일 갱신 | [ ] |
| **D07** | 휴무일 변경 차단 | 출석 있는 날 `isProgramOff:true` 시도 | 409 또는 UI 경고 | [ ] |
| **D08** | 주차 전환 | week=2 조회 | 슬롯 7일, 훈련 빈칸 허용 | [ ] |

---

## 8. Phase 4 — 출정식 리허설 (E2E)

출정식 장소/단톡과 동일 조건으로 **2~3명**이 실제 흐름을 밟는다.

| TC | 시나리오 | 참가자 | 기대 | 통과 |
|----|----------|--------|------|------|
| **E01** | 신규 온보딩 전체 | 파일럿 A | ①→⑤ 3분 이내, goalRace 선택 완료 | [ ] |
| **E02** | 운영진 현장 안내 | 운영진 1명 | admin 로그인 → 1주차 훈련표 화면 공유 가능 | [ ] |
| **E03** | URL·문구 | — | 단톡 초안 URL 클릭 시 404/SSL 오류 없음 | [ ] |
| **E04** | (선택) 7/20 출석 리허서 | dev only | admin에서 dayIndex=1 날짜 임시 조정 **하지 않음** — 정책상 7/20부터 |

**출정식 당일 권장 멘트 (검증용):**

- 앱: https://dmc-attendance.web.app/chunbaek/
- **7/20(월)부터** 매일 출석, 지금은 **온보딩만** 미리 해도 됨
- 토요일은 **동마클 출석 + 춘백 출석** 둘 다

---

## 9. Go / No-Go 체크리스트 (7/16 전 서명)

| # | 항목 | 통과 |
|---|------|------|
| G1 | Phase 0 자동 테스트 OK | [ ] |
| G2 | P1~P7 사전 준비 완료 | [ ] |
| G3 | 회원 C01~C14 전항 통과 | [ ] |
| G4 | admin D01~D08 전항 통과 | [ ] |
| G5 | 파일럿 E01~E03 통과 | [ ] |
| G6 | Critical/Blocker 결함 0건 | [ ] |
| G7 | 1주차 훈련표 admin 저장 완료 | [ ] |
| G8 | 운영진 단톡 URL·안내 문구 확정 | [ ] |

**Go:** G1~G8 모두 ✅ → 출정식에서 URL 공유  
**No-Go:** G2(시드)·G3(온보딩)·G4(admin) 중 실패 → **preview 목업만 공유**, 실서비스는 시드·수정 후 재공지

---

## 10. 결함 심각도·대응

| 등급 | 예시 | 출정식 전 대응 |
|------|------|----------------|
| **Blocker** | ping 실패, roster 0명, create-profile 전원 실패 | 시드·배포 롤백, URL 공유 보류 |
| **Critical** | 출석 저장 실패, admin 그리드 빈 화면 | 핫픽스·Functions 재배포, 재테스트 |
| **Major** | goalRace 라벨 누락, 팀 탭 통계 오류 | 출정식 가능, 7/20 전 수정 |
| **Minor** | 문구·스타일, preview 잔존 | 백로그 |

---

## 11. 테스트 계정·데이터 정리

| 용도 | 권장 |
|------|------|
| 파일럿 온보딩 | 운영진 본인 또는 `participant:true` 테스트 2~3명 |
| 잘못 가입 | Firestore에서 `profileComplete:false` + 세션 revoke (확장 API 전까지 수동) |
| 출석 테스트 데이터 | 7/20 전까지 `chunbaek_attendance` 테스트 doc 삭제 또는 테스트 memberId만 사용 |

---

## 12. 산출물·참조

| 파일 | 용도 |
|------|------|
| `scripts/verify-chunbaek-emulator.js` | Phase 0 자동 |
| `scripts/seed-chunbaek-season.js` | Phase 1 시즌·슬롯 |
| `scripts/seed-chunbaek-participants.js` | Phase 1 명단 |
| `scripts/deploy-chunbaek.sh` | **일괄 배포** (Functions → Hosting, Node 22) |
| `scripts/deploy-chunbaek-functions.sh` | Functions만 |
| `scripts/deploy-chunbaek-gallery.sh` | Hosting만 |
| `scripts/lib/firebase-cli.sh` | Node 22 검사·로컬 firebase-tools |

---

## 13. 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-07-12 | 출정식(7/16) 전 테스트 계획 초안 — ops-prep 연동 |
| 2026-07-12 | v0.1.0-alpha.1 — P1~P5·B01~B02 완료, 41명·deploy 스크립트 반영 |
