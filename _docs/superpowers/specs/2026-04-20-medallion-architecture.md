# Medallion Architecture for DMC Race Data

## 문서 정보

- **작성일**: 2026-04-20
- **작성자**: AI Assistant (with Taylor)
- **상태**: Draft
- **목적**: 동일 정보의 다중 저장소 문제 해결 및 데이터 신뢰도 계층화

## 배경

### 현재 문제점

2026-04-20에 발생한 김형진/서윤석/조상현 기록 로드 실패 이슈를 통해 다음 문제가 드러남:

1. **데이터 파편화**: 동일 정보(distance, realName, bibNumber)가 3곳에 중복 저장
   - `scrape_jobs`: 스크랩 원본 데이터
   - `race_events.participants`: 확정 중 임시 데이터
   - `race_results`: 확정 완료 SSOT 데이터

2. **일관성 결여**: 수동 수정 시 동기화 불가
   - 예: `race_results`는 `distance: full`, `participants`는 `distance: 10k`

3. **신뢰도 불명확**: 어느 데이터가 최신/정확한지 판단 불가
   - `scrape_jobs`: 원본이지만 outdated
   - `participants`: 확정 중이지만 provisional
   - `race_results`: 확정 완료지만 참조 없음

4. **중복 생성 위험**: 동일 기록이 여러 경로로 생성될 가능성

### 근본 원인

**Medallion Architecture 부재**: 데이터의 성숙도(maturity) 계층이 없어 Bronze(raw) ↔ Silver(staging) ↔ Gold(SSOT) 간 관계와 우선순위가 명확하지 않음.

## 제안: Medallion Architecture 도입

### 핵심 원칙

| Layer | 역할 | 신뢰도 | 가변성 | 현재 대응 |
|-------|------|--------|--------|-----------|
| **Bronze** | Raw 원본 (불변) | 낮음 | 읽기 전용 | `scrape_jobs` |
| **Silver** | Staging (가변) | 중간 | 확정 전까지 수정 가능 | `race_events.participants` |
| **Gold** | SSOT (최종) | 높음 | 확정 후 수정 가능, 버전 추적 | `race_results` |

### 데이터 흐름

```
Bronze (scrape_jobs)
    ↓ 스크랩 완료
Silver (race_events.participants)
    ↓ 운영자 확정
Gold (race_results) ← SSOT
    ↓ (역참조)
Silver 읽기 전용 전환
```

### 규칙

1. **단방향 흐름**: Bronze → Silver → Gold (역방향 쓰기 금지)
2. **Gold 우선**: Gold 존재 시 Silver/Bronze 무시
3. **Silver 동기화**: Gold 생성/수정 시 Silver 자동 참조 업데이트
4. **Bronze 불변**: scrape_jobs는 생성 후 수정 불가 (archive only)

## 설계

### Phase 1: Gold 메타데이터 추가

#### 목표

`race_results`에 데이터 계보(lineage)와 신뢰도 정보 추가

#### 변경사항

**`race_results` 스키마 확장**:

```javascript
{
  // 기존 필드...
  memberRealName: "김형진",
  distance: "full",
  finishTime: "03:40:08",
  
  // 새 필드: 데이터 계보
  dataLineage: {
    source: "operator_confirmation",  // "operator_confirmation" | "personal_input" | "migration"
    sourceJobId: "20260419006",       // Bronze 추적 (scrape_jobs docId)
    confirmedAt: "2026-04-20T10:00:00Z",
    confirmedBy: "operator",          // "operator" | "member"
    lastModifiedAt: "2026-04-20T11:30:00Z",
    modificationCount: 2,             // 수정 횟수
    modificationHistory: [            // (선택) 수정 로그
      {
        timestamp: "2026-04-20T11:30:00Z",
        field: "distance",
        oldValue: "10k",
        newValue: "full",
        modifiedBy: "operator"
      }
    ]
  },
  
  trustLevel: "gold"  // "bronze" | "silver" | "gold"
}
```

#### 마이그레이션 스크립트

```javascript
// scripts/migrate-add-data-lineage.js
async function migrateRaceResults() {
  const results = await db.collection('race_results').get();
  const batch = db.batch();
  let count = 0;
  
  results.forEach(doc => {
    const data = doc.data();
    batch.update(doc.ref, {
      dataLineage: {
        source: data.confirmedBy === 'operator' ? 'operator_confirmation' : 'personal_input',
        sourceJobId: data.jobId || null,
        confirmedAt: data.confirmedAt || data.createdAt,
        confirmedBy: data.confirmedBy || 'operator',
        lastModifiedAt: data.updatedAt || data.confirmedAt || data.createdAt,
        modificationCount: 0
      },
      trustLevel: 'gold'
    });
    
    count++;
    if (count % 500 === 0) {
      // 배치 커밋 및 새 배치 생성
    }
  });
  
  await batch.commit();
}
```

### Phase 2: Silver에 Gold 참조 추가

#### 목표

`race_events.participants`에서 확정된 기록(Gold)을 참조

#### 변경사항

**`race_events.participants` 스키마 확장**:

```javascript
{
  realName: "김형진",
  nickname: "우상향",
  memberId: "yb5pAeavML9TeKHrXmCr",
  distance: "10k",  // 원본 Silver 값 (변경 전)
  
  // 새 필드: Gold 참조
  confirmedResult: {
    docId: "김형진_full_2026-04-19",      // race_results 문서 ID
    distance: "full",                     // Gold 실제 값
    finishTime: "03:40:08",
    overallRank: 189,
    pbConfirmed: true,
    syncedAt: "2026-04-20T11:30:00Z"
  },
  
  useConfirmedData: true  // Gold 우선 사용 플래그
}
```

#### API 수정

**`confirm-one` API**:

```javascript
// functions/index.js
async function confirmOne(req, res) {
  const { eventId, participant } = req.body;
  
  // 1. Gold 레코드 생성/업데이트
  const goldKey = `${participant.realName}_${participant.distance}_${eventDate}`;
  const goldRef = db.collection('race_results').doc(goldKey);
  
  const existing = await goldRef.get();
  const isUpdate = existing.exists;
  
  const goldData = {
    ...participant,
    dataLineage: {
      source: 'operator_confirmation',
      sourceJobId: participant.jobId,
      confirmedAt: isUpdate ? existing.data().dataLineage.confirmedAt : admin.firestore.FieldValue.serverTimestamp(),
      confirmedBy: 'operator',
      lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      modificationCount: isUpdate ? admin.firestore.FieldValue.increment(1) : 0
    },
    trustLevel: 'gold'
  };
  
  await goldRef.set(goldData, { merge: true });
  
  // 2. Silver 참조 업데이트
  const eventRef = db.collection('race_events').doc(eventId);
  const eventDoc = await eventRef.get();
  const participants = eventDoc.data().participants;
  
  const updatedParticipants = participants.map(p => {
    if (p.realName === participant.realName && p.memberId === participant.memberId) {
      return {
        ...p,
        confirmedResult: {
          docId: goldKey,
          distance: participant.distance,
          finishTime: participant.finishTime,
          overallRank: participant.overallRank,
          pbConfirmed: participant.pbConfirmed,
          syncedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        useConfirmedData: true
      };
    }
    return p;
  });
  
  await eventRef.update({ participants: updatedParticipants });
  
  res.json({ success: true, goldKey });
}
```

### Phase 3: UI에서 Gold 우선 표시

#### 목표

Frontend에서 Gold 데이터 우선 사용 및 신뢰도 표시

#### 변경사항

**`group-detail.html` 수정**:

```javascript
function renderParticipant(p) {
  const isConfirmed = p.useConfirmedData && p.confirmedResult;
  
  // Gold 데이터 우선 사용
  const displayData = isConfirmed ? {
    distance: p.confirmedResult.distance,
    finishTime: p.confirmedResult.finishTime,
    overallRank: p.confirmedResult.overallRank,
    pbConfirmed: p.confirmedResult.pbConfirmed
  } : {
    distance: p.distance,
    finishTime: p.finishTime,
    overallRank: p.overallRank,
    pbConfirmed: false
  };
  
  // 신뢰도 표시
  const trustBadge = isConfirmed 
    ? '<span class="badge gold">🟢 확정</span>' 
    : '<span class="badge silver">🟡 임시</span>';
  
  // Distance 불일치 경고
  const distanceWarning = (isConfirmed && p.distance !== p.confirmedResult.distance)
    ? `<span class="warning">⚠️ 코스 변경: ${p.distance} → ${p.confirmedResult.distance}</span>`
    : '';
  
  return `
    <div class="participant" data-status="${isConfirmed ? 'confirmed' : 'provisional'}">
      ${trustBadge}
      <div class="name">${p.nickname} ${p.realName}</div>
      <div class="result">
        ${displayData.finishTime} (${displayData.overallRank}위)
        ${displayData.pbConfirmed ? '<span class="pb-badge">🏆 PB</span>' : ''}
      </div>
      <div class="distance">${displayData.distance}</div>
      ${distanceWarning}
    </div>
  `;
}
```

**CSS 추가**:

```css
.badge.gold {
  background: #4caf50;
  color: white;
}

.badge.silver {
  background: #ff9800;
  color: white;
}

.warning {
  color: #f44336;
  font-size: 0.85em;
}
```

### Phase 4: 중복 생성 방지

#### 목표

동일 기록이 여러 경로로 생성되는 것 방지

#### 구현

**`bulk-confirm` API**:

```javascript
async function bulkConfirm(req, res) {
  const { eventId, participants } = req.body;
  
  const batch = db.batch();
  const goldKeys = new Set();  // 중복 체크
  
  for (const p of participants) {
    const goldKey = `${p.realName}_${p.distance}_${eventDate}`;
    
    // 중복 체크
    if (goldKeys.has(goldKey)) {
      console.warn(`⚠️  중복 무시: ${goldKey}`);
      continue;
    }
    
    goldKeys.add(goldKey);
    
    const goldRef = db.collection('race_results').doc(goldKey);
    const existing = await goldRef.get();
    
    // 이미 Gold 존재하면 스킵 (Last Write Wins 정책에 따라 덮어쓰기)
    // 또는 에러 발생
    if (existing.exists) {
      console.log(`✓ 기존 Gold 업데이트: ${goldKey}`);
    }
    
    batch.set(goldRef, {
      ...p,
      dataLineage: {
        source: 'operator_confirmation',
        confirmedAt: existing.exists ? existing.data().dataLineage.confirmedAt : admin.firestore.FieldValue.serverTimestamp(),
        confirmedBy: 'operator',
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        modificationCount: existing.exists ? admin.firestore.FieldValue.increment(1) : 0
      },
      trustLevel: 'gold'
    }, { merge: true });
  }
  
  await batch.commit();
  res.json({ success: true, count: goldKeys.size });
}
```

### Phase 5: Bronze Archival

#### 목표

`scrape_jobs` 데이터를 Gold 생성 후 archive 상태로 전환

#### 변경사항

**`scrape_jobs` 스키마 확장**:

```javascript
{
  // 기존 필드...
  status: "archived",           // "pending" | "done" | "archived"
  promotedToGold: true,         // Gold로 승격 완료
  promotedAt: "2026-04-20T12:00:00Z",
  goldEventId: "evt_2026-04-19_24"
}
```

**`bulk-confirm` API 수정**:

```javascript
async function bulkConfirm(req, res) {
  // ... Gold 생성 ...
  
  // Bronze archival
  const jobId = participants[0].jobId;
  if (jobId) {
    await db.collection('scrape_jobs').doc(jobId).update({
      status: 'archived',
      promotedToGold: true,
      promotedAt: admin.firestore.FieldValue.serverTimestamp(),
      goldEventId: eventId
    });
  }
  
  res.json({ success: true });
}
```

## 구현 우선순위

| Phase | 작업 | 영향도 | 복잡도 | 우선순위 |
|-------|------|--------|--------|----------|
| Phase 1 | Gold 메타데이터 | 중간 | 낮음 | P0 (필수) |
| Phase 2 | Silver 참조 | 높음 | 중간 | P0 (필수) |
| Phase 3 | UI Gold 우선 | 높음 | 낮음 | P1 (권장) |
| Phase 4 | 중복 방지 | 낮음 | 중간 | P2 (나중) |
| Phase 5 | Bronze Archival | 낮음 | 낮음 | P3 (선택) |

## 예상 효과

### 기능적 효과

1. **데이터 일관성**: Silver ↔ Gold 동기화로 불일치 제거
2. **신뢰도 명확화**: 계층별 역할과 우선순위 명확
3. **중복 방지**: Gold 존재 여부 체크로 중복 생성 차단
4. **추적 가능성**: 데이터 계보(lineage)로 변경 이력 추적
5. **수정 안전성**: 수동 수정 시 Silver 자동 동기화

### 운영적 효과

1. **디버깅 용이**: "왜 이 기록이 안 보이나?" → lineage 확인
2. **데이터 품질**: 신뢰도 계층으로 품질 보증
3. **확장성**: 새로운 데이터 소스 추가 시 Bronze 계층으로 수용

## 위험 및 대응

| 위험 | 영향 | 대응 |
|------|------|------|
| 마이그레이션 실패 | 높음 | 백업 + 롤백 스크립트 준비 |
| 기존 API 호환성 | 중간 | 점진적 마이그레이션 (Phase별) |
| 성능 저하 (참조 업데이트) | 낮음 | 배치 작업 최적화 |
| 복잡도 증가 | 중간 | 명확한 문서화 + 예시 코드 |

## 다음 단계

1. **Phase 1 구현**: `race_results`에 `dataLineage` 추가
   - 마이그레이션 스크립트 작성
   - 기존 데이터 변환
   - 신규 데이터 적용

2. **Phase 2 구현**: `participants`에 `confirmedResult` 추가
   - API 수정 (`confirm-one`, `bulk-confirm`)
   - 역참조 로직 구현

3. **Phase 3 구현**: UI Gold 우선 표시
   - Frontend 로직 수정
   - 신뢰도 뱃지 추가

4. **Phase 4-5**: 중복 방지 및 Bronze Archival (선택)

## 참고

- [Medallion Architecture - Databricks](https://www.databricks.com/glossary/medallion-architecture)
- DMC `_docs/superpowers/specs/2026-04-20-group-reconfirm-spec.md`
- DMC `_docs/log/2026-04-20.md`

## 변경 이력

- 2026-04-20: 초안 작성 (김형진/서윤석/조상현 이슈 기반)
