"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  mapMyResultCourse,
  myResultPlayerToRecord,
} = require("../../functions/lib/myresult-player.js");
const { fetchMyResultPlayer } = require("../../functions/lib/myresult-socket.js");
const { searchMyResult } = require("../../functions/lib/scraper.js");

/**
 * 2025 춘천(MyResult 132) 배번 1001 공개 기록에서 시각만 옮긴 픽스처.
 * 이름·연락처는 넣지 않는다. time_point는 시계 시각이고 result_guntime 23:59:* 는 버린다.
 */
const FULL_PLAYER = {
  num: "1001",
  name: "기록샘플",
  course_cd: "Full",
  gender: "M",
  result_nettime: "03:35:52.89",
  result_guntime: "23:59:39.74",
  pace_nettime: "05:06",
  mobile: "010-0000-0000",
  birthday: "1990-01-01",
  course: { course_cd: "Full", distance: "42.195", guntime: "09:03:08", explain: "마스터즈 풀코스" },
  records: [
    { point_cd: "P0", time_point: "09:03:28.26", point: { name: "출발", distance: "0.00" } },
    { point_cd: "P10", time_point: "11:37:01.49", point: { name: "30K", distance: "30.00" } },
    { point_cd: "P13", time_point: "12:39:21.15", point: { name: "도착", distance: "42.20" } },
    { point_cd: "P4", time_point: "09:26:46.65", point: { name: "5K", distance: "5.00" } },
    { point_cd: "P8", time_point: "10:48:38.08", point: { name: "Half", distance: "21.10" } },
  ],
};

describe("mapMyResultCourse", () => {
  it("Full·EF는 full, EH는 half, 10K는 10K", () => {
    assert.equal(mapMyResultCourse("Full"), "full");
    assert.equal(mapMyResultCourse("EF"), "full");
    assert.equal(mapMyResultCourse("EH"), "half");
    assert.equal(mapMyResultCourse("10K"), "10K");
  });

  it("휠체어 코드 W는 half로 합치지 않는다", () => {
    assert.equal(mapMyResultCourse("W"), "W");
  });
});

describe("myResultPlayerToRecord", () => {
  it("넷타임과 출발 칩 기준 경과 구간을 거리 순으로 만든다", () => {
    const rec = myResultPlayerToRecord(FULL_PLAYER);
    assert.equal(rec.distance, "full");
    assert.equal(rec.netTime, "03:35:52");
    assert.equal(rec.bib, "1001");
    assert.equal(rec.gender, "M");
    assert.equal(rec.pace, "05:06");
    assert.equal(rec.gunTime, "03:36:13");
    assert.deepEqual(rec.splits.map((s) => s.label), ["5K", "Half", "30K", "도착"]);
    assert.equal(rec.splits[0].time, "00:23:18");
    assert.equal(rec.splits[1].time, "01:45:09");
    assert.equal(rec.splits[3].time, "03:35:52");
    assert.equal(rec.mobile, undefined);
    assert.equal(rec.birthday, undefined);
  });

  it("EF는 full, 넷타임만 있고 구간이 없어도 기록을 만든다", () => {
    const rec = myResultPlayerToRecord({
      num: "10",
      name: "엘리트",
      course_cd: "EF",
      gender: "m",
      result_nettime: "02:38:31.78",
      result_guntime: "23:59:57.21",
      records: [],
    });
    assert.equal(rec.distance, "full");
    assert.equal(rec.netTime, "02:38:31");
    assert.equal(rec.gunTime, "");
    assert.deepEqual(rec.splits, []);
    assert.equal(rec.gender, "M");
  });

  it("EH는 half", () => {
    const rec = myResultPlayerToRecord({
      num: "7",
      name: "하프",
      course_cd: "EH",
      result_nettime: "01:12:03",
      records: [],
    });
    assert.equal(rec.distance, "half");
    assert.equal(rec.netTime, "01:12:03");
  });

  it("넷타임이 없으면 null", () => {
    assert.equal(myResultPlayerToRecord({ num: "1", course_cd: "EF", result_nettime: null, records: [] }), null);
    assert.equal(myResultPlayerToRecord(null), null);
  });
});

describe("fetchMyResultPlayer", () => {
  it("소켓 CLIENT:INFO 응답의 배번 기록을 반환한다", async () => {
    const sent = [];
    class FakeWS {
      constructor(url) {
        this.url = url;
        this.listeners = {};
        queueMicrotask(() => this.emit("0{\"sid\":\"t\"}"));
      }
      addEventListener(type, fn) {
        (this.listeners[type] ||= []).push(fn);
      }
      send(data) {
        sent.push(String(data));
        if (String(data) === "40") queueMicrotask(() => this.emit("40"));
        if (String(data).includes("CLIENT:INFO")) {
          const payload = JSON.stringify(["broadcast", { num: "1001", result_nettime: "03:35:52.89", course_cd: "Full" }]);
          queueMicrotask(() => this.emit("42" + payload));
        }
      }
      emit(data) {
        for (const fn of this.listeners.message || []) fn({ data });
      }
      close() {}
    }

    const player = await fetchMyResultPlayer("132", "1001", { WebSocketImpl: FakeWS, timeoutMs: 1000 });
    assert.equal(player.num, "1001");
    assert.equal(player.result_nettime, "03:35:52.89");
    assert.ok(sent.includes("40"));
    assert.ok(sent.some((s) => s.includes("CLIENT:INFO") && s.includes("1001")));
  });

  it("배번이 없는 응답은 null", async () => {
    class FakeWS {
      constructor() {
        this.listeners = {};
        queueMicrotask(() => this.emit("0{}"));
      }
      addEventListener(type, fn) {
        (this.listeners[type] ||= []).push(fn);
      }
      send(data) {
        if (String(data) === "40") queueMicrotask(() => this.emit("40"));
        if (String(data).includes("CLIENT:INFO")) queueMicrotask(() => this.emit('42["broadcast",{}]'));
      }
      emit(data) {
        for (const fn of this.listeners.message || []) fn({ data });
      }
      close() {}
    }
    const player = await fetchMyResultPlayer(132, "999999", { WebSocketImpl: FakeWS, timeoutMs: 1000 });
    assert.equal(player, null);
  });
});

describe("searchMyResult", () => {
  it("배번 조회는 검색 JSON이 아니라 선수 상세의 넷타임을 쓴다", async () => {
    let httpCalls = 0;
    const rows = await searchMyResult("132", "1001", {
      fetchImpl: async () => {
        httpCalls += 1;
        return { ok: true, json: async () => [{ num: "1001", name: "이름만" }] };
      },
      fetchPlayer: async (eventId, bib) => {
        assert.equal(String(eventId), "132");
        assert.equal(bib, "1001");
        return FULL_PLAYER;
      },
    });
    assert.equal(httpCalls, 0);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].netTime, "03:35:52");
    assert.equal(rows[0].distance, "full");
    assert.equal(rows[0].splits[0].label, "5K");
  });

  it("이름 검색은 q= 결과의 배번으로 상세를 조회한다", async () => {
    const bibs = [];
    const rows = await searchMyResult("132", "홍길동", {
      fetchImpl: async (url) => {
        assert.match(String(url), /\/api\/event\/132\/player\?q=/);
        return { ok: true, json: async () => [{ event_id: 132, num: "10", name: "홍길동" }] };
      },
      fetchPlayer: async (_eventId, bib) => {
        bibs.push(bib);
        return {
          num: bib,
          name: "홍길동",
          course_cd: "10K",
          gender: "F",
          result_nettime: "00:48:12.2",
          records: [],
        };
      },
    });
    assert.deepEqual(bibs, ["10"]);
    assert.equal(rows[0].distance, "10K");
    assert.equal(rows[0].netTime, "00:48:12");
    assert.equal(rows[0].gender, "F");
  });
});

describe("myresult group scrape wiring", () => {
  it("관리 화면 배번 스크랩 허용 목록에 myresult가 있다", () => {
    const html = fs.readFileSync(path.join(__dirname, "../../event-admin.html"), "utf8");
    assert.match(html, /BIB_SCRAPE_SOURCES = \["smartchip", "ohmyrace", "spct", "myresult"\]/);
    assert.match(html, /myresult만 지원합니다/);
  });

  it("스크랩 잡 결과에 splits를 남긴다", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../functions/lib/scraper.js"), "utf8");
    const pushAt = src.indexOf("results.push({");
    const block = src.slice(pushAt, pushAt + 700);
    assert.match(block, /splits:/);
  });

  it("배번 미지원 오류 문구에 myresult가 포함된다", () => {
    const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
    assert.doesNotMatch(index, /smartchip·ohmyrace·spct만 지원합니다/);
    assert.match(index, /BIB_MODE_GROUP_SCRAPE_UNSUPPORTED_ERROR/);
  });
});

describe("2026 춘천 날짜", () => {
  it("discover-events 춘천 스텁은 10-25", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../scripts/discover-events.js"), "utf8");
    const start = src.indexOf("async function discoverChuncheon");
    const end = src.indexOf("async function discoverOhmyrace");
    const fn = src.slice(start, end);
    assert.match(fn, /10-25/);
    assert.doesNotMatch(fn, /10-26/);
  });

  it("춘백 시즌 목표 대회 춘천은 2026-10-25", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../functions/lib/chunbaek-handlers.js"), "utf8");
    assert.match(src, /chuncheon:\s*"2026-10-25"/);
    assert.doesNotMatch(src, /chuncheon:\s*"2026-10-26"/);
  });
});
