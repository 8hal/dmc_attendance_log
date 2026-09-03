# 작업 요청서 — 버스 TV용 탑승 QR 안내 그래픽

> **작성일:** 2026-09-03  
> **요청 목적:** 단체 대회 버스에서 회원이 탑승 체크용 QR을 쉽게 이해·스캔하도록, 관광버스 앞쪽 TV에 붙이거나(인쇄) / 옆에 두는 **안내 그래픽 에셋** 제작  
> **제품 근거:** `event-admin.html` QR, `boarding.html` 리다이렉트, `pamphlet-group-event*.html`, `_docs/superpowers/specs/2026-08-28-event-home-profile-bus-prd.md`, `2026-08-30-group-event-bus-bib-confirm-pamphlet-design.md`  
> **상태:** 초안 (디자이너·총무 확인용 팩트 정리)

---

## 1. 한 줄 요약

자리에 앉은 회원이 **앞쪽 관광버스 TV에 붙은 QR**을 폰으로 찍어 `event-home` 탑승 랜딩으로 들어가게 하는 **인쇄/부착용 안내물**이 필요하다. QR URL은 **대회마다 다르고**, 가는·오는 편은 **같은 QR**이다.

---

## 2. 배경 · 운영 맥락

| 항목 | 사실 |
|------|------|
| 장착 위치 | **관광버스 앞쪽 TV**에 크게 (문·좌석 아님). 사용자 지정 2026-08-30 |
| 스캔 시점 | 탑승 직후가 아니라 **자리에 앉은 뒤** |
| 주 진입로 | 카톡 링크가 아님. TV QR이 회원 주 경로 |
| 보조 경로 | 총무가 `event-admin` 「탑승 링크 복사」로 개별 전송 |
| 왕복 | 가는 편·오는 편 **각각** 탑승 체크. **같은 QR**을 돌아오는 버스에서도 다시 찍음 |
| 편 열림 | 총무가 `event-admin`에서 가는/오는 중 **지금 받을 편만** 켬 (`openLeg`) |

참고 카피(제품·팸플릿과 동일 취지):

- 「버스에 타서 자리에 앉으면, 앞쪽 관광버스 TV에 크게 붙어있는 QR 코드를 폰 카메라로 찍으면 시작됩니다」
- 「QR은 가는편·오는편 공통이에요. 한 번 TV에 붙여두면 돌아오는 버스에서도 같은 QR로 체크할 수 있어요」

---

## 3. QR이 가리키는 URL (정확)

### 3.1 정식(캐논) — 총무 `event-admin`이 생성

```
https://dmc-attendance.web.app/event-home.html?eventId={EVENT_ID}&board=1
```

- `{EVENT_ID}` 예: `evt_2026-09-05_23_dmz` (철원 시범)
- **쿼리에 `leg=` 없음** — outbound/return 공통 1개 URL
- 생성 코드: `event-admin.html` → `participantUrl()` → `event-home.html?eventId=…&board=1` (절대 URL은 `window.location.href` 기준)
- 화면 미리보기 QR: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=…` (UI용 160×160 img). **TV 부착용으로는 해상도 부족** → 별도 고해상도 QR 필요

### 3.2 레거시(호환) — 옛 북마크·`boarding-admin` / `boarding.html`

```
https://dmc-attendance.web.app/boarding.html?eventId={EVENT_ID}
```

→ 즉시 `event-home.html?eventId=…&board=1` 로 `location.replace`.

**새 인쇄물에 넣을 값은 3.1 캐논 URL을 권장.** 레거시도 동작하지만 불필요한 홉이 생김.

### 3.3 회원 vs 총무

| 대상 | URL | 비고 |
|------|-----|------|
| 회원(TV QR) | `event-home.html?eventId=&board=1` | `&board=1`이 탑승 랜딩·자동 `self-board` 트리거 |
| 회원 홈(일반) | `event-home.html?eventId=` | board 없음 = 일반 홈 |
| 총무 | `event-admin.html?eventId=` (+ 비밀번호) | QR에 넣지 않음 |
| (구) 총무 | `boarding-admin.html?eventId=` | 레거시 운영 UI; QR은 아직 `boarding.html`을 인코딩 |

`&board=1` 동작 요약: 닉 저장됨 + 열린 편이 본인 행에 필요하면 `self-board` 후 탑승 완료 연출 → 홈. 닉 없으면 닉 선택. 편 안 열려 있으면 보드하지 않고 홈만.

---

## 4. 권장 포스터/안내 문구 (제품 근거)

### 헤드라인 (택1)

- **자리에 앉아 QR을 찍어 주세요**
- **버스 탑승 체크 — QR 스캔**
- **동탄 마라톤 클럽 · 버스 탑승**

### 단계 (짧게, TV에서 읽기)

1. 자리에 앉기  
2. 폰 카메라로 이 QR 찍기  
3. 화면에서 본인 확인 · 탑승 완료  
4. (이어서) 종목·배번 입력  

### 면책·안내 (작은 글씨)

- 가는 버스·오는 버스 **각각** 한 번씩 찍어 주세요. (QR은 같습니다)
- 탑승이 안 열리면 총무가 편을 켠 뒤에 다시 찍어 주세요.
- QR을 못 찍으면 총무에게 「탑승 링크」를 받아 주세요.
- 배번을 넣었다고 바로 기록이 뜨지 않습니다. 대회가 끝난 뒤 기록을 확인해 주세요.

### 넣지 말 것

- 총무 비밀번호, `event-admin` URL, API/필드명(`openLeg`, `self-board` 등)
- 「가는 편 전용 / 오는 편 전용」다른 QR (제품상 없음)

---

## 5. 브랜드 · 비주얼 참고

| 토큰/자산 | 값 |
|-----------|-----|
| 클럽명 | 동탄 마라톤 클럽 (동마클) |
| 로고 | `assets/dmc_logo.png` |
| Primary | `#2563eb` (`--dmc-color-primary` / `--dmc-blue-9`) |
| Primary hover/진한 | `#1d4ed8` (`--dmc-blue-10`) |
| 본문 | `#0f172a` |
| 보조 텍스트 | `#64748b` |
| 성공(탑승 완료 톤) | `#059669` 계열 |
| 회원 UI 셸 | `assets/design-tokens.css`, `assets/event-member-shell.css` |
| 팸플릿 톤 | 파란 그라디언트 히어로 (`#2563EB` → `#1D4ED8`), 흰 카드, system-ui |

춘백(춘천) 오렌지 포스터 톤(`_docs/design/chunbaek-design-tokens.md`)은 **단체 대회 버스 UI와 별 브랜드**. 이 요청서는 **DMC 블루**를 기본으로 한다.

**레포에 없는 것:** TV용 인쇄 규격(mm/인치), 16:9 템플릿, 포스터 PSD. UI QR 200px만 존재. 「크게 인쇄」만 문서·팸플릿에 반복됨. 과거 A4는 **손체크 명단** 맥락이지 QR 포스터 규격이 아님.

---

## 6. 권장 물리 규격 · 비율 (제안 — 레포 미기재, 제작 가이드)

| 용도 | 제안 | 이유 |
|------|------|------|
| TV 면에 붙이는 인쇄지 | **A4 세로** 또는 **A5~A4**, QR 모듈 **한 변 8–12 cm 이상** | 좌석에서 폰 카메라로 찍기; 관리 UI 200px는 사용 금지 |
| TV 옆 거치/클립 | A4 세로, 상단 헤드라인 + 중앙 QR | 유리 반사·화면 가림 최소화 |
| TV 화면 자체 송출(디지털) | **16:9** 풀프레임(예: 1920×1080), 중앙 큰 QR + 짧은 단계 | 「인쇄해서 붙인다」가 주 운영 서술이나, 디지털 대안 시 |
| QR quiet zone | 모듈 폭 ≥ 4칸, 흰 여백 | 스캔 실패 방지 |
| 파일 | PDF(인쇄) + PNG@300dpi(또는 SVG+고해상도 QR) | 총무가 대회마다 QR만 교체 가능하게 **틀(셸) + QR 슬롯** 권장 |

**중요:** `eventId`가 대회마다 바뀌므로, (A) 셸만 인쇄하고 QR은 총무가 출력해 붙이거나 (B) 대회마다 완성본을 다시 뽑는 워크플로를 요청서에 명시할 것.

---

## 7. 관련 화면 · 자산 맵

| 경로 | 역할 |
|------|------|
| `event-admin.html` | 총무: 편 스위치, 참가자 QR·링크 복사 (캐논 URL) |
| `event-home.html?eventId=&board=1` | 회원 탑승 랜딩 |
| `boarding.html` | 옛 QR → 홈 board=1 리다이렉트만 |
| `boarding-admin.html` | 레거시 총무 UI; QR은 아직 boarding.html |
| `pamphlet-group-event-member.html` | 회원 안내 카피·6단계 플로우 |
| `pamphlet-group-event.html` | 총무: TV에 QR 인쇄·부착 지시 |
| `assets/dmc_logo.png` | 브랜드 마크 |

---

## 8. 납품물 체크리스트 (디자이너용)

- [ ] 인쇄용 1종(A4 권장) — 헤드라인 + 단계 + QR 슬롯/샘플
- [ ] (선택) 16:9 TV 송출용 1종
- [ ] 빈 QR 슬롯 버전 + 샘플 QR 버전(테스트 URL 가능)
- [ ] 브랜드: 로고 + DMC 블루 팔레트
- [ ] 한글 카피 최종본 (위 §4 후보에서 확정)
- [ ] 편집 가능 원본(AI/Figma/Canva 등) + PDF

---

## 9. 사용자(요청자) 확인 질문 (최대 3)

1. **부착 vs 송출:** TV **유리/베젤에 인쇄물을 붙이는** 것이 확정인가, 아니면 **TV 화면에 이미지를 띄우는** 것도 필요한가?  
2. **대회마다 바뀌는 QR:** 고정 셸 + 교체형 QR 스티커인가, **대회마다 완성본 PDF**를 새로 뽑는가?  
3. **실제 TV 크기·좌석 거리:** 대략 인치/가로(cm)와 맨 뒷자리에서의 거리를 알 수 있으면 QR 최소 크기를 확정할 수 있다.

---

## 10. 작업 요청서 섹션 아웃라인 (최종본용)

1. 목적 · 사용 장면  
2. 타깃(회원 / 총무는 인쇄만)  
3. QR URL 규칙 · 샘플 eventId  
4. 카피(헤드라인·단계·주의)  
5. 브랜드·색·로고  
6. 규격·비율·해상도·여백  
7. 가변 영역(eventId QR) 워크플로  
8. 납품 포맷·수량  
9. 일정·승인  
10. 참고 링크(프로덕션 팸플릿·관리 화면)

---

## 11. 참고 링크 (프로덕션)

- Hosting: `https://dmc-attendance.web.app/`
- 회원 안내: `…/pamphlet-group-event-member.html`
- 총무 안내: `…/pamphlet-group-event.html`
- 예시 회원 홈: `…/event-home.html?eventId=evt_2026-09-05_23_dmz`
- 예시 탑승 QR 목적지: `…/event-home.html?eventId=evt_2026-09-05_23_dmz&board=1`
