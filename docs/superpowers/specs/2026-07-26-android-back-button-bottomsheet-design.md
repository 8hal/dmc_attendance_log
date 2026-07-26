# 안드로이드 뒤로 가기 버튼으로 하단 팝업 닫기 — 설계 문서

## 목적

웹뷰(카카오톡 인앱 브라우저 등) 환경에서 안드로이드 뒤로 가기 버튼을 눌렀을 때,
열려있는 하단 팝업 / 라이트박스가 닫히도록 한다.
현재는 뒤로 가기 버튼을 누르면 앱 전체가 이전 페이지로 이동하거나 인앱 브라우저가 닫힌다.

## 대상 팝업 (4개)

| 식별자 | open 함수 | close 함수 |
|---|---|---|
| `#timeline-modal` | `openTrainingModal(slot)` | `closeTrainingModal()` |
| `#team-profile-modal` | `openTeamProfileModal(memberId)` | `closeTeamProfileModal()` |
| `#exception-request-modal` | `openExceptionRequestModal()` | `closeExceptionRequestModal()` |
| `#photo-lightbox` | `openLightbox(urls, startIdx)` | `closeLightbox()` |

## 기술 접근 방식: 중앙 모달 스택 (History API)

### 원리

브라우저 History API의 `pushState` / `popstate`를 활용한다.
안드로이드 뒤로 가기 버튼은 브라우저에 `popstate` 이벤트를 발생시키는 것과 동일하게 동작한다.

```
팝업 열림  →  history.pushState({modal:true}, "")
             _modalStack에 closeFn 등록

뒤로 가기  →  popstate 이벤트 발생
             _modalStack.pop()() 로 closeFn 실행 → 팝업 닫힘

X 버튼/바깥 탭  →  closeXxx() 직접 호출
                   _modalStack에서 해당 closeFn 제거
                   _skipNextPopstate = true 세팅
                   history.back() 호출 (히스토리 항목 정리)
                   popstate 이벤트는 플래그로 무시
```

### 핵심 유틸 (app.js 내부 스코프)

```javascript
const _modalStack = [];
let _skipNextPopstate = false;

function _modalPush(closeFn) {
  history.pushState({ modal: true }, "");
  _modalStack.push(closeFn);
}

function _modalRemoveFromStack(closeFn) {
  const idx = _modalStack.lastIndexOf(closeFn);
  if (idx >= 0) {
    _modalStack.splice(idx, 1);
    _skipNextPopstate = true;
    history.back();
  }
}

window.addEventListener("popstate", () => {
  if (_skipNextPopstate) { _skipNextPopstate = false; return; }
  if (_modalStack.length > 0) _modalStack.pop()();
});
```

### open 함수 변경 (한 줄 추가)

각 `openXxx` 함수 끝에 `_modalPush(closeXxx)` 한 줄 추가.

### close 함수 변경 (첫 줄 추가)

각 `closeXxx` 함수 첫 줄에 `_modalRemoveFromStack(closeXxx)` 한 줄 추가.

## 동작 시나리오

| 시나리오 | 동작 |
|---|---|
| 팝업 없음 → 뒤로 가기 | 스택 비어있음 → 기존 브라우저 동작 (변경 없음) |
| 훈련 상세 열림 → 뒤로 가기 | 훈련 상세 닫힘 |
| 팀원 프로필 열림 → 뒤로 가기 | 팀원 프로필 닫힘 |
| 팀원 프로필 위에 라이트박스 → 뒤로 가기 | 라이트박스만 닫힘, 프로필 유지 |
| 라이트박스 닫힘 → 뒤로 가기 한 번 더 | 팀원 프로필 닫힘 |
| 팝업 열림 → X 버튼 클릭 | 즉시 닫힘 + 히스토리 항목 정리 |
| 팝업 열림 → 바깥 탭 | 즉시 닫힘 + 히스토리 항목 정리 |
| 출석하기 버튼 후 자동 닫힘 | `closeTrainingModal()` 직접 호출 경로도 동일하게 처리 |

## 변경 파일

- **수정 1개**: `chunbaek/js/app.js`
  - 모달 스택 유틸 (~15줄) 추가
  - `openTrainingModal`, `openTeamProfileModal`, `openExceptionRequestModal`, `openLightbox` — 각 1줄 추가
  - `closeTrainingModal`, `closeTeamProfileModal`, `closeExceptionRequestModal`, `closeLightbox` — 각 1줄 추가

## 테스트 계획

History API는 실제 브라우저 환경이 필요하므로 Node.js 단위 테스트 대신 에뮬레이터 수동 검증.

1. `firebase emulators:start` 후 `localhost:5000` 접속
2. 각 팝업 열기 → 브라우저 뒤로 가기(또는 Alt+← / Backspace) → 팝업 닫힘 확인
3. 팝업 → X 버튼 → 뒤로 가기가 앱 페이지 이동이 되는지 확인
4. 팀원 프로필 → 라이트박스 → 뒤로 가기 두 번 → 순서대로 닫힘 확인
5. `pre-deploy-test.sh` 전체 통과 확인 (API 레벨 회귀 없음)
