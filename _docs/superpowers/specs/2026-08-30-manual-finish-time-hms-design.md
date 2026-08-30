# 수동 완주 시각 시·분·초 분리 입력

**상태:** 승인·구현 (2026-08-30)  
**범위:** `event-home.html` 기록 직접 입력(`#profileManualForm`)만

## 목표
자유 텍스트 `1:42:00` 한 칸 대신 시·분·초를 나눠 잘못 입력을 줄인다.

## 동작
- 필드: `#profileTimeH` / `#profileTimeM` / `#profileTimeS` (`inputmode=numeric`)
- 분·초 2자리 채우면 다음 칸 포커스
- 저장 시 `EventFinishTime.composeNetTime` → `netTime` (예: `1:42:00`)
- 시 0–23, 분·초 0–59, 숫자만
- PB 체크는 같은 줄 오른쪽 유지
- DNS/DNF 선택 시 시·분·초 비움

## API
변경 없음 (`self-confirm`의 `netTime` 문자열 유지)
