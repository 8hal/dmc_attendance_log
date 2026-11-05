/**
 * 당신 때문에 고마웠다 — 회원 투표 폼과 운영진 결과 마크업.
 * 회원 화면에는 득표와 이유를 그리지 않는다.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ChunbaekThanks = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const THANKS_REASON_MAX = 80;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function memberSectionHtml({ voted, candidates } = {}) {
    const people = candidates || [];
    const status = voted
      ? "투표했습니다. 다시 고르면 이 표가 바뀝니다."
      : "아직 투표하지 않았습니다.";
    const options = people.length
      ? `<option value="">동료 선택</option>${people.map((person) => (
        `<option value="${escapeHtml(person.memberId)}">${escapeHtml(person.nickname || "이름 없음")}</option>`
      )).join("")}`
      : `<option value="">선택할 동료가 없습니다</option>`;
    return `<section class="section no-print" id="thanks-vote" aria-labelledby="thanks-vote-title">
      <h2 id="thanks-vote-title">당신 때문에 고마웠다</h2>
      <p class="criterion">고마웠던 동료 1명을 고릅니다. 자기 자신은 빠지고, 다시 투표하면 이전 표를 덮어씁니다. 득표와 이유는 운영진만 봅니다.</p>
      <p class="vote-status" id="thanks-vote-status">${status}</p>
      <form class="vote-form" id="thanks-vote-form">
        <label for="thanks-nominee">동료</label>
        <select id="thanks-nominee" name="nomineeMemberId">${options}</select>
        <label for="thanks-reason">짧은 이유 (선택, ${THANKS_REASON_MAX}자)</label>
        <textarea id="thanks-reason" name="reason" maxlength="${THANKS_REASON_MAX}" rows="3" placeholder="고마운 이유를 짧게"></textarea>
        <p class="vote-error" id="thanks-vote-error" role="alert"></p>
        <button type="submit" class="btn vote-submit" id="thanks-vote-submit"${people.length ? "" : " disabled"}>투표하기</button>
      </form>
    </section>`;
  }

  function finaleDateLabel(iso) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(iso || "")) ? String(iso) : "2026-11-27";
    const [year, month, day] = date.split("-").map(Number);
    const utc = new Date(Date.UTC(year, month - 1, day));
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][utc.getUTCDay()];
    return `${date} (${weekday})`;
  }

  function partyNoticeHtml(party) {
    const info = party || {};
    const place = info.place
      ? escapeHtml(info.place)
      : "운영진이 정하면 여기에 표시됩니다";
    const time = info.time
      ? escapeHtml(info.time)
      : "운영진이 정하면 여기에 표시됩니다";
    const note = info.note ? `<p class="criterion" id="party-note">${escapeHtml(info.note)}</p>` : `<p class="criterion" id="party-note"></p>`;
    return `<section class="section" id="party-facts">
      <h2>안내</h2>
      <p class="party-date" id="party-date">${escapeHtml(finaleDateLabel(info.date))}</p>
      <dl class="party-facts">
        <div><dt>장소</dt><dd id="party-place">${place}</dd></div>
        <div><dt>시간</dt><dd id="party-time">${time}</dd></div>
      </dl>
      ${note}
    </section>`;
  }

  function adminResultsHtml(payload) {
    const tally = (payload && payload.tally) || [];
    const count = payload && Number.isFinite(payload.ballotCount) ? payload.ballotCount : 0;
    if (!tally.length) {
      return `<p class="roster-loading">아직 투표가 없습니다. (${count}표)</p>`;
    }
    const cards = tally.map((row, index) => {
      const reasons = (row.reasons || []).map((reason) => {
        const text = reason.reason ? escapeHtml(reason.reason) : "이유 없음";
        return `<li>${escapeHtml(reason.voterNickname || "이름 없음")} — ${text}</li>`;
      }).join("");
      return `<article class="thanks-result">
        <h3>${index + 1}. ${escapeHtml(row.nickname || "이름 없음")} <span>${row.votes}표</span></h3>
        <ul class="thanks-reasons">${reasons}</ul>
      </article>`;
    }).join("");
    return `<p class="admin-toolbar-sub">투표 ${count}명</p>${cards}`;
  }

  return {
    THANKS_REASON_MAX,
    finaleDateLabel,
    partyNoticeHtml,
    memberSectionHtml,
    adminResultsHtml,
  };
});
