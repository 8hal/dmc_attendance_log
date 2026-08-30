const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  shouldApplyPlaceFromServer,
  shouldSyncPlaceLabels,
  shouldPollBusStatus,
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

describe("shouldSyncPlaceLabels (poll scope)", () => {
  it("never syncs place labels from poll", () => {
    assert.equal(shouldSyncPlaceLabels("poll"), false);
    assert.equal(shouldSyncPlaceLabels({ source: "poll" }), false);
  });

  it("syncs on initial fetch", () => {
    assert.equal(shouldSyncPlaceLabels("initial"), true);
    assert.equal(shouldSyncPlaceLabels({ source: "initial" }), true);
  });

  it("syncs after place save", () => {
    assert.equal(shouldSyncPlaceLabels("save"), true);
    assert.equal(shouldSyncPlaceLabels({ source: "save" }), true);
  });

  it("does not sync on bus action reload or unknown source", () => {
    assert.equal(shouldSyncPlaceLabels("action"), false);
    assert.equal(shouldSyncPlaceLabels("panel"), false);
    assert.equal(shouldSyncPlaceLabels(), false);
    assert.equal(shouldSyncPlaceLabels(null), false);
  });
});

describe("shouldPollBusStatus (poll scope)", () => {
  it("polls when on bus section and document visible", () => {
    assert.equal(
      shouldPollBusStatus({ opsPanel: "bus", documentHidden: false }),
      true
    );
  });

  it("does not poll on prep / bib / scrape", () => {
    assert.equal(
      shouldPollBusStatus({ opsPanel: "prep", documentHidden: false }),
      false
    );
    assert.equal(
      shouldPollBusStatus({ opsPanel: "bib", documentHidden: false }),
      false
    );
    assert.equal(
      shouldPollBusStatus({ opsPanel: "scrape", documentHidden: false }),
      false
    );
  });

  it("does not poll when document is hidden even on bus", () => {
    assert.equal(
      shouldPollBusStatus({ opsPanel: "bus", documentHidden: true }),
      false
    );
  });

  it("treats missing panel as no poll", () => {
    assert.equal(shouldPollBusStatus({ documentHidden: false }), false);
    assert.equal(shouldPollBusStatus(null), false);
  });
});

describe("shouldApplyPlaceFromServer (defense-in-depth)", () => {
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

describe("event-admin poll-scope wiring", () => {
  const html = read("event-admin.html");

  it("loads event-admin-place-labels helper", () => {
    assert.match(html, /assets\/event-admin-place-labels\.js/);
  });

  it("startPoll only loads bus status when shouldPollBusStatus allows", () => {
    const fn = extractFn(html, "startPoll");
    assert.match(fn, /shouldPollBusStatus/);
    assert.match(fn, /source:\s*["']poll["']/);
    assert.doesNotMatch(fn, /loadEventDetail/);
  });

  it("applyBusStatus syncs place inputs only when shouldSyncPlaceLabels allows", () => {
    const fn = extractFn(html, "applyBusStatus");
    assert.match(fn, /shouldSyncPlaceLabels/);
    assert.match(fn, /shouldApplyPlaceFromServer/);
  });

  it("loadAll requests place sync via initial source", () => {
    const fn = extractFn(html, "loadAll");
    assert.match(fn, /source:\s*["']initial["']/);
  });

  it("savePlaceLabels reloads with save source and clears dirty", () => {
    const fn = extractFn(html, "savePlaceLabels");
    assert.match(fn, /source:\s*["']save["']/);
    assert.match(fn, /placeLabelsDirty\s*=\s*false/);
  });

  it("marks place labels dirty on input and tracks IME composition", () => {
    assert.match(html, /placeLabelsDirty\s*=\s*true/);
    assert.match(html, /placeLabelsComposing/);
    assert.match(html, /compositionstart/);
  });
});
