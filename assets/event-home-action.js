(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EventHomeAction = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  /**
   * Chunbaek-style "what to do now" for group event member home.
   * Priority: identity → outbound → bib → waiting/confirm (return bus secondary)
   * → return bus after confirm → done.
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

  const PROFILE_DISTANCES = Object.freeze([
    "full",
    "half",
    "10K",
    "5K",
    "3K",
    "30K",
    "32K",
    "ultra",
  ]);

  function trimField(value) {
    return value == null ? "" : String(value).trim();
  }

  function emptyCardExtras() {
    return {
      showManual: false,
      showPb: false,
      largeBib: false,
      ctaLabel: null,
      ctaHref: null,
      secondaryHref: null,
    };
  }

  function resolveProfileCard(ctx) {
    const participant = ctx && ctx.participant ? ctx.participant : null;
    const confirmMode = ctx && ctx.confirmMode ? String(ctx.confirmMode) : "none";
    const intent = ctx && ctx.intent ? String(ctx.intent) : "";
    const manualKind =
      ctx && ctx.manualKind ? String(ctx.manualKind).toLowerCase() : "";

    if (ctx && ctx.isGuest) {
      return Object.assign(emptyCardExtras(), {
        state: "guest",
        prompt: "지인 탑승은 대회 기록에 남지 않아요.",
      });
    }

    if (confirmMode === "confirmed") {
      return Object.assign(emptyCardExtras(), {
        state: "confirmed",
        prompt: "끝. 동마클 대회 기록에 저장됐어요.",
      });
    }

    if (intent === "reject") {
      return Object.assign(emptyCardExtras(), {
        state: "bib",
        prompt: "배번과 종목을 넣어 주세요.",
        showManual: false,
      });
    }

    if (intent === "manual") {
      return Object.assign(emptyCardExtras(), {
        state: "manual",
        prompt: "",
        showPb: manualKind === "finish",
      });
    }

    const bib = participant ? trimField(participant.bib) : "";
    const distance = participant ? trimField(participant.distance) : "";
    if (!bib || !distance) {
      return Object.assign(emptyCardExtras(), {
        state: "bib",
        prompt: "배번과 종목을 넣어 주세요.",
      });
    }

    if (confirmMode === "pending") {
      return Object.assign(emptyCardExtras(), {
        state: "pending",
        prompt: "고생했어요. 이 기록이 맞나요?",
        showManual: true,
        showPb: true,
        largeBib: true,
      });
    }

    return Object.assign(emptyCardExtras(), {
      state: "wait",
      prompt: "기록이 올라오면 여기서 확인해요.",
      showManual: true,
      largeBib: true,
    });
  }

  function busLeg(legs, name) {
    const row = legs && legs[name] ? legs[name] : {};
    return {
      required: row.required === true,
      boarded: row.boarded === true,
    };
  }

  function busCard(state, extras) {
    return Object.assign(
      {
        state: state,
        prompt: null,
        leg: null,
        ctaLabel: null,
      },
      extras || {}
    );
  }

  function resolveBusCard(ctx) {
    const openLeg = ctx && ctx.openLeg != null ? ctx.openLeg : null;
    const busRow = ctx && ctx.busRow ? ctx.busRow : null;
    if (!busRow) {
      return busCard("missing", {
        prompt:
          "이번 대회 버스 명단에 없습니다. 버스 탑승 예정이면 총무에게 문의하세요.",
      });
    }

    const legs = busRow.legs || {};
    const outbound = busLeg(legs, "outbound");
    const ret = busLeg(legs, "return");

    if (openLeg === "return" && ret.required) {
      if (ret.boarded) {
        return busCard("return_done", { leg: "return" });
      }
      return busCard("ready", { leg: "return", ctaLabel: "탑승하기" });
    }

    if (openLeg === "outbound" && outbound.required && !outbound.boarded) {
      return busCard("ready", { leg: "outbound", ctaLabel: "탑승하기" });
    }

    if (outbound.required && !outbound.boarded) {
      return busCard("locked", {
        prompt: "가는 버스 탑승 시간이 아닙니다.",
        leg: "outbound",
      });
    }

    if (outbound.boarded && ret.required && openLeg !== "return") {
      return busCard("outbound_done", { leg: "outbound" });
    }

    if (ret.required) {
      return busCard("locked", {
        prompt: "오는 버스 탑승 시간이 아닙니다.",
        leg: "return",
      });
    }

    if (outbound.boarded) {
      return busCard("outbound_done", { leg: "outbound" });
    }

    return busCard("locked", {
      prompt: "가는 버스 탑승 시간이 아닙니다.",
    });
  }

  function nickFrom(row) {
    return row && row.nickname != null ? String(row.nickname).trim() : "";
  }

  function pickNicknames(ctx) {
    const boardLanding = !!(ctx && ctx.boardLanding);
    const openLeg = ctx && ctx.openLeg;
    const participants = (ctx && ctx.participants) || [];
    const roster = (ctx && ctx.roster) || [];

    if (boardLanding) {
      const nicks = [];
      const seen = new Set();
      roster.forEach(function (row) {
        const nick = nickFrom(row);
        if (!nick || seen.has(nick)) return;
        const legs = row.legs || {};
        const leg = openLeg && legs[openLeg] ? legs[openLeg] : null;
        if (leg && leg.required === true) {
          seen.add(nick);
          nicks.push(nick);
        }
      });
      return nicks;
    }

    const seen = new Set();
    const nicks = [];
    function add(row) {
      const nick = nickFrom(row);
      if (!nick || seen.has(nick)) return;
      seen.add(nick);
      nicks.push(nick);
    }
    participants.forEach(add);
    roster.forEach(add);
    return nicks;
  }

  return {
    resolveNextAction,
    pageHref,
    resolveProfileCard,
    resolveBusCard,
    pickNicknames,
    PROFILE_DISTANCES,
  };
});
