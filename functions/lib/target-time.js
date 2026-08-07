/**
 * 참가자 목표 기록(선택) — 매칭용이 아니라 표시/재미용.
 * 허용: MM:SS, H:MM:SS (시는 1자리 이상)
 */

"use strict";

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: string|null } | { ok: false, error: string }}
 */
function normalizeTargetTime(raw) {
  if (raw === undefined || raw === null) {
    return { ok: true, value: null };
  }
  const s = String(raw).trim();
  if (s === "") {
    return { ok: true, value: null };
  }

  const three = s.match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/);
  if (three) {
    return {
      ok: true,
      value: `${Number(three[1])}:${three[2]}:${three[3]}`,
    };
  }

  const two = s.match(/^(\d{1,2}):([0-5]\d)$/);
  if (two) {
    return {
      ok: true,
      value: `${Number(two[1])}:${two[2]}`,
    };
  }

  return {
    ok: false,
    error: "목표 시간은 MM:SS 또는 H:MM:SS 형식으로 입력해 주세요",
  };
}

/**
 * update-bib 시 participants[] 한 행에 적용할 필드 병합 (순수)
 * @param {object} participant
 * @param {{ bib: string, distance?: unknown, targetTime?: unknown }} patch
 * @param {{ normalizeRaceDistance: (d: unknown) => string }} deps
 */
function applyBibParticipantPatch(participant, patch, deps) {
  const next = { ...participant, bib: patch.bib };

  if (patch.distance !== undefined && patch.distance !== null && String(patch.distance).trim() !== "") {
    next.distance = deps.normalizeRaceDistance(patch.distance);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "targetTime")) {
    const t = normalizeTargetTime(patch.targetTime);
    if (!t.ok) {
      return { ok: false, error: t.error };
    }
    if (t.value === null) {
      delete next.targetTime;
    } else {
      next.targetTime = t.value;
    }
  }

  return { ok: true, participant: next };
}

module.exports = {
  normalizeTargetTime,
  applyBibParticipantPatch,
};
