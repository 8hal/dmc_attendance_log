const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");
}

function extractFn(html, name) {
  const start = html.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing function " + name);
  const next = html.indexOf("\n    function ", start + 1);
  return html.slice(start, next > 0 ? next : html.length);
}

function subActionBlock(src, sub) {
  const needle = `if (sub === "${sub}"`;
  const start = src.indexOf(needle);
  assert.ok(start >= 0, "missing subAction " + sub);
  const next = src.indexOf("\n      if (sub ===", start + 1);
  const endUnknown = src.indexOf(
    'error: "unknown subAction"',
    start
  );
  let end = src.length;
  if (next > start) end = next;
  if (endUnknown > start && endUnknown < end) end = endUnknown;
  return src.slice(start, end);
}

describe("event-admin prep roster write", () => {
  const html = read("event-admin.html");

  it("CSV file input is not locked to boarding-on", () => {
    assert.match(html, /id="csv-input"/);
    assert.doesNotMatch(html, /id="csv-input"[^>]*ops-writable/);
  });

  it("guest add fields are not locked to boarding-on", () => {
    assert.doesNotMatch(html, /id="guest-add-btn"[^>]*ops-writable/);
    assert.doesNotMatch(html, /id="guest-nickname"[^>]*ops-writable/);
  });

  it("add-person menu is 탑승 인원 추가", () => {
    assert.match(html, /id="guest-open-btn"[^>]*>탑승 인원 추가</);
    assert.match(html, /id="guest-sheet"/);
    assert.match(html, /id="guest-add-btn"/);
    assert.doesNotMatch(html, />지인 추가</);
  });

  it("add-person form opens in a bottom sheet", () => {
    const html = read("event-admin.html");
    assert.match(html, /id="guest-open-btn"/);
    assert.match(html, /id="guest-sheet"/);
    assert.match(html, /class="[^"]*bottom-sheet/);
    assert.match(html, /\.bottom-sheet\.open\s*\{\s*display:\s*block/);
    assert.match(html, /id="guest-sheet-close"/);
    assert.match(html, /id="guest-sheet-backdrop"/);
    const openFn = extractFn(html, "openGuestSheet");
    const closeFn = extractFn(html, "closeGuestSheet");
    assert.match(openFn, /guest-sheet/);
    assert.match(closeFn, /guest-sheet/);
    const addFn = extractFn(html, "addGuest");
    assert.match(addFn, /closeGuestSheet/);
    assert.match(html, /guest-sheet-close"\)\.addEventListener\("click", closeGuestSheet\)/);
    assert.match(html, /guest-sheet-backdrop"\)\.addEventListener\("click", closeGuestSheet\)/);
    assert.match(html, /e\.key !== "Escape"/);
    assert.match(html, /e\.isComposing/);
    assert.match(html, /guest-open-btn"\)\.addEventListener\("click", openGuestSheet\)/);
  });

  it("add-person form lets ops pick 회원 or 지인", () => {
    assert.match(html, /id="guest-kind"/);
    assert.match(html, /<option value="member"[^>]*>회원</);
    assert.match(html, /<option value="guest"[^>]*>지인</);
    const addFn = extractFn(html, "addGuest");
    assert.match(addFn, /guest-kind/);
    assert.match(addFn, /isGuest:\s*kind === "guest"/);
  });

  it("boarding-admin add form also lets ops pick 회원 or 지인", () => {
    const boarding = read("boarding-admin.html");
    assert.match(boarding, /id="guestKind"/);
    assert.match(boarding, /<option value="member"[^>]*>회원</);
    assert.match(boarding, /<option value="guest"[^>]*>지인</);
    const addFn = extractFn(boarding, "addGuest");
    assert.match(addFn, /guestKind/);
    assert.match(addFn, /isGuest:\s*kind === "guest"/);
  });

  it("remove and note save work while boarding is off", () => {
    const removeFn = extractFn(html, "removeRoster");
    assert.doesNotMatch(removeFn, /enabled !== true/);
    const saveFn = extractFn(html, "saveNote").split("function addGuest")[0];
    assert.doesNotMatch(saveFn, /enabled !== true/);
    assert.doesNotMatch(saveFn, /isGuest/);
  });

  it("has separate outbound and return boarding toggles", () => {
    const html = read("event-admin.html");
    assert.match(html, /id="bus-toggle-outbound"/);
    assert.match(html, /id="bus-toggle-return"/);
    assert.doesNotMatch(html, /id="enable-btn"/);
    assert.doesNotMatch(html, /id="bus-toggle-btn"/);
  });

  it("QR is one home board link; no separate bib copy", () => {
    const html = read("event-admin.html");
    const urlFn = extractFn(html, "participantUrl");
    assert.match(urlFn, /event-home\.html/);
    assert.match(urlFn, /board=1/);
    assert.doesNotMatch(urlFn, /leg=/);
    assert.doesNotMatch(html, /id="copy-bib-link-btn"/);
    assert.doesNotMatch(html, /배번 입력 링크 복사/);
    assert.doesNotMatch(html, /function bibUrl/);
    assert.doesNotMatch(html, /가는 버스 링크 복사/);
    assert.doesNotMatch(html, /오는 버스 QR/);
    assert.match(html, /id="copy-link-btn"/);
  });

  it("boarded toggle works while boarding is off", () => {
    const html = read("event-admin.html");
    const toggleFn = extractFn(html, "toggleBoard");
    assert.doesNotMatch(toggleFn, /enabled !== true/);
  });

  it("roster board CTA is a button; note and remove sit in more menu", () => {
    const html = read("event-admin.html");
    const render = extractFn(html, "renderRoster");
    assert.match(render, /roster-board-btn/);
    assert.match(render, /roster-more/);
    assert.match(render, /더 보기/);
    assert.doesNotMatch(render, /class="board-toggle"/);
    assert.doesNotMatch(render, /type="checkbox"/);
    const moreIdx = render.indexOf("roster-more");
    const removeIdx = render.indexOf("roster-remove");
    const noteIdx = render.indexOf("note-input");
    assert.ok(moreIdx >= 0, "more menu missing");
    assert.ok(removeIdx > moreIdx, "제외 should be inside more menu");
    assert.ok(noteIdx > moreIdx, "비고 should be inside more menu");
    assert.match(html, /closest\(["']\.roster-board-btn["']\)/);
    assert.doesNotMatch(html, /board-toggle/);
  });

  it("add-person button sits at the end of roster-list without an inner scroll pane", () => {
    const html = read("event-admin.html");
    const bus = html.slice(html.indexOf('id="sec-bus"'), html.indexOf('id="sec-bib"'));
    const listIdx = bus.indexOf('id="roster-list"');
    const btnIdx = bus.indexOf('id="guest-open-btn"');
    assert.ok(listIdx >= 0 && btnIdx > listIdx, "guest-open-btn follows roster-list markup");
    const listOpen = bus.indexOf(">", listIdx);
    const listClose = bus.indexOf("</div>", listOpen);
    assert.ok(btnIdx > listOpen && btnIdx < listClose, "guest-open-btn is inside #roster-list");
    assert.doesNotMatch(html, /\.roster-list\s*\{[^}]*max-height\s*:/);
    assert.doesNotMatch(html, /\.roster-list\s*\{[^}]*overflow-y\s*:\s*auto/);
    const render = extractFn(html, "renderRoster");
    assert.match(render, /detachGuestOpenBtn/);
    assert.match(render, /appendGuestOpenBtn/);
    assert.match(html, /function detachGuestOpenBtn/);
    assert.match(html, /function appendGuestOpenBtn/);
    assert.match(extractFn(html, "appendGuestOpenBtn"), /guest-open-btn/);
    assert.match(extractFn(html, "appendGuestOpenBtn"), /appendChild/);
  });

  it("event-admin settings never posts enabled true without openLeg", () => {
    const html = read("event-admin.html");
    assert.doesNotMatch(html, /function enableBoarding/);
    const setFn = extractFn(html, "setOpenLeg") + extractFn(html, "clearOpenLeg");
    assert.match(setFn, /openLeg/);
    assert.doesNotMatch(setFn, /enabled:\s*true/);
  });

  it("boarding-admin boarded toggle works while boarding is off", () => {
    const boarding = read("boarding-admin.html");
    const toggleFn = extractFn(boarding, "toggleBoard");
    assert.doesNotMatch(toggleFn, /enabled !== true/);
  });

  it("boarding-admin enableBoarding sends openLeg", () => {
    const boarding = read("boarding-admin.html");
    assert.match(boarding, /function enableBoarding/);
    const enableFn = extractFn(boarding, "enableBoarding");
    assert.match(enableFn, /openLeg:\s*(currentLeg|"outbound"|"return")/);
    assert.doesNotMatch(enableFn, /enabled:\s*true[\s\S]{0,80}legs:\s*\[/);
  });

  it("source and scrape are not owner-only", () => {
    const html = read("event-admin.html");
    assert.doesNotMatch(html, /id="owner-scrape-hint"/);
    assert.doesNotMatch(html, /class="owner-writable"/);
  });

  it("shows day checklist", () => {
    assert.match(read("event-admin.html"), /id="ops-checklist"/);
  });

  it("disabled banner says roster is still editable", () => {
    assert.match(html, /명단은 수정할 수 있습니다/);
  });

  it("prep has club/venue place inputs and save", () => {
    assert.match(html, /id="place-club-input"/);
    assert.match(html, /id="place-venue-input"/);
    assert.match(html, /id="save-place-labels-btn"/);
  });

  it("savePlaceLabels posts settings with placeClub and placeVenue", () => {
    const fn = extractFn(html, "savePlaceLabels");
    assert.match(fn, /subAction:\s*"settings"/);
    assert.match(fn, /placeClub:/);
    assert.match(fn, /placeVenue:/);
    assert.match(fn, /openLeg:/);
  });
});

describe("bus-boarding API gates", () => {
  const src = read("functions/index.js");

  it("import / roster-upsert / roster-remove use ensureBusBoarding, not enabled", () => {
    for (const sub of ["import", "roster-upsert", "roster-remove"]) {
      const block = subActionBlock(src, sub);
      assert.match(block, /ensureBusBoarding/, sub + " should ensure boarding doc");
      assert.doesNotMatch(block, /assertEnabled/, sub + " should not require enabled");
    }
  });

  it("settings uses parseSettingsOpenLeg, not enabled-boolean-only", () => {
    const src = read("functions/index.js");
    const block = subActionBlock(src, "settings");
    assert.match(block, /parseSettingsOpenLeg/);
    assert.doesNotMatch(block, /enabled \(boolean\) required/);
  });

  it("settings applies optional placeClub/placeVenue", () => {
    const src = read("functions/index.js");
    const block = subActionBlock(src, "settings");
    assert.match(block, /parseSettingsPlaces/);
    assert.match(block, /applyPlaceLabels/);
  });

  it("self-board uses assertLegOpen not only assertEnabled", () => {
    const src = read("functions/index.js");
    const block = subActionBlock(src, "self-board");
    assert.match(block, /assertLegOpen/);
    assert.doesNotMatch(block, /assertEnabled/);
  });

  it("admin-board does not require enabled or openLeg", () => {
    const src = read("functions/index.js");
    const block = subActionBlock(src, "admin-board");
    assert.doesNotMatch(block, /assertEnabled/);
    assert.doesNotMatch(block, /assertLegOpen/);
    assert.match(block, /ensureBusBoarding/);
  });

  it("roster-upsert rejects explicit member when nickname is missing from members", () => {
    const block = subActionBlock(src, "roster-upsert");
    assert.match(block, /rosterUpsertIdentity/);
    assert.match(block, /requireMember && !memberId/);
    assert.match(block, /회원 명단에 없는 닉네임/);
  });
});
