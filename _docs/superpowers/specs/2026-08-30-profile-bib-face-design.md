# 회원 홈 대기 카드 배번 페이스 디자인

**상태:** 승인됨 (대화 2026-08-30) · 구현 대상  
**범위:** `event-home.html` 대기(`wait`) 상태 `#profileCard`만

## 목표

기록이 올라오기 전 대기 화면에서 배번·거리를 **실물 배번판**처럼 보이게 한다. 연한 파란 `.profile-card` 배경은 유지하고, 배번 블록만 페이스로 바꾼다.

## 포함

- CSS `.bib-face` (사진·SVG 배경 이미지 없음)
- 흰 배번면 (핀홀 없음)
- 파란 밴드 + 큰 검정 배번 숫자 (`#profileBibLarge`)
- 밴드 왼쪽 위 거리 pill (`memberDistanceLabel`, 예: `풀`)
- 하단 대회명 (`memberEventTitle(event.eventName || event.primaryName)`, 홈 헤더와 동일)
- 「배번 수정」「기록 직접 입력」은 `.profile-link-row` 한 줄

## 제외

- 서울신문 배번 브랜딩·비상연락처 복제 금지
- `pending` / `bib` 폼 / `manual` / `confirmed` UI 변경 없음
- 신규 HTTP API 없음

## 마크업 스케치

```html
<div class="bib-face" id="profileBibFace">
  <div class="bib-face-band">
    <span class="bib-face-dist" id="profileBibDist"></span>
    <div class="bib-face-number" id="profileBibLarge"></div>
  </div>
  <p class="bib-face-event" id="profileBibEvent"></p>
</div>
<div class="profile-link-row">
  <button id="profileEditBtn">배번 수정</button>
  <button id="profileManualBtn">기록 직접 입력</button>
</div>
```

`wait`에서만 `#profileBibFace`를 보이고, `pending`은 기존 `.profile-bib-large` 평문 표시를 유지한다.
