/**
 * 춘백 API 클라이언트 — _docs/development/api-patterns.md 준수
 */
const IS_LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = IS_LOCAL
  ? `http://${location.hostname}:5001/dmc-attendance/asia-northeast3/chunbaek`
  : "/api/chunbaek";

const TOKEN_KEY = "chunbaekSessionToken";

const PREVIEW_MODE = new URLSearchParams(location.search).has("preview")
  || location.protocol === "file:"
  || IS_LOCAL;

function useMock() {
  return PREVIEW_MODE;
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
        { dayIndex: 36, title: "5km 인터벌", content: "워밍업 10분, 5×1km (r:90s), 마무리 이지 2km", status: "attend", photo: true },
        { dayIndex: 37, title: "(휴무)", content: "", status: "off" },
        { dayIndex: 38, title: "장거리", content: "15km 이지, 페이스 6:00~6:15/km", status: "attend" },
        { dayIndex: 39, title: "인터벌", content: "6×800m", status: "miss" },
        { dayIndex: 42, title: "인터벌", content: "5×1km", status: "today" },
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
      { nickname: "김○○", goal: "4:30", bar: "███", week: "3/3", met: true },
      { nickname: "이○○", goal: "4:00", bar: "██░", week: "2/3", met: false },
      { nickname: "박○○", goal: "5:00", bar: "█░░", week: "1/3", met: false },
    ],
  },
};

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function apiGet(action, params = {}, needToken = false) {
  if (useMock()) return mockGet(action, params);
  const qs = new URLSearchParams({ action, ...params });
  if (needToken && getToken()) qs.set("token", getToken());
  try {
    const res = await fetch(`${API_BASE}?${qs}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "오류");
    return data;
  } catch (e) {
    console.warn("[chunbaek] API 실패 → 목업 데이터 사용:", action, e.message);
    return mockGet(action, params);
  }
}

async function apiPost(action, body, needToken = false) {
  if (useMock()) return mockPost(action, body);
  const headers = { "Content-Type": "application/json" };
  if (needToken && getToken()) headers.Authorization = `Bearer ${getToken()}`;
  try {
    const res = await fetch(`${API_BASE}?action=${action}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "오류");
    return data;
  } catch (e) {
    console.warn("[chunbaek] API 실패 → 목업:", action, e.message);
    return mockPost(action, body);
  }
}

function mockGet(action) {
  if (action === "members-roster") return Promise.resolve({ ok: true, members: MOCK.roster });
  if (action === "my-profile") return Promise.resolve({ ok: true, ...MOCK.profile });
  if (action === "today-slot") return Promise.resolve({ ok: true, slot: MOCK.todaySlot });
  if (action === "my-timeline") return Promise.resolve({ ok: true, weeks: MOCK.timeline });
  if (action === "team-summary") return Promise.resolve({ ok: true, ...MOCK.team });
  return Promise.reject(new Error(`preview: unknown action ${action}`));
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
    MOCK.todaySlot.attended = true;
    MOCK.profile.stats.weekAttendCount = 3;
    return Promise.resolve({ ok: true });
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
