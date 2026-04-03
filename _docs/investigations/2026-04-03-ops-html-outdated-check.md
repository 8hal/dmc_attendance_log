# ops.html 최신 시스템 반영 체크

> 체크일: 2026-04-03  
> 기준: 최근 3개 커밋 (confirmedCount 제거, confirmSource 단순화, P0 버그 수정)

## 체크 결과

### ✅ 반영됨

1. **data-integrity API (f93cc3c)** — 이미 반영됨
   - `ops.html` line 144: "Count 불일치" → **현재는 "phantom jobs"**를 표시
   - `ops.html` lines 231-248: `renderIntegrity()` — phantom jobs 렌더링
   - Backend (lines 1864-1883): confirmed 상태인데 race_results 0건인 잡만 이슈로 보고

2. **confirmSource 단순화 (4d5d22e)** — 이미 반영됨
   - `ops.html` lines 162-204: `confirmSource` 통계 표시
   - Backend (lines 1735-1748): `personal / operator / other` 3개로 집계
   - **BUT**: ops.html은 여전히 `event / suggestion` 표시 중 ⚠️

### ❌ 수정 필요

#### 1. confirmSource 경로 표기 불일치 (P1)

**현재 ops.html (lines 198-202)**:
```html
<tr><td>🔍 개인 검색 (personal)</td>...
<tr><td>✨ 제안 (suggestion)</td>...
<tr><td>📋 이벤트 (event)</td>...
<tr><td>기타/이전</td>...
```

**Backend 실제 집계 (lines 1746-1748)**:
```javascript
if (src === "personal") confirmSourceCount.personal++;
else if (src === "operator") confirmSourceCount.operator++;
else confirmSourceCount.other++;
```

**문제**: 
- Backend는 `personal / operator / other` 3개만 반환
- Frontend는 `personal / suggestion / event / other` 4개 표시
- `suggestion`, `event` 행은 항상 0건으로 표시됨

**수정**:
```html
<tr><td>🔍 개인 입력 (personal)</td><td class="num">${src.personal||0}</td><td class="num">${srcPct(src.personal||0)}%</td></tr>
<tr><td>📋 운영자 입력 (operator)</td><td class="num">${src.operator||0}</td><td class="num">${srcPct(src.operator||0)}%</td></tr>
<tr><td>기타/이전</td><td class="num">${src.other||0}</td><td class="num">${srcPct(src.other||0)}%</td></tr>
```

#### 2. 통계 라벨 명확성 개선 (P2)

**현재 (line 144)**:
```html
<div class="stat-label">Count 불일치</div>
```

**수정 제안**:
```html
<div class="stat-label">Phantom Jobs</div>
```

**이유**: "Count 불일치"는 이전 `confirmedCount` 시대 용어. 현재는 "phantom jobs" (confirmed인데 race_results 없는 잡)

---

## 수정 우선순위

| 항목 | 심각도 | 이유 |
|------|--------|------|
| confirmSource 경로 불일치 | P1 | 실제 데이터 표시 오류 (suggestion/event 항상 0) |
| 통계 라벨 ("Count 불일치") | P2 | 용어 정확도 (기능엔 영향 없음) |

---

## 다음 단계

1. ✅ **즉시 수정**: confirmSource 경로 3개로 교체
2. 선택: 통계 라벨 "Phantom Jobs"로 변경
3. 검증: 로컬 에뮬레이터에서 ops.html 접속 확인

---

## 관련 파일

- `ops.html`: lines 162-204 (confirmSource 표시)
- `functions/index.js`: lines 1728-1800 (member-stats API)
- 커밋 참조:
  - `4d5d22e`: confirmSource enum 단순화
  - `f93cc3c`: confirmedCount 제거 → phantom jobs로 전환
