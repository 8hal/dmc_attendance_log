(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EventAdminPlaceLabels = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  /**
   * Place labels (prep inputs) sync only on initial fetch / after save —
   * never from the live poll path.
   */
  function shouldSyncPlaceLabels(sourceOrOpts) {
    const source =
      sourceOrOpts && typeof sourceOrOpts === "object"
        ? sourceOrOpts.source
        : sourceOrOpts;
    return source === "initial" || source === "save";
  }

  /**
   * Live bus status poll only while the ops UI is on the bus section
   * and the document is visible. Prep/bib/scrape do not need 4s refresh.
   */
  function shouldPollBusStatus(opts) {
    const o = opts || {};
    if (o.documentHidden) return false;
    return o.opsPanel === "bus";
  }

  /**
   * Defense-in-depth: even when sync is allowed, do not overwrite inputs
   * while the user is editing (focus / IME / unsaved draft).
   */
  function shouldApplyPlaceFromServer(opts) {
    const o = opts || {};
    if (o.focused) return false;
    if (o.composing) return false;
    if (o.dirty) return false;
    return true;
  }

  function normalizePlace(value) {
    return value == null ? "" : String(value).trim();
  }

  function placeLabelsEqual(a, b) {
    const left = a || {};
    const right = b || {};
    return (
      normalizePlace(left.placeClub) === normalizePlace(right.placeClub) &&
      normalizePlace(left.placeVenue) === normalizePlace(right.placeVenue)
    );
  }

  return {
    shouldSyncPlaceLabels: shouldSyncPlaceLabels,
    shouldPollBusStatus: shouldPollBusStatus,
    shouldApplyPlaceFromServer: shouldApplyPlaceFromServer,
    placeLabelsEqual: placeLabelsEqual,
  };
});
