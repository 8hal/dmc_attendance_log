"use strict";

const INTERVAL_MS = 10 * 60 * 1000;
const WINDOW_MS = 6 * 60 * 60 * 1000;

function startSession(nowMs) {
  return {
    startedAt: new Date(nowMs).toISOString(),
    until: new Date(nowMs + WINDOW_MS).toISOString(),
    intervalMinutes: 10,
  };
}

function stopSession(session, nowMs) {
  const base = session && typeof session === "object" ? { ...session } : startSession(nowMs);
  base.until = new Date(nowMs).toISOString();
  return base;
}

function hasEverStartedSession(session) {
  return !!(session && session.startedAt);
}

function isSessionActive(session, nowMs) {
  if (!hasEverStartedSession(session) || !session.until) return false;
  return nowMs < Date.parse(session.until);
}

function hasValidFinish(result) {
  if (!result) return false;
  const t = String(result.netTime || result.finishTime || "").trim();
  if (!t || t === "-" || t === "--:--:--") return false;
  return true;
}

function pickRetryParticipants(participants, jobResults, confirmedKeys) {
  const list = Array.isArray(participants) ? participants : [];
  const results = Array.isArray(jobResults) ? jobResults : [];
  const keys = confirmedKeys instanceof Set ? confirmedKeys : new Set(confirmedKeys || []);
  const byBib = new Map();
  for (const r of results) {
    const bib = String(r && r.bib != null ? r.bib : "").trim();
    if (bib) byBib.set(bib, r);
  }
  const out = [];
  for (const p of list) {
    const bib = String(p && p.bib != null ? p.bib : "").trim();
    if (!bib) continue;
    const key = `${p.realName}_${p.distance}`;
    if (keys.has(key)) continue;
    if (hasValidFinish(byBib.get(bib))) continue;
    out.push(p);
  }
  return out;
}

function decideAutoScrapeTick(event, nowMs, kstHour, kstMinute) {
  const session = event && event.groupScrapeSession;
  if (isSessionActive(session, nowMs)) {
    if (event.groupScrapeStatus === "running") return "skip";
    return "session-retry";
  }
  if (hasEverStartedSession(session)) return "skip";
  if (kstHour !== 15 || kstMinute >= 10) return "skip";
  if (event.groupScrapeStatus === "done" || event.groupScrapeStatus === "running") return "skip";
  return "oneshot";
}

module.exports = {
  INTERVAL_MS,
  WINDOW_MS,
  startSession,
  stopSession,
  hasEverStartedSession,
  isSessionActive,
  pickRetryParticipants,
  decideAutoScrapeTick,
};
