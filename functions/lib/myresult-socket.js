"use strict";

/**
 * 포토월 페이지가 쓰는 Socket.IO (engine.io v3).
 * 결과 페이지의 REST /player/{bib} 는 API key 없이 401이라, 배번 기록은 이 소켓으로 읽는다.
 */
const MYRESULT_SOCKET_URL = "wss://myresult.co.kr/socket.io/?EIO=3&transport=websocket";

/**
 * @param {unknown} data
 * @returns {string}
 */
function messageText(data) {
  if (typeof data === "string") return data;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) return data.toString("utf8");
  return data == null ? "" : String(data);
}

/**
 * 배번 하나의 선수 객체를 가져온다. 없으면 null.
 * 타임아웃·연결 오류는 throw (scrapeEvent 재시도).
 * @param {string|number} eventId
 * @param {string|number} bib
 * @param {{ WebSocketImpl?: typeof WebSocket, timeoutMs?: number, url?: string }} [opts]
 * @returns {Promise<object|null>}
 */
function fetchMyResultPlayer(eventId, bib, opts = {}) {
  const playerNum = String(bib ?? "").trim();
  const id = Number(eventId);
  if (!playerNum || !Number.isFinite(id)) return Promise.resolve(null);

  const WS = opts.WebSocketImpl || globalThis.WebSocket;
  if (typeof WS !== "function") {
    return Promise.reject(new Error("myresult socket: WebSocket 없음"));
  }
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 8000;
  const url = opts.url || MYRESULT_SOCKET_URL;

  return new Promise((resolve, reject) => {
    let settled = false;
    let ws;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws && ws.close(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error("myresult socket timeout")), timeoutMs);

    try {
      ws = new WS(url);
    } catch (err) {
      finish(err instanceof Error ? err : new Error("myresult socket error"));
      return;
    }

    let asked = false;
    const ask = () => {
      if (asked) return;
      asked = true;
      ws.send("42" + JSON.stringify(["CLIENT:INFO", { event_id: id, player_num: playerNum }]));
    };

    ws.addEventListener("error", () => finish(new Error("myresult socket error")));
    ws.addEventListener("message", (ev) => {
      const data = messageText(ev && ev.data);
      if (data.startsWith("0")) {
        try { ws.send("40"); } catch (err) { finish(err); }
        return;
      }
      if (data === "2") {
        try { ws.send("3"); } catch { /* ignore */ }
        return;
      }
      // namespace connect ack. "42..." 는 이벤트 패킷이라 여기서 제외.
      if (data.startsWith("40")) {
        try { ask(); } catch (err) { finish(err); }
        return;
      }
      if (!data.startsWith("42")) return;
      let payload;
      try {
        payload = JSON.parse(data.slice(2));
      } catch (err) {
        finish(err);
        return;
      }
      const body = payload && payload[1];
      if (!body || typeof body !== "object") {
        finish(null, null);
        return;
      }
      const num = body.num == null ? "" : String(body.num).trim();
      if (!num) {
        finish(null, null);
        return;
      }
      if (num !== playerNum) return;
      finish(null, body);
    });
  });
}

module.exports = {
  MYRESULT_SOCKET_URL,
  fetchMyResultPlayer,
};
