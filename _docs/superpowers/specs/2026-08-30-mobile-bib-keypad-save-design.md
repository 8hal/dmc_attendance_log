# 모바일 배번 키패드 저장 UX

**상태:** 리뷰 요청 (대화 2026-08-30)  
**범위:** `event-home.html` 프로필 카드 `bib` 상태 (`#profileBibForm`)만  
**관련:** `_docs/superpowers/specs/2026-08-23-event-member-day-ux-design.md`, `_docs/superpowers/specs/2026-04-18-self-service-bib-input-design.md`

## 목표

모바일에서 배번을 숫자 키패드로 친 뒤, 키패드 오른쪽 **이동/입력/완료**를 누르면 저장되게 한다.  
종목과 배번을 **별도 화면으로 나누지 않는다.**

## 배경

지금 `#profileBibForm`은 한 카드에 배번 입력 + 종목 칩 + `저장` 버튼이 같이 있다.

```html
<input id="profileBib" class="profile-input" inputmode="numeric" autocomplete="off" />
<div class="dist-chips" id="profileDistChips"></div>
<button type="button" class="today-cta" id="profileBibSave">저장</button>
```

저장은 `#profileBibSave` 클릭만 된다. `Enter` 핸들러도 `<form>`도 `enterkeyhint`도 없다.

그래서 안드로이드 숫자 키패드는 제출이 아니라 **다음 필드로 이동**으로 해석하고, 버튼 문구가 **이동**이 된다. 눌러도 `submitUpdateBib`가 호출되지 않는다. 키패드가 종목 칩·저장 버튼을 가리므로, 이미 종목을 고른 상태에서도 “숫자 입력 → 키패드 확인”만으로는 끝나지 않는다.

레거시 `my-bib.html`은 `#bibInput`에서 `Enter` → `saveBib()`가 이미 있다. 홈 카드만 빠져 있다.

## 결론 (권장)

**같은 카드에 종목+배번을 두고, 키패드 확인을 저장에 연결한다.**

플로우를 두 단계·두 페이지로 나누지 않는 이유:

1. 스크린샷처럼 종목이 이미 선택된 경우가 많다. 필요한 동작은 “키패드 확인 = 저장” 한 가지다.
2. 홈 카드는 “지금 할 일 하나”다. 배번 입력은 그 하나의 일이다. 종목은 그 안의 보조 필드다.
3. 화면을 나누면 뒤로 가기·중간 이탈·상태 복원이 늘고, 신규 API나 라우트도 필요해진다.
4. 키패드가 칩을 가리는 문제는 **종목 미선택 시에만** 남는다. 그때는 키패드를 닫고 칩을 보여 주면 된다.

## 검토한 대안

### A. 같은 화면 + 키패드 저장 (권장)

한 카드 유지. 키패드 확인 → 배번·종목이 있으면 `submitUpdateBib`.  
구현이 작고, 레거시 `my-bib.html`과 맞는다.

### B. 같은 카드에서 종목 → 배번 순서로 나누기

1단계 칩만, 2단계 배번+키패드. 종목이 이미 있으면 1단계 생략.  
키패드가 칩을 가리지 않지만, 카드 안 상태가 늘고 권장 A만으로도 목표를 달성한다. **이번 범위 밖.**

### C. 종목 화면 / 배번 화면 분리

페이지나 풀스크린 스텝. 홈 카드 모델과 어긋나고 이득이 작다. **채택하지 않음.**

## 동작

### 키패드

- `#profileBib`에 `enterkeyhint="done"`을 넣는다. 안드로이드 **이동**이 **완료/입력** 쪽으로 바뀌는 힌트다. OS가 문구를 보장하지는 않는다.
- `#profileBibForm`을 `<form>`으로 감싼다. `submit`에서 `preventDefault` 후 `submitUpdateBib(activeIdentity)`.
- 칩·저장 버튼은 `type="button"`을 유지해 form submit을 가로채지 않게 한다.
- `#profileBib`에서 `Enter`도 같은 저장 경로로 보낸다. IME `isComposing`이면 무시한다 (한글 IME 패턴).
- `inputmode="numeric"`은 유지한다. `type="number"`로 바꾸지 않는다 (스피너·빈 값 이슈).

### 저장 조건

기존 `submitUpdateBib` 규칙을 그대로 쓴다.

| 배번 | 종목 | 키패드 확인 / Enter / 저장 버튼 |
|------|------|----------------------------------|
| 있음 | 있음 | `update-bib` 호출 |
| 없음 | 있음 | 토스트: 배번과 종목을 넣어 주세요. 저장 안 함 |
| 있음 | 없음 | 같은 토스트. 입력 블러로 키패드를 닫아 칩이 보이게 함 |
| 없음 | 없음 | 같은 토스트. 블러 |

종목만 고르고 배번이 비어 있으면 키패드 확인으로 저장하지 않는다.

### 화면에 남는 것

- 종목 칩과 `저장` 버튼은 그대로 둔다. 키패드가 없는 기기·키패드를 닫은 뒤에도 저장할 수 있어야 한다.
- 종목 칩 선택만으로 저장하지 않는다. 배번이 비어 있으면 안 되고, 배번이 있어도 실수 탭으로 바로 올리면 위험하다.
- 참가자에 이미 정규 종목이 있으면 지금처럼 칩을 미리 고른다.

## API

변경 없음. 기존 `group-events` + `subAction=update-bib` (`bib`, `distance`).

## 제외

- `my-bib.html`, `group-detail.html` 인라인 배번 편집
- 종목/배번 wizard·별도 페이지
- 신규 HTTP API
- `wait` / `pending` / `manual` / `confirmed` 카드
- 종목 칩 탭 즉시 저장
- 배번만 있고 종목 없이 저장

## 검증

- 배번+종목 있는 상태에서 `#profileBib` `Enter` → `submitUpdateBib`가 호출된다.
- 종목 없이 `Enter` → 저장 호출 없음, 기존 토스트.
- `inputmode="numeric"`, `enterkeyhint="done"`이 마크업에 있다.
- form `submit`이 페이지를 리로드하지 않는다.
- `#profileBibSave` 클릭 저장은 유지된다.

브라우저 실기는 구현 후 배포·하드 리프레시로 확인한다. 단위 테스트는 마크업·Enter 분기·저장 가드를 잠근다.
