const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { handleChunbaekRequest } = require(path.join(
  __dirname,
  "../../functions/lib/chunbaek-handlers.js",
));

class FakeTimestamp {
  constructor(iso) {
    this.iso = iso;
  }

  toDate() {
    return new Date(this.iso);
  }
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== "object") return value;
  if (typeof value.toDate === "function") return value;
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = cloneValue(inner);
  }
  return out;
}

class FakeDocSnapshot {
  constructor(id, data) {
    this.id = id;
    this.exists = data !== undefined;
    this._data = data;
  }

  data() {
    return this.exists ? cloneValue(this._data) : undefined;
  }
}

class FakeQuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.empty = docs.length === 0;
  }

  forEach(fn) {
    this.docs.forEach(fn);
  }
}

class FakeDocRef {
  constructor(collection, id) {
    this.collection = collection;
    this.id = id;
  }

  async get() {
    return new FakeDocSnapshot(this.id, this.collection.docs.get(this.id));
  }

  async set(value, options = {}) {
    const next = cloneValue(value);
    if (options.merge) {
      const prev = this.collection.docs.get(this.id) || {};
      this.collection.docs.set(this.id, { ...cloneValue(prev), ...next });
      return;
    }
    this.collection.docs.set(this.id, next);
  }
}

class FakeQuery {
  constructor(collection, filters = [], order = null, limitCount = null) {
    this.collection = collection;
    this.filters = filters;
    this.order = order;
    this.limitCount = limitCount;
  }

  where(field, op, value) {
    return new FakeQuery(
      this.collection,
      [...this.filters, { field, op, value }],
      this.order,
      this.limitCount,
    );
  }

  orderBy(field, direction = "asc") {
    return new FakeQuery(this.collection, this.filters, { field, direction }, this.limitCount);
  }

  limit(count) {
    return new FakeQuery(this.collection, this.filters, this.order, count);
  }

  async get() {
    let rows = [...this.collection.docs.entries()];
    rows = rows.filter(([, data]) => this.filters.every(({ field, op, value }) => {
      assert.equal(op, "==");
      return data?.[field] === value;
    }));
    if (this.order) {
      const dir = this.order.direction === "desc" ? -1 : 1;
      rows.sort((a, b) => {
        const av = sortableValue(a[1]?.[this.order.field]);
        const bv = sortableValue(b[1]?.[this.order.field]);
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    }
    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }
    return new FakeQuerySnapshot(rows.map(([id, data]) => new FakeDocSnapshot(id, data)));
  }
}

class FakeCollectionRef extends FakeQuery {
  constructor(name, docs) {
    super(null);
    this.name = name;
    this.docs = docs;
    this.collection = this;
  }

  doc(id) {
    return new FakeDocRef(this, id);
  }
}

class FakeDb {
  constructor(seed = {}) {
    this.collections = new Map();
    this.transactionCalls = 0;
    for (const [name, docs] of Object.entries(seed)) {
      this.collections.set(name, new Map(Object.entries(cloneValue(docs))));
    }
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    return new FakeCollectionRef(name, this.collections.get(name));
  }

  dumpCollection(name) {
    return Object.fromEntries(this.collections.get(name) || []);
  }

  async runTransaction(callback) {
    this.transactionCalls += 1;
    const operations = [];
    const tx = {
      get: async (docRef) => docRef.get(),
      set: (docRef, value, options = {}) => {
        operations.push({ kind: "set", docRef, value, options });
      },
    };
    const result = await callback(tx);
    const nextCollections = cloneCollections(this.collections);
    for (const op of operations) {
      applyOperation(nextCollections, op);
    }
    this.collections = nextCollections;
    return result;
  }
}

function sortableValue(value) {
  if (value && typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return value ?? 0;
}

function mergeDocs(prev, value) {
  return { ...cloneValue(prev), ...cloneValue(value) };
}

function cloneCollections(collections) {
  const next = new Map();
  for (const [name, docs] of collections.entries()) {
    next.set(name, new Map(Object.entries(cloneValue(Object.fromEntries(docs)))));
  }
  return next;
}

function applyOperation(collections, op) {
  const name = op.docRef.collection.name;
  if (!collections.has(name)) {
    collections.set(name, new Map());
  }
  const docs = collections.get(name);
  if (op.kind === "set") {
    const next = cloneValue(op.value);
    if (op.options.merge) {
      const prev = docs.get(op.docRef.id) || {};
      docs.set(op.docRef.id, mergeDocs(prev, next));
      return;
    }
    docs.set(op.docRef.id, next);
    return;
  }
  throw new Error(`unsupported operation: ${op.kind}`);
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function runAction(action, req, db) {
  const res = makeRes();
  await handleChunbaekRequest(
    {
      headers: {},
      query: {},
      body: {},
      ...req,
    },
    res,
    { db, action },
  );
  return res;
}

async function withMockedNow(iso, fn) {
  const realNow = Date.now;
  Date.now = () => Date.parse(iso);
  try {
    await fn();
  } finally {
    Date.now = realNow;
  }
}

describe("chunbaek member exception APIs", () => {
  it("request-exception dryRun returns preview without writing a request", async () => {
    const db = new FakeDb({
      members: {
        m1: {
          nickname: "초이스",
          chunbaekS3: { participant: true, profileComplete: true },
        },
      },
      chunbaek_sessions: {
        tok: {
          token: "tok",
          memberId: "m1",
          revoked: false,
          expiresAt: new FakeTimestamp("2099-01-01T00:00:00.000Z"),
        },
      },
      chunbaek_season_config: {
        "chunbaek-s3": { weeklyTarget: 3, photoRequired: false },
      },
      chunbaek_slots: {
        "1": { dayIndex: 1, date: "2026-07-20", week: 1, isProgramOff: false },
        "2": { dayIndex: 2, date: "2026-07-21", week: 1, isProgramOff: false },
        "3": { dayIndex: 3, date: "2026-07-22", week: 1, isProgramOff: false },
      },
      chunbaek_attendance: {
        a1: { memberId: "m1", slotId: 1, attended: true, exception: false },
        a2: { memberId: "m1", slotId: 2, attended: false, exception: true },
      },
    });

    await withMockedNow("2026-07-20T03:00:00.000Z", async () => {
      const res = await runAction("request-exception", {
        method: "POST",
        query: { token: "tok" },
        body: {
          reason: "발목 통증",
          startDate: "2026-07-20",
          endDate: "2026-07-22",
          dryRun: true,
        },
      }, db);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, {
        ok: true,
        preview: {
          applicableSlotIds: [3],
          skippedSlotIds: [1],
        },
      });
      assert.deepEqual(db.dumpCollection("chunbaek_exception_requests"), {});
    });
  });

  it("request-exception creates a pending request and member lock in one transaction", async () => {
    const db = new FakeDb({
      members: {
        m1: {
          nickname: "초이스",
          chunbaekS3: { participant: true, profileComplete: true },
        },
      },
      chunbaek_sessions: {
        tok: {
          token: "tok",
          memberId: "m1",
          revoked: false,
          expiresAt: new FakeTimestamp("2099-01-01T00:00:00.000Z"),
        },
      },
      chunbaek_season_config: {
        "chunbaek-s3": { weeklyTarget: 3, photoRequired: false },
      },
      chunbaek_slots: {
        "1": { dayIndex: 1, date: "2026-07-20", week: 1, isProgramOff: false },
        "2": { dayIndex: 2, date: "2026-07-21", week: 1, isProgramOff: false },
        "3": { dayIndex: 3, date: "2026-07-22", week: 1, isProgramOff: false },
      },
      chunbaek_attendance: {
        a1: { memberId: "m1", slotId: 1, attended: true, exception: false },
        a2: { memberId: "m1", slotId: 2, attended: false, exception: true },
      },
    });

    await withMockedNow("2026-07-20T03:00:00.000Z", async () => {
      const res = await runAction("request-exception", {
        method: "POST",
        query: { token: "tok" },
        body: {
          reason: "발목 통증",
          startDate: "2026-07-20",
          endDate: "2026-07-22",
        },
      }, db);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.ok, true);
      assert.equal(typeof res.body.requestId, "string");
      assert.deepEqual(res.body.preview, {
        applicableSlotIds: [3],
        skippedSlotIds: [1],
      });
      assert.equal(db.transactionCalls, 1);

      const requests = db.dumpCollection("chunbaek_exception_requests");
      assert.deepEqual(Object.keys(requests), [res.body.requestId]);
      assert.equal(requests[res.body.requestId].memberId, "m1");
      assert.equal(requests[res.body.requestId].status, "pending");

      const locks = db.dumpCollection("chunbaek_exception_locks");
      assert.equal(locks.m1.pendingRequestId, res.body.requestId);
      assert.ok(locks.m1.updatedAt);
    });
  });

  it("my-exception-requests returns recent requests in descending order", async () => {
    const db = new FakeDb({
      chunbaek_sessions: {
        tok: {
          token: "tok",
          memberId: "m1",
          revoked: false,
          expiresAt: new FakeTimestamp("2099-01-01T00:00:00.000Z"),
        },
      },
      chunbaek_exception_requests: {
        old: {
          seasonId: "chunbaek-s3",
          type: "exception",
          memberId: "m1",
          nickname: "초이스",
          reason: "출장",
          startDate: "2026-07-20",
          endDate: "2026-07-21",
          status: "pending",
          createdAt: new FakeTimestamp("2026-07-19T00:00:00.000Z"),
          updatedAt: new FakeTimestamp("2026-07-19T00:00:00.000Z"),
          reviewedBy: null,
          reviewedAt: null,
          reviewNote: "",
          appliedSlotIds: [],
          skippedSlotIds: [],
        },
        newest: {
          seasonId: "chunbaek-s3",
          type: "exception",
          memberId: "m1",
          nickname: "초이스",
          reason: "휴가",
          startDate: "2026-07-22",
          endDate: "2026-07-23",
          status: "approved",
          createdAt: new FakeTimestamp("2026-07-20T04:00:00.000Z"),
          updatedAt: new FakeTimestamp("2026-07-20T05:00:00.000Z"),
          reviewedBy: "admin-1",
          reviewedAt: new FakeTimestamp("2026-07-20T05:00:00.000Z"),
          reviewNote: "승인",
          appliedSlotIds: [3],
          skippedSlotIds: [],
        },
        otherMember: {
          memberId: "m2",
          createdAt: new FakeTimestamp("2026-07-21T00:00:00.000Z"),
        },
      },
    });

    const res = await runAction("my-exception-requests", {
      method: "GET",
      query: { token: "tok" },
    }, db);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual(
      res.body.requests.map((request) => request.requestId),
      ["newest", "old"],
    );
    assert.equal(res.body.requests[0].createdAt, "2026-07-20T04:00:00.000Z");
    assert.equal(res.body.requests[0].reviewedAt, "2026-07-20T05:00:00.000Z");
  });

  it("self-clear-future-exceptions clears only today and future exception slots", async () => {
    const db = new FakeDb({
      chunbaek_sessions: {
        tok: {
          token: "tok",
          memberId: "m1",
          revoked: false,
          expiresAt: new FakeTimestamp("2099-01-01T00:00:00.000Z"),
        },
      },
      chunbaek_season_config: {
        "chunbaek-s3": { weeklyTarget: 3, photoRequired: false },
      },
      chunbaek_slots: {
        "1": { dayIndex: 1, date: "2026-07-19", week: 1, isProgramOff: false },
        "2": { dayIndex: 2, date: "2026-07-20", week: 1, isProgramOff: false },
        "3": { dayIndex: 3, date: "2026-07-22", week: 1, isProgramOff: false },
        "4": { dayIndex: 4, date: "2026-07-23", week: 1, isProgramOff: true },
      },
      chunbaek_attendance: {
        "m1_1": {
          memberId: "m1",
          slotId: 1,
          exception: true,
          exceptionNote: "[상신] 지난주",
          note: "keep past",
        },
        "m1_2": {
          memberId: "m1",
          slotId: 2,
          exception: true,
          exceptionNote: "[상신] 오늘",
          note: "keep today",
        },
        "m1_3": {
          memberId: "m1",
          slotId: 3,
          exception: true,
          exceptionNote: "[상신] 미래",
          note: "keep future",
        },
        "m1_4": {
          memberId: "m1",
          slotId: 4,
          exception: true,
          exceptionNote: "[상신] off",
          note: "keep off",
        },
      },
    });

    await withMockedNow("2026-07-20T03:00:00.000Z", async () => {
      const res = await runAction("self-clear-future-exceptions", {
        method: "POST",
        query: { token: "tok" },
      }, db);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, {
        ok: true,
        clearedSlotIds: [2, 3],
      });

      const attendance = db.dumpCollection("chunbaek_attendance");
      assert.equal(attendance["m1_1"].exception, true);
      assert.equal(attendance["m1_2"].exception, false);
      assert.equal(attendance["m1_2"].exceptionNote, "");
      assert.equal(attendance["m1_2"].updatedBy, "m1");
      assert.equal(attendance["m1_2"].note, "keep today");
      assert.equal(attendance["m1_3"].exception, false);
      assert.equal(attendance["m1_3"].note, "keep future");
      assert.equal(attendance["m1_4"].exception, true);
    });
  });
});
