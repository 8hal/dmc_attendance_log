"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");
const {
  buildAttendanceCsv,
  attendanceCsvFilename,
  gridWeekScored,
  cellText,
  sheetWeekLabel,
  trainingSavedMessage,
  initialAdminPanel,
  awardsPanelView,
  createAwardsLoadGate,
} = require("../../chunbaek/js/admin-grid-csv.js");
const { isSeasonCloseScoredWeek } = require("../../functions/lib/chunbaek-stats");

const week = {
  week: 7,
  range: "4/7 ~ 4/13",
  slots: [
    { slotId: 36, dayIndex: 36, date: "2026-04-07", isProgramOff: false },
    { slotId: 37, dayIndex: 37, date: "2026-04-08", isProgramOff: false },
    { slotId: 38, dayIndex: 38, date: "2026-04-09", isProgramOff: true },
  ],
  members: [
    {
      id: "m1",
      nickname: "김러너",
      profileComplete: true,
      weekCount: 1,
      weekExceptionCount: 1,
      weekScore: 1.5,
      weekTarget: 3,
      weekTargetMet: false,
      cells: { 36: "attend", 37: "exception", 38: "off" },
    },
    {
      id: "m2",
      nickname: "이,페이스",
      profileComplete: false,
      weekCount: 0,
      weekExceptionCount: 0,
      weekScore: 0,
      weekTarget: 3,
      weekTargetMet: false,
      cells: { 36: "miss", 37: "future" },
    },
  ],
};

test("현재 주차 출석 CSV는 회원별 출석·예외·점수와 날짜 칸을 모두 담는다", () => {
  const csv = buildAttendanceCsv(week);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /\r\n/);
  const body = csv.slice(1);
  const lines = body.trim().split("\r\n");
  assert.match(lines[0], /주차,기간,닉네임,회원ID,프로필완료,출석,예외,점수,목표,목표달성/);
  assert.match(lines[0], /36일 2026-04-07/);
  assert.match(lines[0], /38일 2026-04-09/);
  assert.match(lines[1], /7주차,4\/7 ~ 4\/13,김러너,m1,예,1,1,1\.5,3,미달,출석,예외,휴무/);
  assert.match(lines[2], /"이,페이스",m2,아니오,0,0,0,3,미달,미출석,예정,휴무/);
  assert.equal(lines.length, 3);
  assert.equal(attendanceCsvFilename(7), "chunbaek-s3-week7-attendance.csv");
  assert.equal(attendanceCsvFilename(0), "chunbaek-s3-week0-attendance.csv");
});

test("7/20~7/26 그리드는 0주차로 보이고 주간 미달로 내보내지 않는다", () => {
  const slots = [
    { slotId: 1, dayIndex: 1, date: "2026-07-20" },
    { slotId: 7, dayIndex: 7, date: "2026-07-26" },
  ];
  assert.equal(gridWeekScored(slots), false);
  assert.equal(isSeasonCloseScoredWeek(slots), false);
  assert.equal(cellText("preseason", false), "제외");
  assert.equal(cellText("miss", false), "미출석");
  const csv = buildAttendanceCsv({
    week: 1,
    range: "7/20 ~ 7/26",
    slots,
    members: [{
      id: "m1",
      nickname: "김러너",
      profileComplete: true,
      weekCount: 0,
      weekExceptionCount: 0,
      weekScore: 0,
      weekTarget: 3,
      weekTargetMet: false,
      cells: { 1: "preseason", 7: "miss" },
    }],
  });
  const line = csv.slice(1).trim().split("\r\n")[1];
  assert.match(line, /^0주차,7\/20 ~ 7\/26,/);
  assert.match(line, /,제외,제외,미출석/);
  assert.equal(line.includes("미달"), false);
});

test("7/27~8/2 그리드는 1주차로 보이고 8~14일 칸은 유지한다", () => {
  const slots = [
    { slotId: 8, dayIndex: 8, date: "2026-07-27" },
    { slotId: 14, dayIndex: 14, date: "2026-08-02" },
  ];
  assert.equal(gridWeekScored(slots), true);
  assert.equal(isSeasonCloseScoredWeek(slots), true);
  const csv = buildAttendanceCsv({
    week: 2,
    range: "7/27 ~ 8/2",
    slots,
    members: [{
      id: "m1",
      nickname: "김러너",
      profileComplete: true,
      weekCount: 1,
      weekExceptionCount: 0,
      weekScore: 1,
      weekTarget: 3,
      weekTargetMet: false,
      cells: { 8: "attend", 14: "miss" },
    }],
  });
  const body = csv.slice(1);
  assert.match(body, /8일 2026-07-27/);
  assert.match(body, /14일 2026-08-02/);
  assert.match(body, /^1주차,7\/27 ~ 8\/2,김러너,m1,예,1,0,1,3,미달,출석,미출석/m);
  assert.equal(attendanceCsvFilename(2), "chunbaek-s3-week2-attendance.csv");
});

test("시즌 마감은 전부 준비되기 전 로딩만 보이고 늦은 응답은 버린다", () => {
  const loading = awardsPanelView("loading");
  assert.equal(loading.readyHidden, true);
  assert.equal(loading.spinner, true);
  assert.equal(loading.text, "시즌 마감을 불러오는 중입니다");
  assert.equal(loading.retry, false);
  const failed = awardsPanelView("error");
  assert.equal(failed.spinner, false);
  assert.equal(failed.readyHidden, true);
  assert.equal(failed.retry, true);
  assert.match(failed.text, /불러오지 못했습니다/);
  const ready = awardsPanelView("ready");
  assert.equal(ready.statusHidden, true);
  assert.equal(ready.readyHidden, false);
  const gate = createAwardsLoadGate();
  const first = gate.start();
  const second = gate.start();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
  const js = fs.readFileSync(path.join(__dirname, "../../chunbaek/js/admin.js"), "utf8");
  const refresh = js.slice(js.indexOf("async function refreshAwards"), js.indexOf("function downloadAttendanceCsv"));
  assert.match(refresh, /showAwardsLoad\("loading"\)/);
  assert.match(refresh, /if \(!awardsLoadGate\.isCurrent\(requestId\)\) return;/);
  assert.match(refresh, /awardsHtml\(model\)/);
  assert.match(refresh, /paintAwardsReview\(review\)/);
  assert.match(refresh, /showAwardsLoad\("ready"\)/);
  assert.match(refresh, /showAwardsLoad\("error"\)/);
  const readyAt = refresh.indexOf('showAwardsLoad("ready")');
  const paintAt = refresh.indexOf("paintAwardsReview(review)");
  assert.ok(paintAt >= 0 && readyAt > paintAt);
});

test("운영 화면의 처음 탭은 시즌 마감이고 주소의 탭 지정은 유지한다", () => {
  assert.equal(initialAdminPanel({}), "awards");
  assert.equal(initialAdminPanel({ search: "?preview=1" }), "awards");
  assert.equal(initialAdminPanel({ search: "?preview=1&panel=grid" }), "grid");
  assert.equal(initialAdminPanel({ hash: "#training" }), "training");
  assert.equal(initialAdminPanel({ hash: "#roster" }), "roster");
  assert.equal(initialAdminPanel({ hash: "#exceptions" }), "exceptions");
  assert.equal(initialAdminPanel({ search: "?panel=nope", hash: "#grid" }), "grid");
  assert.equal(initialAdminPanel({ search: "?panel=awards" }), "awards");
  const root = path.join(__dirname, "../..");
  const html = fs.readFileSync(path.join(root, "chunbaek/admin.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "chunbaek/js/admin.js"), "utf8");
  assert.match(html, /id="panel-awards" class="admin-panel active"|class="admin-panel active" id="panel-awards"/);
  assert.equal(/id="panel-grid"[^>]*active|class="admin-panel active" id="panel-grid"/.test(html), false);
  assert.match(html, /data-panel="awards"[^>]*active|class="admin-nav-btn active" data-panel="awards"/);
  assert.match(js, /initialAdminPanel\(\{/);
  const init = js.slice(js.indexOf("async function init()"), js.indexOf("async function saveTraining"));
  assert.match(init, /showPanel\(currentPanel\);\s*try \{\s*await resolveDefaultWeek\(\)/);
  assert.match(init, /catch \(err\)[\s\S]*await switchPanel\(currentPanel\)/);
  assert.match(js, /switchPanel\(btn\.dataset\.panel\)/);
  assert.match(js, /switchPanel\("grid"\)/);
});

test("훈련 저장 알림은 화면 주차와 같고 저장 요청 주차 번호는 바꾸지 않는다", () => {
  assert.equal(sheetWeekLabel(14, { preview: true }), "14주차");
  assert.equal(trainingSavedMessage(14, { preview: true, mock: true }), "14주차 훈련 저장됨 (목업)");
  assert.equal(sheetWeekLabel(14), "13주차");
  assert.equal(trainingSavedMessage(14, { saved: 7 }), "13주차 훈련 7건 저장됨");
  assert.equal(sheetWeekLabel(2), "1주차");
  assert.equal(sheetWeekLabel(1), "0주차");
  assert.equal(sheetWeekLabel(0), "0주차 (베타)");
  assert.equal(trainingSavedMessage(2, { saved: 7 }), "1주차 훈련 7건 저장됨");
});

test("출석 결과 CSV 버튼이 현재 그리드 내려받기에 연결된다", () => {
  const root = path.join(__dirname, "../..");
  const html = fs.readFileSync(path.join(root, "chunbaek/admin.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "chunbaek/js/admin.js"), "utf8");
  assert.match(html, /id="btn-download-attendance-csv"/);
  assert.match(html, /출석 결과 CSV/);
  assert.match(html, /js\/admin-grid-csv\.js/);
  assert.match(js, /btn-download-attendance-csv/);
  assert.match(js, /buildAttendanceCsv/);
  assert.match(js, /gridWeekScored/);
  assert.match(js, /trainingSavedMessage\(currentWeek, \{ preview: true, mock: true \}\)/);
  assert.match(js, /trainingSavedMessage\(currentWeek, \{ saved: result\.saved \}\)/);
  assert.equal(js.includes("${currentWeek}주차"), false);
  assert.match(js, /admin-save-week-slots", \{ week: currentWeek, rows \}/);
  assert.match(js, /status === "preseason"\) return "cell-off"/);
  assert.match(js, /viewGrid\(\)/);
});
