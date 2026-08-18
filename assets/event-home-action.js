(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EventHomeAction = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  /**
   * Chunbaek-style "what to do now" for group event member home.
   * Priority: identity → outbound bus → bib → confirm → return bus → done / waiting.
   */
  function resolveNextAction(ctx) {
    const nickname = ctx && ctx.nickname ? String(ctx.nickname).trim() : "";
    const busEnabled = !!(ctx && ctx.busEnabled);
    const busRow = ctx && ctx.busRow ? ctx.busRow : null;
    const participant = ctx && ctx.participant ? ctx.participant : null;
    const confirmMode = ctx && ctx.confirmMode ? ctx.confirmMode : "none";

    if (!nickname) {
      return {
        kind: "pick_identity",
        kicker: "시작",
        title: "당신은 누구신가요?",
        desc: "명단에서 본인 닉네임을 선택하세요",
        ctaLabel: null,
        ctaKind: "none",
        ctaHref: null,
        done: false,
      };
    }

    if (busEnabled && busRow && busRow.legs) {
      const outbound = busRow.legs.outbound;
      if (outbound && outbound.required === true && outbound.boarded !== true) {
        return actionLink(
          "bus_outbound",
          "지금",
          "가는 버스",
          "집합 장소에서 탑승 체크를 해 주세요",
          "탑승하기",
          "boarding"
        );
      }
    }

    const bib =
      participant && participant.bib != null ? String(participant.bib).trim() : "";
    if (!bib) {
      return actionLink(
        "bib",
        "지금",
        "배번 입력",
        "대회 배번을 입력하면 기록을 가져올 수 있어요",
        "배번 입력",
        "bib"
      );
    }

    if (confirmMode === "pending") {
      return {
        kind: "confirm_pending",
        kicker: "기록 준비됨",
        title: "내 기록",
        desc: "확인 후 컨펌하면 명단·결과에 반영됩니다",
        ctaLabel: "내 기록 확인 · 컨펌",
        ctaKind: "confirm",
        ctaHref: null,
        done: false,
      };
    }

    if (busEnabled && busRow && busRow.legs) {
      const ret = busRow.legs.return;
      if (ret && ret.required === true && ret.boarded !== true) {
        return actionLink(
          "bus_return",
          "지금",
          "오는 버스",
          "복귀 버스 탑승 체크를 해 주세요",
          "탑승하기",
          "boarding"
        );
      }
    }

    if (confirmMode === "confirmed") {
      return {
        kind: "all_done",
        kicker: "완료",
        title: "수고하셨어요",
        desc: "대회기록이 반영되었습니다. 명단·결과에서 확인하세요",
        ctaLabel: "컨펌 완료 ✓",
        ctaKind: "done",
        ctaHref: null,
        done: true,
      };
    }

    return {
      kind: "waiting_result",
      kicker: "대기",
      title: "기록 준비 중",
      desc: "경기 후 기록이 올라오면 여기서 컨펌할 수 있어요",
      ctaLabel: null,
      ctaKind: "none",
      ctaHref: null,
      secondaryLabel: "명단·결과 보기",
      secondaryHref: "roster",
      done: false,
    };
  }

  function actionLink(kind, kicker, title, desc, ctaLabel, hrefKey) {
    return {
      kind,
      kicker,
      title,
      desc,
      ctaLabel,
      ctaKind: "link",
      ctaHref: hrefKey,
      done: false,
    };
  }

  function pageHref(hrefKey, eventId) {
    if (!eventId) return "#";
    const q = "?eventId=" + encodeURIComponent(eventId);
    if (hrefKey === "boarding") return "boarding.html" + q;
    if (hrefKey === "bib") return "my-bib.html" + q;
    if (hrefKey === "roster") return "event-roster.html" + q;
    if (hrefKey === "home") return "event-home.html" + q;
    return "#";
  }

  return {
    resolveNextAction,
    pageHref,
  };
});
