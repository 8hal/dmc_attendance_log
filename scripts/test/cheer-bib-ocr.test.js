const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { pickBibCandidate, recognizeBib, setCustomEngine } = require("../../assets/cheer-bib-ocr.js");

const ROSTER = ["10021", "10022", "10408"];

describe("pickBibCandidate", () => {
  it("picks a roster-length number next to a bib label and ignores the clock", () => {
    const text = "CHUNCHEON\n배번 12045\nNET 03:45:12\n42.195";
    assert.equal(pickBibCandidate(text, ROSTER), "12045");
  });

  it("fixes digit lookalikes only inside a number that already has a digit", () => {
    assert.equal(pickBibCandidate("NO 12O45", ROSTER), "12045");
    assert.equal(pickBibCandidate("BIB", ROSTER), null);
  });

  it("returns null when the only numbers are a year or a finish time", () => {
    assert.equal(pickBibCandidate("2026 춘천 03:45:12", ROSTER), null);
    assert.equal(pickBibCandidate("", ROSTER), null);
    assert.equal(pickBibCandidate("배번 없음", []), null);
  });

  it("prefers the number beside 배번 when several roster-length numbers appear", () => {
    const text = "10021\n배번 10408\n다른 10022";
    assert.equal(pickBibCandidate(text, ROSTER), "10408");
  });

  it("joins a split bib when the roster length is known", () => {
    assert.equal(pickBibCandidate("1 2 0 4 5", ROSTER), "12045");
  });

  it("accepts a 4 to 6 digit number when the roster has no bibs yet", () => {
    assert.equal(pickBibCandidate("번호 4821", []), "4821");
    assert.equal(pickBibCandidate("4821\n2026", []), "4821");
  });

  it("does not invent a bib from a distance marker", () => {
    assert.equal(pickBibCandidate("KM 42.195", []), null);
  });
});

describe("recognizeBib", () => {
  it("uses the swapped engine and still lets the caller keep a manual bib", async () => {
    setCustomEngine(async () => "배번 55555");
    try {
      const read = await recognizeBib(Buffer.from("jpeg"), { rosterBibs: ROSTER });
      assert.equal(read.bib, "55555");
      assert.equal(read.fromPhoto, true);
      assert.equal(read.error, "");
    } finally {
      setCustomEngine(null);
    }
  });

  it("returns no bib when the engine cannot read digits", async () => {
    setCustomEngine(async () => "글자만");
    try {
      const read = await recognizeBib(Buffer.from("jpeg"), { rosterBibs: ROSTER });
      assert.equal(read.bib, null);
      assert.equal(read.fromPhoto, false);
    } finally {
      setCustomEngine(null);
    }
  });

  it("reports an engine failure without throwing", async () => {
    setCustomEngine(async () => {
      throw new Error("cdn down");
    });
    try {
      const read = await recognizeBib(Buffer.from("jpeg"), { rosterBibs: ROSTER });
      assert.equal(read.bib, null);
      assert.equal(read.fromPhoto, false);
      assert.match(read.error, /cdn down/);
    } finally {
      setCustomEngine(null);
    }
  });
});
