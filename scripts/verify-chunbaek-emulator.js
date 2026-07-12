#!/usr/bin/env node
/**
 * 춘백 API 에뮬 통합 검증 — emulators:exec 안에서 실행
 */
const assert = require("node:assert/strict");

const BASE = process.env.CHUNBAEK_API
  || "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/chunbaek";

const ADMIN_PW = process.env.DMC_ADMIN_PW || "dmc2008";

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

  const saved = await apiPost("save-attendance", { slotId: 1, attended: true }, token);
  assert.equal(saved.data.ok, true);

  const profile = await apiGet("my-profile", { token });
  assert.equal(profile.data.ok, true);
  assert.equal(profile.data.stats.seasonAttendCount, 1);

  const noAuth = await apiGet("my-profile");
  assert.equal(noAuth.status, 401);

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
