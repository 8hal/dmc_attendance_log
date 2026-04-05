---
name: firestore-data-modification
description: Use when writing scripts to modify Firestore data (scrape_jobs, race_results, members collections), or when user requests to fix/update/delete database records
---

# Firestore 데이터 수정

## 근거

2026-03-17: 사용자 승인 없이 607건 bulk insert → 롤백 필요
2026-04-05: dry-run 없이 ohmyrace 118 잡 수정 → data-write-safety 룰 위반

Firestore 수정은 되돌리기 어렵고 다운스트림 지표에 즉시 영향을 미친다.

## 핵심 원칙

> **Firestore 데이터를 수정하기 전에 반드시 dry-run 결과를 보여주고 사용자 승인을 받는다.**

## 필수 절차 (4단계)

### 1단계: 영향 범위 분석 (AI가 먼저 설명)

사용자에게 명확히 설명:
- 몇 개 문서?
- 어느 컬렉션?
- 어느 필드?
- 변경 전/후 값은?

### 2단계: Dry-run 스크립트 작성 (필수)

모든 Firestore 수정 스크립트는 `--dry-run` 플래그 지원:

```javascript
const dryRun = process.argv.includes("--dry-run");

// 변경 전 출력
console.log(`[${dryRun ? "DRY RUN" : "실행"}] ${doc.id} 업데이트 예정`);
console.log(`  현재: ${data.field}`);
console.log(`  변경 후: ${updates.field}`);

// dry-run이면 실제 수정 스킵
if (!dryRun) {
  await doc.ref.update(updates);
}
```

### 3단계: Dry-run 실행 및 사용자 확인

AI가 dry-run을 먼저 실행하고 결과를 사용자에게 보여줌:

```bash
node scripts/fix-something.js --dry-run
```

출력 예시:
```
[DRY RUN] 영향 범위:
- 문서 수: 1개
- 컬렉션: scrape_jobs
- Job ID: ohmyrace_118
  현재 eventName: Ohmyrace Event 118
  변경 후: 2026 군산 새만금 마라톤 대회
```

명시적 질문: **"이대로 진행할까요?"**

### 4단계: 승인 후 실행

사용자가 "진행", "yes", "ok" 등으로 승인한 경우에만:

```bash
node scripts/fix-something.js  # dry-run 플래그 없이
```

## ❌ 금지 행동

```
❌ dry-run 없이 스크립트 바로 실행
❌ 사용자 승인 없이 실행
❌ "이미 실행했습니다" 선언 후 결과 보고
❌ "간단한 수정이니까" 예외 처리
❌ 스크립트 작성과 동시에 실행
```

## Red Flags - 멈추고 절차 따르기

다음 생각이 들면 **즉시 중단**, dry-run부터:

- "영향이 작으니까 바로 실행"
- "시간 절약을 위해 한 번에"
- "사용자가 원한다고 했으니까"
- "rollback이 있으니까 괜찮아"
- "이미 승인받은 거나 마찬가지"

**모든 경우: dry-run → 사용자 확인 → 실행**

## 예외 없음

다음 경우에도 절차 준수:
- 1개 문서만 수정
- 긴급 상황
- 이전에 비슷한 작업 승인받음
- 롤백 가능
- 사용자가 급함

**절차 생략 = 룰 위반**

## Common Mistakes

### ❌ 나쁜 예: 바로 실행
```javascript
async function fix() {
  await doc.ref.update({ eventName: "새 이름" });
  console.log("✅ 수정 완료");
}
```

### ✅ 좋은 예: dry-run 먼저
```javascript
async function fix() {
  const dryRun = process.argv.includes("--dry-run");
  
  console.log(`[${dryRun ? "DRY RUN" : "실행"}]`);
  console.log(`현재: ${data.eventName}`);
  console.log(`변경: 새 이름`);
  
  if (!dryRun) {
    await doc.ref.update({ eventName: "새 이름" });
    console.log("✅ 수정 완료");
  } else {
    console.log("\n실행하려면: node script.js");
  }
}
```

## Rationalization Table

| 변명 | 현실 |
|------|------|
| "1개만 수정이니까 괜찮아" | 1개도 잘못 수정하면 롤백 필요. dry-run은 30초. |
| "이미 승인받았어" | 구체적 결과 보여주고 승인받는 게 진짜 승인. |
| "간단한 수정이라" | 간단한 수정이 큰 사고. 절차 생략 = 큰 위험. |
| "백업 있으니까" | 백업 복구는 다운타임. 예방이 최선. |
| "rollback 가능해" | Rollback도 데이터 쓰기. 두 번 위험 감수할 이유 없음. |

## Real-World Impact

**2026-03-17 사례:**
- 607건 bulk insert (승인 없이)
- 플랜 미확정 상태에서 데이터 오염
- 롤백 필요 → 작업 시간 낭비

**2026-04-05 사례:**
- ohmyrace 118 잡 수정 (dry-run 없이)
- 다행히 문제없었으나 절차 위반
- 이 스킬 작성의 계기

**교훈:** 절차를 지키면 사고 방지. 생략하면 운에 맡기는 것.
