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

  const TEAM_SEASON_RESULT_START_DATE = "2026-10-25";

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

  function decodedStorageObjectPath(photoUrl) {
    const raw = String(photoUrl || "");
    const marker = "/o/";
    const idx = raw.indexOf(marker);
    const encoded = (idx >= 0 ? raw.slice(idx + marker.length) : raw).split("?")[0];
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }

  function photoUrlOwnerMemberId(photoUrl) {
    const objectPath = decodedStorageObjectPath(photoUrl);
    const attend = objectPath.match(/chunbaek\/attendance\/[^/]+\/[^/]+\/([^/]+)$/i);
    if (attend) {
      const owned = attend[1].match(/^(.*)_(\d+)\.(?:jpe?g|png|webp)$/i);
      return owned ? owned[1] : null;
    }
    const result = objectPath.match(/chunbaek\/season-results\/[^/]+\/([^/]+)\.(?:jpe?g|png|webp)$/i);
    return result ? result[1] : null;
  }

  function photoUrlBelongsToMember(photoUrl, memberId) {
    const meId = String(memberId || "");
    if (!meId || !photoUrl) return false;
    const owner = photoUrlOwnerMemberId(photoUrl);
    if (!owner) return true;
    return owner === meId;
  }

  function photosFromMyTimeline(weeks, me) {
    const photos = [];
    const memberId = me?.memberId || "";
    const nickname = me?.nickname || "";
    const pushMine = (photoUrl, extra) => {
      if (!photoUrl || !photoUrlBelongsToMember(photoUrl, memberId)) return;
      photos.push({
        memberId,
        nickname,
        photoUrl,
        ...extra,
      });
    };
    for (const week of weeks || []) {
      for (const slot of week.slots || []) {
        const urls = Array.isArray(slot.photoUrls)
          ? slot.photoUrls.filter(Boolean)
          : (slot.photoUrl ? [slot.photoUrl] : []);
        const dayIndex = slot.displayDayIndex ?? slot.dayIndex ?? null;
        for (const photoUrl of urls) {
          pushMine(photoUrl, {
            date: slot.date || "",
            dayIndex,
            kind: "attendance",
          });
        }
      }
    }
    if (me?.seasonResult?.photoUrl) {
      pushMine(me.seasonResult.photoUrl, {
        date: "",
        dayIndex: null,
        kind: "result",
      });
    }
    return photos;
  }

  function collectSeasonPhotoTiles({ photos, members, me, mineOnly = false } = {}) {
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
      if (!mineOnly) {
        (members || []).forEach((m) => pushCert(m.memberId, m.nickname, m.seasonResult));
      }
    }
    if (mineOnly) {
      if (!meId) return [];
      list = list.filter((p) => p && p.memberId === meId && photoUrlBelongsToMember(p.photoUrl, meId));
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

  function reportPhotoTileCaption(tile) {
    if (tile?.kind === "result") return "기록";
    const day = Number(tile?.dayIndex);
    if (Number.isFinite(day) && day > 0) return `${day}일`;
    return "";
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
    photosFromMyTimeline,
    photoUrlBelongsToMember,
    collectSeasonPhotoTiles,
    reportPhotoTileCaption,
    teamNicknameInitial,
  };
});
