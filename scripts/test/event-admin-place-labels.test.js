const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  shouldApplyPlaceFromServer,
  placeLabelsEqual,
} = require(path.join(__dirname, "../../assets/event-admin-place-labels.js"));

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");
}

function extractFn(html, name) {
  const start = html.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing function " + name);
  const next = html.indexOf("\n    function ", start + 1);
  return html.slice(start, next > 0 ? next : html.length);
}

describe("shouldApplyPlaceFromServer", () => {
  it("applies when clean, unfocused, not composing", () => {
    assert.equal(
      shouldApplyPlaceFromServer({ focused: false, composing: false, dirty: false }),
      true
    );
  });

  it("skips while either place input is focused", () => {
    assert.equal(
      shouldApplyPlaceFromServer({ focused: true, composing: false, dirty: false }),
      false
    );
  });

  it("skips while IME composition is active", () => {
    assert.equal(
      shouldApplyPlaceFromServer({ focused: false, composing: true, dirty: false }),
      false
    );
  });

  it("skips while unsaved local draft is dirty (blur-before-save)", () => {
    assert.equal(
      shouldApplyPlaceFromServer({ focused: false, composing: false, dirty: true }),
      false
    );
  });

  it("skips when focused and dirty", () => {
    assert.equal(
      shouldApplyPlaceFromServer({ focused: true, composing: false, dirty: true }),
      false
    );
  });

  it("treats missing opts as apply", () => {
    assert.equal(shouldApplyPlaceFromServer(), true);
    assert.equal(shouldApplyPlaceFromServer(null), true);
  });
});

describe("placeLabelsEqual", () => {
  it("compares trimmed club/venue strings", () => {
    assert.equal(
      placeLabelsEqual({ placeClub: "동탄", placeVenue: "철원" }, { placeClub: "동탄", placeVenue: "철원" }),
      true
    );
    assert.equal(
      placeLabelsEqual({ placeClub: " 동탄 ", placeVenue: "철원" }, { placeClub: "동탄", placeVenue: "철원" }),
      true
    );
    assert.equal(
      placeLabelsEqual({ placeClub: "동탄", placeVenue: "철원" }, { placeClub: "판교", placeVenue: "철원" }),
      false
    );
  });

  it("treats null/undefined as empty", () => {
    assert.equal(
      placeLabelsEqual({ placeClub: null, placeVenue: undefined }, { placeClub: "", placeVenue: "" }),
      true
    );
  });
});

describe("event-admin place labels poll protection wiring", () => {
  const html = read("event-admin.html");

  it("loads event-admin-place-labels helper", () => {
    assert.match(html, /assets\/event-admin-place-labels\.js/);
  });

  it("applyBusStatus uses shouldApplyPlaceFromServer before writing inputs", () => {
    const fn = extractFn(html, "applyBusStatus");
    assert.match(fn, /shouldApplyPlaceFromServer/);
    assert.match(fn, /placeLabelsDirty|dirty/);
  });

  it("marks place labels dirty on input and tracks IME composition", () => {
    assert.match(html, /placeLabelsDirty\s*=\s*true/);
    assert.match(html, /place-club-input[\s\S]*compositionstart|compositionstart[\s\S]*place-club/);
    assert.match(html, /placeLabelsComposing/);
  });

  it("clears dirty after successful savePlaceLabels", () => {
    const fn = extractFn(html, "savePlaceLabels");
    assert.match(fn, /placeLabelsDirty\s*=\s*false/);
  });
});
