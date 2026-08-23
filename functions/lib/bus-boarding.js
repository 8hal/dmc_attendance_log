"use strict";

function rideTypeToLegRequired(rideType) {
  switch (rideType) {
    case "roundtrip":
      return { outbound: true, return: true };
    case "outbound_only":
      return { outbound: true, return: false };
    case "return_only":
      return { outbound: false, return: true };
    default:
      return { outbound: false, return: false };
  }
}

const VALID_RIDE_TYPES = new Set(["roundtrip", "outbound_only", "return_only"]);

function parseRideTypeLabel(label) {
  const s = String(label || "").trim();
  if (!s) return null;
  if (s === "왕복") return "roundtrip";
  if (s === "개별 이동") return "excluded";

  const arrowCount = (s.match(/->|→/g) || []).length;
  if (arrowCount > 1) return null;

  if (/동탄\s*(->|→)\s*철원/.test(s)) return "outbound_only";
  if (/철원\s*(->|→)\s*동탄/.test(s)) return "return_only";

  return null;
}

function makeLegState(required, existing) {
  const prev = existing || {};
  return {
    required: !!required,
    boarded: prev.boarded === true,
    boardedAt: prev.boardedAt ?? null,
    boardedBy: prev.boardedBy ?? null,
  };
}

function buildLegsFromRideType(rideType, existingLegs) {
  const req = rideTypeToLegRequired(rideType);
  const prev = existingLegs || {};
  return {
    outbound: makeLegState(req.outbound, prev.outbound),
    return: makeLegState(req.return, prev.return),
  };
}

function newRosterId() {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildRosterEntry({ nickname, realName, rideType, note, memberId, rosterId, existingLegs }) {
  if (!VALID_RIDE_TYPES.has(rideType)) {
    throw new Error(`invalid rideType: ${rideType}`);
  }
  const nick = String(nickname).trim();
  const mid = memberId ?? null;
  return {
    rosterId: rosterId || newRosterId(),
    nickname: nick,
    realName: String(realName || "").trim(),
    rideType,
    isGuest: !mid,
    memberId: mid,
    note: note == null || note === "" ? null : String(note),
    legs: buildLegsFromRideType(rideType, existingLegs),
  };
}

function emptyBusBoarding(options = {}) {
  return {
    enabled: false,
    legs: [...(options.legs || ["outbound", "return"])],
    importMeta: {
      importedAt: null,
      rowCount: 0,
      sourceLabel: null,
    },
    roster: [],
  };
}

/** 총무 명단 쓰기용. 없으면 enabled:false 껍데기를 만든다. 회원 탑승 체크(assertEnabled)와 분리. */
function ensureBusBoarding(busBoarding) {
  if (busBoarding && typeof busBoarding === "object") return busBoarding;
  return emptyBusBoarding();
}

function findRosterIndexByNickname(roster, nickname) {
  const key = String(nickname).trim();
  return roster.findIndex((r) => r.nickname === key);
}

function applySelfBoard(row, leg, isoNow) {
  const legState = row.legs?.[leg];
  if (!legState || !legState.required) {
    return { ok: false };
  }
  if (legState.boarded) {
    return { ok: true, already: true };
  }
  legState.boarded = true;
  legState.boardedBy = "self";
  legState.boardedAt = isoNow;
  return { ok: true, already: false };
}

function applyAdminBoard(row, leg, boarded, isoNow) {
  const legState = row.legs?.[leg];
  if (!legState) {
    return { ok: false };
  }
  if (boarded) {
    legState.boarded = true;
    legState.boardedBy = "admin";
    legState.boardedAt = isoNow;
  } else {
    legState.boarded = false;
    legState.boardedBy = null;
    legState.boardedAt = null;
  }
  return { ok: true };
}

function toPublicRoster(roster) {
  return roster.map(({ note, ...rest }) => ({ ...rest }));
}

function mergeRosterImport(existing, rows, options = {}) {
  const memberIdByNickname = options.memberIdByNickname || new Map();
  const roster = existing.map((r) => ({ ...r, legs: { ...r.legs, outbound: { ...r.legs.outbound }, return: { ...r.legs.return } } }));
  const report = { merged: 0, added: 0, excluded: 0, errors: [] };

  const nickCounts = new Map();
  for (const row of rows) {
    const nick = String(row.nickname || "").trim();
    if (!nick) continue;
    nickCounts.set(nick, (nickCounts.get(nick) || 0) + 1);
  }
  const duplicateNicks = new Set(
    [...nickCounts.entries()].filter(([, c]) => c > 1).map(([n]) => n)
  );

  const processedDuplicateNicks = new Set();

  for (const row of rows) {
    const nick = String(row.nickname || "").trim();
    if (!nick) {
      report.errors.push({ nickname: "", reason: "empty nickname" });
      continue;
    }

    if (duplicateNicks.has(nick)) {
      if (!processedDuplicateNicks.has(nick)) {
        processedDuplicateNicks.add(nick);
        report.errors.push({ nickname: nick, reason: "duplicate nickname in batch" });
      }
      continue;
    }

    const parsed = parseRideTypeLabel(row.rideTypeLabel);
    if (parsed === "excluded") {
      report.excluded += 1;
      continue;
    }
    if (parsed === null) {
      report.errors.push({ nickname: nick, reason: `unmapped rideType: ${row.rideTypeLabel}` });
      continue;
    }

    const memberId = memberIdByNickname.get(nick) ?? null;
    const idx = findRosterIndexByNickname(roster, nick);

    if (idx >= 0) {
      const prev = roster[idx];
      const realName = Object.prototype.hasOwnProperty.call(row, "realName")
        ? row.realName
        : prev.realName;
      const note = Object.prototype.hasOwnProperty.call(row, "note")
        ? row.note
        : prev.note;
      roster[idx] = buildRosterEntry({
        nickname: nick,
        realName,
        rideType: parsed,
        note,
        memberId: memberId ?? prev.memberId,
        rosterId: prev.rosterId,
        existingLegs: prev.legs,
      });
      report.merged += 1;
    } else {
      roster.push(
        buildRosterEntry({
          nickname: nick,
          realName: row.realName,
          rideType: parsed,
          note: row.note,
          memberId,
        })
      );
      report.added += 1;
    }
  }

  return { roster, report };
}

function assertEnabled(busBoarding) {
  return !!(busBoarding && busBoarding.enabled === true);
}

function summarizeLeg(roster, leg) {
  let required = 0;
  let boarded = 0;
  for (const row of roster) {
    const legState = row.legs?.[leg];
    if (legState?.required) {
      required += 1;
      if (legState.boarded) boarded += 1;
    }
  }
  return { required, boarded };
}

module.exports = {
  rideTypeToLegRequired,
  parseRideTypeLabel,
  buildRosterEntry,
  mergeRosterImport,
  toPublicRoster,
  findRosterIndexByNickname,
  applySelfBoard,
  applyAdminBoard,
  emptyBusBoarding,
  ensureBusBoarding,
  assertEnabled,
  summarizeLeg,
};
