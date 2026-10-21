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

describe("event-home bib form markup", () => {
  const html = read("event-home.html");

  it("profileBibForm is a form; chips always inside; bib number is a separate group", () => {
    assert.match(html, /<form[^>]*id="profileBibForm"[^>]*>/);
    const formStart = html.indexOf('id="profileBibForm"');
    const formEnd = html.indexOf("</form>", formStart);
    const form = html.slice(formStart, formEnd);
    assert.match(form, /id="profileDistChips"/);
    assert.match(form, /id="profileBibNumberGroup"/);
    const groupStart = form.indexOf('id="profileBibNumberGroup"');
    assert.ok(
      form.indexOf('id="profileDistChips"') < groupStart,
      "dist chips markup should come before the bib number group"
    );
  });

  it("bib input uses numeric keypad with a done-style enter key", () => {
    assert.match(
      html,
      /id="profileBib"[^>]*inputmode="numeric"[^>]*enterkeyhint="done"/
    );
    assert.doesNotMatch(html, /id="profileBib"[^>]*type="number"/);
  });

  it("chip and save buttons stay type=button so they cannot submit the form", () => {
    const groupStart = html.indexOf('id="profileBibNumberGroup"');
    const groupEnd = html.indexOf("</div>", html.indexOf("</div>", groupStart) + 1);
    const group = html.slice(groupStart, groupEnd);
    assert.match(group, /id="profileBibSave"[^>]*type="button"|type="button"[^>]*id="profileBibSave"/);
  });
});

describe("event-home bib stage prompt style", () => {
  const css = read("assets/event-member-shell.css");

  it("profile-prompt-question is a bigger bold question style", () => {
    const block = css.match(/\.profile-prompt-question\s*\{[^}]+\}/);
    assert.ok(block, ".profile-prompt-question rule missing");
    assert.match(block[0], /font-size:\s*(1[89]|[2-9][0-9])px/);
    assert.match(block[0], /font-weight:\s*(700|800|900|bold)/);
  });
});

describe("event-home renderProfileCard bib stage branch", () => {
  const html = read("event-home.html");

  it("bib branch toggles the number group and question style by resolved stage", () => {
    const fn = extractFn(html, "renderProfileCard");
    const bibIdx = fn.indexOf('if (card.state === "bib")');
    assert.ok(bibIdx >= 0, "bib branch missing");
    const block = fn.slice(bibIdx);
    assert.match(block, /EventHomeAction\.bibStagePrompt\(/);
    assert.match(block, /profileBibNumberGroup\.classList\.toggle\(["']hidden["']/);
    assert.match(block, /profile-prompt-question/);
    assert.match(block, /card\.bibStage/);
    assert.match(block, /selectedDistance/);
  });

  it("bib branch only autofocuses when a pending focus flag says so", () => {
    const fn = extractFn(html, "renderProfileCard");
    const bibIdx = fn.indexOf('if (card.state === "bib")');
    const block = fn.slice(bibIdx, bibIdx + 900);
    assert.match(block, /bibStageFocusPending/);
    assert.match(block, /profileBib\.focus\(\)/);
  });
});

describe("event-home distance chip click advances to bib stage", () => {
  const html = read("event-home.html");

  it("chip click sets selectedDistance, re-renders the profile card, and arms focus only from hidden group", () => {
    const fn = extractFn(html, "renderDistanceChips");
    assert.match(fn, /selectedDistance\s*=\s*dist/);
    assert.match(fn, /profileBibNumberGroup\.classList\.contains\(["']hidden["']\)/);
    assert.match(fn, /bibStageFocusPending\s*=/);
    assert.match(fn, /renderProfileCard\(activeIdentity\)/);
    assert.doesNotMatch(fn, /renderDistanceChips\(\);\s*\}\);/, "chip click must not just re-render chips in place");
  });
});

describe("event-home bib form submit is the single keypad-confirm save path", () => {
  const html = read("event-home.html");

  it("profileBibForm submit prevents default, skips while IME composing, and calls submitUpdateBib once", () => {
    const submitIdx = html.indexOf('profileBibForm.addEventListener("submit"');
    assert.ok(submitIdx >= 0, "missing profileBibForm submit listener");
    const block = html.slice(submitIdx, submitIdx + 400);
    assert.match(block, /preventDefault\(\)/);
    assert.match(block, /bibComposing/);
    assert.match(block, /submitUpdateBib\(activeIdentity\)/);
  });

  it("does not attach a second Enter/keydown listener on profileBib for saving", () => {
    const bibListeners = html.match(/profileBib\.addEventListener\(["']keydown["']|profileBib\.addEventListener\(["']keypress["']/g);
    assert.equal(bibListeners, null, "profileBib must not have its own keydown/keypress submit listener");
  });

  it("profileBib tracks IME composing state for the submit guard", () => {
    const compIdx = html.indexOf("bibComposing");
    assert.ok(compIdx >= 0);
    assert.match(html, /profileBib\.addEventListener\(["']compositionstart["']/);
    assert.match(html, /profileBib\.addEventListener\(["']compositionend["']/);
  });
});

describe("event-home submitUpdateBib falls back to the distance stage when distance is missing", () => {
  const html = read("event-home.html");

  it("re-renders the profile card when distance is missing so the UI matches reality", () => {
    const fn = extractFn(html, "submitUpdateBib");
    const guardIdx = fn.search(/if\s*\(!bib\s*\|\|\s*!distance\)/);
    assert.ok(guardIdx >= 0, "missing bib/distance guard");
    const guardBlock = fn.slice(guardIdx, guardIdx + 250);
    assert.match(guardBlock, /showToast\(/);
    assert.match(guardBlock, /renderProfileCard\(identity\)/);
  });
});
