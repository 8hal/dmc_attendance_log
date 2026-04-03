const path = require("path");
const { createRequire } = require("module");
// Load dotenv/nodemailer from functions/ (deps live in functions/package.json)
const requireFn = createRequire(path.join(__dirname, "../functions/package.json"));
requireFn("dotenv").config({ path: path.join(__dirname, "../functions/.env") });
const nodemailer = requireFn("nodemailer");

async function testEmail() {
  const to = process.env.ADMIN_EMAIL;

  if (!to || !process.env.GMAIL_USER) {
    console.error(".env 파일에 GMAIL_USER, ADMIN_EMAIL 설정 필요");
    return;
  }

  console.log(`테스트 이메일 발송 중... (to: ${to})`);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"DMC Ops Test" <${process.env.GMAIL_USER}>`,
    to,
    subject: "[테스트] ops.html 이메일 알림",
    html: "<h2>테스트 이메일</h2><p>이메일 발송이 정상 동작합니다.</p>",
  });

  console.log("✅ 발송 완료! 받은편지함 확인하세요.");
}

testEmail().catch(console.error);
