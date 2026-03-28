#!/usr/bin/env node
/**
 * SmartChip Playwright 스크래퍼
 *
 * Node.js fetch는 IP 차단됨 → 실제 Chromium 브라우저로 우회
 *
 * 사용법:
 *   node scripts/scrape_smartchip_playwright.js <sourceId> <이름1> [이름2] ...
 *   node scripts/scrape_smartchip_playwright.js 202650000006 김성한 이동현
 *
 *   --dry-run: Firestore 저장 없이 파싱 결과만 출력
 *   --headless=false: 브라우저 창 표시 (디버깅용)
 */

const { chromium } = require("playwright");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");
const { normalizeRaceDistance } = require("../functions/lib/raceDistance");

const DRY_RUN = process.argv.includes("--dry-run");
const HEADLESS = !process.argv.includes("--headless=false");

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [sourceId, ...names] = args;

if (!sourceId || names.length === 0) {
  console.error("사용법: node scrape_smartchip_playwright.js <sourceId> <이름1> [이름2] ...");
  process.exit(1);
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

function normDist(raw) {
  return normalizeRaceDistance(raw);
}

function normTime(raw) {
  const t = String(raw || "").trim();
  const m3 = t.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (m3) return `${m3[1].padStart(2, "0")}:${m3[2]}:${m3[3]}`;
  const m2 = t.match(/^(\d{1,2}):(\d{2})(?:\.\d+)?$/);
  if (m2) return `00:${m2[1].padStart(2, "0")}:${m2[2]}`;
  return t;
}

function scDecrypt(secret, html) {
  if (!secret) return "";
  const keyMatch = html.match(/const\s+_k\s*=\s*\[([\d,\s]+)\]/);
  const xorMatch = html.match(/\^\s*(\d+)\s*;/);
  const keyArray = keyMatch
    ? keyMatch[1].split(",").map((n) => parseInt(n.trim()))
    : [1, 4, 11, 14, 0, 9, 8].map((n) => n + 100);
  const xorMask = keyMatch && xorMatch ? parseInt(xorMatch[1]) : keyMatch ? 170 : 0;
  let text = "";
  for (let i = 0; i < secret.length; i += 4) {
    const code = parseInt(secret.substr(i, 4), 16);
    const kCode = keyArray[(i / 4) % keyArray.length] ^ xorMask;
    text += String.fromCharCode(code ^ kCode);
  }
  return text;
}

function parseSmartChipHtml(html, memberName) {
  // 시간 암호화 값 추출
  const enc = html.match(/drawTextCanvas\s*\(\s*"targetClock"\s*,\s*"([0-9a-fA-F]+)"\s*\)/);
  const netTime = enc ? scDecrypt(enc[1], html) : "";
  if (!netTime) return null;

  // jamsil-bold-center 클래스에서 이름/종목 추출 (정규식으로 간단 파싱)
  const jamsil = [];
  const re = /class="jamsil-bold-center"[^>]*>([^<]*)</g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const t = m[1].replace(/&nbsp;/g, "").trim();
    if (t) jamsil.push(t);
  }

  const name = jamsil[0] || memberName;
  const distance = normDist(jamsil[1] || "");
  let bib = "";
  for (let i = 0; i < jamsil.length; i++) {
    if (jamsil[i] === "BIB" && jamsil[i + 1]) { bib = jamsil[i + 1].trim(); break; }
  }

  const rankData = html.match(/var rawData\s*=\s*\[([^\]]*)\]/);
  const overallRank = rankData ? parseInt(rankData[1].split(",")[0]) : null;

  const genderUrlMatch = html.match(/Total_Rank\.asp[^"']*gender=([^&"']+)/i);
  let gender = null;
  if (genderUrlMatch) {
    const g = decodeURIComponent(genderUrlMatch[1]);
    if (g === "남" || g.toLowerCase() === "male" || g.toLowerCase() === "m") gender = "M";
    else if (g === "여" || g.toLowerCase() === "female" || g.toLowerCase() === "f") gender = "F";
  }

  return { name, bib, distance, netTime: normTime(netTime), gunTime: "", overallRank, gender };
}

// ── 메인 ─────────────────────────────────────────────────────────
(async () => {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "ko-KR",
  });
  const page = await context.newPage();

  // 1. dongma.html 방문 → 세션 쿠키 발급
  console.log("[SmartChip] 세션 초기화...");
  await page.goto("https://smartchip.co.kr/dongma.html", { waitUntil: "domcontentloaded", timeout: 15000 });
  console.log("[SmartChip] 세션 발급 완료");

  // 2. 대회 페이지로 이동 → eventName, eventDate 추출
  const eventUrl = `https://smartchip.co.kr/Search_Ballyno.html?usedata=${sourceId}`;
  console.log(`[SmartChip] 대회 페이지 로딩: ${eventUrl}`);
  await page.goto(eventUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

  // 대회명, 날짜 추출
  const pageTitle = await page.title();
  let eventName = pageTitle || `SmartChip ${sourceId}`;
  let eventDate = "";

  // 페이지 HTML에서 날짜 파싱 시도
  const pageHtml = await page.content();
  const dateMatch = pageHtml.match(/(\d{4})[.\-년\s]*(\d{1,2})[.\-월\s]*(\d{1,2})/);
  if (dateMatch) {
    eventDate = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}`;
  }
  console.log(`  대회명: ${eventName} | 날짜: ${eventDate || "미확인"}`);

  const results = {};

  // 3. 각 회원 검색
  for (const name of names) {
    console.log(`\n[검색] ${name}...`);

    try {
      // 이름 검색: 브라우저 내에서 fetch (쿠키 자동 포함)
      const searchResult = await page.evaluate(async ({ sourceId, name }) => {
        const params = new URLSearchParams();
        params.append("nameorbibno", name);
        params.append("usedata", sourceId);

        const res = await fetch("https://www.smartchip.co.kr/return_data_livephoto.asp", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": `https://smartchip.co.kr/Search_Ballyno.html?usedata=${sourceId}`,
          },
          body: params.toString(),
          credentials: "include",
        });

        return await res.text();
      }, { sourceId, name });

      if (!searchResult || searchResult.includes("잘못된 접속 경로")) {
        console.log(`  ❌ 세션 만료 또는 접근 거부`);
        results[name] = { found: false, error: "session_expired" };
        continue;
      }

      if (searchResult.includes("기록이 없습니다") || searchResult.length < 1000) {
        console.log(`  ❌ 기록 없음`);
        results[name] = { found: false, records: [] };
        continue;
      }

      // 동명이인 처리
      if (searchResult.includes("name_search_result.asp")) {
        console.log(`  ⚠️ 동명이인 감지 — 배번별 재검색`);
        const bibMatches = [...searchResult.matchAll(/\b(\d{3,6})\b/g)].map((m) => m[1]);
        const uniqueBibs = [...new Set(bibMatches)].slice(0, 10);
        const records = [];

        for (const bib of uniqueBibs) {
          await new Promise((r) => setTimeout(r, 500));
          const bibResult = await page.evaluate(async ({ sourceId, bib }) => {
            const params = new URLSearchParams();
            params.append("nameorbibno", bib);
            params.append("usedata", sourceId);
            const res = await fetch("https://www.smartchip.co.kr/return_data_livephoto.asp", {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": `https://smartchip.co.kr/Search_Ballyno.html?usedata=${sourceId}`,
              },
              body: params.toString(),
              credentials: "include",
            });
            return await res.text();
          }, { sourceId, bib });

          const r = parseSmartChipHtml(bibResult, name);
          if (r) records.push(r);
        }

        console.log(`  ✅ ${records.length}건 (동명이인)`);
        results[name] = { found: records.length > 0, records };
        continue;
      }

      const record = parseSmartChipHtml(searchResult, name);
      if (record) {
        console.log(`  ✅ ${record.distance} | ${record.netTime} | bib=${record.bib}`);
        results[name] = { found: true, records: [record] };
      } else {
        console.log(`  ❌ 파싱 실패`);
        results[name] = { found: false, records: [] };
      }

    } catch (e) {
      console.log(`  ❌ 오류: ${e.message}`);
      results[name] = { found: false, error: e.message };
    }

    await new Promise((r) => setTimeout(r, 800));
  }

  await browser.close();

  // 4. 결과 출력
  console.log("\n\n=== 결과 요약 ===");
  for (const [name, r] of Object.entries(results)) {
    if (r.found && r.records?.length) {
      r.records.forEach((rec) => {
        console.log(`  ✅ ${name} | ${rec.distance} | ${rec.netTime} | bib=${rec.bib}`);
      });
    } else {
      console.log(`  ❌ ${name} | 기록 없음`);
    }
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: Firestore 저장 생략");
    process.exit(0);
  }

  // 5. search_cache 업데이트
  const now = new Date().toISOString();
  const foundNames = Object.entries(results).filter(([, r]) => r.found && r.records?.length);

  if (foundNames.length === 0) {
    console.log("\n저장할 기록 없음");
    process.exit(0);
  }

  const batch = db.batch();
  for (const [name, r] of foundNames) {
    const docId = `smartchip_${sourceId}_${name}`;
    const ref = db.collection("search_cache").doc(docId);
    batch.set(ref, {
      source: "smartchip",
      sourceId,
      realName: name,
      found: true,
      result: {
        eventName,
        eventDate,
        source: "smartchip",
        sourceId,
        records: r.records,
      },
      cachedAt: now,
      scrapedBy: "playwright",
    });
  }
  await batch.commit();
  console.log(`\n✅ search_cache 업데이트: ${foundNames.length}건`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
