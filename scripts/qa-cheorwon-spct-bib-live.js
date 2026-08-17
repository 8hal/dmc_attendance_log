#!/usr/bin/env node
/**
 * 2025 철원 SPCT 배번 조회 스모크 (실사이트).
 * Firestore에 쓰지 않음. 기술 검증용 기대 기록만 대조.
 *
 *   node scripts/qa-cheorwon-spct-bib-live.js
 *   node scripts/qa-cheorwon-spct-bib-live.js --limit 5
 */
"use strict";

const fs = require("fs");
const path = require("path");
const scraper = require("../functions/lib/scraper");

const SOURCE = "spct";
const SOURCE_ID = "2025092102";
const CSV = path.join(__dirname, "fixtures", "cheorwon-2025-spct-bib-input.csv");

function parseArgs(argv) {
  const i = argv.indexOf("--limit");
  if (i >= 0 && argv[i + 1]) return { limit: Number(argv[i + 1]) };
  return { limit: 0 };
}

function parseCsv(text) {
  const lines = String(text)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] || "";
    });
    return row;
  });
}

(async () => {
  const { limit } = parseArgs(process.argv.slice(2));
  const rows = parseCsv(fs.readFileSync(CSV, "utf8"));
  const slice = limit > 0 ? rows.slice(0, limit) : rows;
  const info = await scraper.getEventInfo(SOURCE, SOURCE_ID);
  console.log("EVENT", JSON.stringify(info));

  let pass = 0;
  let fail = 0;
  for (const row of slice) {
    const bib = String(row["배번"] || "").trim();
    const expected = String(row["기대기록"] || "").trim();
    const found = await scraper.searchMember(SOURCE, SOURCE_ID, bib);
    const first = Array.isArray(found) && found[0] ? found[0] : null;
    const net = first && first.netTime ? String(first.netTime) : "";
    const ok = !!(first && net === expected);
    if (ok) pass += 1;
    else fail += 1;
    console.log(
      ok ? "PASS" : "FAIL",
      row["닉네임"],
      bib,
      "expected",
      expected,
      "got",
      first ? `${first.name}/${first.bib}/${net}/${first.distance}` : "none"
    );
  }
  console.log("SUMMARY", JSON.stringify({ total: slice.length, pass, fail }));
  if (fail > 0) process.exit(2);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
