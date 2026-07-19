const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  parseCafeTrainingPaste,
  trainingDocId,
  normalizeTrainingRow,
  resolveWeekMeetingDates,
  emptyTrainingRow,
} = require(path.join(__dirname, "../../functions/lib/meeting-training.js"));

const SAMPLE_PASTE = `
화요일 정모
시간/장소: 18:30 / 여울공원 운동장(트랙)
훈련 · 전: 체조 · 스트레칭 · 조깅
훈련 · 본: 인터벌 · 보강
훈련 · 후: 쿨다운 · 스트레칭
급수 및 서포터즈: —
메모: 화요 메모

목요일 정모
시간/장소: 19:30 / 여울공원 운동장(트랙)
훈련 · 전: 체조 및 스트레칭, 조깅 운동장 7바퀴
훈련 · 본: 300/100 인터벌 10개 & 보강훈련
훈련 · 후: Cool 조깅 10분, 마무리 체조 및 스트레칭
급수 및 서포터즈: 바우돌리노/보스톤
메모: 7월에는 갯수 좀 줄일테니 스피드좀 올려 주세요.

토요일 정모
시간/장소: 06:00 / 여울공원 운동장(트랙)
훈련 · 전: 체조 · 조깅
훈련 · 본: LSD / 페이스런
훈련 · 후: 스트레칭
급수 및 서포터즈: —
`;

/** Real Naver cafe paste style (spaced headers, label/value on separate lines) */
const NAVER_CAFE_PASTE = `
시간/장소

19:30 / 동탄 예당공원

훈

련

전

조깅 10분, 체조 및 스트레칭

본

▶업힐 훈련 20회전

예당공원 內 회전구간 달리기

오르막 질주 내리막 회복 20회 총 9km

팀별로 함께

후

Cool 마무리 체조 및 스트레칭

급 수 및

서포터즈

옥/루이

정모 모이는 장소 정모소요시간 1시간

https://cafe.naver.com/2008dmc/4618

목 요 일 정 모

시간/장소

19:30 여울공원 운동장(트랙)

훈

련

전

체조 및 스트레칭, 조깅 운동장7바퀴

본

300/100 인터벌 10개 & 보강훈련

후

Cool 조깅 10분, 마무리 체조 및 스트레칭

급 수 및

서포터즈

바우돌리노/보스톤

7월에는 갯수 좀 줄일테니 스피드좀 올려 주세요.

토요일 정모

시간/장소

06:00/동탄여울공원

훈

련

전

스트레칭, 트랙 3바퀵

본

여울공원-동탄ic 4회전 약 25km

후

스트레칭

급 수 및

서포터즈

삼둥/쌩메

더우니까 스피드 붙여서 빠르게 끝내겠습니다.
`;

describe("meeting-training helpers", () => {
  it("trainingDocId uses dash date and type", () => {
    assert.equal(trainingDocId("2026/07/16", "THU"), "2026-07-16_THU");
    assert.equal(trainingDocId("2026-07-16", "tue"), "2026-07-16_TUE");
  });

  it("normalizeTrainingRow trims fields and uppercases type", () => {
    const row = normalizeTrainingRow({
      meetingDate: "2026-07-16",
      meetingType: "thu",
      time: " 19:30 ",
      place: "여울",
      trainBefore: "전",
      trainMain: "본",
      trainAfter: "후",
      supporters: "A/B",
      note: "메모",
    });
    assert.equal(row.meetingDateKey, "2026/07/16");
    assert.equal(row.meetingType, "THU");
    assert.equal(row.time, "19:30");
    assert.equal(row.trainMain, "본");
  });

  it("resolveWeekMeetingDates returns Tue/Thu/Sat for week of anchor", () => {
    // 2026-07-15 is Wednesday → week Tue 14, Thu 16, Sat 18
    const week = resolveWeekMeetingDates("2026-07-15");
    assert.deepEqual(week, {
      TUE: "2026/07/14",
      THU: "2026/07/16",
      SAT: "2026/07/18",
    });
  });

  it("emptyTrainingRow has required keys", () => {
    const e = emptyTrainingRow("2026/07/14", "TUE");
    assert.equal(e.meetingType, "TUE");
    assert.equal(e.meetingDateKey, "2026/07/14");
    assert.equal(e.time, "");
    assert.equal(e.trainBefore, "");
  });
});

describe("parseCafeTrainingPaste", () => {
  it("parses Tue/Thu/Sat blocks from sample paste", () => {
    const parsed = parseCafeTrainingPaste(SAMPLE_PASTE);
    assert.equal(parsed.TUE.time, "18:30");
    assert.equal(parsed.TUE.place, "여울공원 운동장(트랙)");
    assert.equal(parsed.TUE.trainMain, "인터벌 · 보강");
    assert.equal(parsed.THU.time, "19:30");
    assert.match(parsed.THU.trainBefore, /체조/);
    assert.match(parsed.THU.trainMain, /300\/100/);
    assert.equal(parsed.THU.supporters, "바우돌리노/보스톤");
    assert.match(parsed.THU.note, /7월/);
    assert.equal(parsed.SAT.time, "06:00");
    assert.match(parsed.SAT.trainMain, /LSD/);
  });

  it("returns empty slots for blank paste", () => {
    const parsed = parseCafeTrainingPaste("");
    assert.equal(parsed.TUE.time, "");
    assert.equal(parsed.THU.trainMain, "");
    assert.equal(parsed.SAT.place, "");
  });

  it("parses Naver cafe paste with spaced headers and multiline labels", () => {
    const parsed = parseCafeTrainingPaste(NAVER_CAFE_PASTE);
    assert.equal(parsed.TUE.time, "19:30");
    assert.match(parsed.TUE.place, /예당공원/);
    assert.match(parsed.TUE.trainBefore, /조깅 10분/);
    assert.match(parsed.TUE.trainMain, /업힐/);
    assert.match(parsed.TUE.trainAfter, /마무리/);
    assert.equal(parsed.TUE.supporters, "옥/루이");
    assert.match(parsed.TUE.note, /정모소요시간|1시간/);

    assert.equal(parsed.THU.time, "19:30");
    assert.match(parsed.THU.place, /여울공원/);
    assert.match(parsed.THU.trainMain, /300\/100/);
    assert.match(parsed.THU.trainMain, /보강훈련/);
    assert.doesNotMatch(parsed.THU.trainMain, /보강훈련후/);
    assert.match(parsed.THU.trainAfter, /Cooldown|조깅 10분/);
    assert.equal(parsed.THU.supporters, "바우돌리노/보스톤");
    assert.match(parsed.THU.note, /7월/);

    assert.equal(parsed.SAT.time, "06:00");
    assert.match(parsed.SAT.place, /여울공원|동탄여울공원/);
    assert.match(parsed.SAT.trainMain, /25km/);
    assert.equal(parsed.SAT.supporters, "삼둥/쌩메");
    assert.match(parsed.SAT.note, /더우니까/);
  });

  it("parses cafe article API JSON via contentHtml table", () => {
    const html = `
<div class="se-viewer">
  <table>
    <tr><td>시간/장소</td><td>19:30 / 동탄 예당공원</td></tr>
    <tr><td>훈<br>련</td><td>전</td><td>조깅 10분, 체조 및 스트레칭</td></tr>
    <tr><td></td><td>본</td><td>▶업힐 훈련 20회전<br>예당공원 內 회전구간</td></tr>
    <tr><td></td><td>후</td><td>Cooldown 마무리 체조 및 스트레칭</td></tr>
    <tr><td>급 수 및<br>서포터즈</td><td>옥/루이</td></tr>
    <tr><td colspan="3">정모 모이는 장소 정모소요시간 1시간</td></tr>
    <tr><td colspan="3">목 요 일 정 모</td></tr>
    <tr><td>시간/장소</td><td>19:30 여울공원 운동장(트랙)</td></tr>
    <tr><td>훈<br>련</td><td>전</td><td>체조 및 스트레칭, 조깅 운동장7바퀴</td></tr>
    <tr><td></td><td>본</td><td>300/100 인터벌 10개 &amp; 보강훈련</td></tr>
    <tr><td></td><td>후</td><td>Cooldown 조깅 10분, 마무리 체조 및 스트레칭</td></tr>
    <tr><td>급 수 및<br>서포터즈</td><td>바우돌리노/보스톤</td></tr>
    <tr><td colspan="3">7월에는 갯수 좀 줄일테니 스피드좀 올려 주세요.</td></tr>
    <tr><td colspan="3">토요일 정모</td></tr>
    <tr><td>시간/장소</td><td>06:00/동탄여울공원</td></tr>
    <tr><td>훈<br>련</td><td>전</td><td>스트레칭, 트랙 3바퀵</td></tr>
    <tr><td></td><td>본</td><td>여울공원-동탄ic 4회전 약 25km</td></tr>
    <tr><td></td><td>후</td><td>스트레칭</td></tr>
    <tr><td>급 수 및<br>서포터즈</td><td>삼둥/쌩메</td></tr>
    <tr><td colspan="3">더우니까 스피드 붙여서 빠르게 끝내겠습니다.</td></tr>
  </table>
</div>`;
    const apiJson = JSON.stringify({
      result: {
        cafeId: 30619899,
        articleId: 4853,
        article: {
          id: 4853,
          subject: "7월3주차 정모공지",
          contentHtml: html,
        },
      },
    });
    const parsed = parseCafeTrainingPaste(apiJson);
    assert.equal(parsed.TUE.time, "19:30");
    assert.match(parsed.TUE.place, /예당공원/);
    assert.match(parsed.TUE.trainMain, /업힐/);
    assert.match(parsed.TUE.trainAfter, /Cooldown/);
    assert.equal(parsed.TUE.supporters, "옥/루이");
    assert.equal(parsed.THU.time, "19:30");
    assert.match(parsed.THU.trainMain, /보강훈련/);
    assert.doesNotMatch(parsed.THU.trainMain, /보강훈련후/);
    assert.match(parsed.THU.trainAfter, /Cooldown/);
    assert.equal(parsed.THU.supporters, "바우돌리노/보스톤");
    assert.equal(parsed.SAT.time, "06:00");
    assert.match(parsed.SAT.trainMain, /25km/);
    assert.equal(parsed.SAT.supporters, "삼둥/쌩메");
  });
});
