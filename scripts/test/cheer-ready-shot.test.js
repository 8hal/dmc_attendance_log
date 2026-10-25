const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  READY_SHOT_MAX_BYTES,
  parseReadyShotJpeg,
  readyShotObjectPath,
  publicReadyShotUrl,
  saveReadyShotJpeg,
  uploadReadyShotForParticipant,
} = require("../../functions/lib/cheer-ready-shot.js");

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function dataUrl(buffer, mime = "image/jpeg") {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

describe("parseReadyShotJpeg", () => {
  it("treats a missing or blank photo as no upload", () => {
    assert.deepEqual(parseReadyShotJpeg({}), { buffer: null });
    assert.deepEqual(parseReadyShotJpeg({ imageBase64: "  " }), { buffer: null });
  });

  it("accepts a jpeg data URL and raw base64 with a jpeg header", () => {
    const fromUrl = parseReadyShotJpeg({ imageBase64: dataUrl(JPEG) });
    assert.equal(fromUrl.error, undefined);
    assert.ok(fromUrl.buffer.slice(0, 3).equals(JPEG.slice(0, 3)));
    const fromRaw = parseReadyShotJpeg({ imageBase64: JPEG.toString("base64") });
    assert.ok(fromRaw.buffer.equals(JPEG));
  });

  it("rejects png, a jpeg label on a png, and an oversized file", () => {
    assert.equal(parseReadyShotJpeg({ imageBase64: dataUrl(PNG, "image/png") }).error, "image must be jpeg");
    assert.equal(parseReadyShotJpeg({ imageBase64: dataUrl(PNG) }).error, "image must be jpeg");
    assert.equal(parseReadyShotJpeg({ imageBase64: "!!!!" }).error, "invalid base64 image");
    const huge = Buffer.alloc(READY_SHOT_MAX_BYTES + 1);
    huge[0] = 0xff;
    huge[1] = 0xd8;
    huge[2] = 0xff;
    assert.equal(parseReadyShotJpeg({ imageBase64: huge.toString("base64") }).error, "image too large");
  });
});

describe("ready shot storage path and public URL", () => {
  it("stores one jpeg per event and participant, without path traversal", () => {
    assert.equal(
      readyShotObjectPath("evt_2026-10-25_2026", { memberId: "m1", nickname: "가람" }),
      "cheer/ready-shots/evt_2026-10-25_2026/m1.jpg"
    );
    assert.equal(
      readyShotObjectPath("../evt", { memberId: "../secret", nickname: "가람" }),
      "cheer/ready-shots/evt/secret.jpg"
    );
    assert.equal(
      readyShotObjectPath("evt_1", { nickname: "디모" }),
      "cheer/ready-shots/evt_1/nick_디모.jpg"
    );
  });

  it("allows firebase and local emulator download URLs only", () => {
    const ok = "https://firebasestorage.googleapis.com/v0/b/demo/o/a.jpg?alt=media&token=t";
    assert.equal(publicReadyShotUrl(ok), ok);
    const emu = "http://127.0.0.1:9199/v0/b/demo/o/a.jpg?alt=media&token=t";
    assert.equal(publicReadyShotUrl(emu), emu);
    assert.equal(publicReadyShotUrl("javascript:alert(1)"), "");
    assert.equal(publicReadyShotUrl("http://evil.example/a.jpg"), "");
    assert.equal(publicReadyShotUrl(""), "");
  });
});

describe("saveReadyShotJpeg", () => {
  const prev = process.env.FIREBASE_STORAGE_EMULATOR_HOST;

  beforeEach(() => {
    delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    else process.env.FIREBASE_STORAGE_EMULATOR_HOST = prev;
  });

  it("writes jpeg bytes with a download token URL", async () => {
    let saved = null;
    const bucket = {
      name: "dmc-attendance.firebasestorage.app",
      file(path) {
        return {
          async save(buffer, options) {
            saved = { path, buffer, options };
          },
        };
      },
    };
    const url = await saveReadyShotJpeg(bucket, "cheer/ready-shots/evt_1/m1.jpg", JPEG);
    assert.equal(saved.path, "cheer/ready-shots/evt_1/m1.jpg");
    assert.ok(saved.buffer.equals(JPEG));
    assert.equal(saved.options.metadata.contentType, "image/jpeg");
    const token = saved.options.metadata.metadata.firebaseStorageDownloadTokens;
    assert.match(token, /^[0-9a-f-]{36}$/);
    assert.equal(
      url,
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(saved.path)}?alt=media&token=${token}`
    );
  });

  it("uploads only after jpeg checks and returns the token URL", async () => {
    const calls = [];
    const bucket = {
      name: "demo.firebasestorage.app",
      file(path) {
        return {
          async save() {
            calls.push(path);
          },
        };
      },
    };
    const skip = await uploadReadyShotForParticipant({
      bucket,
      eventId: "evt_1",
      participant: { memberId: "m1" },
      body: {},
    });
    assert.equal(skip.url, null);
    assert.equal(calls.length, 0);

    const bad = await uploadReadyShotForParticipant({
      bucket,
      eventId: "evt_1",
      participant: { memberId: "m1" },
      body: { imageBase64: dataUrl(PNG) },
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.status, 400);
    assert.equal(calls.length, 0);

    const good = await uploadReadyShotForParticipant({
      bucket,
      eventId: "evt_1",
      participant: { memberId: "m1", nickname: "가람" },
      body: { imageBase64: dataUrl(JPEG) },
    });
    assert.equal(good.ok, true);
    assert.match(good.url, /token=/);
    assert.deepEqual(calls, ["cheer/ready-shots/evt_1/m1.jpg"]);
  });
});
