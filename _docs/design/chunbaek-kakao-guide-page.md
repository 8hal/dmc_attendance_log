# 춘백 카카오 안내 페이지 패턴

> 작성일: 2026-07-20  
> 상태: **승인됨** (사용자: 「디자인 좋습니다. 저장해두고 나중에도 봅시다」)  
> 기준 구현: `chunbaek/exception-guide.html`  
> 프로덕션 URL: https://dmc-attendance.web.app/chunbaek/exception-guide.html  
> 형제 페이지: `chunbaek/install.html` (홈 화면 추가 안내 — 같은 계열)

단톡·카카오톡으로 링크만 뿌리는 **모바일 단페이지 안내**를 새로 만들 때 이 문서를 먼저 본다.

---

## 1. 언제 쓰는가

| 적합 | 비적합 |
|------|--------|
| 앱 밖(카톡)에서 기능을 설명하고 앱으로 유도 | 로그인·상태 의존 대시보드 |
| 요청 방법 + 주의사항 정도의 짧은 가이드 | 긴 정책 문서·FAQ 전체 |
| CTA 하나(앱 특정 탭/화면) | 여러 동등 CTA·통계·일정 나열 |

---

## 2. 페이지 골격 (위에서 아래)

```
[브랜드 오렌지 헤더]
  eyebrow (춘백 S3)
  큰 제목 (줄바꿈 OK)
  한 줄 보조 설명

[카카오 인앱 배너]  ← UA에 KAKAOTALK일 때만 .visible

[섹션 카드] 요청/설치 방법 — numbered steps
[섹션 카드] 알아두면 좋아요 — bullets

[풀폭 primary CTA]  → 딥링크 (예: /chunbaek/#/me)
[푸터] 동마클 · 춘백 S3
```

**의도적으로 빼는 것**

- 「무엇을 위한 기능인가요?」 같은 장황한 소개 블록
- 단톡 공지 문구 복사 박스·토스트
- 카드 위 플로팅 뱃지·통계 스트립·이모지 장식 과다

---

## 3. 시각 규칙

토큰은 `chunbaek/css/tokens.css`를 쓰고, 페이지 전용 스타일은 HTML `<style>`에 둔다 (install / exception-guide와 동일).

| 요소 | 규칙 |
|------|------|
| 폭 | `.page` max-width **480px**, 가운데 |
| 배경 | `--bg` (`#faf8f6`) |
| 헤더 | 풀폭 `--brand-orange`, 흰 글씨. eyebrow 12px / h1 26px weight 800 / 보조 14px |
| 섹션 | `--card` + 1px `--border-default`, radius **16px**, margin 좌우 16 |
| 스텝 행 | `--surface-muted` 배경, radius 12, 왼쪽 원형 step-num (오렌지·흰 숫자) |
| CTA | pill (`border-radius: 999px`), 풀폭, `--brand-orange` |
| 폰트 | Noto Sans KR 400/600/700/800 |
| 카카오 배너 | `#FEF3C7` / border `#F59E0B` / 제목 `#92400E` — install.html과 동일 |

브랜드 오렌지를 **헤더 + CTA + step 번호**에만 쓰고, 본문 카드는 흰/연회색으로 유지한다 (`chunbaek-design-tokens.md`의 「배경은 조용하게 · 브랜드는 포인트로」와 맞춤).

---

## 4. 카카오톡 대응 (필수)

```js
if (/KAKAOTALK/i.test(navigator.userAgent || "")) {
  document.getElementById("kakao-banner").classList.add("visible");
}
```

배너 카피 기본형:

- 제목: `카카오톡 안에서 보시는 경우`
- 본문: `오른쪽 아래 ⋯ → 다른 브라우저로 열기`를 누르면 앱 사용이 더 편합니다.

---

## 5. CTA · 딥링크

- 기본 앱 루트(`/chunbaek/`)보다 **목적 화면 해시**를 쓴다.
- 「나」탭: `/chunbaek/#/me` (`app.js` `navigateFromHash` → `TAB_VIEWS`의 `me`)
- 로그인·프로필 미완료면 welcome으로 떨어지는 것은 앱 기존 동작 — 안내 페이지에서 따로 우회하지 않는다.

---

## 6. 새 안내 페이지 체크리스트

```
☐ tokens.css + Noto Sans KR 로드
☐ 오렌지 헤더 (eyebrow + 제목 + 한 줄 설명)
☐ 카카오 배너 + UA 토글
☐ 방법 섹션 (numbered steps, surface-muted 행)
☐ 주의/팁 섹션 (bullets) — 필요할 때만
☐ CTA 하나, 딥링크 확인
☐ 단톡 공지 복사 UI / 장황한 「기능 소개」 넣지 않기
☐ viewport-fit=cover, theme-color #ff3214
☐ 로컬·모바일 폭 확인 후 배포는 hosting만으로 충분
```

---

## 7. 참조 파일

| 파일 | 역할 |
|------|------|
| `chunbaek/exception-guide.html` | **이 패턴의 기준 구현** (출석 예외) |
| `chunbaek/install.html` | 같은 계열 (홈 화면 추가, 헤더에 아이콘·뒤로가기 변형) |
| `_docs/design/chunbaek-design-tokens.md` | 앱 전체 토큰·톤 |
| `_docs/superpowers/specs/2026-07-20-chunbaek-exception-request-design.md` | 예외 기능 정책 SSOT |
