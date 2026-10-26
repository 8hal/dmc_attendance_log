const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function updateBibBlock() {
  const src = read("functions/index.js");
  const start = src.indexOf('subAction === "update-bib"');
  const end = src.indexOf('action === "bus-boarding"');
  assert.ok(start > 0 && end > start);
  return src.slice(start, end);
}

describe("ready-shot upload is removed", () => {
  it("update-bib no longer accepts or stores a ready-shot image", () => {
    const block = updateBibBlock();
    const index = read("functions/index.js");
    assert.doesNotMatch(block, /uploadReadyShotForParticipant|imageBase64|readyShotUrl|cheer-ready-shot/);
    assert.doesNotMatch(index, /cheer-ready-shot/);
    assert.equal(fs.existsSync(path.join(root, "functions/lib/cheer-ready-shot.js")), false);
    assert.match(block, /runTransaction/);
    assert.match(block, /trimmedBib/);
  });

  it("bib page keeps direct bib entry and drops photo upload and OCR", () => {
    const html = read("cheer/bib.html");
    assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
    assert.match(html, /id="bib"/);
    assert.match(html, /id="goalH"/);
    assert.match(html, /EventBibForm\.buildBibBody/);
    assert.match(html, /action=group-events/);
    assert.match(html, /아직 참가 명단이 없습니다/);
    assert.match(html, /본인이 없으면 운영진에게 알려 주세요/);
    assert.doesNotMatch(html, /시험/);
    assert.doesNotMatch(html, /eventId가 없습니다/);
    assert.doesNotMatch(html, /레디샷|readyShot|cheer-bib-ocr|imageBase64|tesseract|type="file"/);
    assert.equal(fs.existsSync(path.join(root, "assets/cheer-bib-ocr.js")), false);
  });

  it("cheer detail does not render a ready shot or leave an empty photo slot", () => {
    const html = read("cheer/index.html");
    assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
    assert.match(html, /id="detailBody"/);
    assert.match(html, /출발 시각이 등록되면 코스에 점이 생깁니다/);
    assert.match(html, /아직 목표 시간을 넣은 풀코스 선수가 없습니다/);
    assert.doesNotMatch(html, /시험|총무가 조 출발|링크를 받은 분만/);
    assert.doesNotMatch(html, /eventId가 없습니다/);
    assert.doesNotMatch(html, /레디샷|readyShot|shotLightbox|shotOpen|shotLarge|class=['"]shot['"]/);
  });

  it("drops the ready-shot storage rule that was never deployed", () => {
    const rules = read("storage.rules");
    assert.doesNotMatch(rules, /ready-shots|레디샷/);
    assert.match(rules, /chunbaek\/attendance/);
    assert.match(rules, /chunbaek\/season-results/);
  });

  it("names the operator bib link without a ready shot", () => {
    const html = read("event-admin.html");
    assert.match(html, /id="copy-cheer-bib"/);
    assert.match(html, /배번 링크 복사/);
    assert.doesNotMatch(html, /레디샷|readyShot/);
  });

  it("uses operator wording without a test banner", () => {
    const html = read("cheer/waves.html");
    assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
    assert.doesNotMatch(html, /시험/);
    assert.doesNotMatch(html, /러너/);
    assert.doesNotMatch(html, /eventId가 없습니다/);
    assert.doesNotMatch(html, /레디샷/);
    assert.match(html, /조·출발 시각/);
    assert.match(html, /참가자/);
  });
});
