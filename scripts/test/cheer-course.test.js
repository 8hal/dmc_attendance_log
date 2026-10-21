const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { coursePoint, snakePath, clusterRunners } = require("../../assets/cheer-course");

describe("snake course", () => {
  it("places 0, 5, 30, 38, and 42.195 on the expected row and direction", () => {
    const start = coursePoint(0);
    assert.equal(start.row, 0);
    assert.equal(start.ltr, true);
    assert.ok(start.x < 0.01);

    const five = coursePoint(5);
    assert.equal(five.row, 1);
    assert.equal(five.ltr, false);
    assert.ok(five.x > 0.99);

    const thirty = coursePoint(30);
    assert.equal(thirty.row, 6);
    assert.equal(thirty.ltr, true);
    assert.ok(thirty.x < 0.01);

    const thirtyEight = coursePoint(38);
    assert.equal(thirtyEight.row, 7);
    assert.equal(thirtyEight.ltr, false);
    assert.ok(Math.abs(thirtyEight.x - 0.4) < 0.02);

    const finish = coursePoint(42.195);
    assert.equal(finish.row, 8);
    assert.equal(finish.ltr, true);
    assert.ok(Math.abs(finish.x - 2.195 / 5) < 1e-9);
  });

  it("keeps every row horizontal so y is the row", () => {
    for (const km of [0, 2.5, 4.999, 5, 17.3, 41, 42.195]) {
      const p = coursePoint(km);
      assert.equal(p.y, p.row, String(km));
    }
    assert.ok(Math.abs(coursePoint(2.5).x - 0.5) < 1e-9);
    assert.ok(Math.abs(coursePoint(7.5).x - 0.5) < 1e-9);
  });

  it("draws rows joined by U-turns on alternating sides", () => {
    const box = { left: 10, right: 90, top: 12, gap: 16 };
    const d = snakePath(box);
    assert.ok(d.startsWith("M 10 12 "));
    const arcs = d.match(/A 8 8 0 0 [01] /g) || [];
    assert.equal(arcs.length, 8);
    assert.ok(d.includes("A 8 8 0 0 1 90 28"), "first turn on the right");
    assert.ok(d.includes("A 8 8 0 0 0 10 44"), "second turn on the left");
    assert.ok(d.endsWith(" H 45.12"));
    assert.equal((d.match(/H /g) || []).length, 9);
  });

  it("clusters runners within 0.4 km", () => {
    const groups = clusterRunners([
      { nickname: "가", km: 10 },
      { nickname: "나", km: 10.3 },
      { nickname: "다", km: 12 },
    ]);
    assert.equal(groups.length, 2);
    assert.deepEqual(
      groups[0].runners.map((row) => row.nickname),
      ["가", "나"]
    );
  });
});
