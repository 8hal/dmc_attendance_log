#!/usr/bin/env node
/**
 * 춘백 목업 모바일 스크린샷 — 방장 공유용
 * 사용: node scripts/capture-chunbaek-mockup.js
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "chunbaek", "screenshots");
const PORT = 9876;
const BASE = `http://127.0.0.1:${PORT}/chunbaek/?preview=1`;

const SCREENS = [
  { id: "01-welcome", hash: "#/welcome", label: "① 환영" },
  { id: "02-pick", hash: "#/pick", label: "② 명단" },
  { id: "03-profile", hash: "#/profile", label: "③ 프로필" },
  { id: "04-guide", hash: "#/guide", label: "④ 가이드" },
  { id: "05-home", hash: "#/today", label: "⑤ 홈" },
  { id: "06-timeline", hash: "#/timeline", label: "내 100일" },
  { id: "07-team", hash: "#/team", label: "팀" },
  { id: "08-me", hash: "#/me", label: "나" },
];

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split("?")[0]);
      if (urlPath === "/" || urlPath === "/chunbaek" || urlPath === "/chunbaek/") {
        urlPath = "/chunbaek/index.html";
      }
      const filePath = path.normalize(path.join(ROOT, urlPath.replace(/^\//, "")));
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        return res.end();
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          return res.end("not found");
        }
        const ext = path.extname(filePath);
        const types = {
          ".html": "text/html; charset=utf-8",
          ".css": "text/css",
          ".js": "application/javascript",
        };
        res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "ko-KR",
  });

  for (const screen of SCREENS) {
    const page = await context.newPage();
    await page.goto(`${BASE}${screen.hash}`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      localStorage.setItem("chunbaekSessionToken", "preview-token");
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.addStyleTag({
      content: ".demo-nav { display: none !important; }",
    });
    const out = path.join(OUT_DIR, `${screen.id}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`✓ ${screen.label} → ${path.relative(ROOT, out)}`);
    await page.close();
  }

  await browser.close();
  server.close();
  console.log(`\n완료: ${OUT_DIR}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
