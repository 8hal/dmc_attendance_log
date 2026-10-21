# 춘천마라톤 응원 보드 주말 리허설

> **For agentic workers:** 이 문서는 구현 계획이 아니다. 이미 브랜치 `cursor/group-event-live-progress-spec-7bd3`(PR 91)에 있는 응원 보드를 2026-10-25 춘천마라톤에서 확인하는 운영 체크리스트다. 새 API·스크랩 주기 변경·D-day 상수 수정·`firebase deploy`는 이 계획의 작업이 아니다. 배포는 사용자가 따로 말할 때만 `.cursor/skills/firebase-deploy/SKILL.md`를 따른다.

**Goal:** 2026-10-25(일) 09:00 춘천마라톤에서, 배번·목표가 있는 풀코스만 조 출발 시각(조를 안 고르면 첫 출발)과 목표 완주로 추정한 위치가 코스·순위·상세에 보이는지 확인한다.

**Architecture:** 위치는 서버 `Date.now()`와 그 러너의 `waves[].startAt`으로 계산한다. 칩 구간이 잡에 없으면 목표 페이스만 쓴다. 토요일 움직임 확인은 에뮬레이터의 별도 대회에서만 하고, 프로덕션 춘천 문서의 `startAt`은 일요일 총성으로만 둔다. 보기 링크는 `eventId`만 있으면 된다.

**Tech Stack:** 숨은 시험 경로 `lab/cheer/index.html`(보드), `lab/cheer/bib.html`(배번·조·목표), `lab/cheer/waves.html`(총무 조 편집), `GET group-events` `cheer-board` / `cheer-runner`. 호스팅 `https://dmc-attendance.web.app`. 에뮬레이터 호스팅 `http://127.0.0.1:5000`, Functions `http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race`.

---

## 할 일 목록 (2026-10-21 기준)

| 상태 | 언제 | 누가 | 할 일 |
|------|------|------|-------|
| ✅ | 10/21 | AI | 프로덕션 춘천 단체 대회 문서 생성. `EVENT_ID` = `evt_2026-10-25_2026`, `eventDate` `2026-10-25`, `gorunningId` `gorunning_2026-10-25_155`(등록 목록에서 숨겨져 중복 등록 안 됨) |
| ✅ | 10/21 | AI | 기록 사이트 확인: **MyResult `https://myresult.co.kr/176`** (2026 춘천마라톤 2026-10-25 공지천, 대회 전이라 No Data). 공식 홈페이지 [대회 기록] 메뉴도 대회 후 열린다 |
| ✅ | 10/21 | AI | 에뮬레이터 리허설 `scripts/qa-cheer-board.sh` 23/23 |
| ☐ | 10/22–23 | 총무 | `group.html` 춘천 카드 ⋮ → **참가자 편집**으로 참가 회원 저장. **한 번만**. 배번 입력이 시작된 뒤에는 다시 저장하지 않는다 |
| ☐ | 10/22–23 | 사용자 | 시험 참가자 고르기: 풀코스 2명 이상(목표 차가 클수록 좋음), 가능하면 10 km 1명 |
| ☐ | 10/23 | 사용자 → AI | “배포해줘”. AI가 pre-deploy-test → 백업 → 커밋 확인 → functions → hosting. 회원 화면은 바뀌지 않는다 |
| ☐ | 10/23 배포 후 | 총무 | `lab/cheer/waves.html?eventId=evt_2026-10-25_2026`에서 조 `출발` `09:00` 저장(배번표에 다른 총성이 있으면 그 시각). 저장 후 지우고 다시 만들지 않는다 |
| ☐ | 10/23 배포 후 | 사용자 | 시험 참가자에게만 `lab/cheer/bib.html?eventId=evt_2026-10-25_2026` 전달. 배번과 목표 완주 입력(조·목표는 선택, 조가 하나면 조 칸은 안 보인다)(버스에서 해도 됨) |
| ☐ | 10/23 배포 후 | 사용자 | `lab/cheer/index.html?eventId=evt_2026-10-25_2026`에서 시험 참가자가 0 km로 보이는지 |
| ☐ | 10/24 | AI(요청 시) | 에뮬레이터 리허설 재실행. 프로덕션 춘천 조 시각은 건드리지 않는다 |
| ☐ | 10/25 08:50 / 09:10 / 09:30 | 사용자 | 4절 체크 (0 km → 약 2.0/1.4 km → 약 6.0/4.2 km) |
| ☐ | 10/25 대회 후 | 총무 | 기록 확정은 기존 흐름: 리포트에서 소스 `myresult`, id `176`으로 스크랩 → 확정. 단체 대회 **기록 소스 칸은 비워 둔다**(myresult는 배번 단체 스크랩 미지원, 넣으면 15:00 자동 스크랩이 오류로 끝난다) |
| ☐ | 결정 필요 | 사용자 | 춘백 S3 목표 대회 D-day: `SEASON_RACE_DATES.chuncheon`이 `2026-10-26`이라 춘백 카드가 하루 늦다. 회원 화면이라 이 PR과 별도로 고칠지 정한다 |

---

## 0. 사실 (이 계획의 전제)

| 항목 | 값 |
|------|----|
| 오늘 | 2026-10-19 (월) |
| 토요일 리허설 | 2026-10-24. 에뮬레이터만. 프로덕션 춘천 문서의 출발 시각을 당기지 않는다 |
| 일요일 본선 | 2026-10-25 09:00 KST, 공지천교. 풀코스 42.195 km 제한 5시간 30분, 10 km 제한 1시간 30분. 출처: chuncheonmarathon.com |
| 조 시각 | 공식 사이트는 기록대별 출발을 두지만, 이 계획을 쓸 때 조별 총성 오프셋은 확인되지 않았다. 배번표에 다른 총성이 없으면 조는 하나, `09:00:00` |
| 코드 위치 | `main`에 없다. 화면은 `lab/cheer/` 아래에만 있고 회원 페이지 어디에서도 링크하지 않는다(`noindex`). 홈·`my-bib.html`·`event-admin.html`·스크래퍼는 `main`과 같다. 일요일 폰 테스트는 이 브랜치의 functions+hosting 배포가 끝난 뒤에만 된다 |
| 회원 기능 호환 | 운영 `my-bib.html`·홈은 계속 배번만 보낸다. 풀코스여도 조·목표를 하나도 안 보내면 `update-bib`는 예전처럼 배번만 저장하고 기존 조·목표는 둔다. 이런 사람은 보드에 없다. 서버에 더한 것은 `group-events`의 `waves`·`cheer-board`·`cheer-runner` subAction뿐이다 |
| 성공 | 목표 페이스 점이 조 출발 전 0 km, 출발 후 아래 식과 ±0.05 km |
| 기록 소스 | 2026 춘천은 MyResult `176`. 배번 단체 스크랩은 `smartchip`·`ohmyrace`·`spct`만 되므로 단체 대회 기록 소스는 비우고, 대회 후 기록은 리포트의 일반 스크랩으로 확정한다 |
| 칩 | 이 시험판은 스크래퍼를 건드리지 않으므로 잡 결과에 구간이 없다. 칩 뱃지는 켜지지 않는다. 뱃지가 없는 것이 1차 성공이다. 2025 춘천 기록 소스는 `myresult:132`였고, 배번 스크랩은 `smartchip` · `ohmyrace` · `spct`만 된다. 스마트칩 파서는 `splits: []`를 줄 수 있다 |
| 스크랩 | `groupEventAutoScrape`는 10분 유지. 세션이 없으면 당일 15:00–15:09 원샷뿐이라 경기 중 칩을 받지 못한다. 주기를 줄이지 않는다 |
| D-day | `functions/lib/chunbaek-handlers.js`의 `SEASON_RACE_DATES.chuncheon`은 `2026-10-26`. 응원 보드는 `race_events.eventDate`와 `waves.startAt`만 본다. 춘백 카드가 월요일에야 “당일”이 되어도 이 리허설의 실패가 아니다 |
| 대회 문서 | 2026-10-21에 만들었다: `evt_2026-10-25_2026` (`eventDate` `2026-10-25`). 고러닝 캐시의 춘천 행 날짜는 25일이 맞다. 26일은 `scripts/discover-events.js`가 붙인 `matchedEvent` 날짜뿐이다. 다시 만들지 않는다 |
| 참가자 | 명단은 `group.html` 카드 **⋮ → 참가자 편집** (`POST` `subAction=participants`). `event-admin` 버스 패널은 버스 명단만 쓴다. 참가자 편집을 배번 입력 **후에** 다시 저장하면 `bib`·`distance`만 남고 `waveId`·`goalFinishSec`가 빠져 보드에서 사라진다 |

추정 거리:

```text
elapsedSec = max(0, floor((nowMs - startMs) / 1000))
km = min(42.195, elapsedSec * 42.195 / goalFinishSec)
```

출발 전이면 `km = 0`, `elapsedSec = 0`. 평균 페이스는 목표 페이스.

리허설 쌍(실제 목표로 바꿔도 된다. 바꾸면 같은 식으로 다시 계산):

| 닉 자리 | 종목 | 목표 | `goalFinishSec` | 출발 10분 | 출발 30분 |
|---------|------|------|-----------------|-----------|-----------|
| 러너A | full | 3:30:00 | 12600 | 2.009 km | 6.028 km |
| 러너B | full | 5:00:00 | 18000 | 1.407 km | 4.220 km |
| 러너C | 10 km | 없음 | 없음 | 보드에 없음 | 보드에 없음 |

10분 시점에 A와 B 차이는 0.603 km다. 코스 점은 0.4 km 안이면 한 덩어리로 센다. 이 쌍은 09:10에도 점 두 개다. 실제 목표 차이가 30분 미만이면 09:10에는 한 덩어리일 수 있고, 그건 실패가 아니다.

계산:

```bash
node -e '
const FULL = 42.195;
const goals = { A: 12600, B: 18000 };
for (const min of [10, 30]) {
  const elapsed = min * 60;
  for (const [name, goal] of Object.entries(goals)) {
    const km = Math.min(FULL, (elapsed * FULL) / goal);
    console.log(min + "min", name, km.toFixed(3));
  }
}
'
```

기대 출력:

```text
10min A 2.009
10min B 1.407
30min A 6.028
30min B 4.220
```

---

## 1. 하지 않는 일

- 프로덕션 `firebase deploy`. 사용자가 “배포”라고 말하기 전에는 실행하지 않는다.
- `SEASON_RACE_DATES.chuncheon` 수정. 카드까지 일요일에 맞추려면 금요일 배포 전에 따로 요청한다.
- 스크랩 cron을 10분보다 짧게 바꾸기.
- 토요일에 진짜 춘천 `race_events`의 `waves[].startAt`을 과거로 두기. 두면 일요일 0 km 확인이 깨지고, 세션을 토요일에 시작하면 `hasEverStartedSession` 때문에 일요일 15:00 원샷도 건너뛴다.
- 2025 문서 `evt_2025-10-26_chuncheon_marathon` 재사용.
- 춘천 단체 대회를 한 번 더 등록하기. `evt_2026-10-25_2026`이 있다.
- 배번·조·목표를 넣은 뒤에 **참가자 편집** 저장을 다시 누르기.
- 응원 링크를 클럽 단톡 밖에 올리기. `cheer-board` JSON에 배번·목표 초·조 출발이 있다. 실명 필드는 없다.

---

## 2. 금요일 2026-10-23 — 프로덕션 대회 문서

배포가 끝난 뒤에만 이 절을 프로덕션에서 한다. 배포 전 확인은 3절 에뮬레이터로 대체한다.

배포를 사용자가 요청하면 그때의 문장은 다음으로 고정한다.

```text
배포 목표: 숨은 시험 경로 lab/cheer/ 의 응원 보드·배번·조 페이지와 cheer-board가 프로덕션에서 열린다
성공 기준: https://dmc-attendance.web.app/lab/cheer/index.html 이 200이고, 단체 대회 eventId로 cheer-board가 runners 배열 JSON을 준다
실패 기준: bash scripts/pre-deploy-test.sh 실패, 또는 기존 홈 카드·기록 확정 흐름이 깨짐
```

순서는 스킬 그대로다. `bash scripts/pre-deploy-test.sh` → `cd functions && node ../scripts/backup-firestore.js` → 커밋이 원격에 있는지 → `firebase deploy --only functions` 다음 `firebase deploy --only hosting`.

- [x] **Step 1: 대회 문서** — 2026-10-21 완료. `EVENT_ID` = `evt_2026-10-25_2026`. `group.html`에 날짜 10월 25일 카드로 보인다.

- [ ] **Step 2: 참가자**

배번을 받기 **전에** `group.html`에서 그 카드의 **⋮ → 참가자 편집**으로 클럽 회원을 저장한다. 버스 패널에만 넣은 사람은 `lab/cheer/bib.html` 닉 목록에 없고 `update-bib`가 `403 not a participant`다.

리허설 최소 인원:

- 풀코스 2명. 목표가 90분 이상 벌어지면 09:10 점 분리 확인이 쉽다. 실제 목표가 더 가까우면 식을 다시 계산하고, 분리는 차이가 0.4 km를 넘는 시각에 본다.
- 10 km 1명. 보드에 없어야 한다.
- 풀코스 1명은 버스에서처럼 배번만 저장하고 목표를 비운다. 배번은 저장되고 보드에는 없다. 나중에 같은 페이지에서 목표를 채워 저장하면 보드에 오른다.

이 저장 이후에는 **참가자 편집 저장을 다시 누르지 않는다.** 다시 누르면 배번과 종목만 남고 조·목표가 지워진다.

- [ ] **Step 3: 조 하나 저장**

`group.html` 카드 본문을 누른다. 주소가 `event-admin.html?eventId=`로 바뀌고, 그 쿼리가 `EVENT_ID`다. 카드 글자 자체는 id가 아니다.

`https://dmc-attendance.web.app/lab/cheer/waves.html?eventId=EVENT_ID`를 연다. 이름 `출발`, 시각 `09:00`, 운영 비밀번호를 넣고 **조 저장**. `event-admin.html`에는 조 편집이 없다. 비밀번호를 curl·단톡에 붙여 넣지 않는다.

저장이 되면 조가 화면에 남는다. 조를 지웠다 다시 저장하면 id가 바뀌어, 이미 고른 러너는 첫 출발 시각으로 계산된다. 배번 입력 전에 조를 확정한다.

배번표에 총성이 09:00이 아니면 그 시각으로 조를 나눈다. 한 사람이 한 조다. 클럽 공통 출발은 쓰지 않는다.

- [x] **Step 4: 기록 소스** — 2026-10-21 확인. MyResult `https://myresult.co.kr/176`. 배번 단체 스크랩 미지원 소스라 **1 준비**의 기록 소스 칸은 비운다. **4 결과 가져오기**의 스크랩도 누르지 않는다(`400`). 응원 보드는 소스 없이 목표 페이스로 동작한다.

- [ ] **Step 5: 배번 입력 안내**

조·목표를 넣을 시험 참가자에게만 `https://dmc-attendance.web.app/lab/cheer/bib.html?eventId=EVENT_ID`를 따로 보낸다. 다른 회원은 평소처럼 홈·`my-bib.html`로 배번만 넣는다. 그 사람들은 배번만 저장되고 보드에는 없다.

풀코스: 닉 → 칩 `풀` → 배번 → (선택) 목표 방식 `완주 시각` → 시·분·초. 3:30:00이면 시 `3`, 분 `30`, 초 `0`. 조가 하나면 조 칸은 숨고, 둘 이상이면 고르지 않아도 첫 출발 시각으로 계산한다. 시·분·초를 비우면 배번만 저장되고 “목표 기록을 넣으면 응원 보드에 나옵니다”가 뜬다. 조 등록 전에 목표를 넣어도 저장되고, 조가 등록되면 보드에 나온다. 버스에서 배번만 넣고 목표는 나중에 넣어도 된다. 목표 허용 범위는 1시간–10시간.

10 km: 칩 `10K`, 배번만. 조·목표 칸은 풀일 때만 나온다.

- [ ] **Step 6: 보기 링크**

`https://dmc-attendance.web.app/lab/cheer/index.html?eventId=EVENT_ID`

닉 없이 열린다. 시험 중이므로 시험 참가자와 응원 확인할 사람에게만 보낸다. 배번과 목표가 보이므로 클럽 밖에는 올리지 않는다.

---

## 3. 토요일 2026-10-24 — 에뮬레이터 리허설

프로덕션 춘천 문서는 열어서 저장하지 않는다. 에뮬레이터 대회 날짜는 토요일이다. `startAt`이 `eventDate`와 같아야 하기 때문이다.

빠른 경로: 에뮬레이터와 회원 시드(Step 1) 다음 `bash scripts/qa-cheer-board.sh`. 오늘 KST 날짜로 버릴 대회를 만들고 조 출발을 실행 10분 전으로 둔 뒤 Step 2–4를 검사한다. `API`가 `127.0.0.1`/`localhost`가 아니면 멈춘다. 끝에 찍힌 `lab/cheer/index.html` 주소로 Step 5 화면을 본다. 조 등록 전 버스에서 배번만 넣고 나중에 목표를 넣는 순서도 본다. 2026-10-21 실행 결과 23/23 통과. 아래 수동 절차는 스크립트가 실패할 때 원인을 찾는 용도다.

- [ ] **Step 1: 에뮬레이터**

```bash
firebase emulators:start --only functions,hosting,firestore,storage --project dmc-attendance
```

다른 터미널:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator-members-2026-03-31.js
```

호스팅 `http://127.0.0.1:5000`. API는 페이지가 `127.0.0.1`이면 에뮬레이터 Functions를 본다. pubsub 함수가 “emulator is not running”이라고 해도 무시한다.

- [ ] **Step 2: 버릴 대회와 참가자**

에뮬레이터의 고러닝 캐시는 비어 있으므로 `group.html` 등록 목록에서 대회가 나오지 않는다. promote로 토요일 문서를 만든다.

```bash
DRY_ID=$(curl -s -X POST 'http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race?action=group-events' \
  -H 'content-type: application/json' \
  -d '{
    "subAction": "promote",
    "gorunningId": "dry-chuncheon-cheer",
    "eventName": "춘천 응원 리허설",
    "eventDate": "2026-10-24"
  }' | jq -r .canonicalEventId)
echo "$DRY_ID"
```

`echo`가 `null`이면 promote가 실패한 것이다. 다음 `jq`보다 먼저 이 변수가 있어야 한다. `all-members`는 닉 가나다순이라 문서 id `mem_001`이 앞의 세 명과 같지 않다. 응답의 `id`를 그대로 `memberId`로 쓴다.

```bash
curl -s 'http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race?action=all-members' \
  | jq --arg id "$DRY_ID" '{
      subAction: "participants",
      canonicalEventId: $id,
      participants: [.members[:3][] | {memberId:.id, nickname, realName}]
    }' > /tmp/cheer-dry-participants.json
jq -r '.participants[].nickname' /tmp/cheer-dry-participants.json
curl -s -X POST 'http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race?action=group-events' \
  -H 'content-type: application/json' \
  --data-binary @/tmp/cheer-dry-participants.json
```

닉 출력 첫 줄이 풀 3:30:00, 둘째 줄이 풀 5:00:00, 셋째 줄이 10 km다. 기대: `{"ok":true}`. 이후 이 대회에서 **참가자 편집 저장을 다시 누르지 않는다.**

조를 저장한다. 시각은 **확인 시점으로부터 10분이 이미 지난 시각**으로 맞춘다. 예: 지금 15:20이면 `2026-10-24T15:10:00+09:00`. 날짜는 `2026-10-24`여야 한다.

`START`는 그 시각이다. 지금보다 과거여야 한다. 아직 안 지난 시각이면 두 사람 모두 0 km라 순위 비교가 실패로 보인다. 날짜가 토요일이 아니면 조 저장은 `400`이다.

```bash
START='2026-10-24T15:10:00+09:00'
curl -s -X POST 'http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race?action=group-events' \
  -H 'content-type: application/json' \
  -d "$(jq -n --arg id "$DRY_ID" --arg start "$START" '{
    subAction: "waves",
    ownerPw: "dmc2008",
    eventId: $id,
    waves: [{ id: "", name: "출발", startAt: $start }]
  }')"
```

`ownerPw`는 에뮬레이터 관리자 비밀번호 `dmc2008`. 응답 `waves[0].id`가 러너가 고를 조 id다.

- [ ] **Step 3: 배번 페이지**

`http://127.0.0.1:5000/lab/cheer/bib.html?eventId=DRY_ID`

- 닉 첫 줄: 칩 `풀`, 배번 `1001`, 조 `출발`, 완주 시각 시 `3` 분 `30` 초 `0`
- 닉 둘째 줄: 칩 `풀`, 배번 `1002`, 조 `출발`, 시 `5` 분 `0` 초 `0`
- 닉 셋째 줄: 칩 `10K`, 배번 `2001`. 조·목표 칸이 숨는다.

`http://127.0.0.1:5000/my-bib.html?eventId=DRY_ID`는 바뀌지 않은 원래 페이지다. 거기서 배번을 다시 저장해도 조·목표는 남는다. 배번 입력에 시간이 걸리면 출발 후 10분이 더 지난다. 2.009 / 1.407은 출발 10분 예시이고, 합격은 다음 식이다.

- [ ] **Step 4: 보드 숫자**

```bash
curl -s --get "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race" \
  --data-urlencode "action=group-events" \
  --data-urlencode "subAction=cheer-board" \
  --data-urlencode "eventId=$DRY_ID"
```

닉 쿼리는 붙이지 않는다. 기대:

- `ok: true`
- `runners` 길이 2. 닉 셋째 줄 없음
- 각 행의 `km`이 `min(42.195, elapsedSec * 42.195 / goalFinishSec)`와 0.05 안. `elapsedSec`와 `goalFinishSec`는 그 응답에 있다. 배번을 넣는 동안 시간이 지나도 이 식으로 합격이다
- `goalFinishSec` 12600인 사람이 18000인 사람보다 `km`이 크다
- `chip: false`
- JSON 전체에 `realName` 키가 없음

상세:

```bash
curl -s --get "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race" \
  --data-urlencode "action=group-events" \
  --data-urlencode "subAction=cheer-runner" \
  --data-urlencode "eventId=$DRY_ID" \
  --data-urlencode "runnerNickname=$(jq -r '.participants[0].nickname' /tmp/cheer-dry-participants.json)"
```

기대: `runner.bib` `1001`, `runner.goalFinishSec` `12600`, `splits` `[]`, `realName` 없음. 닉 셋째 줄은 `404`.

- [ ] **Step 5: 화면**

`http://127.0.0.1:5000/lab/cheer/index.html?eventId=DRY_ID`

- 코스 눈금: 0, 5, 10, 15, 20, 25, 30, 35, 38, 40, 마지막 글자는 `42.2`. 30·38은 고정 눈금이다.
- 점 두 개가 코스 선 위에 있다. 한 점을 누르면 그 닉 상세. 상세에 목표, 배번, 구간(비어 있음). 실명 없음.
- 순위: 닉, 조, 추정 km, 경과, 평균 페이스, 칩. 칩은 꺼져 있음.
- 새로고침 없이 30초 뒤 요청이 한 번 더 간다. 탭을 백그라운드로 보내면 멈춘다.
- `event-home.html?eventId=DRY_ID`에는 응원 탭이 없고, 배번 버튼은 `my-bib.html`로 간다. 회원 화면은 `main`과 같다.

- [ ] **Step 6: 끝나기**

에뮬레이터를 끈다. 프로덕션 데이터는 없다. `DRY_ID`를 일요일 단톡에 붙이지 않는다.

---

## 4. 일요일 2026-10-25 — 본선

전제: 금요일 배포가 끝났고, 프로덕션 `EVENT_ID`의 조가 `2026-10-25T09:00:00+09:00`(또는 배번표 총성)이다. 배포가 없으면 이 절은 하지 않는다. 에뮬레이터 결과를 본선 결과로 적지 않는다.

폰으로 `https://dmc-attendance.web.app/lab/cheer/index.html?eventId=EVENT_ID`를 연다.

- [ ] **08:50** `runners` 중 입장 조건(풀 + 배번 + 목표, 조는 없으면 첫 출발)을 채운 사람만 있고, `km` 0, `elapsedSec` 0. 10 km와 목표가 빈 풀코스는 없다. 칩 뱃지 없음. 실명 없음.
- [ ] **09:10** 목표가 3:30:00과 5:00:00이면 km는 약 2.009와 1.407, 차이 0.6 km라 점이 둘이다. 다른 목표면 0절의 식 ±0.05 km. 09:00 이전이면 아직 0 km인데, 그때는 조 시각이 09:00이 아닌 것이다. 배번표와 맞으면 식을 그 시각으로 다시 계산한다. 맞추려고 `startAt`을 당기지 않는다.
- [ ] **09:30** 3:30:00은 약 6.028 km, 5:00:00은 약 4.220 km. 순위는 km가 큰 사람이 위다. 30 km 눈금은 아직 비어 있다. 4시간 목표(14400초)는 이 시각에 약 5.274 km다.
- [ ] **홈** `event-home.html?eventId=EVENT_ID`는 평소와 같다. 응원 탭·링크가 없고 버스·기록 확인 카드가 그대로다.
- [ ] **칩** 해당 없음. 춘천은 MyResult라 단체 배번 스크랩을 돌리지 않는다. 칩 뱃지는 켜지지 않는다.
- [ ] **완주 후** 넷타임이 잡에 들어가면 그 러너는 42.195 km에서 경과가 멈추고 평균 페이스는 `넷타임 / 42.195`다. 넷타임이 없으면 목표 완주 초에 멈춘다. 10 km 러너는 끝까지 표에 없다.

실패로 보는 것:

- 08:50에 이미 km가 0보다 큼 (조 날짜·시각이 일요일 총성이 아님)
- 10 km 또는 목표 없는 풀코스가 `runners`에 있음
- `cheer-board` 또는 `cheer-runner` JSON에 `realName`
- 닉 없이 응원 URL이 403
- 홈·`my-bib.html` 등 회원 화면에 응원 탭이나 `lab/cheer` 링크가 보임
- 두 목표의 km가 식과 0.05 km보다 더 벌어짐

실패로 보지 않는 것:

- 칩 뱃지가 없음
- 09:10에 목표가 비슷한 두 사람이 점 하나에 숫자 2로 모임
- 춘백 D-day 카드가 10월 26일을 가리킴
- 15:00 자동 스크랩이 칩을 못 채움

---

## 5. 일요일 아침 한 장

1. 응원 링크는 `lab/cheer/index.html?eventId=EVENT_ID` 하나. 시험 참가자에게만 보낸다.
2. 08:50에 전원 0 km인지 본다.
3. 09:30에 빠른 목표가 느린 목표보다 앞에 있는지만 본다. 숫자는 0절 식.
4. 30 km·38 km 눈금은 장식이다. 사람은 그 근처에 점이 올 때 코스에서 찾는다.
5. 칩이 없어도 목표 페이스 점을 믿는다.
6. 조 시각과 스크랩 주기는 당일에 바꾸지 않는다.
