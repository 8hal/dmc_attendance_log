"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const { handleChunbaekRequest } = require("../../functions/lib/chunbaek-handlers");
const {
  THANKS_REASON_MAX,
  validateThanksVote,
  memberVoteResponse,
  tallyThanksVotes,
} = require("../../functions/lib/chunbaek-thanks-vote");
const {
  memberSectionHtml,
  adminResultsHtml,
  candidateMatches,
} = require("../../chunbaek/js/thanks-vote");
const { awardsHtml, previewModel } = require("../../chunbaek/js/finale");

const ADMIN_PW = process.env.DMC_ADMIN_PW || "dmc2008";

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, inner] of Object.entries(value)) out[key] = cloneValue(inner);
  return out;
}

class FakeDocSnapshot {
  constructor(id, data) {
    this.id = id;
    this.exists = data !== undefined;
    this._data = data;
  }

  data() {
    return this.exists ? cloneValue(this._data) : undefined;
  }
}

class FakeQuerySnapshot {
  constructor(docs) {
    this.docs = docs;
  }

  forEach(fn) {
    this.docs.forEach(fn);
  }
}

class FakeDocRef {
  constructor(collection, id) {
    this.collection = collection;
    this.id = id;
  }

  async get() {
    return new FakeDocSnapshot(this.id, this.collection.docs.get(this.id));
  }

  async set(value, options = {}) {
    const next = cloneValue(value);
    if (options.merge) {
      const prev = this.collection.docs.get(this.id) || {};
      this.collection.docs.set(this.id, { ...cloneValue(prev), ...next });
      return;
    }
    this.collection.docs.set(this.id, next);
  }
}

class FakeQuery {
  constructor(docs, filters = []) {
    this.docs = docs;
    this.filters = filters;
  }

  where(field, op, value) {
    return new FakeQuery(this.docs, [...this.filters, { field, op, value }]);
  }

  orderBy() {
    return this;
  }

  async get() {
    let rows = [...this.docs.entries()];
    for (const filter of this.filters) {
      assert.equal(filter.op, "==");
      rows = rows.filter(([, data]) => data?.[filter.field] === filter.value);
    }
    return new FakeQuerySnapshot(rows.map(([id, data]) => new FakeDocSnapshot(id, data)));
  }
}

class FakeDb {
  constructor(seed) {
    this.collections = new Map();
    for (const [name, docs] of Object.entries(seed)) {
      this.collections.set(name, new Map(Object.entries(cloneValue(docs))));
    }
  }

  collection(name) {
    if (!this.collections.has(name)) this.collections.set(name, new Map());
    const docs = this.collections.get(name);
    const query = new FakeQuery(docs);
    return {
      docs,
      doc: (id) => new FakeDocRef({ docs, name }, id),
      where: (field, op, value) => query.where(field, op, value),
      orderBy: () => query.orderBy(),
      get: () => query.get(),
    };
  }
}

function memberDoc(nickname, participant = true) {
  return {
    nickname,
    hidden: false,
    chunbaekS3: { participant, profileComplete: true },
  };
}

function seedDb(extraVotes = {}) {
  return new FakeDb({
    members: {
      a: memberDoc("가람"),
      b: memberDoc("나래"),
      c: memberDoc("다온"),
      hidden: { nickname: "숨김", hidden: true, chunbaekS3: { participant: true } },
      guest: memberDoc("손님", false),
    },
    chunbaek_sessions: {
      token_a: { memberId: "a", revoked: false },
      token_b: { memberId: "b", revoked: false },
      token_c: { memberId: "c", revoked: false },
      token_guest: { memberId: "guest", revoked: false },
    },
    chunbaek_thanks_votes: extraVotes,
  });
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function callChunbaek(db, { method = "GET", action, token, adminPw, body }) {
  const req = {
    method,
    query: { action },
    headers: {},
    body: body || {},
  };
  if (token) req.headers.authorization = `Bearer ${token}`;
  if (adminPw && method === "GET") req.query.adminPw = adminPw;
  if (adminPw && method !== "GET") req.body = { ...req.body, adminPw };
  const res = mockRes();
  await handleChunbaekRequest(req, res, { db, action });
  return res;
}

test("투표 검증은 자기 자신을 거절하고 다른 참가자와 빈 이유를 허용한다", () => {
  const participants = [
    { memberId: "a", nickname: "가람" },
    { memberId: "b", nickname: "나래" },
  ];
  const self = validateThanksVote({
    voterMemberId: "a",
    nomineeMemberId: "a",
    reason: "",
    participants,
  });
  assert.equal(self.ok, false);
  assert.equal(self.status, 400);

  const other = validateThanksVote({
    voterMemberId: "a",
    nomineeMemberId: "b",
    reason: "  페이스를 맞춰 줘서  ",
    participants,
  });
  assert.equal(other.ok, true);
  assert.equal(other.nominee.nickname, "나래");
  assert.equal(other.reason, "페이스를 맞춰 줘서");

  const blank = validateThanksVote({
    voterMemberId: "a",
    nomineeMemberId: "b",
    reason: "   ",
    participants,
  });
  assert.equal(blank.ok, true);
  assert.equal(blank.reason, "");

  const long = validateThanksVote({
    voterMemberId: "a",
    nomineeMemberId: "b",
    reason: "가".repeat(THANKS_REASON_MAX + 1),
    participants,
  });
  assert.equal(long.ok, false);
  assert.match(long.error, /80자|이내/);
});

test("회원 응답에는 투표 여부와 후보만 있고 득표·이유는 없다", () => {
  const view = memberVoteResponse({
    voted: true,
    candidates: [{ memberId: "b", nickname: "나래", reason: "비밀", votes: 3 }],
  });
  assert.deepEqual(Object.keys(view).sort(), ["candidates", "ok", "voted"]);
  assert.equal(view.voted, true);
  assert.deepEqual(view.candidates, [{ memberId: "b", nickname: "나래" }]);
  assert.equal(JSON.stringify(view).includes("비밀"), false);
});

test("득표 집계는 같은 후보의 표와 이유를 모은다", () => {
  const tally = tallyThanksVotes([
    { nomineeMemberId: "b", nomineeNickname: "나래", voterMemberId: "a", voterNickname: "가람", reason: "응원" },
    { nomineeMemberId: "b", nomineeNickname: "나래", voterMemberId: "c", voterNickname: "다온", reason: "" },
    { nomineeMemberId: "a", nomineeNickname: "가람", voterMemberId: "b", voterNickname: "나래", reason: "기록" },
  ]);
  assert.deepEqual(tally.map((row) => [row.memberId, row.votes]), [["b", 2], ["a", 1]]);
  assert.deepEqual(tally[0].reasons.map((row) => row.voterNickname), ["가람", "다온"]);
});

test("멤버는 1표만 저장하고 재투표하면 같은 문서가 바뀐다", async () => {
  const db = seedDb();
  const first = await callChunbaek(db, {
    method: "POST",
    action: "thanks-vote",
    token: "token_a",
    body: { nomineeMemberId: "b", reason: "같이 달려 줘서" },
  });
  assert.equal(first.statusCode, 200);
  assert.deepEqual(Object.keys(first.body).sort(), ["ok", "voted"]);
  assert.equal(first.body.voted, true);

  const again = await callChunbaek(db, {
    method: "POST",
    action: "thanks-vote",
    token: "token_a",
    body: { nomineeMemberId: "c", reason: "기록을 봐 줘서" },
  });
  assert.equal(again.statusCode, 200);

  const votes = db.collections.get("chunbaek_thanks_votes");
  assert.equal(votes.size, 1);
  const stored = votes.get("a");
  assert.equal(stored.nomineeMemberId, "c");
  assert.equal(stored.reason, "기록을 봐 줘서");
  assert.equal(stored.voterMemberId, "a");
  assert.ok(stored.createdAt);
  assert.ok(stored.updatedAt);
});

test("회원 조회는 자신의 투표 여부만 알려 주고 다른 사람의 이유를 숨긴다", async () => {
  const db = seedDb();
  await callChunbaek(db, {
    method: "POST",
    action: "thanks-vote",
    token: "token_a",
    body: { nomineeMemberId: "b", reason: "비밀 이유" },
  });

  const mine = await callChunbaek(db, { action: "thanks-vote", token: "token_a" });
  assert.equal(mine.statusCode, 200);
  assert.equal(mine.body.voted, true);
  assert.deepEqual(mine.body.candidates.map((row) => row.memberId), ["b", "c"]);
  assert.equal(JSON.stringify(mine.body).includes("비밀 이유"), false);
  assert.equal(JSON.stringify(mine.body).includes("nominee"), false);

  const other = await callChunbaek(db, { action: "thanks-vote", token: "token_b" });
  assert.equal(other.body.voted, false);
  assert.equal(JSON.stringify(other.body).includes("비밀 이유"), false);
  assert.equal(other.body.candidates.some((row) => row.memberId === "b"), false);
});

test("자기 자신·비참가자·빈 대상·너무 긴 이유·없는 토큰은 저장하지 않는다", async () => {
  const db = seedDb();
  const self = await callChunbaek(db, {
    method: "POST",
    action: "thanks-vote",
    token: "token_a",
    body: { nomineeMemberId: "a", reason: "나" },
  });
  assert.equal(self.statusCode, 400);

  const hidden = await callChunbaek(db, {
    method: "POST",
    action: "thanks-vote",
    token: "token_a",
    body: { nomineeMemberId: "hidden" },
  });
  assert.equal(hidden.statusCode, 400);

  const missing = await callChunbaek(db, {
    method: "POST",
    action: "thanks-vote",
    token: "token_a",
    body: { reason: "누구?" },
  });
  assert.equal(missing.statusCode, 400);

  const long = await callChunbaek(db, {
    method: "POST",
    action: "thanks-vote",
    token: "token_a",
    body: { nomineeMemberId: "b", reason: "가".repeat(THANKS_REASON_MAX + 1) },
  });
  assert.equal(long.statusCode, 400);

  const guest = await callChunbaek(db, {
    method: "POST",
    action: "thanks-vote",
    token: "token_guest",
    body: { nomineeMemberId: "b" },
  });
  assert.equal(guest.statusCode, 404);

  const anon = await callChunbaek(db, {
    method: "POST",
    action: "thanks-vote",
    body: { nomineeMemberId: "b" },
  });
  assert.equal(anon.statusCode, 401);
  assert.equal(db.collections.get("chunbaek_thanks_votes").size, 0);
});

test("투표 결과와 이유는 운영진 비밀번호로만 볼 수 있다", async () => {
  const db = seedDb();
  await callChunbaek(db, {
    method: "POST",
    action: "thanks-vote",
    token: "token_a",
    body: { nomineeMemberId: "b", reason: "응원 고마워요" },
  });
  await callChunbaek(db, {
    method: "POST",
    action: "thanks-vote",
    token: "token_c",
    body: { nomineeMemberId: "b", reason: "" },
  });

  const denied = await callChunbaek(db, { action: "admin-thanks-votes", token: "token_a" });
  assert.equal(denied.statusCode, 401);
  assert.equal(JSON.stringify(denied.body).includes("응원 고마워요"), false);

  const wrong = await callChunbaek(db, { action: "admin-thanks-votes", adminPw: "nope" });
  assert.equal(wrong.statusCode, 401);

  const admin = await callChunbaek(db, { action: "admin-thanks-votes", adminPw: ADMIN_PW });
  assert.equal(admin.statusCode, 200);
  assert.equal(admin.body.ballotCount, 2);
  assert.equal(admin.body.tally[0].memberId, "b");
  assert.equal(admin.body.tally[0].votes, 2);
  assert.equal(admin.body.tally[0].reasons.some((row) => row.reason === "응원 고마워요" && row.voterNickname === "가람"), true);
});

test("시상 명단은 운영진 비밀번호가 있을 때만 내려온다", async () => {
  const db = seedDb();
  const denied = await callChunbaek(db, { action: "admin-finale", token: "token_a" });
  assert.equal(denied.statusCode, 401);
  assert.equal(JSON.stringify(denied.body).includes("가람"), false);

  const admin = await callChunbaek(db, { action: "admin-finale", adminPw: ADMIN_PW });
  assert.equal(admin.statusCode, 200);
  assert.equal(Object.hasOwn(admin.body, "party"), false);
  assert.ok(admin.body.members.some((member) => member.nickname === "가람"));
  assert.equal(JSON.stringify(admin.body).includes("tally"), false);
});

test("화면은 회원에게 투표와 안내만, 시상은 운영 화면에 둔다", () => {
  const root = path.join(__dirname, "../..");
  const party = fs.readFileSync(path.join(root, "chunbaek/party.html"), "utf8");
  const finale = fs.readFileSync(path.join(root, "chunbaek/finale.html"), "utf8");
  const index = fs.readFileSync(path.join(root, "chunbaek/index.html"), "utf8");
  const admin = fs.readFileSync(path.join(root, "chunbaek/admin.html"), "utf8");
  const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
  const section = memberSectionHtml({
    voted: false,
    candidates: [
      { memberId: "b", nickname: "나래" },
      { memberId: "me", nickname: "<script>" },
    ],
  });
  assert.match(section, /당신 때문에 고마웠다/);
  assert.match(section, /고마웠던 춘백방 회원 1명을 골라주세요/);
  assert.equal(section.includes("자기 자신"), false);
  assert.match(section, /아직 투표하지 않았습니다/);
  const ordered = memberSectionHtml({
    voted: false,
    candidates: [
      { memberId: "c", nickname: "다온" },
      { memberId: "a", nickname: "가람" },
      { memberId: "b", nickname: "나래" },
    ],
  });
  assert.deepEqual(
    [...ordered.matchAll(/thanks-card-name">([^<]+)/g)].map((match) => match[1]),
    ["가람", "나래", "다온"],
  );
  assert.match(section, /value="b"/);
  assert.match(section, /class="thanks-card"/);
  assert.match(section, /class="thanks-card-name">나래</);
  assert.equal(section.includes("sl-avatar"), false);
  assert.match(section, /id="thanks-search"/);
  assert.match(section, /id="thanks-vote-submit"[^>]*disabled/);
  assert.equal(section.includes("<script>"), false);
  assert.equal(memberSectionHtml({
    voted: false,
    candidates: [],
    draftReason: "<script>",
  }).includes("<script>"), false);
  assert.equal(candidateMatches("나래", "나"), true);
  assert.equal(candidateMatches("나래", "페이스"), false);
  const picked = memberSectionHtml({
    voted: true,
    selectedMemberId: "b",
    candidates: [{ memberId: "b", nickname: "나래" }],
  });
  assert.match(picked, /투표했습니다/);
  assert.match(picked, /checked/);
  assert.match(picked, /다시 투표하기/);
  assert.match(memberSectionHtml({ voted: true, candidates: [] }), /투표했습니다/);

  const awards = awardsHtml(previewModel());
  assert.match(awards, /목표 달성상/);
  assert.match(awards, /카페인상/);
  assert.match(awards, /최우수상/);

  const adminHtml = adminResultsHtml({
    ballotCount: 1,
    tally: [{
      memberId: "b",
      nickname: "나래",
      votes: 1,
      reasons: [{ voterNickname: "가람", reason: "응원" }],
    }],
  });
  assert.match(adminHtml, /1표/);
  assert.match(adminHtml, /가람/);
  assert.match(adminHtml, /응원/);

  assert.match(party, /당신 때문에 고마웠다/);
  assert.match(party, /thanks-vote-host/);
  assert.equal(party.includes("2026-11-27"), false);
  assert.equal(party.includes("장소"), false);
  assert.equal(party.includes("finale-party"), false);
  assert.match(party, /js\/thanks-vote\.js/);
  assert.match(party, /shoelace@2\.20\.1/);
  assert.equal(party.includes("목표 달성상"), false);
  assert.equal(party.includes("최우수상"), false);
  assert.equal(party.includes("카페인상"), false);
  assert.equal(party.includes("저녁"), false);
  assert.match(index, /party\.html/);
  assert.equal(index.includes("finale.html"), false);
  assert.match(finale, /party\.html/);
  assert.equal(finale.includes("목표 달성상"), false);
  assert.equal(finale.includes("team-summary"), false);
  assert.match(admin, /data-panel="awards"/);
  assert.match(admin, /id="panel-awards"/);
  assert.match(admin, /id="awards-root"/);
  assert.equal(admin.includes("finale-place"), false);
  assert.equal(admin.includes("안내 저장"), false);
  assert.match(admin, /js\/finale\.js/);
  assert.match(admin, /js\/thanks-vote\.js/);
  assert.equal(admin.includes("finale.html"), false);
  assert.match(rules, /match \/chunbaek_thanks_votes\/\{docId\}/);
  assert.match(rules, /chunbaek_thanks_votes[\s\S]*allow read: if false/);
  assert.match(rules, /chunbaek_thanks_votes[\s\S]*allow write: if false/);
});
