/**
 * 춘백 API 클라이언트 — _docs/development/api-patterns.md 준수
 */
const IS_LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = IS_LOCAL
  ? `http://${location.hostname}:5001/dmc-attendance/asia-northeast3/chunbaek`
  : "/api/chunbaek";

const TOKEN_KEY = "chunbaekSessionToken";
const ADMIN_PW_KEY = "chunbaekAdminPw";

const PREVIEW_MODE = new URLSearchParams(location.search).has("preview")
  || location.protocol === "file:"
  || IS_LOCAL;

function useMock() {
  return PREVIEW_MODE;
}

function getPreviewScenario() {
  return new URLSearchParams(location.search).get("scenario") || "beta-mon";
}

const PREVIEW_SCENARIOS = {
  "beta-mon": {
    profile: {
      stats: {
        seasonDayIndex: 1,
        seasonAttendCount: 0,
        seasonAttendRate: 0,
        weekAttendCount: 0,
        weekTarget: 3,
        inBetaWeek: true,
      },
    },
    todaySlot: {
      ok: true,
      slot: {
        dayIndex: 901,
        displayDayIndex: 1,
        date: "2026-07-13",
        week: 0,
        trainingTitle: "베타 D1 — 이지런 5km",
        trainingContent: "워밍업 10분 · 본편 5km 이지 · 마무리 스트레칭",
        isProgramOff: false,
        attended: false,
      },
      beforeSeason: false,
      afterSeason: false,
      betaWeek: true,
      photoRequired: false,
      startDate: "2026-07-20",
      endDate: "2026-10-27",
      betaWeekStartDate: "2026-07-13",
      betaWeekEndDate: "2026-07-19",
    },
  },
  "beta-sat": {
    profile: {
      stats: {
        seasonDayIndex: 4,
        seasonAttendCount: 3,
        seasonAttendRate: 100,
        weekAttendCount: 3,
        weekTarget: 3,
        inBetaWeek: true,
      },
    },
    todaySlot: {
      ok: true,
      slot: {
        dayIndex: 904,
        displayDayIndex: 4,
        date: "2026-07-16",
        week: 0,
        trainingTitle: "베타 D4 — 동마클 토요일",
        trainingContent: "동마클 정모 + 춘백 출석 각각",
        isProgramOff: false,
        attended: false,
      },
      beforeSeason: false,
      afterSeason: false,
      betaWeek: true,
      photoRequired: false,
      startDate: "2026-07-20",
      endDate: "2026-10-27",
      betaWeekStartDate: "2026-07-13",
      betaWeekEndDate: "2026-07-19",
    },
  },
  "beta-no-slot": {
    profile: {
      stats: {
        seasonDayIndex: 1,
        seasonAttendCount: 1,
        seasonAttendRate: 100,
        weekAttendCount: 1,
        weekTarget: 3,
        inBetaWeek: true,
      },
    },
    todaySlot: {
      ok: true,
      slot: null,
      beforeSeason: false,
      afterSeason: false,
      betaWeek: true,
      betaNoSlotToday: true,
      photoRequired: false,
      startDate: "2026-07-20",
      endDate: "2026-10-27",
      betaWeekStartDate: "2026-07-13",
      betaWeekEndDate: "2026-07-19",
    },
  },
  "before-season": {
    profile: {
      stats: {
        seasonDayIndex: 0,
        seasonAttendCount: 0,
        seasonAttendRate: 0,
        weekAttendCount: 0,
        weekTarget: 3,
        inBetaWeek: false,
      },
    },
    todaySlot: {
      ok: true,
      slot: null,
      beforeSeason: true,
      afterSeason: false,
      betaWeek: false,
      photoRequired: false,
      startDate: "2026-07-20",
      endDate: "2026-10-27",
      betaWeekStartDate: "2026-07-13",
      betaWeekEndDate: "2026-07-19",
    },
  },
  season: {
    profile: {
      stats: {
        seasonDayIndex: 42,
        seasonAttendCount: 28,
        seasonAttendRate: 68,
        weekAttendCount: 2,
        weekTarget: 3,
        inBetaWeek: false,
      },
    },
    todaySlot: {
      ok: true,
      slot: {
        dayIndex: 42,
        displayDayIndex: 42,
        date: "2026-04-11",
        week: 7,
        trainingTitle: "동마클 토요일 훈련",
        trainingContent: "",
        isProgramOff: false,
        attended: false,
      },
      beforeSeason: false,
      afterSeason: false,
      betaWeek: false,
      photoRequired: false,
      startDate: "2026-07-20",
      endDate: "2026-10-27",
    },
  },
};

function previewPayload() {
  const base = PREVIEW_SCENARIOS[getPreviewScenario()] || PREVIEW_SCENARIOS["beta-mon"];
  return {
    profile: { ...MOCK.profile, ...base.profile, stats: { ...MOCK.profile.stats, ...base.profile.stats } },
    todaySlot: base.todaySlot,
  };
}

const MOCK = {
  roster: [
    { memberId: "m1", nickname: "게살볶음밥", profileComplete: false },
    { memberId: "m2", nickname: "김러너", profileComplete: true },
    { memberId: "m3", nickname: "이페이스", profileComplete: false },
    { memberId: "m4", nickname: "박풀코스", profileComplete: true },
    { memberId: "m5", nickname: "최인터벌", profileComplete: false },
  ],
  profile: {
    memberId: "m2",
    nickname: "김러너",
    goalMarathonNetTime: 16200,
    existingPbNetTime: 17520,
    goalBodyWeightKg: 68.5,
    goalBodyWeightPrivate: false,
    goalRace: "jtbc",
    goalRaceLabel: "JTBC 서울마라톤",
    resolutionText: "100일 꾸준히 달려서 춘마 4:30 도전!",
    profileComplete: true,
    stats: {
      seasonDayIndex: 42,
      seasonAttendCount: 28,
      seasonAttendRate: 68,
      weekAttendCount: 2,
      weekTarget: 3,
    },
  },
  todaySlot: {
    dayIndex: 42,
    date: "2026-04-11",
    week: 7,
    trainingTitle: "동마클 토요일 훈련",
    trainingContent: "",
    isProgramOff: false,
    attended: false,
  },
  timeline: [
    {
      week: 7,
      range: "4/7 ~ 4/13",
      attendSummary: "2/3회",
      dots: "●●○○○",
      slots: [
        {
          slotId: 36,
          dayIndex: 36,
          displayDayIndex: 36,
          date: "2026-04-07",
          title: "5km 인터벌",
          content: "워밍업 10분, 5×1km (r:90s), 마무리 이지 2km",
          status: "attend",
          attended: true,
          canEdit: true,
          editLocked: false,
          exception: false,
          photo: true,
          photoUrl: "https://firebasestorage.googleapis.com/v0/b/preview/o/chunbaek%2Fpreview_0.jpg?alt=media&token=preview-token",
          photoUrls: [
            "https://firebasestorage.googleapis.com/v0/b/preview/o/chunbaek%2Fpreview_0.jpg?alt=media&token=preview-token",
          ],
          note: "페이스 잘 나왔다",
        },
        {
          slotId: 37,
          dayIndex: 37,
          displayDayIndex: 37,
          date: "2026-04-08",
          title: "(휴무)",
          content: "",
          status: "off",
          attended: false,
          canEdit: false,
          editLocked: false,
          exception: false,
          photo: false,
          photoUrl: "",
          note: "",
        },
        {
          slotId: 38,
          dayIndex: 38,
          displayDayIndex: 38,
          date: "2026-04-09",
          title: "장거리",
          content: "15km 이지, 페이스 6:00~6:15/km",
          status: "attend",
          attended: true,
          canEdit: true,
          editLocked: false,
          exception: false,
          photo: false,
          photoUrl: "",
          note: "",
        },
        {
          slotId: 39,
          dayIndex: 39,
          displayDayIndex: 39,
          date: "2026-04-10",
          title: "인터벌",
          content: "6×800m",
          status: "miss",
          attended: false,
          canEdit: true,
          editLocked: false,
          exception: false,
          photo: false,
          photoUrl: "",
          note: "",
        },
        {
          slotId: 42,
          dayIndex: 42,
          displayDayIndex: 42,
          date: "2026-04-11",
          title: "인터벌",
          content: "5×1km",
          status: "today",
          attended: false,
          canEdit: true,
          editLocked: false,
          exception: false,
          photo: false,
          photoUrl: "",
          note: "",
        },
      ],
    },
    {
      week: 6,
      range: "3/31 ~ 4/6",
      attendSummary: "3/3회",
      dots: "●●●○○",
      slots: [],
      collapsed: true,
    },
  ],
  team: {
    seasonRate: 68,
    weekMetCount: 12,
    participantCount: 38,
    members: [
      {
        memberId: "mock_a",
        nickname: "김○○",
        profileComplete: true,
        goal: "4:30",
        goalMarathonNetTime: 16200,
        existingPbNetTime: 17520,
        existingPb: "4:52",
        goalBodyWeightKg: 65,
        goalBodyWeightPrivate: false,
        goalRaceLabel: "춘천 마라톤",
        resolutionText: "100일 꾸준히 달려서 춘마 4:30 도전!",
        bar: "███",
        weekDots: "●●●○○",
        weekPhotoCount: 2,
        week: "3/3",
        weekTarget: 3,
        met: true,
        seasonAttendCount: 12,
        seasonAttendRate: 80,
      },
      {
        memberId: "mock_b",
        nickname: "이○○",
        profileComplete: true,
        goal: "4:00",
        goalMarathonNetTime: 14400,
        existingPbNetTime: 15600,
        existingPb: "4:20",
        goalBodyWeightKg: null,
        goalBodyWeightPrivate: true,
        goalRaceLabel: "JTBC 서울마라톤",
        resolutionText: "서울마라톤 4시간 컷!",
        bar: "██░",
        weekDots: "●●○○○",
        week: "2/3",
        weekTarget: 3,
        met: false,
        seasonAttendCount: 8,
        seasonAttendRate: 55,
      },
    ],
  },
  exceptionRequests: [],
  hasFutureExceptions: true,
  futureExceptionCount: 1,
};

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    return true;
  } catch (err) {
    console.warn("[chunbaek] token storage failed", err);
    return false;
  }
}

function getAdminPw() {
  return sessionStorage.getItem(ADMIN_PW_KEY) || "";
}

function setAdminPw(pw) {
  if (pw) sessionStorage.setItem(ADMIN_PW_KEY, pw);
  else sessionStorage.removeItem(ADMIN_PW_KEY);
}

async function adminGet(action, params = {}) {
  const qs = new URLSearchParams({ action, adminPw: getAdminPw(), ...params });
  const res = await fetch(`${API_BASE}?${qs}`);
  const data = await res.json();
  if (!data.ok) {
    const err = new Error(data.error || "오류");
    err.status = res.status;
    throw err;
  }
  return data;
}

async function adminPost(action, body = {}) {
  const res = await fetch(`${API_BASE}?action=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adminPw: getAdminPw(), ...body }),
  });
  const data = await res.json();
  if (!data.ok) {
    const err = new Error(data.error || "오류");
    err.status = res.status;
    throw err;
  }
  return data;
}

async function verifyAdmin(pw) {
  const res = await fetch(`${API_BASE}?action=verify-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pw }),
  });
  const data = await res.json();
  if (!data.ok) {
    const err = new Error(data.error || "invalid password");
    err.status = res.status;
    throw err;
  }
  setAdminPw(pw);
  return data;
}

async function apiGet(action, params = {}, needToken = false) {
  if (useMock()) return mockGet(action, params);
  const qs = new URLSearchParams({ action, ...params });
  if (needToken && getToken()) qs.set("token", getToken());
  const res = await fetch(`${API_BASE}?${qs}`);
  const data = await res.json();
  if (!data.ok) {
    const err = new Error(data.error || "오류");
    err.status = res.status;
    throw err;
  }
  return data;
}

async function apiPost(action, body, needToken = false) {
  if (useMock()) return mockPost(action, body);
  const headers = { "Content-Type": "application/json" };
  if (needToken && getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const res = await fetch(`${API_BASE}?action=${action}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    const err = new Error(data.error || "오류");
    err.status = res.status;
    throw err;
  }
  return data;
}

function mockGet(action, params = {}) {
  const preview = previewPayload();
  if (action === "members-roster") return Promise.resolve({ ok: true, members: MOCK.roster });
  if (action === "my-profile") return Promise.resolve({ ok: true, ...preview.profile });
  if (action === "today-slot") return Promise.resolve(preview.todaySlot);
  if (action === "my-timeline") {
    return Promise.resolve({ ok: true, photoRequired: false, weeks: MOCK.timeline });
  }
  if (action === "my-exception-requests") {
    return Promise.resolve({ ok: true, requests: MOCK.exceptionRequests || [] });
  }
  if (action === "team-summary") return Promise.resolve({ ok: true, ...MOCK.team });
  if (action === "team-member-attendance") {
    const entries = [];
    for (const week of MOCK.timeline) {
      for (const slot of week.slots || []) {
        if (!slot.attended) continue;
        const note = (slot.note || "").trim();
        const photoUrls = Array.isArray(slot.photoUrls)
          ? slot.photoUrls.filter(Boolean)
          : (slot.photoUrl ? [slot.photoUrl] : []);
        if (!note && !photoUrls.length) continue;
        const slotId = slot.slotId ?? slot.dayIndex;
        const display = slot.displayDayIndex ?? slot.dayIndex;
        const weekNum = slot.week ?? week.week ?? null;
        const isBeta = weekNum === 0 || (Number(slotId) >= 901 && Number(slotId) < 908);
        entries.push({
          slotId,
          displayDayIndex: display,
          week: weekNum,
          date: slot.date || "",
          title: slot.title || "—",
          note,
          photoUrls,
          dayLabel: isBeta ? `베타 ${display}일차` : `${display}일차`,
        });
      }
    }
    entries.sort((a, b) => {
      const da = String(a.date || "");
      const db = String(b.date || "");
      if (db !== da) return db.localeCompare(da);
      return (Number(b.slotId) || 0) - (Number(a.slotId) || 0);
    });
    return Promise.resolve({
      ok: true,
      memberId: params.memberId || "mock_a",
      entries,
    });
  }
  return Promise.reject(new Error(`preview: unknown action ${action}`));
}

function findMockTimelineSlot(slotId) {
  const id = Number(slotId);
  for (const week of MOCK.timeline) {
    for (const slot of week.slots || []) {
      if (slot.slotId === id || slot.dayIndex === id) return slot;
    }
  }
  return null;
}

function mockExceptionPreview() {
  return {
    applicableSlotIds: [1, 2],
    skippedSlotIds: [],
  };
}

function mockPost(action, body) {
  if (action === "create-profile" || action === "link-device") {
    setToken("preview-token");
    const member = MOCK.roster.find((m) => m.memberId === body.memberId);
    if (action === "create-profile" && body.resolutionText) {
      MOCK.profile.resolutionText = body.resolutionText;
    }
    return Promise.resolve({
      ok: true,
      token: "preview-token",
      memberId: body.memberId || "m2",
      nickname: member?.nickname || "김러너",
      profileComplete: true,
    });
  }
  if (action === "save-attendance") {
    const scenario = PREVIEW_SCENARIOS[getPreviewScenario()] || PREVIEW_SCENARIOS["beta-mon"];
    const slot = findMockTimelineSlot(body.slotId);
    if (slot) {
      const attended = !!body.attended;
      slot.attended = attended;
      if (Object.prototype.hasOwnProperty.call(body, "note")) {
        slot.note = body.note || "";
      }
      if (Object.prototype.hasOwnProperty.call(body, "photoUrls")) {
        const urls = Array.isArray(body.photoUrls)
          ? body.photoUrls.filter(Boolean).slice(0, 5)
          : [];
        slot.photoUrls = urls;
        slot.photoUrl = urls[0] || "";
        slot.photo = urls.length > 0;
      } else if (Object.prototype.hasOwnProperty.call(body, "photoUrl")) {
        slot.photoUrl = body.photoUrl || "";
        slot.photoUrls = slot.photoUrl ? [slot.photoUrl] : [];
        slot.photo = !!slot.photoUrl;
      }
      if (attended) slot.status = "attend";
      else if (slot.status === "attend") slot.status = "miss";
    }
    if (body.attended) {
      const todaySlot = scenario.todaySlot?.slot;
      if (todaySlot && (todaySlot.dayIndex === body.slotId || todaySlot.slotId === body.slotId)) {
        todaySlot.attended = true;
      }
      scenario.profile.stats.seasonAttendCount = (scenario.profile.stats.seasonAttendCount || 0) + 1;
      scenario.profile.stats.weekAttendCount = (scenario.profile.stats.weekAttendCount || 0) + 1;
    }
    return Promise.resolve({
      ok: true,
      slotId: body.slotId,
      attended: !!body.attended,
      stats: scenario.profile.stats,
    });
  }
  if (action === "upload-attendance-photo") {
    const idx = Number(body.photoIndex ?? 0);
    return Promise.resolve({
      ok: true,
      slotId: body.slotId,
      photoUrl: `https://firebasestorage.googleapis.com/v0/b/preview/o/chunbaek%2Fpreview_${idx}.jpg?alt=media&token=preview-token`,
    });
  }
  if (action === "update-profile") {
    Object.assign(MOCK.profile, {
      goalRace: body.goalRace,
      goalRaceNote: body.goalRaceNote || null,
      goalMarathonNetTime: body.goalMarathonNetTime,
      existingPbNetTime: body.existingPbNetTime ?? null,
      goalBodyWeightKg: body.goalBodyWeightKg ?? null,
      goalBodyWeightPrivate: !!body.goalBodyWeightPrivate,
      resolutionText: body.resolutionText || null,
      goalRaceLabel: body.goalRace === "jtbc"
        ? "JTBC 서울마라톤"
        : body.goalRace === "other"
          ? (body.goalRaceNote ? `기타: ${body.goalRaceNote}` : "기타")
          : "춘천 마라톤",
    });
    return Promise.resolve({ ok: true, ...MOCK.profile });
  }
  if (action === "request-exception") {
    const preview = mockExceptionPreview();
    if (body?.dryRun) {
      return Promise.resolve({ ok: true, preview });
    }
    if ((MOCK.exceptionRequests || []).some((request) => request.status === "pending")) {
      const err = new Error("pending request exists");
      err.status = 400;
      return Promise.reject(err);
    }
    const requestId = `mock_req_${Date.now()}`;
    const now = new Date().toISOString();
    const request = {
      requestId,
      seasonId: "chunbaek-s3",
      type: "exception",
      memberId: MOCK.profile.memberId || "m2",
      nickname: MOCK.profile.nickname || "김러너",
      reason: String(body?.reason || ""),
      startDate: String(body?.startDate || ""),
      endDate: String(body?.endDate || ""),
      status: "pending",
      createdAt: now,
      updatedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: "",
      appliedSlotIds: [],
      skippedSlotIds: [],
    };
    MOCK.exceptionRequests.unshift(request);
    return Promise.resolve({ ok: true, requestId, preview });
  }
  if (action === "self-clear-future-exceptions") {
    MOCK.futureExceptionCount = 0;
    MOCK.hasFutureExceptions = false;
    return Promise.resolve({ ok: true, clearedSlotIds: [1] });
  }
  return Promise.reject(new Error(`preview: unknown action ${action}`));
}

function formatNetTime(seconds) {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
