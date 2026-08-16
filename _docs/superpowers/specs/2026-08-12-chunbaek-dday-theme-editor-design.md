# 춘백 D-day 테마 조합기 (미리보기) 설계

날짜: 2026-08-12  
상태: 스펙 리뷰 통과 (구현 계획 전 사용자 확인)

## 배경

홈 D-day 카드는 `data-decade`(잔여일 10의자리)별 CSS 변수 테마를 쓴다.  
어드민이 시점(시즌 진행)에 맞춰 10일 칸별 색을 조합·조정하고, **배포로 회원 화면에 반영**하려 한다.

회원 개인 설정·Firestore 실시간 반영은 하지 않는다.

## 목표

- `chunbaek/dday-card-preview.html`을 **편집 + 실시간 미리보기 + CSS 내보내기** 도구로 확장
- 내보낸 CSS를 `chunbaek/css/chunbaek.css`의 decade / `.is-dday` 블록에 붙여넣어 배포

## 비목표 (YAGNI)

- 회원용 테마 설정
- `admin.html` / Firestore / 런타임 JSON 로딩
- 매일 단위 테마
- box-shadow 편집 UI
- `app.js` / 홈 렌더 로직 변경

## 단위

10일 칸만:

| 키 | 의미 |
|---|---|
| `9` … `0` | `data-decade` 90+ … 0~9 |
| `dday` | `.is-dday` (당일) |

## UI

파일: `chunbaek/dday-card-preview.html` (단독 HTML, 앱 라우트 아님)

각 칸마다:

- 카드 미리보기 (기존과 동일 구조)
- 컬러 피커: `bg`, `border`, `count`, `name`, `meta`
- `bg` / `border`: hex 피커 + 불투명도 슬라이더(0–100%) → `rgba`로 적용·내보내기
- `count` / `name` / `meta`: hex만 (alpha 없음, v1)

상단 액션:

- **Copy CSS** — 클립보드에 decade CSS 블록
- **Reset** — 페이지에 내장된 기본 팔레트로 복구

피커 변경 시 해당 카드에 CSS 변수(`--dday-*`)를 인라인으로 즉시 주입.

## 데이터

서버 저장 없음. 페이지 인메모리 객체:

```js
{
  "9": { bg: "#rrggbb", bgAlpha: 0.94, border: "...", borderAlpha: 1, count: "#...", name: "#...", meta: "#..." },
  // … "0"
  "dday": { … }
}
```

로드 시 현재 확정된 기본 아크(화이트→시안→검정→주황→차분→D-DAY 화이트)로 초기화.

## 내보내기 형식

`Copy CSS` 출력은 `chunbaek.css`에 그대로 붙여넣을 수 있는 블록:

```css
.marathon-dday-card[data-decade="9"] {
  --dday-bg: rgba(...);
  --dday-border: rgba(...);
  --dday-count: #...;
  --dday-name: #...;
  --dday-meta: #...;
}
/* decade 8…0 */
.marathon-dday-card.is-dday {
  --dday-bg: ...;
  --dday-border: ...;
  --dday-count: ...;
  --dday-name: ...;
  --dday-meta: ...;
}
```

- box-shadow는 내보내지 않음 (기존 CSS 유지)
- 토큰 참조(`var(--text)` 등)는 내보내기에서 **구체 색 hex/rgba로 고정** (붙여넣기 후 미리보기와 앱이 동일해지도록)

## 반영 흐름

1. 미리보기 HTML에서 조합
2. Copy CSS → `chunbaek.css` decade / `.is-dday` 변수 블록 교체
3. 커밋 후 Hosting 배포
4. 회원 홈은 기존처럼 CSS만으로 테마 표시

## 폐기

도구가 필요 없으면 `chunbaek/dday-card-preview.html`만 삭제. 앱·API 영향 없음.

## 성공 기준

- 칸별 색을 바꿔 카드가 즉시 바뀐다
- Copy CSS로 만든 블록을 `chunbaek.css`에 붙이면 홈 D-day와 동일 톤이 된다
- `app.js` / Functions / admin 변경 없음
