/**
 * 춘백 S3 [팀] 시즌 결과 명단 — 둘째 줄·집계·정렬
 * 브라우저(window.ChunbaekTeamSeason) 및 Node.js(module.exports)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ChunbaekTeamSeason = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const REGISTERED = new Set(["finisher", "dnf", "dns"]);

  function formatNetTime(seconds) {
    if (!seconds) return "—";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function goalLine(m) {
    const goal = m?.goal || "";
    const race = m?.goalRaceLabel || "";
    return race ? `목표 ${goal} · ${race}` : `목표 ${goal}`;
  }

  function teamRowSecondLine(m) {
    const sr = m?.seasonResult;
    if (!sr || !sr.status) return goalLine(m);
    const race = sr.raceLabel || "";
    if (sr.status === "dnf") return `${race} DNF`.trim();
    if (sr.status === "dns") return `${race} DNS`.trim();
    if (sr.status !== "finisher") return goalLine(m);
    let line = `${race} 완주 ${formatNetTime(sr.netTimeSec)}`.trim();
    if (sr.goalMet) line += " · 목표 달성";
    if (sr.pbAchieved) line += " · PB";
    return line;
  }

  function teamProfileResultLine(m) {
    const sr = m?.seasonResult;
    if (!sr || !sr.status) return "아직 없음";
    return teamRowSecondLine(m);
  }

  function teamResultCounts(members) {
    const list = members || [];
    let registered = 0;
    let finishers = 0;
    for (const row of list) {
      const status = row?.seasonResult?.status;
      if (REGISTERED.has(status)) registered += 1;
      if (status === "finisher") finishers += 1;
    }
    return { total: list.length, registered, finishers };
  }

  function resultGroup(m) {
    const status = m?.seasonResult?.status;
    if (status === "finisher") return 0;
    if (status === "dnf") return 1;
    if (status === "dns") return 2;
    return 3;
  }

  function sortTeamMembersForDisplay(members, meId) {
    return [...(members || [])].sort((a, b) => {
      if (meId) {
        if (a.memberId === meId) return -1;
        if (b.memberId === meId) return 1;
      }
      const groupA = resultGroup(a);
      const groupB = resultGroup(b);
      if (groupA !== groupB) return groupA - groupB;
      if (groupA === 0) {
        const timeA = Number(a.seasonResult?.netTimeSec);
        const timeB = Number(b.seasonResult?.netTimeSec);
        const secA = Number.isFinite(timeA) ? timeA : Infinity;
        const secB = Number.isFinite(timeB) ? timeB : Infinity;
        if (secA !== secB) return secA - secB;
      }
      return (a.nickname || "").localeCompare(b.nickname || "", "ko");
    });
  }

  function teamNicknameInitial(nickname) {
    const text = String(nickname || "").trim();
    if (!text) return "?";
    return [...text][0];
  }

  const TEAM_SEASON_RESULT_START_DATE = "2026-10-28";

  function shouldShowTeamSeasonResults(todayIso) {
    return String(todayIso || "").slice(0, 10) >= TEAM_SEASON_RESULT_START_DATE;
  }

  function sortTeamMembersForAttendance(members, meId) {
    return [...(members || [])].sort((a, b) => {
      if (meId) {
        if (a.memberId === meId) return -1;
        if (b.memberId === meId) return 1;
      }
      return (a.nickname || "").localeCompare(b.nickname || "", "ko");
    });
  }

  function collectSeasonPhotoTiles({ photos, members, me } = {}) {
    const meId = me?.memberId || null;
    let list = [];
    if (Array.isArray(photos)) {
      list = photos.slice();
    } else {
      const pushCert = (memberId, nickname, sr) => {
        if (!sr?.photoUrl) return;
        list.push({
          memberId: memberId || "",
          nickname: nickname || "",
          photoUrl: sr.photoUrl,
          date: "",
          dayIndex: null,
          kind: "result",
        });
      };
      if (me) pushCert(me.memberId, me.nickname, me.seasonResult);
      (members || []).forEach((m) => pushCert(m.memberId, m.nickname, m.seasonResult));
    }

    const seen = new Set();
    const tiles = [];
    for (const p of list) {
      const url = p && p.photoUrl;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      tiles.push({
        memberId: p.memberId || "",
        nickname: p.nickname || "",
        photoUrl: url,
        date: p.date || "",
        dayIndex: p.dayIndex ?? null,
        kind: p.kind || "attendance",
        isMe: p.isMe != null ? !!p.isMe : !!(meId && p.memberId === meId),
      });
    }
    tiles.sort((a, b) => {
      const dateCmp = String(b.date || "").localeCompare(String(a.date || ""));
      if (dateCmp) return dateCmp;
      return (Number(b.dayIndex) || 0) - (Number(a.dayIndex) || 0);
    });
    return tiles;
  }

  return {
    TEAM_SEASON_RESULT_START_DATE,
    formatNetTime,
    teamRowSecondLine,
    teamProfileResultLine,
    teamResultCounts,
    sortTeamMembersForDisplay,
    sortTeamMembersForAttendance,
    shouldShowTeamSeasonResults,
    collectSeasonPhotoTiles,
    teamNicknameInitial,
  };
});
