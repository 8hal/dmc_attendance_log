# 대회 홈 배번 키패드 저장 UX

**상태:** 리뷰 요청 (대화 2026-08-30, 대상 정정)  
**대상 화면:** `event-home.html?eventId=evt_2026-09-05_23_dmz` (철원 DMZ 대회 홈)  
**범위:** `event-home.html` 프로필 카드가 `bib`일 때 (`#profileCard` → `#profileBibForm`)  
**관련:** `_docs/superpowers/specs/2026-08-23-event-member-day-ux-design.md`

이 문서는 `my-bib.html`이 아니다. 그 페이지는 레거시 단독 배번 입력이고 이번 문의 대상이 아니다.

## 목표

닉네임을 고른 뒤 홈 카드에서 배번을 숫자 키패드로 치고, 키패드 오른쪽 **이동/입력/완료**를 누르면 저장되게 한다.  
종목 칩과 배번을 **별도 화면으로 나누지 않는다.**

문의에 첨부된 화면이 이 카드다.

- 헤더: 제23회 철원DMZ국제평화마라톤 · 2026-09-05 · 닉 칩
- 안내: 대회 기록 자동 수집을 위해 배번과 종목을 입력해주세요.
- 배번 칸 + 종목 칩(풀/하프/10K/…) + `저장`
- 배번 포커스 중 안드로이드 숫자 키패드, 오른쪽 키가 **이동**

## 배경

프로덕션 `event-home.html`과 로컬이 같은 마크업이다.

```html
<div id="profileBibForm">
  <label class="profile-label" for="profileBib">배번</label>
  <input id="profileBib" class="profile-input" inputmode="numeric" autocomplete="off" />
  <div class="dist-chips" id="profileDistChips"></div>
  <button type="button" class="today-cta" id="profileBibSave">저장</button>
</div>
```

카드 상태 `bib`는 `EventHomeAction.resolveProfileCard`가 만든다. 참가자에 배번 또는 종목이 없거나, 「배번 수정」/`아니에요`로 `intent=reject`일 때다.

저장은 `#profileBibSave` 클릭 → `submitUpdateBib`만 된다. `<form>`도 `enterkeyhint`도 `Enter` 핸들러도 없다.

그래서 안드로이드 숫자 키패드는 제출이 아니라 **다음 칸으로 이동**으로 보고 버튼이 **이동**이 된다. 눌러도 `submitUpdateBib`가 호출되지 않는다. 키패드가 종목 칩과 `저장`을 가린다. 종목(풀)이 이미 선택된 상태에서도 숫자만 치고 키패드를 눌러서는 끝나지 않는다.

## 결론 (권장)

**이 홈 카드 안에서 키패드 확인을 저장에 연결한다. 종목/배번 화면을 나누지 않는다.**

1. 첨부 화면처럼 종목이 이미 고른 경우가 많다. 필요한 동작은 “키패드 확인 = 저장”이다.
2. 홈 카드는 지금 할 일 하나다. 배번 입력이 그 일이다. 종목은 같은 카드의 보조 필드다.
3. 화면을 나누면 뒤로 가기·중간 이탈이 늘고, 신규 라우트도 필요해진다.
4. 키패드가 칩을 가리는 문제는 종목이 비어 있을 때만 남는다. 그때는 키패드를 닫고 칩을 보여 준다.

## 검토한 대안

### A. 같은 홈 카드 + 키패드 저장 (권장)

`#profileBibForm` 유지. 키패드 확인 → 배번·종목이 있으면 `submitUpdateBib`.

### B. 같은 카드에서 종목 → 배번 순서

1단계 칩만, 2단계 배번+키패드. 종목이 이미 있으면 1단계 생략.  
키패드가 칩을 가리지는 않지만, 카드 안 상태가 늘고 A만으로 목표를 달성한다. **이번 범위 밖.**

### C. 종목 화면 / 배번 화면 분리

홈 카드 모델과 어긋난다. **채택하지 않음.**

## 동작

### 키패드

- `#profileBib`에 `enterkeyhint="done"`을 넣는다. 안드로이드 **이동**이 **완료/입력** 쪽으로 바뀌는 힌트다. OS가 문구를 보장하지는 않는다.
- `#profileBibForm`을 `<form>`으로 감싼다. `submit`에서 `preventDefault` 후 `submitUpdateBib(activeIdentity)`.
- 칩·저장 버튼은 `type="button"`을 유지해 form submit을 가로채지 않게 한다.
- 키패드 확인과 `Enter`는 **form `submit` 한 경로**만 쓴다. `#profileBib`에 별도 Enter 리스너를 또 두면 `submitUpdateBib`가 두 번 호출된다 (`isSavingBib`는 성공 경로만 막는다).
- form `submit`이 IME `isComposing`이면 무시한다.
- `inputmode="numeric"`은 유지한다. `type="number"`로 바꾸지 않는다.
- `enterkeyhint="done"`은 힌트다. 일부 안드로이드는 여전히 **이동**으로 보일 수 있다. 그 키가 form submit을 일으키면 된다.

### 저장 조건

기존 `submitUpdateBib` 규칙을 그대로 쓴다. API는 `group-events` + `subAction=update-bib` (`bib`, `distance`).

| 배번 | 종목 | 키패드 확인 / Enter / 저장 버튼 |
|------|------|----------------------------------|
| 있음 | 있음 | `update-bib` 호출 |
| 없음 | 있음 | 토스트: 배번과 종목을 넣어 주세요. 저장 안 함 |
| 있음 | 없음 | 같은 토스트. `#profileBib` 블러로 키패드를 닫아 칩이 보이게 함 |
| 없음 | 없음 | 같은 토스트. 블러 |

종목만 고르고 배번이 비어 있으면 키패드 확인으로 저장하지 않는다.

### 화면에 남는 것

- 종목 칩과 `저장` 버튼은 그대로 둔다. 키패드가 없는 기기·키패드를 닫은 뒤에도 저장할 수 있어야 한다.
- 종목 칩 탭만으로 저장하지 않는다.
- 참가자에 이미 정규 종목이 있으면 지금처럼 칩을 미리 고른다.

## API

변경 없음.

## 제외

- `my-bib.html` (레거시 단독 배번 페이지. 이번 문의 대상 아님)
- `group-detail.html` 운영진 인라인 배번 편집
- 종목/배번 wizard·별도 페이지
- 신규 HTTP API
- `wait`(배번 페이스) / `pending` / `manual` / `confirmed` 카드
- 종목 칩 탭 즉시 저장
- 배번만 있고 종목 없이 저장

## 검증

- 배번+종목 있는 상태에서 `#profileBib` `Enter` → `submitUpdateBib`가 **한 번** 호출된다.
- 배번 있고 종목 없이 `Enter` → `update-bib` 호출 없음, 기존 토스트, `#profileBib` 블러.
- 배번 없고 종목만 있는 상태에서 `Enter` → 저장 호출 없음, 기존 토스트.
- `inputmode="numeric"`, `enterkeyhint="done"`이 마크업에 있다.
- form `submit`이 페이지를 리로드하지 않는다.
- `#profileBibSave` 클릭 저장은 유지된다.

브라우저 실기는 구현 후 해당 URL에서 확인한다. 단위 테스트는 마크업·submit 한 경로·저장 가드를 잠근다.
