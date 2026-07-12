/**
 * 춘백 시즌3 session token (C1)
 */
const crypto = require("crypto");
const { FieldValue } = require("firebase-admin/firestore");

const TOKEN_TTL_DAYS = 120;

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function extractToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return (req.query.token || "").trim();
}

async function issueSession(db, memberId) {
  const token = generateToken();
  const now = Date.now();
  const expiresAt = new Date(now + TOKEN_TTL_DAYS * 86400000);
  await db.collection("chunbaek_sessions").doc(token).set({
    token,
    memberId,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    revoked: false,
  });
  return { token, expiresAt: expiresAt.toISOString() };
}

async function resolveMemberFromToken(db, req) {
  const token = extractToken(req);
  if (!token) return { error: "token required", status: 401 };
  const snap = await db.collection("chunbaek_sessions").doc(token).get();
  if (!snap.exists) return { error: "invalid token", status: 401 };
  const d = snap.data();
  if (d.revoked) return { error: "token revoked", status: 401 };
  if (d.expiresAt?.toDate && d.expiresAt.toDate() < new Date()) {
    return { error: "token expired", status: 401 };
  }
  return { memberId: d.memberId, token };
}

module.exports = {
  issueSession,
  resolveMemberFromToken,
  extractToken,
  TOKEN_TTL_DAYS,
};
