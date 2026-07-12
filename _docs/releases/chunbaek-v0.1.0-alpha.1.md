# 춘백 S3 v0.1.0-alpha.1

> **릴리스일:** 2026-07-12 (KST)  
> **단계:** **알파** — 출정식(7/16) 전 실사용 검증  
> **브랜치:** `cursor/cloud-agent-1783816981460-v32r8`  
> **Git 태그:** `chunbaek-v0.1.0-alpha.1`

---

## 배포 목표

춘백 S3 MVP를 프로덕션에 **한 번에** 올려, 41명 participant·100슬롯 시드 이후 회원·운영진 실 API E2E를 검증한다.

## 성공 기준

| # | 확인 |
|---|------|
| 1 | `curl .../api/chunbaek?action=ping` → `ok:true` |
| 2 | `members-roster` → **41명** |
| 3 | 시즌 전 홈 → **7/20 시작 · D-N** 카드 (42일차·4월 목업 아님) |
| 4 | 내 100일 → **주간만**, 현재 주차 이하만 |
| 5 | 팀 → **프로필 완료자만** |
| 6 | 출석 메모 → **내 100일**에 표시 |
| 7 | admin → 그리드·훈련 입력 동작 |

## 실패 기준 (롤백 검토)

- 온보딩·명단 불가, roster 0명, Functions 5xx 지속

---

## 포함 변경 (이번 알파 번들)

### 인프라·데이터
- Functions `chunbaek` + Hosting `/chunbaek/`
- participant 41명 시드 (`batch.update` 수정 포함)
- season_config + slots 100건 (7/20~10/27)
- 배포 스크립트: `deploy-chunbaek-functions.sh`, `deploy-chunbaek-gallery.sh`, `deploy-chunbaek.sh`

### 회원 앱
- 온보딩 + **goalRace** (춘천/JTBC/기타)
- **시즌 시작 전 홈** (D-day, 출석 버튼 숨김)
- 프로덕션 API 실패 시 목업 자동 전환 **제거**
- **내 100일:** 월간/시즌 탭 제거, 현재 주차 이후 숨김
- **출석 메모** → 내 100일·모달 표시
- **팀:** `profileComplete` 멤버만

### 운영진
- admin API 6개 + admin.html 실연동

### 문서
- ops-prep, 출정식 전 테스트 계획, 참가자 명단 41명

### 미포함 (알파 이후)
- 사진 업로드 (UI disabled)
- 메모 수정·홈 재표시
- 월간/시즌 타임라인
- admin 확장 API 3개

---

## 배포 절차 (사용자 실행)

**전제:** Node **18·20·22** (Node 24는 firebase-tools 미지원). Mac: `nvm use 22`

```bash
cd ~/git/dmc_attendance_log
git fetch origin
git checkout cursor/cloud-agent-1783816981460-v32r8
git pull origin cursor/cloud-agent-1783816981460-v32r8

# Firebase 로그인 (최초 1회)
./node_modules/.bin/firebase login --no-localhost
# (스크립트가 firebase-tools를 루트 node_modules에 자동 설치)

# 1. 백업 (이미 했으면 생략 가능, 권장)
cd functions && node ../scripts/backup-firestore.js && cd ..

# 2. 춘백 일괄 배포 (Functions → Hosting)
bash scripts/deploy-chunbaek.sh

# 3. 검증
curl -s 'https://dmc-attendance.web.app/api/chunbaek?action=ping'
curl -s 'https://dmc-attendance.web.app/api/chunbaek?action=members-roster' | python3 -c "import sys,json; print('roster', len(json.load(sys.stdin).get('members',[])))"
```

**태그:** 이미 생성됨 `chunbaek-v0.1.0-alpha.1`. 재배포만 하면 태그 재생성 불필요.

> `deploy-chunbaek.sh`는 `scripts/lib/firebase-cli.sh`로 Node 22 검사·로컬 `firebase-tools` 설치를 처리한다.  
> Firestore 시드는 Firebase CLI와 별개 — `gcloud auth application-default login` 필요.

---

## 배포 상태 (2026-07-12)

| 항목 | 상태 |
|------|------|
| Git 태그 `chunbaek-v0.1.0-alpha.1` | ✅ 푸시됨 |
| Firestore 시드 (41·100슬롯) | ✅ |
| API ping·roster 41 | ✅ |
| **알파 1 FE+Functions 번들 Mac 배포** | ⏳ Node 22 + `firebase login` 후 `deploy-chunbaek.sh` |

---

## 도구 참고

| 작업 | 도구 |
|------|------|
| 배포 | Mac CLI `scripts/deploy-chunbaek.sh` (Node 22) |
| 시드 | `gcloud auth application-default login` + Node 스크립트 |
| 사후 조회 | Cursor Desktop Firebase MCP (선택) |

## 버저닝 (알파)

| 규칙 | 예 |
|------|-----|
| 형식 | `chunbaek-v{MAJOR}.{MINOR}.{PATCH}-alpha.{N}` |
| **알파** | 출정식~7/20 개시 전, 운영진·파일럿 검증 |
| 다음 | `alpha.2` = 알파 핫픽스, `v0.1.0` = 7/20 정식 개시 |
| 베타 | 전원 온보딩·1주차 출석 안정 후 |
| 정식 | 100일 시즌 중 운영 안정화 후 `v1.0.0` 검토 |

`chunbaek/VERSION` 파일 = 현재 춘백 앱 버전 SSOT.

---

## URL

| 용도 | URL |
|------|-----|
| 회원 | https://dmc-attendance.web.app/chunbaek/ |
| 운영진 | https://dmc-attendance.web.app/chunbaek/admin.html |
| 목업 | https://dmc-attendance.web.app/chunbaek/?preview=1 |
