(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EventFinishTime = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function digitsOnly(raw) {
    return String(raw == null ? "" : raw).replace(/\D/g, "");
  }

  function sanitizeHourDigits(raw) {
    return digitsOnly(raw).slice(0, 2);
  }

  function sanitizeMinSecDigits(raw) {
    return digitsOnly(raw).slice(0, 2);
  }

  function pad2(n) {
    const s = String(n);
    return s.length >= 2 ? s : "0" + s;
  }

  function composeNetTime(hourRaw, minRaw, secRaw) {
    const hStr = String(hourRaw == null ? "" : hourRaw).trim();
    const mStr = String(minRaw == null ? "" : minRaw).trim();
    const sStr = String(secRaw == null ? "" : secRaw).trim();
    if (!hStr || !mStr || !sStr) {
      return { ok: false, error: "incomplete" };
    }
    if (!/^\d{1,2}$/.test(hStr) || !/^\d{1,2}$/.test(mStr) || !/^\d{1,2}$/.test(sStr)) {
      return { ok: false, error: "digits" };
    }
    const h = Number(hStr);
    const m = Number(mStr);
    const s = Number(sStr);
    if (!Number.isFinite(h) || h < 0 || h > 23) {
      return { ok: false, error: "hour" };
    }
    if (!Number.isFinite(m) || m < 0 || m > 59) {
      return { ok: false, error: "minute" };
    }
    if (!Number.isFinite(s) || s < 0 || s > 59) {
      return { ok: false, error: "second" };
    }
    return { ok: true, netTime: h + ":" + pad2(m) + ":" + pad2(s) };
  }

  return {
    composeNetTime,
    sanitizeHourDigits,
    sanitizeMinSecDigits,
  };
});
