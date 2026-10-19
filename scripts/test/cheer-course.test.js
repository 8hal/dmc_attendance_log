const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { coursePoint, clusterRunners } = require("../../assets/cheer-course");

describe("zigzag course", () => {
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
    assert.ok(finish.x > 0.99);
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
