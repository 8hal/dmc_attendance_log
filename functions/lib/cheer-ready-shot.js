"use strict";

const crypto = require("crypto");

const READY_SHOT_MAX_BYTES = 2 * 1024 * 1024;

function parseReadyShotJpeg(body) {
  if (!body || !Object.prototype.hasOwnProperty.call(body, "imageBase64")) {
    return { buffer: null };
  }
  const raw = String(body.imageBase64 || "").trim();
  if (!raw) return { buffer: null };

  const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(raw);
  let b64 = raw;
  if (match) {
    const mime = match[1].toLowerCase();
    if (mime !== "image/jpeg" && mime !== "image/jpg") {
      return { error: "image must be jpeg" };
    }
    b64 = match[2];
  }

  const compact = b64.replace(/\s/g, "");
  if (!compact || /[^A-Za-z0-9+/=]/.test(compact)) {
    return { error: "invalid base64 image" };
  }
  const buffer = Buffer.from(compact, "base64");
  if (!buffer.length) return { error: "invalid base64 image" };
  if (buffer.length > READY_SHOT_MAX_BYTES) return { error: "image too large" };
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    return { error: "image must be jpeg" };
  }
  return { buffer };
}

function safeSegment(value, fallback) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9가-힣_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

function readyShotObjectPath(eventId, participant) {
  const eventSeg = safeSegment(eventId, "event");
  const memberId = participant && participant.memberId
    ? safeSegment(participant.memberId, "")
    : "";
  const nickname = participant && participant.nickname
    ? safeSegment(participant.nickname, "")
    : "";
  const who = memberId || (nickname ? "nick_" + nickname : "runner");
  return "cheer/ready-shots/" + eventSeg + "/" + who + ".jpg";
}

function publicReadyShotUrl(value) {
  const url = String(value || "").trim();
  if (!url || url.length > 2000) return "";
  if (/^https:\/\/firebasestorage\.googleapis\.com\/\S+$/.test(url)) return url;
  if (/^http:\/\/127\.0\.0\.1:\d+\/\S+$/.test(url)) return url;
  if (/^http:\/\/localhost:\d+\/\S+$/.test(url)) return url;
  return "";
}

function buildReadyShotDownloadUrl(bucketName, storagePath, downloadToken) {
  const encoded = encodeURIComponent(storagePath);
  const emulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  if (emulatorHost) {
    return "http://" + emulatorHost + "/v0/b/" + bucketName + "/o/" + encoded + "?alt=media&token=" + downloadToken;
  }
  return "https://firebasestorage.googleapis.com/v0/b/" + bucketName + "/o/" + encoded + "?alt=media&token=" + downloadToken;
}

async function saveReadyShotJpeg(bucket, storagePath, buffer) {
  const downloadToken = crypto.randomUUID();
  const file = bucket.file(storagePath);
  await file.save(buffer, {
    metadata: {
      contentType: "image/jpeg",
      cacheControl: "public, max-age=3600",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
    resumable: false,
  });
  return buildReadyShotDownloadUrl(bucket.name, storagePath, downloadToken);
}

async function uploadReadyShotForParticipant({ bucket, eventId, participant, body }) {
  const parsed = parseReadyShotJpeg(body || {});
  if (parsed.error) return { ok: false, status: 400, error: parsed.error };
  if (!parsed.buffer) return { ok: true, url: null };
  const storagePath = readyShotObjectPath(eventId, participant);
  const url = await saveReadyShotJpeg(bucket, storagePath, parsed.buffer);
  if (!url || url.length > 2000) return { ok: false, status: 500, error: "photoUrl too long" };
  return { ok: true, url };
}

function resolveStorageBucket() {
  const { getStorage } = require("firebase-admin/storage");
  const storage = getStorage();
  if (process.env.FIREBASE_STORAGE_BUCKET) {
    return storage.bucket(process.env.FIREBASE_STORAGE_BUCKET);
  }
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (projectId) return storage.bucket(projectId + ".firebasestorage.app");
  return storage.bucket();
}

module.exports = {
  READY_SHOT_MAX_BYTES,
  parseReadyShotJpeg,
  readyShotObjectPath,
  publicReadyShotUrl,
  saveReadyShotJpeg,
  uploadReadyShotForParticipant,
  resolveStorageBucket,
};
