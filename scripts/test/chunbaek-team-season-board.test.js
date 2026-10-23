"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const teamSeason = require(path.join(__dirname, "../../chunbaek/js/team-season.js"));

function member(partial) {
  return {
    memberId: "x",
    nickname: "홍길동",
    profileComplete: true,
    goal: "4:30",
    goalRaceLabel: "춘천 마라톤",
    ...partial,
  };
}

describe("teamRowSecondLine", () => {
  it("미등록은 목표 줄을 유지한다", () => {
    assert.equal(
      teamSeason.teamRowSecondLine(member({ seasonResult: null })),
      "목표 4:30 · 춘천 마라톤",
    );
    assert.equal(
      teamSeason.teamRowSecondLine(member({ seasonResult: {} })),
      "목표 4:30 · 춘천 마라톤",
    );
  });

  it("완주 문장과 목표 달성·PB 접미를 스펙 순서로 붙인다", () => {
    assert.equal(
      teamSeason.teamRowSecondLine(member({
        seasonResult: {
          status: "finisher",
          raceLabel: "춘천 마라톤",
          netTimeSec: 15480,
          goalMet: true,
          pbAchieved: true,
        },
      })),
      "춘천 마라톤 완주 4:18:00 · 목표 달성 · PB",
    );
    assert.equal(
      teamSeason.teamRowSecondLine(member({
        seasonResult: {
          status: "finisher",
          raceLabel: "JTBC 서울마라톤",
          netTimeSec: 14700,
          goalMet: false,
          pbAchieved: true,
        },
      })),
      "JTBC 서울마라톤 완주 4:05:00 · PB",
    );
  });

  it("DNF와 DNS는 대회명과 상태만 쓴다", () => {
    assert.equal(
      teamSeason.teamRowSecondLine(member({
        seasonResult: { status: "dnf", raceLabel: "춘천 마라톤" },
      })),
      "춘천 마라톤 DNF",
    );
    assert.equal(
      teamSeason.teamRowSecondLine(member({
        seasonResult: { status: "dns", raceLabel: "JTBC 서울마라톤" },
      })),
      "JTBC 서울마라톤 DNS",
    );
  });
});

describe("teamProfileResultLine", () => {
  it("미등록 모달은 아직 없음이고 등록되면 리스트와 같다", () => {
    assert.equal(teamSeason.teamProfileResultLine(member({ seasonResult: null })), "아직 없음");
    const finished = member({
      seasonResult: {
        status: "finisher",
        raceLabel: "춘천 마라톤",
        netTimeSec: 15480,
        goalMet: true,
        pbAchieved: true,
      },
    });
    assert.equal(
      teamSeason.teamProfileResultLine(finished),
      teamSeason.teamRowSecondLine(finished),
    );
  });
});

describe("teamResultCounts", () => {
  it("등록은 완주·DNF·DNS, 완주는 finisher만 센다", () => {
    const counts = teamSeason.teamResultCounts([
      member({ seasonResult: { status: "finisher", netTimeSec: 15480 } }),
      member({ seasonResult: { status: "dnf" } }),
      member({ seasonResult: { status: "dns" } }),
      member({ seasonResult: null }),
    ]);
    assert.deepEqual(counts, { total: 4, registered: 3, finishers: 1 });
  });
});

describe("sortTeamMembersForDisplay", () => {
  it("나 → 완주 빠른 순 → DNF → DNS → 미등록 가나다로 정렬한다", () => {
    const members = [
      member({ memberId: "jung", nickname: "정○○", seasonResult: null }),
      member({
        memberId: "park",
        nickname: "박○○",
        seasonResult: { status: "dnf", raceLabel: "춘천 마라톤" },
      }),
      member({
        memberId: "kim",
        nickname: "김○○",
        seasonResult: { status: "finisher", netTimeSec: 15480 },
      }),
      member({
        memberId: "me",
        nickname: "나중완주",
        seasonResult: { status: "finisher", netTimeSec: 18000 },
      }),
      member({
        memberId: "lee",
        nickname: "이○○",
        seasonResult: { status: "finisher", netTimeSec: 14700 },
      }),
      member({
        memberId: "choi",
        nickname: "최○○",
        seasonResult: { status: "dns", raceLabel: "춘천 마라톤" },
      }),
      member({ memberId: "kang", nickname: "강○○", seasonResult: null }),
    ];
    const ids = teamSeason.sortTeamMembersForDisplay(members, "me").map((m) => m.memberId);
    assert.deepEqual(ids, ["me", "lee", "kim", "park", "choi", "kang", "jung"]);
  });
});

describe("teamNicknameInitial", () => {
  it("닉네임 첫 글자를 아바타로 쓴다", () => {
    assert.equal(teamSeason.teamNicknameInitial("김○○"), "김");
    assert.equal(teamSeason.teamNicknameInitial(""), "?");
  });
});

describe("shouldShowTeamSeasonResults", () => {
  it("출석 마감일(10월 24일)까지는 출석 명단, 다음 날부터 결과 명단이다", () => {
    assert.equal(teamSeason.shouldShowTeamSeasonResults("2026-10-23"), false);
    assert.equal(teamSeason.shouldShowTeamSeasonResults("2026-10-24"), false);
    assert.equal(teamSeason.shouldShowTeamSeasonResults("2026-10-25"), true);
    assert.equal(teamSeason.shouldShowTeamSeasonResults("2026-10-27"), true);
  });
});

describe("sortTeamMembersForAttendance", () => {
  it("출석 명단은 나 다음 가나다다", () => {
    const members = [
      member({ memberId: "jung", nickname: "정○○" }),
      member({ memberId: "me", nickname: "나중" }),
      member({ memberId: "kang", nickname: "강○○" }),
    ];
    const ids = teamSeason.sortTeamMembersForAttendance(members, "me").map((m) => m.memberId);
    assert.deepEqual(ids, ["me", "kang", "jung"]);
  });
});

describe("collectSeasonPhotoTiles", () => {
  it("출석 사진과 기록 사진을 합치고 날짜 역순으로 둔다", () => {
    const tiles = teamSeason.collectSeasonPhotoTiles({
      me: { memberId: "me" },
      photos: [
        {
          memberId: "a",
          nickname: "이○○",
          photoUrl: "https://x/attend-old.jpg",
          date: "2026-08-01",
          dayIndex: 13,
          kind: "attendance",
        },
        {
          memberId: "me",
          nickname: "김○○",
          photoUrl: "https://x/attend-new.jpg",
          date: "2026-10-20",
          dayIndex: 93,
          kind: "attendance",
        },
        {
          memberId: "me",
          nickname: "김○○",
          photoUrl: "https://x/cert.jpg",
          date: "2026-10-22",
          dayIndex: null,
          kind: "result",
        },
        {
          memberId: "me",
          nickname: "김○○",
          photoUrl: "https://x/attend-new.jpg",
          date: "2026-10-20",
          dayIndex: 93,
          kind: "attendance",
        },
      ],
    });
    assert.deepEqual(tiles.map((t) => t.photoUrl), [
      "https://x/cert.jpg",
      "https://x/attend-new.jpg",
      "https://x/attend-old.jpg",
    ]);
    assert.equal(tiles[0].kind, "result");
    assert.equal(tiles[1].isMe, true);
    assert.equal(tiles[2].isMe, false);
  });

  it("mineOnly면 내 사진만 남긴다", () => {
    const tiles = teamSeason.collectSeasonPhotoTiles({
      mineOnly: true,
      me: { memberId: "me", nickname: "김○○" },
      photos: [
        {
          memberId: "a",
          nickname: "이○○",
          photoUrl: "https://x/other.jpg",
          date: "2026-10-20",
          dayIndex: 93,
          kind: "attendance",
        },
        {
          memberId: "me",
          nickname: "김○○",
          photoUrl: "https://x/mine.jpg",
          date: "2026-10-21",
          dayIndex: 94,
          kind: "attendance",
        },
      ],
    });
    assert.deepEqual(tiles.map((t) => t.photoUrl), ["https://x/mine.jpg"]);
    assert.equal(tiles[0].isMe, true);
  });

  it("photosFromMyTimeline은 내 출석·기록 사진만 모은다", () => {
    const photos = teamSeason.photosFromMyTimeline(
      [
        {
          slots: [
            {
              date: "2026-10-20",
              displayDayIndex: 93,
              photoUrls: ["https://x/day93.jpg"],
            },
            { date: "2026-10-21", displayDayIndex: 94, photoUrl: "" },
          ],
        },
      ],
      {
        memberId: "me",
        nickname: "김○○",
        seasonResult: { photoUrl: "https://x/cert.jpg" },
      },
    );
    assert.deepEqual(photos.map((p) => p.photoUrl), [
      "https://x/day93.jpg",
      "https://x/cert.jpg",
    ]);
    assert.ok(photos.every((p) => p.memberId === "me"));
  });

  it("개인 갤러리 캡션은 일차 또는 기록만 쓴다", () => {
    assert.equal(teamSeason.reportPhotoTileCaption({ kind: "attendance", dayIndex: 96 }), "96일");
    assert.equal(teamSeason.reportPhotoTileCaption({ kind: "result", nickname: "케이지" }), "기록");
    assert.equal(teamSeason.reportPhotoTileCaption({ kind: "attendance" }), "");
  });
});

describe("팀 탭 마크업 계약", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../chunbaek/index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(__dirname, "../../chunbaek/js/app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../../chunbaek/css/chunbaek.css"), "utf8");
  const apiJs = fs.readFileSync(path.join(__dirname, "../../chunbaek/js/api.js"), "utf8");
  const teamHtml = html.slice(html.indexOf('id="view-team"'), html.indexOf('id="team-profile-modal"'));

  it("#view-team에 시즌 최종 결과 캡션과 team-season.js 로드가 있다", () => {
    assert.match(teamHtml, /id="team-season-caption"/);
    assert.match(teamHtml, /시즌 최종 결과/);
    assert.match(html, /src="js\/team-season\.js"/);
  });

  it("paintTeam은 시즌 종료 전에는 출석 명단, 이후는 결과 명단이다", () => {
    assert.match(appJs, /shouldShowTeamSeasonResults/);
    assert.match(appJs, /결과 등록/);
    assert.match(appJs, /이번 주 3점/);
    assert.match(appJs, /시즌 출석률/);
    assert.match(appJs, /team-row--clickable/);
    assert.match(appJs, /team-row--season/);
    const modal = appJs.slice(
      appJs.indexOf("function openTeamProfileModal"),
      appJs.indexOf("function bindTeamListEvents"),
    );
    assert.match(modal, /시즌 최종 결과/);
    assert.match(modal, /<dt>이번 주<\/dt>/);
  });

  it("성과 사진 보드는 내 출석 사진만 모으고 my-timeline을 쓴다", () => {
    assert.match(appJs, /photosFromMyTimeline/);
    assert.match(appJs, /mineOnly:\s*true/);
    assert.match(appJs, /my-timeline/);
    const loadStart = appJs.indexOf("async function loadReportPhotoBoard");
    const loadEnd = appJs.indexOf("async function renderReport");
    const load = appJs.slice(loadStart, loadEnd);
    assert.doesNotMatch(load, /includePhotos/);
    const boardHtml = html.slice(html.indexOf('id="report-photo-board"') - 280, html.indexOf('id="tab-bar"'));
    assert.match(boardHtml, /내가 올린 사진/);
    assert.match(boardHtml, /내가 올린 출석 사진과 기록 사진/);
    const paint = appJs.slice(
      appJs.indexOf("function paintReportPhotoBoard"),
      appJs.indexOf("async function loadReportPhotoBoard"),
    );
    assert.match(paint, /reportPhotoTileCaption/);
    assert.doesNotMatch(paint, /t\.nickname|· 나/);
  });

  it("사진 타일 캡션은 한 줄로 자른다", () => {
    assert.match(css, /\.report-photo-tile-name[\s\S]*white-space:\s*nowrap/);
  });

  it("결과 행은 48px 아바타고 출석 행은 점 칸을 쓴다", () => {
    assert.match(css, /\.team-row--season/);
    assert.match(css, /\.team-row-photo/);
    assert.match(css, /1fr auto/);
  });

  it("MOCK.team에 DNS와 미등록 멤버가 있다", () => {
    assert.match(apiJs, /status:\s*"dns"/);
    assert.match(apiJs, /seasonResult:\s*null/);
  });
});
