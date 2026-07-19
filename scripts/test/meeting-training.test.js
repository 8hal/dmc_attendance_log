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
});
