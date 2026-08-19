"use strict";

/**
 * group-events POST source / scrape 쓰기 권한.
 * 오너(DMC_OWNER_PW)와 총무(DMC_ADMIN_PW, 기본 dmc2008) 모두 허용.
 * @param {unknown} pw
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function canWriteGroupEvents(pw, env) {
  const e = env || process.env;
  const secret = pw == null ? "" : String(pw);
  if (!secret) return false;
  const ownerPw = e.DMC_OWNER_PW;
  const adminPw = e.DMC_ADMIN_PW || "dmc2008";
  if (ownerPw && secret === ownerPw) return true;
  if (secret === adminPw) return true;
  return false;
}

module.exports = { canWriteGroupEvents };
