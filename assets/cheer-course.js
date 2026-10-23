(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CheerCourse = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FULL_KM = 42.195;

  function coursePoint(km) {
    const clamped = Math.max(0, Math.min(FULL_KM, Number(km) || 0));
    const row = Math.min(8, Math.floor(clamped / 5));
    const t = (clamped - row * 5) / 5;
    const ltr = row % 2 === 0;
    const x = ltr ? t : 1 - t;
    return { row: row, x: x, y: row, ltr: ltr };
  }

  // U-turns between rows carry no distance; each row is 5 km wide.
  function snakePath(box) {
    const r = box.gap / 2;
    const parts = ["M " + box.left + " " + box.top];
    for (let row = 0; row < 9; row += 1) {
      const xEnd = row === 8
        ? Math.round((box.left + (box.right - box.left) * coursePoint(FULL_KM).x) * 100) / 100
        : (row % 2 === 0 ? box.right : box.left);
      parts.push("H " + xEnd);
      if (row < 8) {
        const yNext = box.top + (row + 1) * box.gap;
        parts.push("A " + r + " " + r + " 0 0 " + (row % 2 === 0 ? 1 : 0) + " " + xEnd + " " + yNext);
      }
    }
    return parts.join(" ");
  }

  function clusterRunners(runners, thresholdKm) {
    const threshold = thresholdKm == null ? 0.4 : thresholdKm;
    const sorted = (runners || []).slice().sort(function (a, b) {
      return Number(a.km) - Number(b.km);
    });
    const groups = [];
    sorted.forEach(function (runner) {
      const last = groups[groups.length - 1];
      if (last && Math.abs(Number(runner.km) - last.km) <= threshold) {
        last.runners.push(runner);
      } else {
        groups.push({ km: Number(runner.km), runners: [runner] });
      }
    });
    return groups;
  }

  function formatKm(km) {
    const n = Number(km);
    if (!Number.isFinite(n)) return "—";
    return (Math.round(n * 10) / 10).toFixed(1);
  }

  function formatElapsed(sec) {
    const n = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const s = n % 60;
    function pad(v) {
      return v < 10 ? "0" + v : String(v);
    }
    return h + ":" + pad(m) + ":" + pad(s);
  }

  function formatPace(secPerKm) {
    const n = Number(secPerKm);
    if (!Number.isFinite(n) || n <= 0) return "—";
    const total = Math.round(n);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ":" + (s < 10 ? "0" + s : String(s));
  }

  return {
    FULL_KM: FULL_KM,
    coursePoint: coursePoint,
    snakePath: snakePath,
    clusterRunners: clusterRunners,
    formatKm: formatKm,
    formatElapsed: formatElapsed,
    formatPace: formatPace,
  };
});
