(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EventUpcoming = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function kstTodayYmd(now) {
    return (now || new Date()).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  }
  function filterUpcomingGroupEvents(groupEvents, todayYmd) {
    const today = todayYmd || kstTodayYmd();
    return (groupEvents || [])
      .filter((e) => e && e.isGroupEvent === true && typeof e.eventDate === "string" && e.eventDate >= today)
      .map((e) => ({
        id: e.id,
        eventDate: e.eventDate,
        displayName: e.eventName || e.primaryName || e.id,
      }))
      .sort((a, b) => (a.eventDate < b.eventDate ? -1 : a.eventDate > b.eventDate ? 1 : 0));
  }
  return { kstTodayYmd, filterUpcomingGroupEvents };
});
