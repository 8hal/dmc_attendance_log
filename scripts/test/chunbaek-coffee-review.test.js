"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");
const { buildCoffeeReview } = require("../../functions/lib/chunbaek-coffee-review");
const { COFFEE_AWARD } = require("../../chunbaek/js/finale");
const {
  coffeeMemberTableHtml,
  coffeeNoteText,
} = require("../../chunbaek/js/admin-awards-review");

const DATA_PATH = path.join(__dirname, "../../functions/data/chunbaek-coffee-records.json");

test("시즌 기간의 coffee만 남기고 바나나와 단톡 원문은 결과에 넣지 않는다", () => {
  const review = buildCoffeeReview([
    { date: "2025-09-10", buyer: "완주", item: "banana", sample_quote: "비밀문장", thanks_count: 9 },
    { date: "2025-09-10", buyer: "완주", item: "coffee", sample_quote: "단톡원문" },
    { date: "2026-07-25", buyer: "직전", item: "coffee" },
    { date: "2026-07-26", buyer: "완주 박은정", item: "coffee", sample_quote: "고마워요" },
    { date: "2026-08-13", buyer: "진달 김진규", item: "coffee" },
    { date: "2026-08-13", buyer: "진달 김진규", item: "coffee" },
    { date: "2026-09-08", buyer: "진달 김진규", item: "coffee" },
    { date: "2026-10-24", buyer: "막날", item: "coffee" },
    { date: "2026-10-25", buyer: "다음날", item: "coffee" },
  ]);
  const text = JSON.stringify(review);
  assert.equal(text.includes("비밀문장"), false);
  assert.equal(text.includes("단톡원문"), false);
  assert.equal(text.includes("고마워요"), false);
  assert.equal(text.includes("thanks_count"), false);
  assert.equal(text.includes("sample_quote"), false);
  assert.equal(review.seasonStart, "2026-07-26");
  assert.equal(review.seasonEnd, "2026-10-24");
  assert.equal(review.sourceMinDate, "2025-09-10");
  assert.equal(review.sourceMaxDate, "2026-10-25");
  assert.equal(review.bananaRowsExcluded, 1);
  assert.equal(review.sourceCoffeeRows, 8);
  assert.equal(review.seasonCoffeeRows, 5);
  assert.equal(review.seasonCoffeeOutsideRows, 3);
  assert.equal(review.matchesSeason, true);
  assert.equal(review.warning, null);
  assert.deepEqual(review.days.map((day) => day.date), [
    "2026-07-26",
    "2026-08-13",
    "2026-09-08",
    "2026-10-24",
  ]);
  assert.deepEqual(review.days[1].buyers, ["진달 김진규"]);
  const jindal = review.members.find((member) => member.buyer === "진달 김진규");
  assert.equal(jindal.dayCount, 2);
  assert.deepEqual(jindal.dates, ["2026-08-13", "2026-09-08"]);
  assert.equal(review.members.some((member) => member.buyer === "완주"), false);
  assert.equal(review.members.some((member) => member.buyer === "직전"), false);
  assert.equal(review.members[0].buyer, "진달 김진규");
});

test("시즌3 coffee가 없으면 날짜를 고치지 않고 빈 표와 경고만 남긴다", () => {
  const review = buildCoffeeReview([
    { date: "2025-09-05", buyer: "진달 김진규", item: "coffee", sample_quote: "원문" },
  ]);
  assert.equal(review.days.length, 0);
  assert.equal(review.members.length, 0);
  assert.equal(review.matchesSeason, false);
  assert.equal(review.sourceMinDate, "2025-09-05");
  assert.equal(review.sourceMaxDate, "2025-09-05");
  assert.match(review.warning, /2026-07-26/);
  assert.match(review.warning, /2026-10-24/);
  assert.equal(JSON.stringify(review).includes("2026-09-05"), false);
});

test("제공 CSV에서 만든 자료는 시즌3 coffee 78건이고 원문 필드는 없다", () => {
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  assert.equal(raw.includes("sample_quote"), false);
  assert.equal(raw.includes("thanks_count"), false);
  assert.equal(raw.includes("잘마셨"), false);
  const records = JSON.parse(raw);
  assert.equal(records.length, 413);
  records.forEach((row) => {
    assert.deepEqual(Object.keys(row).sort(), ["buyer", "date", "item"]);
  });
  const review = buildCoffeeReview(records);
  assert.equal(review.sourceMinDate, "2025-07-14");
  assert.equal(review.sourceMaxDate, "2026-11-03");
  assert.equal(review.sourceCoffeeRows, 286);
  assert.equal(review.bananaRowsExcluded, 127);
  assert.equal(review.seasonCoffeeRows, 78);
  assert.equal(review.seasonCoffeeOutsideRows, 208);
  assert.equal(review.days[0].date, "2026-07-26");
  assert.deepEqual(review.days[0].buyers, ["완주 박은정"]);
  assert.equal(review.days.at(-1).date, "2026-10-23");
  assert.equal(review.members[0].buyer, "*Josh조상현*");
  assert.equal(review.members[0].dayCount, 8);
  const jindal = review.members.find((member) => member.buyer === "진달 김진규");
  assert.deepEqual(jindal.dates, [
    "2026-07-29",
    "2026-08-13",
    "2026-08-17",
    "2026-09-08",
    "2026-09-22",
    "2026-09-28",
  ]);
  const cho = review.members.find((member) => member.buyer === "초초긍정 이현옥");
  assert.deepEqual(cho.dates, ["2026-08-11", "2026-10-20"]);
  const choHtml = coffeeMemberTableHtml([cho]);
  assert.match(choHtml, /2026-08-11/);
  assert.equal(choHtml.includes("2026-08-05"), false);
  const html = `${coffeeNoteText(review)}${coffeeMemberTableHtml(review.members)}`;
  const adminPage = fs.readFileSync(path.join(__dirname, "../../chunbaek/admin.html"), "utf8");
  const adminJs = fs.readFileSync(path.join(__dirname, "../../chunbaek/js/admin.js"), "utf8");
  assert.equal(adminPage.includes("coffee-day-table"), false);
  assert.equal(adminPage.includes("일자별"), false);
  assert.equal(adminJs.includes("coffeeDailyTableHtml"), false);
  assert.match(html, /2025-07-14/);
  assert.match(html, /바나나 127건/);
  assert.equal(html.includes("잘마셨"), false);
});

test("카페인상 이름은 CSV buyer의 별표를 뺀 Josh조상현이고 시즌3 날 수는 8일이다", () => {
  const review = buildCoffeeReview(JSON.parse(fs.readFileSync(DATA_PATH, "utf8")));
  assert.equal(review.members[0].buyer, "*Josh조상현*");
  assert.equal(review.members[0].dayCount, 8);
  assert.equal(COFFEE_AWARD.nickname, "Josh조상현");
  assert.equal(COFFEE_AWARD.days, review.members[0].dayCount);
  assert.equal(COFFEE_AWARD.nickname.includes("*"), false);
});
