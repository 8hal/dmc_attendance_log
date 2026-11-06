"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SEASON_START = "2026-07-26";
const SEASON_END = "2026-10-24";
const DATA_PATH = path.join(__dirname, "../data/chunbaek-coffee-records.json");

function compareName(a, b) {
  return String(a).localeCompare(String(b), "ko");
}

function loadCoffeeRecords() {
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

function buildCoffeeReview(records, options = {}) {
  const seasonStart = options.seasonStart || SEASON_START;
  const seasonEnd = options.seasonEnd || SEASON_END;
  const coffee = [];
  let bananaRowsExcluded = 0;
  for (const row of Array.isArray(records) ? records : []) {
    const date = String(row && row.date || "").trim();
    const buyer = String(row && row.buyer || "").trim();
    const item = String(row && row.item || "").trim();
    if (!date || !buyer) continue;
    if (item === "banana") {
      bananaRowsExcluded += 1;
      continue;
    }
    if (item !== "coffee") continue;
    coffee.push({ date, buyer });
  }
  const sourceDates = coffee.map((row) => row.date).sort();
  const inSeason = coffee.filter((row) => row.date >= seasonStart && row.date <= seasonEnd);
  const byDate = new Map();
  const byBuyer = new Map();
  for (const row of inSeason) {
    if (!byDate.has(row.date)) byDate.set(row.date, new Set());
    byDate.get(row.date).add(row.buyer);
    if (!byBuyer.has(row.buyer)) byBuyer.set(row.buyer, new Set());
    byBuyer.get(row.buyer).add(row.date);
  }
  const days = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, buyers]) => ({ date, buyers: [...buyers].sort(compareName) }));
  const members = [...byBuyer.entries()]
    .map(([buyer, dates]) => ({
      buyer,
      dayCount: dates.size,
      dates: [...dates].sort(),
    }))
    .sort((a, b) => b.dayCount - a.dayCount || compareName(a.buyer, b.buyer));
  const matchesSeason = inSeason.length > 0;
  return {
    seasonStart,
    seasonEnd,
    sourceMinDate: sourceDates[0] || null,
    sourceMaxDate: sourceDates[sourceDates.length - 1] || null,
    sourceCoffeeRows: coffee.length,
    bananaRowsExcluded,
    seasonCoffeeRows: inSeason.length,
    seasonCoffeeOutsideRows: coffee.length - inSeason.length,
    matchesSeason,
    warning: matchesSeason
      ? null
      : `제공 자료에는 공식 시즌3(${seasonStart}~${seasonEnd}) coffee 기록이 없습니다. 날짜를 시즌3로 바꾸지 않았습니다.`,
    days,
    members,
  };
}

module.exports = {
  SEASON_START,
  SEASON_END,
  loadCoffeeRecords,
  buildCoffeeReview,
};
