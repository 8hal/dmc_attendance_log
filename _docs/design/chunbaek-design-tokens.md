# 춘백 S3 디자인 토큰

> 작성일: 2026-07-13  
> 기준 UI: **내 100일** (타임라인)  
> 구현: `chunbaek/css/tokens.css` → `chunbaek.css`에서 `@import`

## 디자인 원칙

내 100일에서 만족스러운 패턴을 앱 전반의 기본 톤으로 쓴다.

| 원칙 | 설명 |
|------|------|
| 배경은 조용하게 | 흰/연회색 (`surface-muted`) — 브랜드색 풀배경 지양 |
| 상태는 배지로 | 출석·오늘·미출석을 색·형태로 구분 |
| 브랜드는 포인트로 | 오렌지·시안은 테두리·메모·active 탭 등 액센트 |
| 출석 완료 = 초록 | `attend-*` 시맨틱 토큰 |

**예외:** 온보딩 welcome-hero는 포스터 모드(풀 오렌지) 유지.

## 토큰 계층

### 1. Brand (`--brand-*`)

춘천마라톤 공식 톤. 헤더·포스터·브랜드 액센트용.

- `--brand-orange`, `--brand-cyan`, `--brand-black`, `--brand-white`

레거시 alias: `--chun-orange`, `--primary`, `--accent` 등 (기존 CSS 호환).

### 2. Semantic (`--surface-*`, `--attend-*`, `--today-*`, …)

내 100일 컴포넌트에서 추출한 의미 단위.

| 토큰 | 용도 | 내 100일 참조 |
|------|------|----------------|
| `--surface-muted` | 섹션 헤더·요약 카드 배경 | `.week-header` |
| `--attend-fg` / `--attend-bg` | 출석 완료 | `.slot-day-badge--attend`, `.week-pill--done` |
| `--today-fg` / `--today-bg` / `--today-ring` | 오늘 | `.slot-day-badge--today` |
| `--miss-border` | 미출석 링 | `.status-badge--miss` |
| `--pill-done-bg` 등 | 주간 진행 점 | `.week-pill--*` |

### 3. Component (`--badge-*`, `--radius-*`, `--row-*`)

크기·간격·모서리. 내 100일 레이아웃 SSOT.

- 일차 배지: 40×40px, radius 12px
- 상태 배지: 44×44px, radius 14px
- 주간 헤더: radius 10px, padding 12px

## 적용 현황 (2026-07-13)

| 화면 | 상태 |
|------|------|
| 내 100일 | 토큰 매핑 완료 (시각 변화 없음) |
| 팀 `team-summary` | 토큰 기반 2열 스탯 카드로 재디자인 |
| 홈 | 기존 유지 (만족도 높음, 미적용) |
| 온보딩 | 포스터 예외 유지 |

## team-summary 패턴

`week-header`와 같은 `surface-muted` 카드 안에 2열:

- 좌: 시즌 출석률 % + 「팀 평균」
- 우: 이번 주 3회 달성 **N명** + 「N명 중」+ 초록 progress bar

`0/34명` 분수 표기는 사용하지 않는다 (리스트 `1/3` 제거와 동일 맥락).

## 다음 단계 (백로그)

- 팀 프로필 모달·피드 토큰 정리
- 홈 `before-season-card`를 시맨틱 토큰으로만 치환 (레이아웃 유지)
- admin.css 중복 토큰 검토
