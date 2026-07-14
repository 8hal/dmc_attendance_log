# 설계: `members.isRegularMember` (정회원 여부)

> 작성일: 2026-07-14  
> 상태: **설계만** — 구현·백필·API 변경 **아직 하지 않음**  
> 배경: 동마클 정회원이 아닌 외부 추천으로 춘백에 참여하는 사용자 1명. 기능 전용 플로우는 오버 스펙.

---

## 1. 문제

춘백 참가자는 MVP에서 **DMC `members` 부분집합** (`chunbaekS3.participant === true`)으로 묶여 있다.  
정회원이 아닌 외부 추천 참가자를 넣으려면:

| 우회 | 문제 |
|------|------|
| `hidden: true` | 춘백 API·시드가 `hidden`을 전부 제외 → **활동 불가**. 의미도 탈퇴·보관용이라 정책상 부적절 |
| 게스트 전용 가입/명단 분리 | 1명 대응에 오버 스펙 |
| 시트만으로 관리 | 팀·출석률·주간 집계에 안 잡힘 |

필요: **출석 명단(`members`)에는 두되, 정회원 여부를 데이터로 구분**.

---

## 2. 결정 요약

| 항목 | 결정 |
|------|------|
| 신원 저장소 | **`members` 유지** (춘백·DMC 느슨한 완전 분리 ❌) |
| 정회원 필드 | 루트 **`isRegularMember: boolean`** |
| 기존 정회원 | 필드 없음 허용 ❌ → **`true`로 백필** (구현 시) |
| 외부 추천·비정회원 | `isRegularMember: false` + (춘백이면) `chunbaekS3.participant: true` |
| `hidden` | **탈퇴·보관만**. 비정회원 표시에 사용 금지 |
| DMC 정모 출석부 노출 | **이번 범위 밖** — 다음에 고민 (API 필터·UX 미결정) |
| 구현 | **문서만**. 백필 스크립트·API·UI 변경은 후속 |

---

## 3. 필드 정의

```javascript
members/{memberId} {
  nickname: string,
  hidden: boolean,           // 탈퇴·보관. 기존 의미 유지
  isRegularMember: boolean,  // NEW — 동마클 정회원 여부
  // ...
  chunbaekS3?: {
    participant: boolean,
    profileComplete: boolean,
    // ...
  }
}
```

### 의미

| `isRegularMember` | 의미 |
|-------------------|------|
| `true` | 동마클 정회원 (출석 명단·명부 동기화 대상의 기본) |
| `false` | 비정회원. 예: 춘백 외부 추천 참가. `hidden === false`여도 정회원이 아님 |

### 백필 규칙 (구현 시)

1. `hidden !== true` 이고 문서에 `isRegularMember`가 없으면 → **`true` 설정**
2. 이미 `true`/`false`가 있으면 유지
3. `hidden === true`(보관)인 문서의 백필 정책: 구현 계획에서 확정  
   - 초안 권장: 보관 문서도 **과거 정회원이면 `true`** (이력 명확). `false`로 바꾸지 않음
4. **「필드 없음 = 정회원」을 장기 기본으로 두지 않음.** 런타임 해석 fallback은 전이 기간에만 허용 가능하나, 목표는 **전원 명시 boolean**

---

## 4. 춘백과의 관계

춘백 접근 조건은 **변경하지 않음** (현행 유지):

```
chunbaekS3.participant === true && hidden !== true
```

- `isRegularMember`는 춘백 roster·출석 API 게이트에 **필수가 아님**
- 외부 추천 1명 절차(구현 후 운영):

  1. `members` 생성: `nickname`, `hidden: false`, **`isRegularMember: false`**
  2. `chunbaekS3.participant: true`, `profileComplete: false`
  3. (가능하면) `chunbaek-s3-names.txt` / participants JSON 반영
  4. 앱 온보딩은 정회원과 동일

정모에 처음 온 사람(명부 외)은 기존 **`isGuest` 명부 외 출석** 경로를 유지한다.  
그날로 `members`를 만들거나 `isRegularMember`를 쓸 필요 없음.

---

## 5. 범위 / 비범위

### In scope (이 문서)

- 필드 의미·위치·백필 원칙
- `hidden`과 역할 분리
- 춘백 외부 참가와의 관계
- DMC 출석부 노출은 **후속 과제**로 명시

### Out of scope (지금은 하지 않음)

- Firestore 백필 실행
- `add-member` / `update-member` / sync 스크립트 반영
- DMC `action=members` 등 출석부 API 필터 변경
- 키오스크·attendance UI에 「정회원/비정회원」 노출  
  (기존 원칙: 출석 명부 ≠ 정회원 명단 UI — `_docs/superpowers/specs/2026-06-13-attendance-kiosk-blocker2-design.md`)
- 춘백·DMC 컬렉션 완전 분리
- 게스트 전용 온보딩 UI

---

## 6. 후속 (다음 고민)

1. **DMC 정모 출석부:** `isRegularMember === false`를 명부에서 숨길지, 구분해 보일지, 명부 외만 쓸지
2. **데이터 딕셔너리** (`_docs/knowledge/data-dictionary.md`)에 `members.isRegularMember` 항목 추가 (구현 PR과 함께)
3. **신규 회원 API:** 생성 시 기본 `isRegularMember: true`, 명시적 `false`만 비정회원
4. **2명 이상 외부 참가** 시: 전용 플로우·느슨한 연결 재검토

---

## 7. 채택하지 않은 대안

| 대안 | 이유 |
|------|------|
| `hidden: true`로 정모만 숨김 | 춘백 차단 + 정책 의미 왜곡 |
| `chunbaekOnly: true` | 춘백 특화. 정회원 여부 일반 개념과 어긋남 |
| `membershipType` enum | 1~2명·현 단계엔 과함. boolean으로 충분 |
| 춘백 명단 완전 분리 | MVP·인원 규모 대비 이중 관리 비용 |

---

## 8. 승인·구현 게이트

- [x] 설계 방향 사용자 합의: `members` + `isRegularMember`, 출석부 UX는 후속
- [x] 기존 정회원 **`true` 백필** 필요 — 사용자 확인
- [ ] 스펙 리뷰
- [ ] 구현·백필 착수 전 별도 승인 (이 문서로는 **개발 시작 금지**)
