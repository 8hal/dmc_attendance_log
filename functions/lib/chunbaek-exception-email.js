"use strict";

const ADMIN_PAGE_URL = "https://dmc-attendance.web.app/chunbaek/admin.html";

function escapeHtmlForEmail(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeSubjectPart(s) {
  return String(s || "").replace(/[\r\n]+/g, " ").trim();
}

/**
 * 예외 상신 운영진 알림 메일 제목·본문 생성 (순수 함수 — 단위 테스트용)
 */
function buildExceptionRequestAlertEmail({
  nickname,
  reason,
  startDate,
  endDate,
  requestId,
}) {
  const nick = sanitizeSubjectPart(nickname) || "(닉네임 없음)";
  const subject = `[춘백 예외 요청] ${nick} · ${startDate}~${endDate}`;
  const html = `
<p><strong>춘백 출석 예외 요청</strong>이 접수되었습니다.</p>
<ul>
  <li><strong>닉네임:</strong> ${escapeHtmlForEmail(nickname)}</li>
  <li><strong>기간:</strong> ${escapeHtmlForEmail(startDate)} ~ ${escapeHtmlForEmail(endDate)}</li>
  <li><strong>사유:</strong> ${escapeHtmlForEmail(reason)}</li>
  <li><strong>요청 ID:</strong> ${escapeHtmlForEmail(requestId)}</li>
</ul>
<p><a href="${ADMIN_PAGE_URL}">춘백 운영진 — 예외 요청 확인</a></p>
<hr/>
<p style="color:#999;font-size:12px;">춘백 예외 상신 자동 알림</p>
`;
  return { subject, html };
}

async function defaultSendEmail({ to, subject, html }) {
  const nodemailer = require("nodemailer");
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
    subject,
    html,
  });
}

/**
 * 예외 상신 성공 후 운영진 메일 발송.
 * env 미설정 시 생략. 실패해도 throw하지 않음(호출부는 fire-and-forget 권장).
 *
 * @returns {{ sent: boolean, skipped?: boolean, error?: string }}
 */
async function sendExceptionRequestAlertEmail(payload, opts = {}) {
  const sendEmailFn = opts.sendEmailFn || defaultSendEmail;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("[exceptionRequestEmail] GMAIL/ADMIN_EMAIL 미설정 — 알림 생략");
    return { sent: false, skipped: true };
  }

  const { subject, html } = buildExceptionRequestAlertEmail(payload);
  try {
    await sendEmailFn({ to: adminEmail, subject, html });
    return { sent: true };
  } catch (err) {
    console.error("[exceptionRequestEmail] 발송 실패:", err && err.message ? err.message : err);
    return { sent: false, error: String(err && err.message ? err.message : err) };
  }
}

/**
 * fire-and-forget 래퍼 — 상신 API 응답을 막지 않음
 */
function notifyExceptionRequestCreated(payload) {
  sendExceptionRequestAlertEmail(payload).catch((err) => {
    console.error("[exceptionRequestEmail] unexpected:", err && err.message ? err.message : err);
  });
}

module.exports = {
  buildExceptionRequestAlertEmail,
  sendExceptionRequestAlertEmail,
  notifyExceptionRequestCreated,
  ADMIN_PAGE_URL,
};
