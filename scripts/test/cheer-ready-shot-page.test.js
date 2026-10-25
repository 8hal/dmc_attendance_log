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
    const html = read("cheer/bib.html");
    assert.match(html, /id="readyShotBtn"/);
    assert.match(html, /레디샷 올리기/);
    assert.match(html, /레디샷 바꾸기/);
    assert.match(html, /아직 참가 명단이 없습니다/);
    assert.match(html, /본인이 없으면 운영진에게 알려 주세요/);
    assert.match(html, /응원 보드 링크를 가진 누구나 사진을 볼 수 있어요/);
    assert.doesNotMatch(html, /noindex/);
    assert.match(html, /사진에서 읽음, 맞는지 확인해 주세요/);
    assert.match(html, /cheer-bib-ocr\.js/);
    assert.match(html, /1280/);
    assert.match(html, /image\/jpeg/);
    assert.doesNotMatch(html, /시험/);
    assert.doesNotMatch(html, /eventId가 없습니다/);
    assert.match(html, /id="bib"/);
  });

  it("shows the ready shot under the nickname and hides it when absent", () => {
    const html = read("cheer/index.html");
    assert.match(html, /readyShotUrl/);
    assert.match(html, /id="shotLightbox"/);
    assert.match(html, /레디샷/);
    assert.match(html, /출발 시각이 등록되면 코스에 점이 생깁니다/);
    assert.match(html, /아직 목표 시간을 넣은 풀코스 선수가 없습니다/);
    assert.match(html, /출발 전입니다/);
    assert.match(html, /모두 완주했습니다/);
    assert.match(html, /기록 없음/);
    assert.match(html, /칩 기록이 없습니다/);
    assert.doesNotMatch(html, /시험|총무가 조 출발|링크를 받은 분만/);
    assert.doesNotMatch(html, /noindex/);
    assert.doesNotMatch(html, /eventId가 없습니다/);
  });

  it("uses operator wording without a test banner", () => {
    const html = read("cheer/waves.html");
    assert.doesNotMatch(html, /시험/);
    assert.doesNotMatch(html, /러너/);
    assert.doesNotMatch(html, /eventId가 없습니다/);
    assert.match(html, /조·출발 시각/);
    assert.match(html, /참가자/);
  });
});
