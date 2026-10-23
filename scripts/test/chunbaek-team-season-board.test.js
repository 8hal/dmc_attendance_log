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
  it("10월 25일 전부터는 출석 명단, 당일부터 결과 명단이다", () => {
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

  it("paintTeam은 10월 25일 전에는 출석 명단, 이후는 결과 명단이다", () => {
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

  it("성과 사진 보드는 출석 사진을 포함하고 includePhotos를 요청한다", () => {
    assert.match(appJs, /includePhotos/);
    assert.match(appJs, /collectSeasonPhotoTiles/);
    const boardHtml = html.slice(html.indexOf('id="report-photo-board"') - 280, html.indexOf('id="tab-bar"'));
    assert.match(boardHtml, /올라온 사진/);
    assert.match(boardHtml, /출석 사진과 기록 사진/);
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
