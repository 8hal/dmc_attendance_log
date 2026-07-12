# 춘백 시즌3 — 개발 착수 (Kickoff)

> **작성일:** 2026-07-12  
> **상태:** 개발 진행 중  
> **브랜치:** `cursor/cloud-agent-1783816981460-v32r8`

---

## 1. SSOT — 어떤 문서를 볼까

| 질문 | 문서 |
|------|------|
| 정책·명단·토요 정모? | [confirmed-decisions.md](./2026-07-12-chunbaek-season3-confirmed-decisions.md) |
| 제품·데이터 모델? | [PRD](./2026-07-12-chunbaek-season3-attendance-design.md) |
| 운영진 API? | [admin-api.md](./2026-07-12-chunbaek-season3-admin-api.md) |
| 회원 FE·목업? | [fe-tech-spec.md](./2026-07-12-chunbaek-season3-fe-tech-spec.md) + `chunbaek/*.html` |
| **코딩 순서·체크리스트?** | [mvp-impl.md](../plans/2026-07-12-chunbaek-season3-mvp-impl.md) |
| API 호출 패턴? | `_docs/development/api-patterns.md` |

**새 대형 테크 스펙은 쓰지 않음.** 목업 + 위 문서로 충분.

---

## 2. DMC와 충돌 없음 (요약)

| | DMC | 춘백 |
|--|-----|------|
| URL | `/`, `attendance-v2.html` … | `/chunbaek/` |
| API | `/api/race` | `/api/chunbaek` |
| 출석 DB | `attendance` | `chunbaek_attendance` |
| 회원 | `members` 루트 | `members.chunbaekS3` merge만 |

---

## 3. 완료 vs 남은 일 (2026-07-12)

### ✅ 완료 (코드·목업)

| Milestone | 산출물 |
|-----------|--------|
| M1 | `firebase.json` rewrite, `firestore.rules`, `exports.chunbaek`, auth, 온보딩 API |
| M2 | `save-attendance`, `my-timeline`, `team-summary`, `chunbaek-stats.js` |
| M4 (△) | 회원 SPA 목업 `?preview=1`, 내 100일 훈련 B(제목+내용+모달) |
| M5 (△) | `admin.html` 목업 Hosting 배포됨 |
| **M6 (△)** | **`chunbaek-admin.js` 6개 API + `admin.js` 실 API 연동** |
| — | `seed-emulator-chunbaek.js`, `verify-chunbaek-stats.js`, `verify-chunbaek-emulator.js` (+ admin smoke) |

### ❌ 남은 일 (이번 스프린트)

| 순서 | Task | 내용 |
|------|------|------|
| ~~**1**~~ | ~~**Task 6**~~ | ~~운영진 API~~ **코드 완료** |
| ~~2~~ | ~~Task 11b~~ | ~~`admin.js` 실 API 연동~~ **코드 완료** |
| **3** | 배포 | `functions:chunbaek` 배포 (사용자 실행) |
| 4 | 시드 | 프로덕션 participant 40명 + 슬롯 |
| 5 | Task 8~10 | 회원 앱 `preview` 없이 실 API E2E |
| 6 | Task 12 | `pre-deploy-test.sh` + chunbaek smoke |
| 7 | **테스트** | [출정식 전 테스트 계획](../../testing/2026-07-12-chunbaek-season3-pre-departure-test-plan.md) — **7/16 전 Go** |

---

## 4. 개발 순서 (확정)

```
Task 6 admin API 구현
  → verify-chunbaek-emulator admin smoke
  → admin.js API 연동
  → (사용자) functions 배포
  → participant·슬롯 시드
  → 회원 SPA 실데이터 E2E
  → pre-deploy 전체
```

---

## 5. 목업 ↔ 구현 갭

| 항목 | 목업 | 실구현 시 |
|------|------|-----------|
| 회원 API | `api.js` mock fallback | `preview` 없을 때 API만, 실패 시 mock **끄기** 검토 |
| admin | `admin.js` 가상 데이터 | `adminGet`/`adminPost` + `adminPw` |
| Functions | Hosting만 배포됨 | `chunbaek` function 배포 필요 |
| 홈 「이번 주 훈련」 A | 보류 | — |

---

## 6. 배포 (사용자)

```bash
# Functions 먼저
npx firebase-tools@13.29.1 deploy --only functions:chunbaek --project dmc-attendance

# Hosting (정적·목업)
bash scripts/deploy-chunbaek-gallery.sh
```

배포 전: `bash scripts/pre-deploy-test.sh` (Task 12 완료 후)

---

## 7. 회원 훈련 보기 (확정)

- **B 필수:** 내 100일 — 제목+내용, 탭→모달 (FE 목업 반영)
- **A 선택:** 홈 이번 주 카드 — 보류

---

## 8. 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-07-12 | kickoff 최초 작성, Task 6 착수 |
| 2026-07-12 | Task 6·11b 코드 완료 (`chunbaek-admin.js`, admin.js API 연동) |
| 2026-07-16 | 운영 준비: 출정식=7/16, **시작=7/20** — [ops-prep.md](./2026-07-16-chunbaek-season3-ops-prep.md) |
