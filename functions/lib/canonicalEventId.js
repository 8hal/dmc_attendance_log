/**
 * race_events 문서 id = canonicalEventId 발급 (§2.3)
 * 형식: evt_{YYYY-MM-DD}_{ascii-slug}, 전체 ≤80자, 충돌 시 -2, -3, …
 */

const MAX_ID_LEN = 80;

function normalizeEventDateForId(d) {
  if (!d) return new Date().toISOString().slice(0, 10);
  const m = String(d).trim().match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : new Date().toISOString().slice(0, 10);
}

function slugify(primaryName) {
  if (!primaryName || typeof primaryName !== "string") return "unnamed";
  let s = primaryName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  s = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").replace(/_+/g, "_");
  return s || "unnamed";
}

/**
 * @param {import("firebase-admin/firestore").Firestore} db
 * @param {string} eventDate
 * @param {string} primaryName
 * @returns {Promise<string>}
 */
async function allocateCanonicalEventId(db, eventDate, primaryName) {
  const date = normalizeEventDateForId(eventDate);
  const prefix = `evt_${date}_`;
  const slug = slugify(primaryName);
  const maxSlugLen = MAX_ID_LEN - prefix.length;
  let shortSlug = slug.length <= maxSlugLen ? slug : slug.slice(0, maxSlugLen).replace(/_+$/, "");
  if (!shortSlug) shortSlug = "unnamed";

  let baseId = `${prefix}${shortSlug}`;
  if (baseId.length > MAX_ID_LEN) baseId = baseId.slice(0, MAX_ID_LEN).replace(/_+$/, "");

  let candidate = baseId;
  let n = 2;
  while (n < 10000) {
    const ref = db.collection("race_events").doc(candidate);
    const doc = await ref.get();
    if (!doc.exists) return candidate;

    const suffix = `-${n}`;
    const room = MAX_ID_LEN - prefix.length - suffix.length;
    const truncated =
      room < 1 ? "x" : shortSlug.slice(0, room).replace(/_+$/, "") || "x";
    candidate = `${prefix}${truncated}${suffix}`;
    n += 1;
  }
  throw new Error("allocateCanonicalEventId: collision limit exceeded");
}

module.exports = {
  allocateCanonicalEventId,
  slugify,
  normalizeEventDateForId,
  MAX_ID_LEN,
};
