#!/usr/bin/env node
/**
 * 춘백 운영진 목업 PC 스크린샷
 * 사용: node scripts/capture-chunbaek-admin-mockup.js
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "chunbaek", "screenshots", "admin");
const PORT = 9877;
const BASE = `http://127.0.0.1:${PORT}/chunbaek/admin.html?preview=1`;

const SCREENS = [
  { id: "01-auth", panel: "auth", label: "⓪ 비밀번호" },
  { id: "02-grid", panel: "grid", label: "① 출석 그리드" },
  { id: "03-training", panel: "training", label: "② 훈련 입력" },
  { id: "04-import", panel: "import", label: "③ 일괄 import" },
  { id: "05-cell-modal", panel: "grid-modal", label: "셀 모달" },
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
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: "ko-KR",
  });
  const page = await context.newPage();

  for (const screen of SCREENS) {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate((panel) => {
      sessionStorage.setItem("chunbaekAdminPreviewAuth", "1");
      if (panel === "auth") {
        document.getElementById("auth-overlay").classList.remove("hidden");
        document.getElementById("admin-shell").style.display = "none";
        return;
      }
      document.getElementById("auth-overlay").classList.add("hidden");
      document.getElementById("admin-shell").style.display = "";
      if (panel === "grid" || panel === "grid-modal") {
        document.querySelector('[data-panel="grid"]').click();
      } else if (panel === "training") {
        document.querySelector('[data-panel="training"]').click();
      } else if (panel === "import") {
        document.querySelector('[data-panel="import"]').click();
      }
      if (panel === "grid-modal") {
        const cell = document.querySelector("#grid-body td.cell-attend, #grid-body td.cell");
        if (cell) cell.click();
      }
    }, screen.panel);
    await page.waitForTimeout(350);
    await page.addStyleTag({
      content: ".admin-demo-nav { display: none !important; }",
    });
    const out = path.join(OUT_DIR, `${screen.id}.png`);
    await page.screenshot({ path: out, fullPage: screen.panel === "grid" || screen.panel === "grid-modal" });
    console.log(`✓ ${screen.label} → ${path.relative(ROOT, out)}`);
  }

  await browser.close();
  server.close();
  console.log("\n완료:", OUT_DIR);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
