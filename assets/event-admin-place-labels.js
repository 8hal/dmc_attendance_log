(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EventAdminPlaceLabels = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  /**
   * Poll/applyBusStatus may write server place labels into inputs only when
   * the user is not editing: not focused, not IME-composing, no unsaved draft.
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
    shouldApplyPlaceFromServer: shouldApplyPlaceFromServer,
    placeLabelsEqual: placeLabelsEqual,
  };
});
