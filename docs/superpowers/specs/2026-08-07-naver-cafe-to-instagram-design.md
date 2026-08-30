# 네이버 카페 → 인스타그램 게시 스킬 설계

**날짜:** 2026-08-07  
**상태:** Draft (구현 전 검토)  
**관련:** `.cursor/skills/naver-cafe-to-instagram/` (신규)

---

## 1. 문제

동마클 네이버 카페에 올라온 후기/공지 글의 이미지를 인스타그램에 옮기는 작업이 수동이다.  
모바일 Cursor에서도 URL만 주면 반자동으로 올리고 싶다.

---

## 2. 결정된 제약·사실

| 항목 | 결정/사실 |
|------|-----------|
| 네이버 카페 Open API | **글 읽기 API 없음** (가입·글쓰기만) |
| 검색 API | 본문·이미지 미제공 |
| `naver.me` / `art` 공유 링크 | 리다이렉트 URL의 `art` JWT로 **비로그인 본문·이미지 조회 가능** (검증됨: article `4888`) |
| `art` 없이 article API | `errorCode 0004` 로그인 필요 |
| Instagram 게시 | **Graph API** (비즈니스/크리에이터 + 권한). 개인 계정 불가 |
| 실행 환경 | **모바일 Cursor → Cloud Agent**에서도 동작해야 함 |
| V1 트리거 | 사용자가 **공유 URL을 채팅에 제공** (게시판 폴링 없음) |

### 검증 메모 (2026-08-07)

- `https://naver.me/GII49sLm` → `m.cafe.naver.com/2008dmc/4888?art=...`
- `GET .../cafe-articleapi/v2.1/cafes/30619899/articles/4888?art=...` → 제목·본문 HTML·이미지 URL 수신
- 제목 예: `2026.08.04 화요 정모 후기`

---

## 3. 목표 (V1)

사용자가 **카페 공유 URL**(`naver.me` 또는 `art` 포함 카페 URL)을 주면:

1. 단축 URL 해석 → `cafeId` / `articleId` / `art` 추출  
2. 카페 article API로 본문·이미지 URL 수집  
3. 이미지 다운로드·검증(JPEG, 비율, 크기, 최대 10장)  
4. Graph API가 받을 수 있는 **공개 HTTPS URL**로 임시 호스팅  
5. Instagram Graph API로 피드 게시 (단일 또는 캐러셀)  
6. 게시 결과(미디어 ID / 링크)를 사용자에게 보고  

**성공 기준:** 모바일 Cursor 채팅에 공유 URL(+선택 캡션)만 넣어도 Cloud Agent가 위 파이프라인을 끝까지 실행하고 게시 URL을 회신한다.

**실패 기준:** `art` 없는 회원전용 URL만 주어진 경우·IG 계정/토큰 미준비·이미지 규격 불가로 게시 실패 시, 원인을 명시하고 중단(부분 게시 금지).

---

## 4. 비목표 (V1 제외)

- 게시판 자동 폴링 / cron  
- 네이버 자동 로그인·브라우저 세션 의존 (공유 `art` 경로가 되면 불필요)  
- 인스타 스토리·릴스  
- 캡션 LLM 자동 창작 (기본은 글 제목 + 사용자가 준 캡션)  
- Meta App Review가 필요한 “타인 계정 대행” 제품화 (운영자 본인 계정·앱 역할만)

---

## 5. 아키텍처

```
사용자 (모바일 Cursor 포함)
  └─ 공유 URL [+ 선택 캡션]
        ↓
Cloud Agent + 스킬 체크리스트
  ├─ resolveShareUrl(url) → { cafeId, articleId, art, canonicalUrl }
  ├─ fetchArticle(cafeId, articleId, art) → { subject, contentHtml, imageUrls }
  ├─ prepareImages(imageUrls) → local JPEGs (≤10, IG 규격)
  ├─ hostImages(files) → publicHttpsUrls
  └─ publishInstagram({ imageUrls, caption }) → { mediaId, permalink? }
```

### 구성요소

| 단위 | 역할 |
|------|------|
| `.cursor/skills/naver-cafe-to-instagram/SKILL.md` | 실행 절차, 사전조건, 실패 분기, 보안(토큰) |
| `scripts/cafe-to-instagram/` | URL 해석·fetch·이미지 준비·IG 게시 CLI/모듈 (에이전트가 호출) |
| 시크릿/환경변수 | `IG_*` / Meta 토큰 — 레포에 커밋하지 않음 |
| 임시 호스팅 | V1: Firebase Storage(또는 동등 공개 HTTPS). Graph API는 로컬 파일 직접 업로드 불가 |

### 브라우저 의존성

V1은 **공유 `art` 링크 전제**로 HTTP API만 사용한다.  
`art`가 없거나 만료·거부되면 스킬은 **브라우저 로그인 경로로 폴백하지 않고** 사용자에게 공유 링크 재발급을 요청한다. (폴백은 V2 백로그)

---

## 6. Instagram 사전조건

- 계정이 **프로페셔널(비즈니스 또는 크리에이터)** 인지 확인·전환  
- Meta 개발자 앱 + Content Publishing 권한  
- 장기 토큰 보관 위치: Cloud Agent 환경 시크릿 (문서에 값 금지)  
- 이미지: JPEG, 비율 약 4:5~1.91:1, ≤8MB, 캐러셀 ≤10  

계정 타입이 아직 미확인이어도 스킬·스크립트는 작성 가능. **실제 게시 E2E는 계정/토큰 준비 후** 검증.

---

## 7. 데이터·보안

- `art` 토큰·IG access token은 로그/커밋/PR에 남기지 않음  
- 다운로드한 이미지·임시 호스팅 객체는 게시 성공 후 삭제(또는 TTL)  
- 카페 회원 전용 콘텐츠를 외부(인스타)로 재배포하는 것은 **운영자 판단·카페 규정** 하에 수행 (스킬에 고지)

---

## 8. 테스트 전략

| 레벨 | 내용 |
|------|------|
| 단위 | `art` 파싱, cafeId/articleId 추출, HTML→이미지 URL 추출, >10장 truncate |
| 통합(모의) | article API 픽스처 JSON → prepareImages → publish 호출 mock |
| 수동 E2E | 실공유 URL + 샌드박스/실 IG 계정 (토큰 준비 후) |

`pre-deploy-test.sh`에 IG 실토큰 의존 테스트를 넣지 않는다. 헬퍼 단위 테스트만 CI/로컬에 포함.

---

## 9. 열린 이슈

1. IG 계정이 이미 프로페셔널인지 (사용자 확인 필요)  
2. 임시 호스팅을 Firebase Storage vs 단명 URL 서비스 중 무엇으로 할지 (기본 제안: 프로젝트 Storage)  
3. `art` JWT 유효기간 — 만료 시 UX 문구  
4. 이미지 10장 초과 시: 앞 10장 vs 사용자 선택 (V1: 문서 순서 앞 10장 + 경고)

---

## 10. 승인 체크

- [ ] V1 범위(공유 URL 반자동 + Graph API) 동의  
- [ ] `art` 없으면 중단(브라우저 폴백 없음) 동의  
- [ ] 모바일 Cloud Agent 실행 전제 동의  
- [ ] 구현 계획(`docs/superpowers/plans/2026-08-07-naver-cafe-to-instagram.md`) 진행 승인  
