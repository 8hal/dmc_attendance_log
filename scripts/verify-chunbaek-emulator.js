#!/usr/bin/env node
/**
 * 춘백 API 에뮬 통합 검증 — emulators:exec 안에서 실행
 */
const assert = require("node:assert/strict");

const BASE = process.env.CHUNBAEK_API
  || "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/chunbaek";

const ADMIN_PW = process.env.DMC_ADMIN_PW || "dmc2008";
const BETA_DAY_INDEX_BASE = 901;
const DEFAULT_BETA_START = "2026-07-13";
const SEASON_START = "2026-07-20";

function todayKstDate() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

function addDaysIso(isoDate, offset) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + offset * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

function betaSlotIdForToday(today) {
  if (today >= SEASON_START) return 1;
  const betaStart = today < DEFAULT_BETA_START ? today : DEFAULT_BETA_START;
  const [sy, sm, sd] = betaStart.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const offset = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(sy, sm - 1, sd)) / 86400000);
  if (offset < 0 || offset >= 7) return null;
  return BETA_DAY_INDEX_BASE + offset;
}

async function apiGet(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const res = await fetch(`${BASE}?${qs}`);
  return { status: res.status, data: await res.json() };
}

async function apiPost(action, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}?action=${action}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

(async () => {
  const ping = await apiGet("ping");
  assert.equal(ping.data.ok, true);

  const roster = await apiGet("members-roster");
  assert.equal(roster.data.ok, true);
  assert.ok(roster.data.members.length >= 2);

  const created = await apiPost("create-profile", {
    memberId: "chunbaek_seed_b",
    goalMarathonNetTime: 16200,
    goalRace: "chuncheon",
    resolutionText: "에뮬 테스트",
  });
  assert.equal(created.status, 200);
  assert.equal(created.data.ok, true);
  const token = created.data.token;
  assert.ok(token);

  const today = todayKstDate();
  const weekForToday = await apiGet("admin-week-slots", { week: 1, adminPw: ADMIN_PW });
  assert.equal(weekForToday.status, 200, weekForToday.data?.error);
  const alignedWeek = await apiPost("admin-save-week-slots", {
    adminPw: ADMIN_PW,
    week: 1,
    rows: weekForToday.data.slots.map((s, idx) => ({
      dayIndex: s.dayIndex,
      date: addDaysIso(today, idx),
      trainingTitle: s.trainingTitle || "테스트 훈련",
      trainingContent: s.trainingContent || "",
      isProgramOff: s.isProgramOff,
    })),
  });
  assert.equal(alignedWeek.status, 200, alignedWeek.data?.error);
  const weekTwo = await apiGet("admin-week-slots", { week: 2, adminPw: ADMIN_PW });
  assert.equal(weekTwo.status, 200, weekTwo.data?.error);
  if (weekTwo.data.slots.length) {
    const alignedWeekTwo = await apiPost("admin-save-week-slots", {
      adminPw: ADMIN_PW,
      week: 2,
      rows: weekTwo.data.slots.map((s, idx) => ({
        dayIndex: s.dayIndex,
        date: addDaysIso(today, weekForToday.data.slots.length + idx),
        trainingTitle: s.trainingTitle || "테스트 훈련",
        trainingContent: s.trainingContent || "",
        isProgramOff: s.isProgramOff,
      })),
    });
    assert.equal(alignedWeekTwo.status, 200, alignedWeekTwo.data?.error);
  }

  const slotId = betaSlotIdForToday(today);
  assert.ok(slotId, `no beta slot for today=${today}`);

  const saved = await apiPost("save-attendance", { slotId, attended: true }, token);
  assert.equal(saved.data.ok, true);

  const tinyJpeg = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z";
  const uploaded = await apiPost("upload-attendance-photo", {
    slotId,
    imageBase64: tinyJpeg,
    photoIndex: 0,
  }, token);
  assert.equal(uploaded.status, 200, uploaded.data?.error || "upload failed");
  assert.equal(uploaded.data.ok, true);
  assert.ok(uploaded.data.photoUrl);
  assert.ok(uploaded.data.photoUrl.includes("token="));

  const withPhoto = await apiPost("save-attendance", {
    slotId,
    attended: true,
    note: "사진 테스트",
    photoUrls: [uploaded.data.photoUrl],
  }, token);
  assert.equal(withPhoto.data.ok, true);

  const teamFeed = await apiGet("team-member-attendance", { token, memberId: "chunbaek_seed_b" });
  assert.equal(teamFeed.status, 200);
  assert.equal(teamFeed.data.ok, true);
  assert.ok(teamFeed.data.entries.length >= 1);
  assert.equal(teamFeed.data.entries[0].note, "사진 테스트");
  assert.ok(teamFeed.data.entries[0].photoUrls.length >= 1);

  const noMember = await apiGet("team-member-attendance", { token, memberId: "no_such_member" });
  assert.equal(noMember.status, 404);

  const profile = await apiGet("my-profile", { token });
  assert.equal(profile.data.ok, true);
  assert.equal(profile.data.stats.seasonAttendCount, 1);

  const updated = await apiPost("update-profile", {
    goalMarathonNetTime: 15000,
    goalRace: "jtbc",
    resolutionText: "수정됨",
    goalBodyWeightKg: 67.5,
    goalBodyWeightPrivate: true,
  }, token);
  assert.equal(updated.status, 200);
  assert.equal(updated.data.ok, true);
  assert.equal(updated.data.goalRace, "jtbc");
  assert.equal(updated.data.goalMarathonNetTime, 15000);
  assert.equal(updated.data.resolutionText, "수정됨");
  assert.equal(updated.data.goalBodyWeightKg, 67.5);
  assert.equal(updated.data.goalBodyWeightPrivate, true);

  const noToken = await apiPost("update-profile", {
    goalMarathonNetTime: 15000,
    goalRace: "jtbc",
  });
  assert.equal(noToken.status, 401);

  const noAuth = await apiGet("my-profile");
  assert.equal(noAuth.status, 401);

  // --- exception requests ---
  const excStart = today;
  const excEnd = addDaysIso(today, 2);
  const reqExc = await apiPost("request-exception", {
    reason: "에뮬 부상 테스트",
    startDate: excStart,
    endDate: excEnd,
  }, token);
  assert.equal(reqExc.status, 200, reqExc.data?.error || "request-exception failed");
  assert.ok(reqExc.data.requestId);
  assert.ok(reqExc.data.preview);

  const dup = await apiPost("request-exception", {
    reason: "중복",
    startDate: today,
    endDate: today,
  }, token);
  assert.equal(dup.status, 400);

  const pendingList = await apiGet("admin-list-exception-requests", {
    adminPw: ADMIN_PW,
    status: "pending",
  });
  assert.equal(pendingList.status, 200, pendingList.data?.error);
  assert.ok(pendingList.data.requests.some((r) => r.requestId === reqExc.data.requestId));

  const approved = await apiPost("admin-review-exception-request", {
    adminPw: ADMIN_PW,
    requestId: reqExc.data.requestId,
    decision: "approve",
    reviewNote: "확인",
  });
  assert.equal(approved.status, 200, approved.data?.error);
  assert.equal(approved.data.status, "approved");

  const myReqs = await apiGet("my-exception-requests", { token });
  assert.equal(myReqs.status, 200);
  assert.equal(myReqs.data.requests[0].status, "approved");

  const cleared = await apiPost("self-clear-future-exceptions", {}, token);
  assert.equal(cleared.status, 200, cleared.data?.error);
  assert.ok(Array.isArray(cleared.data.clearedSlotIds));

  // --- admin smoke ---
  const badVerify = await apiPost("verify-admin", { pw: "wrong" });
  assert.equal(badVerify.status, 401);

  const verify = await apiPost("verify-admin", { pw: ADMIN_PW });
  assert.equal(verify.status, 200);
  assert.equal(verify.data.ok, true);
  assert.ok(verify.data.role);

  const noAdminPw = await apiGet("admin-grid", { week: 1 });
  assert.equal(noAdminPw.status, 401);
  assert.equal(noAdminPw.data.error, "adminPw required");

  const week0 = await apiGet("admin-week-slots", { week: 0, adminPw: ADMIN_PW });
  assert.equal(week0.status, 200);
  assert.equal(week0.data.ok, true);
  assert.ok(week0.data.slots.length >= 1);

  const grid0 = await apiGet("admin-grid", { week: 0, adminPw: ADMIN_PW });
  assert.equal(grid0.status, 200);
  assert.equal(grid0.data.ok, true);

  const grid = await apiGet("admin-grid", { week: 1, adminPw: ADMIN_PW });
  assert.equal(grid.status, 200);
  assert.equal(grid.data.ok, true);
  assert.ok(Array.isArray(grid.data.slots));
  assert.ok(Array.isArray(grid.data.members));
  assert.ok(grid.data.members.length >= 2);

  const setAtt = await apiPost("admin-set-attendance", {
    adminPw: ADMIN_PW,
    memberId: "chunbaek_seed_a",
    slotId: 2,
    attended: true,
    exception: false,
  });
  assert.equal(setAtt.status, 200);
  assert.equal(setAtt.data.ok, true);
  assert.equal(setAtt.data.attended, true);

  const weekSlots = await apiGet("admin-week-slots", { week: 1, adminPw: ADMIN_PW });
  assert.equal(weekSlots.status, 200);
  assert.equal(weekSlots.data.ok, true);
  assert.ok(weekSlots.data.slots.length >= 1);

  const saveWeek = await apiPost("admin-save-week-slots", {
    adminPw: ADMIN_PW,
    week: 1,
    rows: weekSlots.data.slots.map((s) => ({
      dayIndex: s.dayIndex,
      date: s.date,
      trainingTitle: s.trainingTitle || "테스트 훈련",
      trainingContent: s.trainingContent || "",
      isProgramOff: s.isProgramOff,
    })),
  });
  assert.equal(saveWeek.status, 200);
  assert.equal(saveWeek.data.ok, true);
  assert.ok(saveWeek.data.saved >= 1);

  const importRes = await apiPost("admin-import-slots", {
    adminPw: ADMIN_PW,
    mode: "merge",
    rows: [
      {
        dayIndex: 8,
        date: "2026-04-08",
        week: 2,
        trainingTitle: "이지런",
        trainingContent: "",
        isProgramOff: false,
      },
    ],
  });
  assert.equal(importRes.status, 200);
  assert.equal(importRes.data.ok, true);
  assert.equal(importRes.data.imported, 1);

  console.log("verify-chunbaek-emulator: OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
