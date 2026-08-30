(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EventBusRosterFilter = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FILTERS = ["all", "pending", "boarded"];

  function normalizeBoardFilter(value) {
    return FILTERS.includes(value) ? value : "all";
  }

  function boardStatus(row, currentLeg) {
    const st = row && row.legs && row.legs[currentLeg];
    if (!st || !st.required) return "skip";
    return st.boarded ? "boarded" : "pending";
  }

  function matchesBoardFilter(row, currentLeg, boardFilter) {
    const filter = normalizeBoardFilter(boardFilter);
    if (filter === "all") return true;
    return boardStatus(row, currentLeg) === filter;
  }

  function matchesQuery(row, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    const nick = String((row && row.nickname) || "").toLowerCase();
    const real = String((row && row.realName) || "").toLowerCase();
    const note = String((row && row.note) || "").toLowerCase();
    return nick.includes(q) || real.includes(q) || note.includes(q);
  }

  function filterRosterRows(rows, opts) {
    const list = Array.isArray(rows) ? rows : [];
    const query = opts && opts.query;
    const boardFilter = opts && opts.boardFilter;
    const currentLeg = (opts && opts.currentLeg) || "outbound";
    return list.filter(
      (row) =>
        matchesQuery(row, query) &&
        matchesBoardFilter(row, currentLeg, boardFilter)
    );
  }

  return {
    FILTERS,
    normalizeBoardFilter,
    boardStatus,
    matchesBoardFilter,
    matchesQuery,
    filterRosterRows,
  };
});
