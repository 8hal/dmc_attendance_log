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

  function candidateMatches(nickname, query) {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return true;
    return String(nickname || "").toLowerCase().includes(needle);
  }

  function memberSectionHtml({ voted, candidates, selectedMemberId, draftReason } = {}) {
    const people = [...(candidates || [])].sort((a, b) => (
      String(a.nickname || "").localeCompare(String(b.nickname || ""), "ko")
    ));
    const selectedId = String(selectedMemberId || "");
    const hasSelection = people.some((person) => person.memberId === selectedId);
    const status = voted
      ? "투표했습니다. 다시 고르면 이 표가 바뀝니다."
      : "아직 투표하지 않았습니다.";
    const cards = people.map((person) => {
      const nickname = person.nickname || "이름 없음";
      const checked = person.memberId === selectedId ? " checked" : "";
      return `<label class="thanks-card" data-name="${escapeHtml(nickname)}">
        <input type="radio" name="nomineeMemberId" value="${escapeHtml(person.memberId)}"${checked} />
        <span class="thanks-card-name">${escapeHtml(nickname)}</span>
      </label>`;
    }).join("");
    const grid = people.length
      ? `<div class="thanks-grid" role="radiogroup" aria-label="동료">${cards}</div>
        <p class="thanks-empty" id="thanks-search-empty" hidden>검색 결과가 없습니다.</p>`
      : `<p class="thanks-empty">선택할 동료가 없습니다.</p>`;
    return `<section class="section thanks-vote no-print" id="thanks-vote" aria-labelledby="thanks-vote-title">
      <div class="thanks-head">
        <h2 id="thanks-vote-title">당신 때문에 고마웠다</h2>
        <sl-badge id="thanks-vote-status" variant="${voted ? "success" : "neutral"}" pill>${status}</sl-badge>
      </div>
      <p class="criterion">고마웠던 춘백방 회원 1명을 골라주세요</p>
      <form class="vote-form" id="thanks-vote-form">
        <sl-input id="thanks-search" label="동료 검색" placeholder="이름으로 찾기" clearable></sl-input>
        ${grid}
        <sl-textarea id="thanks-reason" name="reason" label="짧은 이유 (선택)" placeholder="고마운 이유를 짧게" maxlength="${THANKS_REASON_MAX}" rows="3" help-text="${THANKS_REASON_MAX}자 이내. 적지 않아도 됩니다." value="${escapeHtml(draftReason || "")}"></sl-textarea>
        <p class="vote-error" id="thanks-vote-error" role="alert"></p>
        <sl-button type="submit" variant="primary" size="large" id="thanks-vote-submit"${hasSelection ? "" : " disabled"}>${voted ? "다시 투표하기" : "투표하기"}</sl-button>
      </form>
    </section>`;
  }

  function bindThanksVote(root) {
    if (!root) return;
    const search = root.querySelector("#thanks-search");
    const cards = [...root.querySelectorAll(".thanks-card")];
    const empty = root.querySelector("#thanks-search-empty");
    const button = root.querySelector("#thanks-vote-submit");
    const radios = [...root.querySelectorAll('input[name="nomineeMemberId"]')];

    const syncSubmit = () => {
      if (!button) return;
      button.disabled = !radios.some((radio) => radio.checked);
    };
    radios.forEach((radio) => radio.addEventListener("change", syncSubmit));
    syncSubmit();

    if (!search) return;
    const applySearch = () => {
      const query = search.value || "";
      let visible = 0;
      cards.forEach((card) => {
        const show = candidateMatches(card.dataset.name || "", query);
        card.hidden = !show;
        if (show) visible += 1;
      });
      if (empty) empty.hidden = visible !== 0;
    };
    search.addEventListener("sl-input", applySearch);
    search.addEventListener("input", applySearch);
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
    candidateMatches,
    memberSectionHtml,
    bindThanksVote,
    adminResultsHtml,
  };
});
