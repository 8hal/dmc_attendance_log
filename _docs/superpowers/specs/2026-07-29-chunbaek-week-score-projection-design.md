# 춘백 주간 출석 — 확정 점수 + 달성 예정 안내

날짜: 2026-07-29  
상태: **승인됨**  
관련: `2026-07-29-chunbaek-attendance-score-design.md`

## 정책

- **확정 점수**: 출석·예외 모두 `date <= today`만 반영 (미래 예외는 점수에 넣지 않음).
- **스케줄 안내**: 홈 `week-bar`에 확정 점수 옆 한 줄 힌트.

| 상황 | 표시 |
|------|------|
| 이미 달성 | `3.0 / 3점` |
| 미달 + 미래 예외로 목표 도달 | `2.0 / 3점  ·  예외 반영 시 달성 예정` |
| 그 외 미달 | `1.0 / 3점  ·  출석 N회 더 필요` |

```
projected = weekScore + futureExceptionCount × 0.5
N = ceil(weekTarget − projected)
```

## 범위

- In: `computeWeekStats` → `futureExceptionCount`, `weekHint` / 홈 FE
- Out: 타임라인·나 탭·미래 예외 선반영(PR #66 폐기)
