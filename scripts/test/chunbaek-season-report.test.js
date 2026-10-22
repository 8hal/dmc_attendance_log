"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  computeMemberStats,
} = require(path.join(__dirname, "../../functions/lib/chunbaek-stats.js"));
const {
  handleChunbaekRequest,
  parseSeasonResult,
} = require(path.join(__dirname, "../../functions/lib/chunbaek-handlers.js"));

function buildTwoWeeksSlots() {
  const slots = [];
  const startMs = Date.UTC(2026, 6, 20); // 2026-07-20 (Mon)
  for (let i = 0; i < 14; i += 1) {
    const dt = new Date(startMs + i * 86400000).toISOString().slice(0, 10);
    const dayIndex = i + 1;
    const week = Math.ceil(dayIndex / 7);
    slots.push({
      id: String(dayIndex),
      dayIndex,
      date: dt,
      week,
      trainingTitle: i === 4 ? "휴무" : `훈련 ${dayIndex}`,
      isProgramOff: i === 4, // 5일차(금) 휴무
    });
  }
  return slots;
}

describe("Task 1: computeMemberStats — 시즌 마감 출석 성과 (A안)", () => {
  it("시즌 훈련일(seasonTrainingDays), 예외일(seasonExceptionCount), 주간 3점 달성 주차 수(seasonWeeksMetCount/seasonWeeksCount)를 정확히 계산한다", () => {
    const slots = buildTwoWeeksSlots();
    // 1주차(1~7일차, 5일차 휴무 → 훈련일 6일): 1,2,3일차 출석 (3.0점 → 달성!)
    // 2주차(8~14일차, 훈련일 7일): 8일차 출석, 9일차 예외 (1.5점 → 미달)
    const attendanceMap = {
      "1": { slotId: 1, attended: true },
      "2": { slotId: 2, attended: true },
      "3": { slotId: 3, attended: true },
      "8": { slotId: 8, attended: true },
      "9": { slotId: 9, attended: false, exception: true },
    };
    const config = { startDate: "2026-07-20", weeklyTarget: 3 };
    const stats = computeMemberStats({
      slots,
      attendanceMap,
      config,
      today: "2026-08-02", // 14일차 종료일
    });

    assert.equal(stats.seasonDayIndex, 14);
    assert.equal(stats.seasonTrainingDays, 13); // 14일 중 휴무 1일 제외
    assert.equal(stats.seasonExceptionCount, 1); // 9일차 예외 1일
    assert.equal(stats.seasonDenom, 12); // 13 - 1
    assert.equal(stats.seasonAttendCount, 4); // 1,2,3,8일차
    assert.equal(stats.seasonAttendRate, Math.round((4 / 12) * 100)); // 33%
    assert.equal(stats.seasonWeeksCount, 2);
    assert.equal(stats.seasonWeeksMetCount, 1);
    assert.equal(Array.isArray(stats.seasonWeekSummaries), true);
    assert.equal(stats.seasonWeekSummaries.length, 2);
    assert.deepEqual(stats.seasonWeekSummaries[0], {
      week: 1,
      attendCount: 3,
      exceptionCount: 0,
      weekScore: 3,
      target: 3,
      met: true,
    });
    assert.deepEqual(stats.seasonWeekSummaries[1], {
      week: 2,
      attendCount: 1,
      exceptionCount: 1,
      weekScore: 1.5,
      target: 3,
      met: false,
    });
  });
});

class FakeTimestamp {
  constructor(iso) {
    this.iso = iso;
  }
  toDate() {
    return new Date(this.iso);
  }
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== "object") return value;
  if (typeof value.toDate === "function") return value;
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = cloneValue(inner);
  }
  return out;
}

function applyDotPatch(target, patch) {
  const next = cloneValue(target || {});
  for (const [k, v] of Object.entries(patch)) {
    const parts = k.split(".");
    let cur = next;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const p = parts[i];
      if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
      cur = cur[p];
    }
    const last = parts[parts.length - 1];
    if (v && typeof v === "object" && v.constructor && v.constructor.name === "DeleteTransform") {
      delete cur[last];
    } else {
      cur[last] = cloneValue(v);
    }
  }
  return next;
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
  async update(patch) {
    const prev = this.collection.docs.get(this.id) || {};
    this.collection.docs.set(this.id, applyDotPatch(prev, patch));
  }
}

class FakeQuery {
  constructor(collection, filters = []) {
    this.collection = collection;
    this.filters = filters;
  }
  where(field, op, value) {
    return new FakeQuery(this.collection, [...this.filters, { field, op, value }]);
  }
  orderBy() {
    return this;
  }
  async get() {
    let rows = [...this.collection.docs.entries()];
    rows = rows.filter(([, data]) => this.filters.every(({ field, value }) => data?.[field] === value));
    const docs = rows.map(([id, data]) => new FakeDocSnapshot(id, data));
    return {
      docs,
      empty: docs.length === 0,
      forEach: (fn) => docs.forEach(fn),
    };
  }
}

class FakeCollectionRef extends FakeQuery {
  constructor(name, docs) {
    super(null);
    this.name = name;
    this.docs = docs;
    this.collection = this;
  }
  doc(id) {
    return new FakeDocRef(this, id);
  }
}

class FakeDb {
  constructor(seed = {}) {
    this.collections = new Map();
    for (const [name, docs] of Object.entries(seed)) {
      this.collections.set(name, new Map(Object.entries(cloneValue(docs))));
    }
  }
  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    return new FakeCollectionRef(name, this.collections.get(name));
  }
}

function makeRes() {
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

async function runAction(action, req, db) {
  const res = makeRes();
  await handleChunbaekRequest(
    { headers: {}, query: {}, body: {}, ...req },
    res,
    { db, action },
  );
  return res;
}

describe("Task 2: parseSeasonResult 및 update-profile / my-profile / team-summary 연동", () => {
  it("parseSeasonResult — finisher는 netTimeSec(7200~28800초) 필수 및 레이블 생성", () => {
    assert.equal(typeof parseSeasonResult, "function");
    const r = parseSeasonResult({
      status: "finisher",
      race: "chuncheon",
      netTimeSec: 15948,
      photoUrl: "https://example.com/cert.jpg",
      note: "춘마 완주 성공!",
    });
    assert.equal(r.error, undefined);
    assert.equal(r.status, "finisher");
    assert.equal(r.race, "chuncheon");
    assert.equal(r.raceLabel, "춘천 마라톤");
    assert.equal(r.netTimeSec, 15948);
    assert.equal(r.photoUrl, "https://example.com/cert.jpg");
    assert.equal(r.note, "춘마 완주 성공!");
  });

  it("parseSeasonResult — finisher에 netTimeSec 없거나 범위 밖이면 에러", () => {
    const missing = parseSeasonResult({ status: "finisher", race: "jtbc" });
    assert.ok(missing.error);
    const tooFast = parseSeasonResult({ status: "finisher", race: "jtbc", netTimeSec: 3600 });
    assert.ok(tooFast.error);
    const tooSlow = parseSeasonResult({ status: "finisher", race: "jtbc", netTimeSec: 30000 });
    assert.ok(tooSlow.error);
  });

  it("parseSeasonResult — dnf 및 dns는 netTimeSec 없이도 허용되고 null로 정규화된다", () => {
    const dnf = parseSeasonResult({
      status: "dnf",
      race: "jtbc",
      netTimeSec: 15000, // 무시되어야 함
      note: "32km 근육 경련",
    });
    assert.equal(dnf.error, undefined);
    assert.equal(dnf.status, "dnf");
    assert.equal(dnf.netTimeSec, null);
    assert.equal(dnf.raceLabel, "JTBC 서울마라톤");

    const dns = parseSeasonResult({
      status: "dns",
      race: "other",
      raceNote: "경주 동아마라톤",
    });
    assert.equal(dns.error, undefined);
    assert.equal(dns.status, "dns");
    assert.equal(dns.netTimeSec, null);
    assert.equal(dns.raceLabel, "기타: 경주 동아마라톤");
  });

  it("update-profile에서 seasonResult만 단독 전달해도 기존 프로필을 유지하며 저장하고 my-profile / team-summary에 반영된다", async () => {
    const db = new FakeDb({
      members: {
        m1: {
          nickname: "김러너",
          chunbaekS3: {
            participant: true,
            profileComplete: true,
            goalRace: "chuncheon",
            goalMarathonNetTime: 16200, // 4:30:00
            existingPbNetTime: 17520,   // 4:52:00
            resolutionText: "무사 완주!",
          },
        },
      },
      chunbaek_sessions: {
        tok: {
          token: "tok",
          memberId: "m1",
          revoked: false,
          expiresAt: new FakeTimestamp("2099-01-01T00:00:00.000Z"),
        },
      },
      chunbaek_season_config: {
        "chunbaek-s3": { startDate: "2026-07-20", weeklyTarget: 3 },
      },
      chunbaek_slots: {
        "1": { dayIndex: 1, date: "2026-07-20", week: 1, isProgramOff: false },
      },
      chunbaek_attendance: {
        m1_1: { memberId: "m1", slotId: 1, attended: true },
      },
    });

    const saveRes = await runAction("update-profile", {
      method: "POST",
      query: { token: "tok" },
      body: {
        seasonResult: {
          status: "finisher",
          race: "chuncheon",
          netTimeSec: 15948, // 4:25:48
          photoUrl: "https://example.com/cert.jpg",
          note: "목표 달성했습니다!",
        },
      },
    }, db);

    assert.equal(saveRes.statusCode, 200);
    assert.equal(saveRes.body.ok, true);
    assert.equal(saveRes.body.goalMarathonNetTime, 16200); // 기존 프로필 유지
    assert.equal(saveRes.body.existingPbNetTime, 17520);
    assert.ok(saveRes.body.seasonResult);
    assert.equal(saveRes.body.seasonResult.status, "finisher");
    assert.equal(saveRes.body.seasonResult.netTimeSec, 15948);
    assert.equal(saveRes.body.seasonResult.raceLabel, "춘천 마라톤");
    assert.equal(saveRes.body.seasonResult.goalMet, true);
    assert.equal(saveRes.body.seasonResult.pbAchieved, true);

    const teamRes = await runAction("team-summary", {
      method: "GET",
      query: { token: "tok" },
    }, db);
    assert.equal(teamRes.statusCode, 200);
    assert.equal(teamRes.body.members.length, 1);
    assert.ok(teamRes.body.members[0].seasonResult);
    assert.equal(teamRes.body.members[0].seasonResult.status, "finisher");
    assert.equal(teamRes.body.members[0].seasonResult.netTimeSec, 15948);
    assert.equal(teamRes.body.members[0].seasonResult.goalMet, true);
  });
});

describe("Task 3: 기록증 OCR 모듈(chunbaek/js/ocr.js) — 마라톤 시간 추출 및 어댑터", () => {
  it("스마트칩 기록증 텍스트에서 GUN TIME과 10km 구간 기록 대신 NET TIME을 최우선(bestMatch)으로 추출한다", () => {
    const ocr = require(path.join(__dirname, "../../chunbaek/js/ocr.js"));
    const sampleSmartchip = `
      2026 조선일보 춘천마라톤
      참가부문: 풀코스 (Full)  배번: 10425
      10km: 00:52:10   Half: 01:51:20
      GUN TIME: 03:48:05
      NET TIME (순수기록): 03:45:12
    `;
    const parsed = ocr.parseMarathonTimesFromText(sampleSmartchip);
    assert.ok(parsed.bestMatch);
    assert.equal(parsed.bestMatch.h, 3);
    assert.equal(parsed.bestMatch.m, 45);
    assert.equal(parsed.bestMatch.s, 12);
    assert.equal(parsed.bestMatch.totalSec, 3 * 3600 + 45 * 60 + 12);
    // 10km(00:52:10), Half(01:51:20)는 풀코스 범위(2:00:00~8:00:00) 밖이므로 제외되고,
    // 후보에는 03:45:12와 03:48:05가 포함되어야 한다.
    assert.equal(parsed.candidates.length, 2);
    assert.equal(parsed.candidates[0].label, "3:45:12");
    assert.equal(parsed.candidates[1].label, "3:48:05");
  });

  it("한글 시간 표기(4시간 12분 05초)와 점 구분자(04.25.48)도 정확히 파싱한다", () => {
    const ocr = require(path.join(__dirname, "../../chunbaek/js/ocr.js"));
    const sampleKo = "2026 JTBC 서울마라톤 완주 기록 4시간 12분 05초 축하합니다!";
    const parsedKo = ocr.parseMarathonTimesFromText(sampleKo);
    assert.ok(parsedKo.bestMatch);
    assert.equal(parsedKo.bestMatch.label, "4:12:05");
    assert.equal(parsedKo.bestMatch.totalSec, 4 * 3600 + 12 * 60 + 5);

    const sampleDot = "FINISH TIME 04.25.48";
    const parsedDot = ocr.parseMarathonTimesFromText(sampleDot);
    assert.ok(parsedDot.bestMatch);
    assert.equal(parsedDot.bestMatch.label, "4:25:48");
  });

  it("흔한 OCR 오인식 문자(O->0, l/I->1)가 섞인 시간 문자열(03:4S:l2, O4:12:O8)도 보정하여 추출한다", () => {
    const ocr = require(path.join(__dirname, "../../chunbaek/js/ocr.js"));
    const noisyText = "NET TIME O4:12:O8";
    const parsed = ocr.parseMarathonTimesFromText(noisyText);
    assert.ok(parsed.bestMatch);
    assert.equal(parsed.bestMatch.label, "4:12:08");
  });

  it("extractRaceRecord는 플러그인 엔진(1번 tesseract / 2번 custom vision)을 통해 소요시간(elapsedMs)과 결과를 반환한다", async () => {
    const ocr = require(path.join(__dirname, "../../chunbaek/js/ocr.js"));
    const fakeFile = { name: "certificate.jpg" };
    const result = await ocr.extractRaceRecord(fakeFile, {
      engine: async () => "춘천마라톤 풀코스 완주기록 03:58:24",
    });
    assert.equal(result.ok, true);
    assert.equal(typeof result.elapsedMs, "number");
    assert.ok(result.elapsedMs >= 0);
    assert.ok(result.bestMatch);
    assert.equal(result.bestMatch.label, "3:58:24");
  });
});

