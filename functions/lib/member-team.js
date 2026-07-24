/**
 * 정회원(members) 팀 코드 정규화·검증·출석 시 백필 판정.
 * GUEST는 출석 전용이며 members.team 에 저장하지 않는다.
 */

const MEMBER_TEAM_CODES = new Set(["S", "T1", "T2", "T3", "T4", "T5"]);

function normalizeMemberTeam(team) {
  const code = String(team == null ? "" : team).trim().toUpperCase();
  if (!code || !MEMBER_TEAM_CODES.has(code)) return "";
  return code;
}

/**
 * update-member / add-member 용. 빈 문자열은 팀 미지정으로 허용.
 * @returns {{ ok: true, team: string } | { ok: false, error: string }}
 */
function parseMemberTeamUpdate(team) {
  if (team === undefined || team === null) {
    return { ok: false, error: "team is required when provided" };
  }
  const raw = String(team).trim();
  if (!raw) return { ok: true, team: "" };
  const code = raw.toUpperCase();
  if (code === "GUEST") {
    return { ok: false, error: "invalid team enum: GUEST" };
  }
  if (!MEMBER_TEAM_CODES.has(code)) {
    return { ok: false, error: `invalid team enum: ${code}` };
  }
  return { ok: true, team: code };
}

/**
 * 출석 체크인 시 members.team 이 비어 있으면 체크인 팀으로 채울지 여부.
 */
function shouldBackfillMemberTeam(storedTeam, checkinTeam) {
  const stored = normalizeMemberTeam(storedTeam);
  if (stored) return false;
  const checkin = normalizeMemberTeam(checkinTeam);
  return !!checkin;
}

/**
 * 개인 출석 프로필 생성 시 명단 team 사용. 없으면 null (기본값 S 금지).
 */
function teamForNewProfile(memberTeam) {
  const code = normalizeMemberTeam(memberTeam);
  return code || null;
}

module.exports = {
  MEMBER_TEAM_CODES,
  normalizeMemberTeam,
  parseMemberTeamUpdate,
  shouldBackfillMemberTeam,
  teamForNewProfile,
};
