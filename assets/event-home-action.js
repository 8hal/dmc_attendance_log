(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EventHomeAction = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
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
        prompt: "대회 기록 자동 수집을 위해 배번과 종목을 입력해주세요.",
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
        prompt: "대회 기록 자동 수집을 위해 배번과 종목을 입력해주세요.",
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
      prompt: "대회가 종료되면 기록을 자동 수집합니다. 대회 종료 후 기록을 확정해주세요!",
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

  function pageHref(hrefKey, eventId) {
    if (!eventId) return "#";
    const q = "?eventId=" + encodeURIComponent(eventId);
    if (hrefKey === "boarding") return "event-home.html" + q + "&board=1";
    if (hrefKey === "boardingReturn") return "event-home.html" + q + "&board=1";
    if (hrefKey === "bib") return "my-bib.html" + q;
    if (hrefKey === "roster") return "event-roster.html" + q;
    if (hrefKey === "home") return "event-home.html" + q;
    return "#";
  }

  /** Club side is always 동탄. leg: outbound|return; done → · 탑승 완료 */
  function busRouteTitle(opts) {
    const leg = opts && opts.leg;
    const done = !!(opts && opts.done);
    const dest = trimField(opts && opts.destination) || "대회";
    const route =
      leg === "return" ? dest + " → 동탄" : "동탄 → " + dest;
    return done ? route + " · 탑승 완료" : route;
  }

  return {
    resolveProfileCard,
    resolveBusCard,
    pickNicknames,
    PROFILE_DISTANCES,
    pageHref,
    busRouteTitle,
  };
});
