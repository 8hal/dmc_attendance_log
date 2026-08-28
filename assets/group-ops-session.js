(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.GroupOpsSession = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const AUTH_KEY = "dmc_event_admin_auth";
  const PW_KEY = "dmc_event_admin_pw";
  const ROLE_KEY = "dmc_event_admin_role";
  const LIST_KEY = "dmc_group_auth";

  function saveGroupOpsSession(storage, pw, role) {
    storage.setItem(AUTH_KEY, "ok");
    storage.setItem(PW_KEY, String(pw || ""));
    storage.setItem(ROLE_KEY, role || "operator");
    storage.setItem(LIST_KEY, "verified");
  }

  function readGroupOpsSession(storage) {
    return {
      ok: storage.getItem(AUTH_KEY) === "ok",
      pw: storage.getItem(PW_KEY) || "",
      role: storage.getItem(ROLE_KEY) || "",
    };
  }

  function hasAdminAccess(storage) {
    const s = readGroupOpsSession(storage);
    return s.ok && !!s.pw;
  }

  function hasListAccess(storage) {
    if (hasAdminAccess(storage)) return true;
    return storage.getItem(LIST_KEY) === "verified";
  }

  function clearGroupOpsSession(storage) {
    storage.removeItem(AUTH_KEY);
    storage.removeItem(PW_KEY);
    storage.removeItem(ROLE_KEY);
    storage.removeItem(LIST_KEY);
  }

  return {
    AUTH_KEY,
    PW_KEY,
    ROLE_KEY,
    LIST_KEY,
    saveGroupOpsSession,
    readGroupOpsSession,
    hasListAccess,
    hasAdminAccess,
    clearGroupOpsSession,
  };
});
