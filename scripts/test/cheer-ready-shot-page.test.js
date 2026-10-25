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

describe("update-bib stores a ready shot with the same transaction", () => {
  it("validates the jpeg and writes readyShotUrl inside the participant transaction", () => {
    const block = updateBibBlock();
    assert.match(block, /uploadReadyShotForParticipant/);
    assert.match(block, /runTransaction/);
    assert.match(block, /readyShotUrl/);
    const txAt = block.indexOf("runTransaction");
    const assignAt = block.indexOf("readyShotUrl");
    assert.ok(assignAt > txAt, "photo URL is applied in the transaction, after the participant check");
  });
});

describe("cheer pages for operators, cheerers, and runners", () => {
  it("lets a runner upload a ready shot and still edit the bib", () => {
    const html = read("lab/cheer/bib.html");
    assert.match(html, /id="readyShotBtn"/);
    assert.match(html, /레디샷 올리기/);
    assert.match(html, /응원 보드 링크를 가진 누구나 사진을 볼 수 있어요/);
    assert.match(html, /사진에서 읽음, 맞는지 확인해 주세요/);
    assert.match(html, /cheer-bib-ocr\.js/);
    assert.match(html, /1280/);
    assert.match(html, /image\/jpeg/);
    assert.doesNotMatch(html, /시험/);
    assert.doesNotMatch(html, /eventId가 없습니다/);
    assert.match(html, /id="bib"/);
  });

  it("shows the ready shot under the nickname and hides it when absent", () => {
    const html = read("lab/cheer/index.html");
    assert.match(html, /readyShotUrl/);
    assert.match(html, /id="shotLightbox"/);
    assert.match(html, /레디샷/);
    assert.doesNotMatch(html, /시험/);
    assert.doesNotMatch(html, /eventId가 없습니다/);
  });

  it("uses operator wording without a test banner", () => {
    const html = read("lab/cheer/waves.html");
    assert.doesNotMatch(html, /시험/);
    assert.doesNotMatch(html, /러너/);
    assert.doesNotMatch(html, /eventId가 없습니다/);
    assert.match(html, /조·출발 시각/);
    assert.match(html, /참가자/);
  });
});
