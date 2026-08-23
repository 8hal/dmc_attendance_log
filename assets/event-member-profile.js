(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EventMemberProfile = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const LS_PROFILE = "dmc_attendance_v2_profile";
  const LS_ATT = "marathon_att_nickname";
  const LS_BOARDING = "dmc_boarding_nickname";
  const LS_BIB = "dmc_bib_nickname";

  function readSavedIdentity(ls) {
    const rawProfile = ls.getItem(LS_PROFILE);
    if (rawProfile) {
      try {
        const profile = JSON.parse(rawProfile);
        if (profile && profile.nickname) {
          return {
            nickname: profile.nickname,
            memberId: profile.memberId || null,
          };
        }
      } catch (_e) {
        /* fall through */
      }
    }

    const att = ls.getItem(LS_ATT);
    if (att) {
      return { nickname: att, memberId: null };
    }

    const boarding = ls.getItem(LS_BOARDING);
    if (boarding) {
      return { nickname: boarding, memberId: null };
    }

    const bib = ls.getItem(LS_BIB);
    if (bib) {
      return { nickname: bib, memberId: null };
    }

    return { nickname: null, memberId: null };
  }

  function matchInList(list, identity) {
    if (!list || !identity) return null;

    if (identity.memberId != null && identity.memberId !== "") {
      const mid = String(identity.memberId);
      const byId = list.find((m) => m && m.memberId != null && String(m.memberId) === mid);
      if (byId) return byId;
    }

    if (identity.nickname) {
      const nickLower = String(identity.nickname).toLowerCase();
      const byNick = list.find(
        (m) => m && m.nickname && String(m.nickname).toLowerCase() === nickLower
      );
      if (byNick) return byNick;
    }

    return null;
  }

  function syncNicknames(ls, nickname) {
    ls.setItem(LS_ATT, nickname);
    ls.setItem(LS_BOARDING, nickname);
    ls.setItem(LS_BIB, nickname);
    const raw = ls.getItem(LS_PROFILE);
    if (!raw) return;
    try {
      const profile = JSON.parse(raw);
      if (profile && typeof profile === "object") {
        profile.nickname = nickname;
        ls.setItem(LS_PROFILE, JSON.stringify(profile));
      }
    } catch (_e) {
      /* keep loose keys */
    }
  }

  function clearNicknames(ls) {
    ls.removeItem(LS_ATT);
    ls.removeItem(LS_BOARDING);
    ls.removeItem(LS_BIB);
    ls.removeItem(LS_PROFILE);
  }

  return {
    LS_PROFILE,
    LS_ATT,
    LS_BOARDING,
    LS_BIB,
    readSavedIdentity,
    matchInList,
    syncNicknames,
    clearNicknames,
  };
});
