# race_events 배포·검증 체크리스트

AI는 `firebase deploy`를 실행하지 않는다. 아래는 담당자 수동 절차.

## 배포 전

1. `bash scripts/pre-deploy-test.sh` 전체 통과
2. `cd functions && node ../scripts/backup-firestore.js` — `backup/YYYY-MM-DD/` 확인
3. 변경 커밋·푸시

## 배포

1. `firebase deploy --only functions` 후 `firebase deploy`에 rules 포함(프로젝트 관행대로)
2. 프로덕션 `race?action=confirmed-races` — `ok`, `races[].results[].docId` 존재 확인

## 백필(분리된 카드 병합)

1. `scripts/data/race-events-mapping.example.json`을 복사해 `race-events-mapping.json` 작성(이 파일은 `.gitignore`)
2. `node scripts/backfill-race-events-mapping.js --config scripts/data/race-events-mapping.json` — DRY-RUN 출력·§2.4 충돌 없음 확인
3. 팀 승인 후 `... --apply`

## 배포 후 수동 검증

- `races.html` / `my.html` — 병합 대상 날짜에서 카드 1개·참가 인원 정상
- `report.html` — 신규 직접 추가 후 확정 시 `race_events` 생성
- 기존 job 재오픈 시 `action=job` 응답에 `canonicalEventId` 포함 여부(매핑된 경우)
