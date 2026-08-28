const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  AUTH_KEY,
  PW_KEY,
  ROLE_KEY,
  LIST_KEY,
  saveGroupOpsSession,
  readGroupOpsSession,
  hasListAccess,
  hasAdminAccess,
  clearGroupOpsSession,
} = require(path.join(__dirname, "../../assets/group-ops-session.js"));

function mem() {
  const m = new Map();
  return {
    getItem(k) {
      return m.has(k) ? m.get(k) : null;
    },
    setItem(k, v) {
      m.set(k, String(v));
    },
    removeItem(k) {
      m.delete(k);
    },
  };
}

function readHtml(name) {
  return fs.readFileSync(path.join(__dirname, "../..", name), "utf8");
}

function extractFn(html, name) {
  const start = html.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing function " + name);
  const next = html.indexOf("\n    function ", start + 1);
  return html.slice(start, next > 0 ? next : html.length);
}

describe("group-ops-session", () => {
  it("save lets list and event-admin reuse the same pw session", () => {
    const storage = mem();
    saveGroupOpsSession(storage, "dmc2008", "operator");
    assert.equal(storage.getItem(AUTH_KEY), "ok");
    assert.equal(storage.getItem(PW_KEY), "dmc2008");
    assert.equal(storage.getItem(ROLE_KEY), "operator");
    assert.equal(storage.getItem(LIST_KEY), "verified");
    assert.equal(hasListAccess(storage), true);
    assert.equal(hasAdminAccess(storage), true);
    assert.equal(readGroupOpsSession(storage).pw, "dmc2008");
  });

  it("legacy list verified without pw still opens the list, not event-admin", () => {
    const storage = mem();
    storage.setItem(LIST_KEY, "verified");
    assert.equal(hasListAccess(storage), true);
    assert.equal(hasAdminAccess(storage), false);
  });

  it("clear drops list and event-admin keys together", () => {
    const storage = mem();
    saveGroupOpsSession(storage, "dmc2008", "owner");
    clearGroupOpsSession(storage);
    assert.equal(hasListAccess(storage), false);
    assert.equal(hasAdminAccess(storage), false);
    assert.equal(storage.getItem(LIST_KEY), null);
    assert.equal(storage.getItem(PW_KEY), null);
  });
});

describe("group.html and event-admin.html share ops session", () => {
  it("both pages load group-ops-session.js", () => {
    assert.match(readHtml("group.html"), /src="assets\/group-ops-session\.js"/);
    assert.match(readHtml("event-admin.html"), /src="assets\/group-ops-session\.js"/);
  });

  it("group login saves the shared session so event-admin can skip the prompt", () => {
    const fn = extractFn(readHtml("group.html"), "tryAuth");
    assert.match(fn, /saveGroupOpsSession\(sessionStorage/);
  });

  it("group checkAuth accepts the shared session from event-admin login", () => {
    const fn = extractFn(readHtml("group.html"), "checkAuth");
    assert.match(fn, /hasListAccess\(sessionStorage\)/);
  });

  it("event-admin login saves the shared session so the list can skip the prompt", () => {
    const fn = extractFn(readHtml("event-admin.html"), "tryAuth");
    assert.match(fn, /saveGroupOpsSession\(sessionStorage/);
  });

  it("event-admin logout clears the shared session", () => {
    const fn = extractFn(readHtml("event-admin.html"), "clearSession");
    assert.match(fn, /clearGroupOpsSession\(sessionStorage\)/);
  });
});
