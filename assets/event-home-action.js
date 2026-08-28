(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EventHomeAction = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  /**
   * Member home shows four independent tasks. Sequential "what to do now"
   * stays in resolveNextAction for older callers/tests.
   */
  function returnBusOpen(busEnabled, busRow) {
    if (!busEnabled || !busRow || !busRow.legs) return false;
    const ret = busRow.legs.return;
    return !!(ret && ret.required === true && ret.boarded !== true);
  }

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
          "집합 장소에서 탑승을 눌러 주세요",
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
        "배번을 넣으면 경기 후 기록을 가져올 수 있어요",
        "배번 입력",
        "bib"
      );
    }

    if (confirmMode === "pending") {
      const pending = {
        kind: "confirm_pending",
        kicker: "기록 준비됨",
        title: "내 기록",
        desc: "기록이 맞으면 확정하세요. 명단·결과에 반영됩니다",
        ctaLabel: "기록 확인하기",
        ctaKind: "confirm",
        ctaHref: null,
        done: false,
      };
      if (returnBusOpen(busEnabled, busRow)) {
        pending.secondaryLabel = "오는 버스 탑승";
        pending.secondaryHref = "boardingReturn";
      }
      return pending;
    }

    if (confirmMode === "confirmed" && returnBusOpen(busEnabled, busRow)) {
      return actionLink(
        "bus_return",
        "지금",
        "오는 버스",
          "오는 버스에 탈 때 탑승을 눌러 주세요",
          "탑승하기",
        "boardingReturn"
      );
    }

    if (confirmMode === "confirmed") {
      return {
        kind: "all_done",
        kicker: "완료",
        title: "수고하셨어요",
        desc: "대회 기록이 반영되었습니다. 명단·결과에서 확인하세요",
        ctaLabel: "확정 완료 ✓",
        ctaKind: "done",
        ctaHref: null,
        secondaryLabel: "명단·결과 보기",
        secondaryHref: "roster",
        done: true,
      };
    }

    const waiting = {
      kind: "waiting_result",
      kicker: "대기",
      title: "기록 준비 중",
      desc: "경기가 끝나면 기록이 여기 올라옵니다. 그때 다시 확인해 주세요",
      ctaLabel: "다시 확인",
      ctaKind: "reload",
      ctaHref: null,
      secondaryLabel: "명단·결과 보기",
      secondaryHref: "roster",
      done: false,
    };
    if (returnBusOpen(busEnabled, busRow)) {
      waiting.secondaryLabel = "오는 버스 탑승";
      waiting.secondaryHref = "boardingReturn";
    }
    return waiting;
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
    if (hrefKey === "boarding") return "boarding.html" + q + "&leg=outbound";
    if (hrefKey === "boardingReturn") return "boarding.html" + q + "&leg=return";
    if (hrefKey === "bib") return "my-bib.html" + q;
    if (hrefKey === "roster") return "event-roster.html" + q;
    if (hrefKey === "home") return "event-home.html" + q;
    return "#";
  }

  function busTask(id, title, leg, hrefKey, ctx) {
    const busEnabled = !!(ctx && ctx.busEnabled);
    const busRow = ctx && ctx.busRow ? ctx.busRow : null;
    const st = busRow && busRow.legs ? busRow.legs[leg] : null;
    if (st && st.required !== true) {
      return {
        id,
        title,
        state: "skip",
        hint: "이번 편은 해당 없음",
        ctaLabel: null,
        ctaKind: null,
        hrefKey: null,
      };
    }
    if (st && st.boarded === true) {
      return {
        id,
        title,
        state: "done",
        hint: "탑승 완료",
        ctaLabel: null,
        ctaKind: null,
        hrefKey: null,
      };
    }
    if (!busEnabled) {
      return {
        id,
        title,
        state: "locked",
        hint: "총무가 열면 탑승할 수 있어요",
        ctaLabel: null,
        ctaKind: null,
        hrefKey: null,
      };
    }
    if (!st) {
      return {
        id,
        title,
        state: "skip",
        hint: "버스 명단에 없습니다",
        ctaLabel: null,
        ctaKind: null,
        hrefKey: null,
      };
    }
    return {
      id,
      title,
      state: "ready",
      hint: "지금 탑승하세요",
      ctaLabel: "탑승하기",
      ctaKind: "link",
      hrefKey,
    };
  }

  function resolveHomeTasks(ctx) {
    const participant = ctx && ctx.participant ? ctx.participant : null;
    const bib =
      participant && participant.bib != null ? String(participant.bib).trim() : "";
    const confirmMode = ctx && ctx.confirmMode ? ctx.confirmMode : "none";

    const bibTask = bib
      ? {
          id: "bib",
          title: "배번 입력",
          state: "done",
          hint: "배번 " + bib,
          ctaLabel: null,
          ctaKind: null,
          hrefKey: null,
        }
      : {
          id: "bib",
          title: "배번 입력",
          state: "ready",
          hint: "배번을 넣으면 경기 후 기록을 가져올 수 있어요",
          ctaLabel: "입력하기",
          ctaKind: "link",
          hrefKey: "bib",
        };

    let confirmTask;
    if (confirmMode === "confirmed") {
      confirmTask = {
        id: "confirm",
        title: "기록 확인",
        state: "done",
        hint: "확정 완료",
        ctaLabel: null,
        ctaKind: null,
        hrefKey: null,
      };
    } else if (confirmMode === "pending") {
      confirmTask = {
        id: "confirm",
        title: "기록 확인",
        state: "ready",
        hint: "기록이 맞으면 확정하세요",
        ctaLabel: "기록 확인하기",
        ctaKind: "confirm",
        hrefKey: null,
      };
    } else {
      confirmTask = {
        id: "confirm",
        title: "기록 확인",
        state: "locked",
        hint: "기록이 수집되면 확인할 수 있어요",
        ctaLabel: null,
        ctaKind: null,
        hrefKey: null,
      };
    }

    return [
      busTask("bus_outbound", "가는 버스 탑승", "outbound", "boarding", ctx),
      bibTask,
      busTask("bus_return", "오는 버스 탑승", "return", "boardingReturn", ctx),
      confirmTask,
    ];
  }

  return {
    resolveNextAction,
    resolveHomeTasks,
    pageHref,
  };
});
