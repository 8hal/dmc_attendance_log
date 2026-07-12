#!/usr/bin/env node
/**
 * 춘백 S3 100일 슬롯 골격 CSV 생성
 *
 * 사용법:
 *   node scripts/generate-chunbaek-slot-skeleton.js
 *   node scripts/generate-chunbaek-slot-skeleton.js --start=2026-07-20 --out=scripts/data/chunbaek-s3-slots-100days.csv
 */
const fs = require("fs");
const path = require("path");

const MS_PER_DAY = 86400000;
const DEFAULT_START = "2026-07-20";
const DEFAULT_OUT = path.join(__dirname, "data", "chunbaek-s3-slots-100days.csv");
const SLOT_COUNT = 100;

function getArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

function addDays(isoDate, offset) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + offset * MS_PER_DAY;
  return new Date(ms).toISOString().slice(0, 10);
}

function weekForDayIndex(dayIndex) {
  return Math.ceil(dayIndex / 7);
}

function generateRows(startDate) {
  const rows = [];
  for (let dayIndex = 1; dayIndex <= SLOT_COUNT; dayIndex += 1) {
    rows.push({
      dayIndex,
      date: addDays(startDate, dayIndex - 1),
      week: weekForDayIndex(dayIndex),
      trainingTitle: "",
      trainingContent: "",
      isProgramOff: false,
    });
  }
  return rows;
}

function toCsv(rows) {
  const header = "dayIndex,date,week,trainingTitle,trainingContent,isProgramOff";
  const lines = rows.map((r) => [
    r.dayIndex,
    r.date,
    r.week,
    r.trainingTitle,
    r.trainingContent,
    r.isProgramOff,
  ].join(","));
  return `${header}\n${lines.join("\n")}\n`;
}

const startDate = getArg("start", DEFAULT_START);
const outPath = path.resolve(getArg("out", DEFAULT_OUT));
const rows = generateRows(startDate);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, toCsv(rows), "utf8");

const endDate = rows[rows.length - 1].date;
console.log(`[generate-chunbaek-slot-skeleton] ${rows.length}슬롯`);
  console.log(`  시작: ${startDate} (1일차)`);
console.log(`  종료: ${endDate} (100일차)`);
console.log(`  출력: ${outPath}`);
