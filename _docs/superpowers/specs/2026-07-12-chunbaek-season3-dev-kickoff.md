# 춘백 시즌3 — 개발 착수 (Kickoff)

> **작성일:** 2026-07-12  
> **갱신:** 2026-07-12 (v0.1.0-alpha.2 준비)  
> **상태:** **알파** — 출정식(7/16) 전 검증  
> **브랜치:** `cursor/cloud-agent-1783816981460-v32r8`  
> **코드 버전:** `0.1.0-alpha.2` (미배포) · **프로덕션 태그:** `chunbaek-v0.1.0-alpha.1`

---

## 1. SSOT — 어떤 문서를 볼까

| 질문 | 문서 |
|------|------|
| 정책·명단·토요 정모? | [confirmed-decisions.md](./2026-07-12-chunbaek-season3-confirmed-decisions.md) |
| 운영·시드·일정? | [ops-prep.md](./2026-07-16-chunbaek-season3-ops-prep.md) |
| **알파 릴리스·배포?** | [alpha.1](../../releases/chunbaek-v0.1.0-alpha.1.md) · **[alpha.2 (다음)](../../releases/chunbaek-v0.1.0-alpha.2.md)** |
| 출정식 전 테스트? | [pre-departure-test-plan.md](../../testing/2026-07-12-chunbaek-season3-pre-departure-test-plan.md) |
| 제품·데이터 모델? | [PRD](./2026-07-12-chunbaek-season3-attendance-design.md) |
| 운영진 API? | [admin-api.md](./2026-07-12-chunbaek-season3-admin-api.md) |
| 회원 FE? | [fe-tech-spec.md](./2026-07-12-chunbaek-season3-fe-tech-spec.md) + `chunbaek/` |
| 구현 체크리스트? | [mvp-impl.md](../plans/2026-07-12-chunbaek-season3-mvp-impl.md) |

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

### ✅ 완료

| 영역 | 내용 |
|------|------|
| 코드 | 회원·admin API, FE 알파 1 (goalRace, 시즌전 홈, 타임라인·팀·메모) |
| 데이터 | participant **41명**, season_config, slots **100** |
| 검증 | 프로덕션 ping·roster 41 (API) |
| 문서 | ops-prep, 테스트 계획, 릴리스 노트 |
| 버전 | `chunbaek-v0.1.0-alpha.1` 태그 |

### ⏳ 남은 일 (출정식 7/16 전)

| # | 작업 | 담당 |
|---|------|------|
| 1 | **alpha.2 배포** — `bash scripts/deploy-chunbaek.sh` (alpha.1 FE+OG 일괄, Mac **Node 22**) | 운영진 |
| 2 | admin **1주차 훈련표** (7/20~7/26) | 운영진 |
| 3 | 수동 E2E·파일럿 2~3명 | 운영진 |
| 4 | (선택) `pre-deploy-test.sh` chunbaek smoke | 개발 |

---

## 4. 도구 역할 (CLI · gcloud · Firebase MCP)

| 용도 | 권장 도구 |
|------|-----------|
| **Functions·Hosting 배포** | `bash scripts/deploy-chunbaek.sh` (로컬 firebase-tools, Node 22) |
| **Firestore 시드 스크립트** | Mac + `gcloud auth application-default login` |
| **Firestore 조회·export** | **Cursor Desktop + Firebase MCP** (읽기 전용) |
| **members 적용(쓰기)** | API 스크립트 (`members-sync-via-api` 스킬) — MCP 직접 쓰기 비권장 |
| **Cloud Agent** | Firebase MCP **미연결** — 배포·시드는 Mac에서 |

> MCP는 배포 대체가 아니라 **배포 후 데이터 확인**용.

---

## 5. 배포 (사용자 — Mac)

```bash
nvm use 22   # 필수 (Node 24 → firebase-tools 실패)

cd ~/git/dmc_attendance_log
git pull origin cursor/cloud-agent-1783816981460-v32r8

./node_modules/.bin/firebase login --no-localhost   # 최초 1회
bash scripts/deploy-chunbaek.sh
```

상세: [릴리스 노트](../../releases/chunbaek-v0.1.0-alpha.1.md)

---

## 6. 버저닝 (알파)

| 단계 | 태그 예 |
|------|---------|
| 알파 | `chunbaek-v0.1.0-alpha.1` (시드·태그) |
| **다음 배포** | `chunbaek-v0.1.0-alpha.2` ← **코드 준비됨** (OG + alpha.1 FE) |
| 7/20 개시 | `chunbaek-v0.1.0` (alpha 접미사 제거 검토) |

SSOT: `chunbaek/VERSION`

---

## 7. 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-07-12 | kickoff 최초 작성 |
| 2026-07-12 | Task 6·11b 완료 |
| 2026-07-16 | ops-prep — 출정식 7/16, 시작 7/20 |
| 2026-07-12 | **v0.1.0-alpha.2 준비** — OG 실서비스 문구, VERSION bump |
