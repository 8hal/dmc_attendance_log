/**
 * 춘백 시즌3 API handlers — /api/chunbaek
 */

async function handleChunbaekRequest(req, res, { db, action }) {
  if (action === "ping") {
    return res.json({ ok: true, service: "chunbaek" });
  }
  return res.status(400).json({ ok: false, error: `unknown action: ${action}` });
}

module.exports = { handleChunbaekRequest };
