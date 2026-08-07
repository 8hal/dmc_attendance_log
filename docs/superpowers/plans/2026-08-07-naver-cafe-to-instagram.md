# 네이버 카페 → 인스타그램 스킬 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `naver.me`(또는 `art` 포함) 카페 공유 URL에서 이미지를 모아 Instagram Graph API로 피드 게시하는 Cursor 스킬 + 헬퍼 스크립트를 만든다.

**Architecture:** 공유 링크의 `art` JWT로 네이버 cafe-articleapi를 호출해 본문·이미지 URL을 얻고(로그인 브라우저 불필요), 이미지를 IG 규격으로 준비한 뒤 공개 HTTPS로 잠깐 호스팅한 다음 Graph API `media` → `media_publish`(캐러셀 시 children)로 게시한다. 에이전트는 `.cursor/skills/naver-cafe-to-instagram/SKILL.md` 체크리스트를 따른다.

**Tech Stack:** Node.js(프로젝트 `functions`/루트와 맞춤), `node --test`, Instagram Graph API, Firebase Storage(또는 동등 공개 URL), Cursor Skill Markdown

**Spec:** `docs/superpowers/specs/2026-08-07-naver-cafe-to-instagram-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `.cursor/skills/naver-cafe-to-instagram/SKILL.md` | 트리거·사전조건·단계·실패 분기·보안 |
| `scripts/cafe-to-instagram/lib/resolve-share-url.js` | 단축/공유 URL → cafeId, articleId, art |
| `scripts/cafe-to-instagram/lib/fetch-article.js` | article API 호출·제목·HTML·이미지 URL |
| `scripts/cafe-to-instagram/lib/extract-images.js` | contentHtml에서 원본 이미지 URL 정리·중복 제거·최대 10 |
| `scripts/cafe-to-instagram/lib/prepare-images.js` | 다운로드·JPEG/크기/비율 검사(최소 검증) |
| `scripts/cafe-to-instagram/lib/host-images.js` | 공개 HTTPS 업로드 + 정리 |
| `scripts/cafe-to-instagram/lib/publish-instagram.js` | Graph API 컨테이너·퍼블리시 |
| `scripts/cafe-to-instagram/lib/caption.js` | subject + 사용자 캡션 조합 |
| `scripts/cafe-to-instagram/cli.js` | `resolve \| fetch \| publish` 서브커맨드 |
| `scripts/cafe-to-instagram/package.json` | 이 폴더 전용 의존성(최소). 가능하면 루트/`functions` 재사용 |
| `scripts/test/cafe-to-instagram/*.test.js` | 단위 테스트(픽스처 기반) |
| `scripts/test/fixtures/cafe-article-4888-sample.json` | 민감 토큰 제거한 article API 샘플 |
| `.cursor/rules/superpowers.mdc` | 스킬 표에 행 추가(발견 가능하도록) |

---

### Task 1: URL 해석 + 픽스처

**Files:**
- Create: `scripts/cafe-to-instagram/lib/resolve-share-url.js`
- Create: `scripts/test/cafe-to-instagram/resolve-share-url.test.js`
- Create: `scripts/test/fixtures/cafe-article-4888-sample.json`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// scripts/test/cafe-to-instagram/resolve-share-url.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseCafeShareTarget } = require("../../cafe-to-instagram/lib/resolve-share-url.js");

describe("parseCafeShareTarget", () => {
  it("parses m.cafe URL with art and article path", () => {
    const art = "header.payload.sig";
    const u = `https://m.cafe.naver.com/2008dmc/4888?art=${art}`;
    const r = parseCafeShareTarget(u);
    assert.equal(r.cafeUrl, "2008dmc");
    assert.equal(r.articleId, "4888");
    assert.equal(r.art, art);
  });

  it("rejects URL without art", () => {
    assert.throws(
      () => parseCafeShareTarget("https://m.cafe.naver.com/2008dmc/4888"),
      /art/i
    );
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --test scripts/test/cafe-to-instagram/resolve-share-url.test.js`  
Expected: FAIL (module missing)

- [ ] **Step 3: `resolve-share-url.js` 최소 구현**

- 입력: 절대 URL 문자열  
- `m.cafe.naver.com/{cafeUrl}/{articleId}` 및 `cafe.naver.com/...` 변형 파싱  
- query `art` 필수  
- `naver.me` 단축은 **이 모듈에서 HTTP follow 하지 않음** — `resolveShareUrl` 비동기 래퍼에서 `curl`/fetch redirect 후 `parseCafeShareTarget` 호출 (Task 1에 동기 parse + 비동기 resolve 둘 다)

```js
// scripts/cafe-to-instagram/lib/resolve-share-url.js
"use strict";

function parseCafeShareTarget(urlString) {
  const u = new URL(urlString);
  const art = u.searchParams.get("art");
  if (!art) throw new Error("Missing required art token in cafe share URL");
  // path: /{cafeUrl}/{articleId} or /{cafeUrl}/ArticleRead.nhn?...
  const parts = u.pathname.split("/").filter(Boolean);
  let cafeUrl;
  let articleId;
  if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
    cafeUrl = parts[0];
    articleId = parts[1];
  } else {
    articleId = u.searchParams.get("articleid") || u.searchParams.get("articleId");
    cafeUrl = parts[0];
    if (!articleId) throw new Error("Cannot parse articleId from URL");
  }
  return { cafeUrl, articleId: String(articleId), art, hostname: u.hostname };
}

async function resolveShareUrl(urlString, fetchImpl = fetch) {
  const u = new URL(urlString);
  if (u.hostname === "naver.me" || u.hostname.endsWith(".naver.me")) {
    const res = await fetchImpl(urlString, { redirect: "follow", method: "GET" });
    return parseCafeShareTarget(res.url);
  }
  return parseCafeShareTarget(urlString);
}

module.exports = { parseCafeShareTarget, resolveShareUrl };
```

- [ ] **Step 4: 테스트 통과 확인 + `art` 없는 픽스처 JSON 저장**

Article API 응답에서 `art`·토큰성 필드를 제거하고 `contentHtml`·`subject`·이미지 URL 일부만 `scripts/test/fixtures/cafe-article-4888-sample.json`에 둔다.

Run: `node --test scripts/test/cafe-to-instagram/resolve-share-url.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/cafe-to-instagram/lib/resolve-share-url.js \
  scripts/test/cafe-to-instagram/resolve-share-url.test.js \
  scripts/test/fixtures/cafe-article-4888-sample.json
git commit -m "feat(cafe-ig): parse naver cafe share URLs with art token"
```

---

### Task 2: Article fetch + 이미지 URL 추출

**Files:**
- Create: `scripts/cafe-to-instagram/lib/fetch-article.js`
- Create: `scripts/cafe-to-instagram/lib/extract-images.js`
- Create: `scripts/test/cafe-to-instagram/extract-images.test.js`
- Create: `scripts/test/cafe-to-instagram/fetch-article.test.js`

- [ ] **Step 1: extract-images 실패 테스트**

픽스처 HTML에서 `cafeptthumb`/`postfiles` 등 pstatic 이미지 URL을 모으고, 썸네일 중복·쿼리 정리 후 **최대 10개**를 반환하는지 검증.

```js
const { extractImageUrlsFromHtml } = require("../../cafe-to-instagram/lib/extract-images.js");
// fixture contentHtml → length <= 10, all https, unique
```

- [ ] **Step 2: 테스트 실패 확인 후 `extract-images.js` 구현**

우선순위: `data-src` / 원본에 가까운 URL. 동일 파일의 작은 thumb 변형은 가능하면 하나로 합침(단순: path basename 기준 dedupe).

**Truncate (스펙 §9):** HTML 문서 등장 순서 기준 **앞 10장**만 사용. 10장 초과 시 `truncated: true`와 경고 메시지를 반환·로그(부분 게시로 조용히 자르지 말 것 — 호출자가 인지).

응답 필드 형태는 기존 카페 붙여넣기/`contentHtml` 흐름(`functions/lib/meeting-training.js`, `scripts/test/meeting-training.test.js`)과 동일한 `result.article.subject` / `result.article.contentHtml` 경로를 쓴다.

- [ ] **Step 3: `fetch-article.js`**

```text
GET https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/{cafeId}/articles/{articleId}?art={art}
```

**cafeId 결정 순서 (단일 전략):**

1. `art` JWT payload를 base64url decode해 `cafeId`·`articleId` 클레임 사용 (**서명 검증 없음** — 서버가 art 검증)
2. 클레임에 없으면 `CAFE_URL_TO_ID` 맵 (`2008dmc` → `30619899`)
3. 둘 다 없으면 throw (`Cannot resolve numeric cafeId`)

`art` JWT claims 파서 유틸 + 테스트를 `resolve-share-url.js` 또는 `fetch-article.js`에 둔다.

- [ ] **Step 4: fetch 단위 테스트는 mock fetch** (네트워크 실호출 금지 in CI)

- [ ] **Step 5: Commit**

```bash
git add scripts/cafe-to-instagram/lib/fetch-article.js \
  scripts/cafe-to-instagram/lib/extract-images.js \
  scripts/test/cafe-to-instagram/*.test.js
git commit -m "feat(cafe-ig): fetch cafe article and extract image URLs"
```

---

### Task 3: 이미지 준비 + 호스팅 어댑터

**Files:**
- Create: `scripts/cafe-to-instagram/lib/prepare-images.js`
- Create: `scripts/cafe-to-instagram/lib/host-images.js`
- Create: `scripts/test/cafe-to-instagram/prepare-images.test.js`

- [ ] **Step 1: prepare-images 테스트**

- Referer `https://cafe.naver.com` 헤더로 다운로드하는 fetch 래퍼를 mock  
- 파일이 JPEG이 아니면 실패 메시지(또는 V1에서는 JPEG만 허용·변환은 백로그로 명시)  
- 8MB 초과 실패  
- 비율 검사: 간단 휴리스틱(width/height). 메타 없으면 경고 후 통과 가능 — 스펙의 IG 에러에 맡김

- [ ] **Step 2: `host-images.js`**

인터페이스:

```js
async function hostImages(localPaths, { bucket, prefix, upload }) 
// returns string[] publicUrls
async function cleanupHosted(urlsOrKeys, { remove })
```

V1 기본 구현: Firebase Admin Storage + download token URL.  
환경에 Admin 자격 없으면 `HOSTING_MODE=none`일 때 **이미 공개인지 검사** — 네이버 CDN URL이 Graph API에서 hotlink 거부될 수 있으므로 **기본은 재호스팅 필수**. 재호스팅 불가 시 명확히 throw.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(cafe-ig): prepare and host images for Graph API"
```

---

### Task 4: Instagram Graph API publish

**Files:**
- Create: `scripts/cafe-to-instagram/lib/publish-instagram.js`
- Create: `scripts/test/cafe-to-instagram/publish-instagram.test.js`

- [ ] **Step 1: mock 기반 테스트**

단일 이미지:

1. `POST /{ig-user-id}/media` `image_url`, `caption`  
2. `POST /{ig-user-id}/media_publish` `creation_id`

캐러셀(2~10):

1. 각 이미지 child container (`is_carousel_item=true`)  
2. parent carousel container `children=id1,id2,...`  
3. `media_publish`

환경변수:

```text
IG_USER_ID=
IG_ACCESS_TOKEN=
GRAPH_API_VERSION=v21.0   # 구현 시점 문서에 맞게 고정·주석
# 재호스팅(Task 3)에도 자격 필요 — 예: GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_* (값 커밋 금지)
```

**부분 게시 금지:** prepare·host·child container 생성 중 하나라도 실패하면 `media_publish`를 호출하지 않고 전체를 abort한다. 의도한 N장 중 일부만 올리지 않는다.

- [ ] **Step 2: 구현 + 토큰을 로그에 찍지 않기**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(cafe-ig): publish feed media via Instagram Graph API"
```

---

### Task 5: CLI 조립

**Files:**
- Create: `scripts/cafe-to-instagram/cli.js`
- Create: `scripts/cafe-to-instagram/README.md` (사용법·환경변수만, 시크릿 값 없음)
- Create: `scripts/cafe-to-instagram/lib/caption.js`
- Create: `scripts/test/cafe-to-instagram/caption.test.js`

- [ ] **Step 1: 캡션 조합 (스펙 §4)**

기본 캡션 = **글 제목(`subject`)** + (사용자가 `--caption`을 준 경우) 빈 줄 후 사용자 문구.  
LLM 창작 없음. `--caption`만 있고 subject를 빼는 옵션은 V1에 두지 않음.

```js
function buildCaption(subject, userCaption) {
  const s = String(subject || "").trim();
  const u = String(userCaption || "").trim();
  if (!s && !u) return "";
  if (!u) return s;
  if (!s) return u;
  return `${s}\n\n${u}`;
}
```

단위 테스트로 세 가지(제목만 / 제목+사용자 / 둘 다 빈 값) 고정.

- [ ] **Step 2: CLI**

```bash
node scripts/cafe-to-instagram/cli.js publish --url "https://naver.me/..." [--caption "..."] [--dry-run] [--fixture path.json]
```

흐름: resolve → fetch → extract → `buildCaption(subject, --caption)` → prepare → host → publish → cleanup → stdout JSON `{ ok, subject, caption, imageCount, truncated, mediaId, permalink? }`

`--dry-run`: publish/host 생략, 추출된 이미지 URL·**최종 caption**만 출력

`--fixture`: 네트워크 article fetch 대신 로컬 JSON 픽스처 사용 (`art` 만료 시 dry-run 검증용)

- [ ] **Step 3: 로컬 dry-run** (네트워크 허용 환경)

```bash
node scripts/cafe-to-instagram/cli.js publish --url "https://naver.me/GII49sLm" --dry-run
```

Expected: subject·caption에 `화요 정모 후기` 포함, imageCount ≥ 1  

`art` 만료/`0004`이면 실패로 코드 회귀로 오인하지 말고:

```bash
node scripts/cafe-to-instagram/cli.js publish --fixture scripts/test/fixtures/cafe-article-4888-sample.json --dry-run
```

으로 대체 통과.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(cafe-ig): add CLI for cafe share URL to Instagram publish"
```

---

### Task 6: Cursor 스킬 + Superpowers 표

**Files:**
- Create: `.cursor/skills/naver-cafe-to-instagram/SKILL.md`
- Modify: `.cursor/rules/superpowers.mdc` (스킬 목록 행 추가)
- Modify: `.cursor/skills/using-superpowers/SKILL.md` 는 건드리지 않음(목록은 rules 표)

- [ ] **Step 1: SKILL.md 작성**

필수 섹션:

1. **When to use** — 사용자가 카페 공유 URL을 인스타에 올려 달라 할 때  
2. **Preconditions** — IG 프로페셔널·`IG_*` 토큰 env·**이미지 재호스팅(Storage) 자격**·공유 URL에 `art`  
3. **Steps** — CLI 호출 순서, dry-run 먼저, 캡션=`제목`(+사용자 문구), 성공 시 permalink 보고  
4. **Failures** — `art` 없음, 0004 로그인, IG 계정 개인, 비율/용량 오류, **부분 게시 금지(전체 abort)**  
5. **Security** — 토큰/`art` 로그·커밋 금지  
6. **Policy** — 카페 회원 전용 콘텐츠를 인스타로 재배포하는 것은 **운영자 판단·카페 규정** 하에 수행 (스펙 §7)  
7. **Mobile** — Cloud Agent에서 동일 CLI; 사용자 PC Chrome 불필요(V1)  
8. **Out of scope** — 폴링, 스토리, 브라우저 폴백  

- [ ] **Step 2: `superpowers.mdc` 표에 추가**

| 상황 | 스킬 경로 |
| 카페 공유글 이미지를 인스타에 올릴 때 | `.cursor/skills/naver-cafe-to-instagram/SKILL.md` |

- [ ] **Step 3: Commit**

```bash
git commit -m "docs(skill): add naver-cafe-to-instagram skill and index row"
```

---

### Task 7: 검증 게이트 + 문서 마감

**Files:**
- Modify: `package.json` (루트에 `test:cafe-ig` 스크립트 있으면 추가) 또는 README에 테스트 명령만
- Modify: `docs/superpowers/specs/2026-08-07-naver-cafe-to-instagram-design.md` — 승인 체크 반영

- [ ] **Step 1: 단위 테스트 전부**

```bash
node --test scripts/test/cafe-to-instagram/*.test.js
```

Expected: 전부 PASS

- [ ] **Step 2: (토큰 준비된 환경만) 실게시 E2E — 수동**

스킬/README에 체크리스트로만 남김. CI에 넣지 않음.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(cafe-ig): wire cafe-to-instagram unit test script"
```

---

## 구현 시 주의

- `@.cursor/skills/verification-before-completion/SKILL.md` — 완료 주장 전 테스트 출력 확인  
- `@.cursor/skills/writing-skills/SKILL.md` — 스킬은 절차·실패 모드 중심, 서사 금지  
- **절대** `firebase deploy` 실행하지 않음  
- PR/커밋에 access token·`art` 실값 금지 (픽스처는 redact)

## 백로그 (이 계획 밖)

- `art` 없는 URL → Remote Control/브라우저 세션 폴백  
- 게시판 폴링 자동화  
- HEIC→JPEG 변환, 스마트 크롭  
- 캡션 템플릿/해시태그 정책  
