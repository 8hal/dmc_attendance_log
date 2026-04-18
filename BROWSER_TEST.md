# 브라우저 테스트 가이드

## 테스트 환경
- 에뮬레이터: http://127.0.0.1:5001
- Hosting: http://localhost:5000
- 테스트 이벤트 ID: aa3GLVzUpZ6spifzVSZH

## 테스트 URL
http://localhost:5000/my-bib.html?eventId=aa3GLVzUpZ6spifzVSZH

## 테스트 시나리오

### 1. 정상 플로우 - 신규 배번 입력
1. 브라우저에서 테스트 URL 열기
2. "2026 춘천마라톤 · 2026-04-25" 표시 확인
3. 닉네임 입력: `쏘니`
4. "다음" 버튼 클릭
5. 확인:
   - "✅ 쏘니님 확인되었습니다" 표시
   - 종목: "10km" 표시
   - 현재 배번: "미입력" 표시
6. 배번 입력: `77777`
7. "저장" 버튼 클릭
8. 확인:
   - "✅ 저장 완료" 화면 표시
   - "배번이 저장되었습니다" 메시지 표시

### 2. 정상 플로우 - 기존 배번 수정
1. 새로고침 (F5)
2. 닉네임 입력: `라우펜더만`
3. "다음" 버튼 클릭
4. 확인:
   - 종목: "하프 마라톤"
   - 현재 배번: "12345" (기존 값)
   - 입력 필드에 "12345" 자동 입력
5. 배번 변경: `54321`
6. "저장" 버튼 클릭
7. 성공 화면 확인

### 3. 오류 케이스 - 닉네임 없음
1. 새로고침
2. 닉네임 입력 없이 "다음" 클릭
3. 확인: "닉네임을 입력해주세요" 오류 표시

### 4. 오류 케이스 - 참가자 아님
1. 새로고침
2. 닉네임 입력: `외부인`
3. "다음" 클릭
4. 확인: "해당 대회에 참가하지 않는 회원입니다" 오류 표시

### 5. 오류 케이스 - 배번 없음
1. 새로고침
2. 닉네임 입력: `디모`
3. "다음" 클릭
4. 배번 입력 없이 "저장" 클릭
5. 확인: "배번을 입력해주세요" 오류 표시

### 6. Enter 키 동작
1. 새로고침
2. 닉네임 입력 후 Enter 키 → 다음 화면 이동 확인
3. 배번 입력 후 Enter 키 → 저장 완료 확인

## API 검증 (curl)

```bash
# Detail API 확인
curl -s "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race?action=group-events&subAction=detail&eventId=aa3GLVzUpZ6spifzVSZH" | python3 -m json.tool

# Update-bib API 확인
curl -s -X POST "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race?action=group-events" \
  -H "Content-Type: application/json" \
  -d '{"subAction":"update-bib","eventId":"aa3GLVzUpZ6spifzVSZH","nickname":"디모","bib":"99999"}' | python3 -m json.tool

# 저장된 배번 확인
curl -s "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race?action=group-events&subAction=detail&eventId=aa3GLVzUpZ6spifzVSZH" | python3 -c "import sys, json; data=json.load(sys.stdin); print(json.dumps(data['event']['participants'], ensure_ascii=False, indent=2))"
```

## 테스트 결과

### API 테스트 ✅
- detail API: 정상 작동 (이벤트 정보 반환)
- update-bib API: 정상 작동 (배번 저장 성공)
- 데이터 영속성: 정상 (저장 후 조회 시 반영됨)

### 브라우저 테스트
[ ] 1. 정상 플로우 - 신규 배번 입력
[ ] 2. 정상 플로우 - 기존 배번 수정
[ ] 3. 오류 케이스 - 닉네임 없음
[ ] 4. 오류 케이스 - 참가자 아님
[ ] 5. 오류 케이스 - 배번 없음
[ ] 6. Enter 키 동작

## 주의사항

1. API_BASE가 로컬 에뮬레이터를 가리키도록 설정됨:
   ```javascript
   const API_BASE = "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race";
   ```

2. 배포 전 production URL로 변경 필요:
   ```javascript
   const API_BASE = "https://asia-northeast3-dmc-attendance.cloudfunctions.net/race";
   ```
