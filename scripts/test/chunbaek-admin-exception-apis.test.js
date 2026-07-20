const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { handleAdminRequest } = require(path.join(
  __dirname,
  "../../functions/lib/chunbaek-admin.js",
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

  async update(value) {
    const prev = this.collection.docs.get(this.id);
    if (prev === undefined) {
      throw new Error(`doc ${this.collection.name}/${this.id} does not exist`);
    }
    this.collection.docs.set(this.id, { ...cloneValue(prev), ...cloneValue(value) });
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
    if (this.order) {
      throw new Error(`where() must come before orderBy() for ${this.collection.name}`);
    }
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
}

function sortableValue(value) {
  if (value && typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return value ?? 0;
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
  const handled = await handleAdminRequest(
    {
      query: {},
      body: {},
      ...req,
    },
    res,
    db,
    action,
  );
  assert.equal(handled, true);
  return res;
}

function seedAdminDb() {
  return new FakeDb({
    members: {
      m1: {
        nickname: "초이스",
        chunbaekS3: { participant: true, profileComplete: true },
      },
      m2: {
        nickname: "러너",
        chunbaekS3: { participant: true, profileComplete: true },
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
      "m1_1": { memberId: "m1", slotId: 1, attended: true, exception: false },
      "m1_3": {
        memberId: "m1",
        slotId: 3,
        attended: false,
        exception: true,
        exceptionNote: "[상신] 기존",
        updatedBy: "member",
      },
    },
    chunbaek_exception_requests: {
      reqPending: {
        seasonId: "chunbaek-s3",
        type: "exception",
        memberId: "m1",
        nickname: "초이스",
        reason: "발목 통증",
        startDate: "2026-07-20",
        endDate: "2026-07-22",
        status: "pending",
        createdAt: new FakeTimestamp("2026-07-20T05:00:00.000Z"),
        updatedAt: new FakeTimestamp("2026-07-20T05:00:00.000Z"),
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: "",
        appliedSlotIds: [],
        skippedSlotIds: [],
      },
      reqApproved: {
        seasonId: "chunbaek-s3",
        type: "exception",
        memberId: "m2",
        nickname: "러너",
        reason: "휴가",
        startDate: "2026-07-22",
        endDate: "2026-07-22",
        status: "approved",
        createdAt: new FakeTimestamp("2026-07-21T05:00:00.000Z"),
        updatedAt: new FakeTimestamp("2026-07-21T05:00:00.000Z"),
      },
      reqOtherType: {
        type: "other",
        memberId: "m1",
        status: "pending",
        createdAt: new FakeTimestamp("2026-07-22T05:00:00.000Z"),
      },
    },
  });
}

describe("chunbaek admin exception request APIs", () => {
  it("admin-list-exception-requests defaults to pending and attaches preview", async () => {
    const db = seedAdminDb();

    const res = await runAction("admin-list-exception-requests", {
      method: "GET",
      query: { adminPw: "dmc2008" },
    }, db);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      ok: true,
      requests: [
        {
          requestId: "reqPending",
          seasonId: "chunbaek-s3",
          type: "exception",
          memberId: "m1",
          nickname: "초이스",
          reason: "발목 통증",
          startDate: "2026-07-20",
          endDate: "2026-07-22",
          status: "pending",
          createdAt: "2026-07-20T05:00:00.000Z",
          updatedAt: "2026-07-20T05:00:00.000Z",
          reviewedBy: null,
          reviewedAt: null,
          reviewNote: "",
          appliedSlotIds: [],
          skippedSlotIds: [],
          preview: {
            applicableSlotIds: [2],
            skippedSlotIds: [1],
          },
        },
      ],
    });
  });

  it("admin-review-exception-request approve applies only preview-applicable slots", async () => {
    const db = seedAdminDb();

    const res = await runAction("admin-review-exception-request", {
      method: "POST",
      body: {
        adminPw: "dmc2008",
        requestId: "reqPending",
        decision: "approve",
        reviewNote: "확인 완료",
      },
    }, db);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      ok: true,
      requestId: "reqPending",
      status: "approved",
      appliedSlotIds: [2],
      skippedSlotIds: [1],
    });

    const attendance = db.dumpCollection("chunbaek_attendance");
    assert.equal(attendance["m1_1"].attended, true);
    assert.equal(attendance["m1_2"].memberId, "m1");
    assert.equal(attendance["m1_2"].slotId, 2);
    assert.equal(attendance["m1_2"].attended, false);
    assert.equal(attendance["m1_2"].exception, true);
    assert.equal(attendance["m1_2"].exceptionNote, "[상신] 발목 통증");
    assert.equal(attendance["m1_2"].updatedBy, "admin");
    assert.equal(attendance["m1_3"].exceptionNote, "[상신] 기존");
    assert.equal(attendance["m1_3"].updatedBy, "member");

    const requests = db.dumpCollection("chunbaek_exception_requests");
    assert.equal(requests.reqPending.status, "approved");
    assert.deepEqual(requests.reqPending.appliedSlotIds, [2]);
    assert.deepEqual(requests.reqPending.skippedSlotIds, [1]);
    assert.equal(requests.reqPending.reviewedBy, "admin");
    assert.equal(requests.reqPending.reviewNote, "확인 완료");
  });

  it("admin-review-exception-request reject updates request without attendance writes", async () => {
    const db = seedAdminDb();

    const res = await runAction("admin-review-exception-request", {
      method: "POST",
      body: {
        adminPw: "dmc2008",
        requestId: "reqPending",
        decision: "reject",
        reviewNote: "증빙 부족",
      },
    }, db);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      ok: true,
      requestId: "reqPending",
      status: "rejected",
    });

    const attendance = db.dumpCollection("chunbaek_attendance");
    assert.equal(attendance["m1_2"], undefined);

    const requests = db.dumpCollection("chunbaek_exception_requests");
    assert.equal(requests.reqPending.status, "rejected");
    assert.equal(requests.reqPending.reviewedBy, "admin");
    assert.equal(requests.reqPending.reviewNote, "증빙 부족");
  });

  it("admin-review-exception-request blocks already reviewed requests", async () => {
    const db = seedAdminDb();

    const res = await runAction("admin-review-exception-request", {
      method: "POST",
      body: {
        adminPw: "dmc2008",
        requestId: "reqApproved",
        decision: "approve",
      },
    }, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      ok: false,
      error: "already reviewed",
    });
  });
});
