/**
 * 출석 명부 외(isGuest) 알림 메일 발송 테스트
 * 사용: cd functions && node ../scripts/test-not-on-roster-email.js
 * 필요: functions/.env — GMAIL_USER, GMAIL_APP_PASSWORD, ADMIN_EMAIL
 */
const path = require("path");
const { createRequire } = require("module");
const requireFn = createRequire(path.join(__dirname, "../functions/package.json"));
requireFn("dotenv").config({ path: path.join(__dirname, "../functions/.env") });
const nodemailer = requireFn("nodemailer");

function escapeHtmlForEmail(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  const to = process.env.ADMIN_EMAIL;
  if (!to || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error("❌ functions/.env에 GMAIL_USER, GMAIL_APP_PASSWORD, ADMIN_EMAIL 필요");
    process.exit(1);
  }

  const nickname = "메일알림테스트";
  const meetingDateKey = "2099/12/01";
  const meetingTypeLabel = "토요일";
  const timeText = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  const subject = `[DMC 출석] 출석 명부에 없는 경우 — ${nickname}`;
  const html = `
<p><strong>출석 명부에 없는 경우</strong>로 출석이 기록되었습니다.</p>
<ul>
  <li><strong>닉네임:</strong> ${escapeHtmlForEmail(nickname)}</li>
  <li><strong>모임일:</strong> ${escapeHtmlForEmail(meetingDateKey)}</li>
  <li><strong>정모:</strong> ${escapeHtmlForEmail(meetingTypeLabel)}</li>
  <li><strong>출석 시각:</strong> ${escapeHtmlForEmail(timeText)}</li>
</ul>
<p>출석 명부 반영·회원 구분(정회원/준회원/신규)은 운영 명부에서 처리해 주세요.</p>
<p><a href="https://dmc-attendance.web.app/attendance-v2.html?mode=kiosk">키오스크 출석</a> ·
<a href="https://dmc-attendance.web.app/index.html">기존 출석 페이지</a></p>
<hr/>
<p style="color:#999;font-size:12px;">DMC 출석 자동 알림 (테스트 발송)</p>
`;

  console.log(`발송 중… to: ${to}`);
  console.log(`제목: ${subject}`);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"DMC Ops" <${process.env.GMAIL_USER}>`,
    to,
    subject: `[테스트] ${subject}`,
    html,
  });

  console.log("✅ 발송 완료 — 받은편지함(스팸함) 확인");
}

main().catch((e) => {
  console.error("❌ 발송 실패:", e.message);
  process.exit(1);
});
