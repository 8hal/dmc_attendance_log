# 단체 대회 회원 당일 UX

날짜: 2026-08-23  
상태: 구현 중  
관련: `_docs/superpowers/specs/2026-08-18-group-event-member-home-chunbaek-ia.md`

## 목표

새벽 QR부터 기록 확정까지, 회원이 **지금 할 일 하나**만 하게 한다.  
탭은 둘러보기. 시간순 일렬은 주경로가 아니다 (확정과 오는 버스는 순서가 없음).

## 합의

1. QR 랜딩: 닉 없으면 선택, 있으면 바로 해당 편 탑승 확인.
2. 가는 편 완료 → 홈. 오늘 카드는 배번. 완료 화면에 `이어서 배번 입력` 보조.
3. 홈: 스크랩 후 확정이 메인. 오는 버스는 작은 보조.
4. 오는 편 QR도 동일 (`?leg=return`). 확정 대기면 상단 `기록 확정하기` 배너.
5. 신규 API 없음. `my-bib` 셸 통일은 이번 범위 밖.

## 주경로

```
QR(?leg=) → pick | confirm → 홈(배번) → 기록 대기
         → 홈(확정 메인 + 오는 버스 보조)
         → 오는 편 QR 확인 + 확정 배너
```

## 파일

- `assets/event-boarding-flow.js` — 랜딩·완료 링크·확정 배너
- `assets/event-home-action.js` — `confirm_pending` 보조 CTA
- `boarding.html`, `event-home.html`, `event-admin.html` QR
