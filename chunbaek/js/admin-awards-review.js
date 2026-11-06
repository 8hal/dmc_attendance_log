/**
 * 운영진 시상 화면 — 시즌 출석 검수, 목표 입력 현황, 커피 집계.
 * 커피 원문과 입력 기능은 없다. 집계는 서버가 시즌 기간으로 걸러 보낸다.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ChunbaekAwardsReview = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const GOAL_TIME_MIN_SEC = 7200;
  const GOAL_TIME_MAX_SEC = 25200;
  const PROGRAM_START_DATE = "2026-07-26";
  const ATTENDANCE_END_DATE = "2026-10-24";
  const RACE_LABELS = {
    chuncheon: "춘천 마라톤",
    jtbc: "JTBC 서울마라톤",
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isValidGoalTime(seconds) {
    const n = Number(seconds);
    return Number.isFinite(n) && n >= GOAL_TIME_MIN_SEC && n <= GOAL_TIME_MAX_SEC;
  }

  function hasGoalRace(member) {
    return member.goalRace === "chuncheon"
      || member.goalRace === "jtbc"
      || member.goalRace === "other";
  }

  function isGoalMissing(member) {
    return !member.profileComplete || !isValidGoalTime(member.goalMarathonNetTime) || !hasGoalRace(member);
  }

  function formatHms(seconds) {
    if (!isValidGoalTime(seconds) && !(Number.isFinite(Number(seconds)) && Number(seconds) > 0)) {
      return "";
    }
    const n = Math.round(Number(seconds));
    if (!Number.isFinite(n) || n < 0) return "";
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const s = n % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function formatStoredTime(seconds) {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n <= 0) return "";
    return formatHms(n);
  }

  function raceLabel(member) {
    if (member.goalRace === "chuncheon" || member.goalRace === "jtbc") {
      return RACE_LABELS[member.goalRace];
    }
    if (member.goalRace === "other") {
      const note = String(member.goalRaceNote || "").trim();
      return note ? `기타: ${note}` : "기타";
    }
    return "";
  }

  function targetText(target) {
    const n = Number(target);
    if (!Number.isFinite(n)) return "";
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function weekDetailText(week) {
    if (!week || !(Number(week.target) > 0)) {
      return `${week.week}주 유효 훈련일 없음`;
    }
    const score = Number(week.weekScore).toFixed(1);
    const head = `${week.week}주 ${score}/${targetText(week.target)}점`;
    if (week.met) return `${head} 달성`;
    return `${head} 미달 · 출석 ${week.attendCount}일 · 예외 ${week.exceptionCount}일`;
  }

  function missedWeeks(member) {
    return (member.weeks || []).filter((week) => Number(week.target) > 0 && !week.met);
  }

  function sortAttendanceRows(members) {
    return [...(members || [])].sort((a, b) => {
      const diff = missedWeeks(b).length - missedWeeks(a).length;
      if (diff) return diff;
      return String(a.nickname || "").localeCompare(String(b.nickname || ""), "ko");
    });
  }

  function sortGoalRows(members) {
    return [...(members || [])].sort((a, b) => {
      const miss = Number(isGoalMissing(a)) - Number(isGoalMissing(b));
      if (miss) return -miss;
      return String(a.nickname || "").localeCompare(String(b.nickname || ""), "ko");
    });
  }

  function matchesQuery(member, query) {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return true;
    return String(member.nickname || "").toLowerCase().includes(needle);
  }

  function filterAttendance(members, mode) {
    return (members || []).filter((member) => {
      const missed = missedWeeks(member).length;
      if (mode === "missed") return missed > 0;
      if (mode === "clear") return (member.weeks || []).length > 0 && missed === 0;
      if (mode === "low-days") return Number(member.seasonAttendCount) < 4;
      return true;
    });
  }

  function filterGoals(members, mode) {
    return (members || []).filter((member) => {
      if (mode === "missing") return isGoalMissing(member);
      if (mode === "complete") return !isGoalMissing(member);
      if (mode === "no-race") return !hasGoalRace(member);
      if (mode === "no-pb") return !(Number(member.existingPbNetTime) > 0);
      return true;
    });
  }

  function attendanceTableHtml(members) {
    const rows = sortAttendanceRows(members);
    if (!rows.length) return `<p class="review-empty">해당하는 회원이 없습니다.</p>`;
    return `<table class="review-table">
      <thead>
        <tr>
          <th>닉네임</th>
          <th>출석 일수</th>
          <th>예외 일수</th>
          <th>출석률</th>
          <th>달성 주차</th>
          <th>미달 주차</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((member) => {
          const missed = missedWeeks(member);
          const chips = missed.length
            ? missed.map((week) => `<button type="button" class="review-chip miss" data-open-week="${week.week}">${week.week}주</button>`).join("")
            : `<span class="review-chip ok">전 주차 달성</span>`;
          const details = (member.weeks || []).map((week) => (
            `<li class="${week.met ? "met" : "miss"}">${escapeHtml(weekDetailText(week))}</li>`
          )).join("");
          return `<tr class="review-row" data-review-toggle="${escapeHtml(member.memberId)}">
            <td>${escapeHtml(member.nickname || "이름 없음")}</td>
            <td>${Number(member.seasonAttendCount) || 0}</td>
            <td>${Number(member.seasonExceptionCount) || 0}</td>
            <td>${Number(member.seasonAttendRate) || 0}%</td>
            <td>${Number(member.seasonWeeksMetCount) || 0}/${Number(member.seasonWeeksCount) || 0}</td>
            <td>${chips}</td>
          </tr>
          <tr class="review-detail" data-review-detail="${escapeHtml(member.memberId)}" hidden>
            <td colspan="6"><ul class="review-weeks">${details}</ul></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
  }

  function placeholderNetSec() {
    if (typeof module === "object" && module.exports) {
      return require("./finale").PLACEHOLDER_NET_SEC;
    }
    return window.ChunbaekFinale.PLACEHOLDER_NET_SEC;
  }

  function seasonStatusLabel(status) {
    const lib = typeof module === "object" && module.exports
      ? require("./team-season")
      : window.ChunbaekTeamSeason;
    return lib && lib.seasonResultStatusLabel(status) || "";
  }

  function goalOutcomeLabel(member) {
    if (!isValidGoalTime(member && member.goalMarathonNetTime)) return "목표 없음";
    const sr = member && member.seasonResult;
    if (!sr || !sr.status) return "아직 없음";
    const net = Number(sr.netTimeSec);
    if (sr.status === "finisher" && net === placeholderNetSec()) return "집계 대기";
    if (sr.status === "finisher" && sr.goalMet === true) return "달성";
    if (sr.status === "finisher" && sr.goalMet === false && Number.isFinite(net)) return "미달";
    return seasonStatusLabel(sr.status) || "아직 없음";
  }

  function goalTableHtml(members) {
    const rows = sortGoalRows(members);
    if (!rows.length) return `<p class="review-empty">해당하는 회원이 없습니다.</p>`;
    return `<table class="review-table">
      <thead>
        <tr>
          <th>닉네임</th>
          <th>입력</th>
          <th>대회</th>
          <th>목표 시간</th>
          <th>달성 여부</th>
          <th>PB</th>
          <th>다짐</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((member) => {
          const missing = isGoalMissing(member);
          const pb = formatStoredTime(member.existingPbNetTime);
          return `<tr class="${missing ? "goal-missing" : ""}">
            <td>${escapeHtml(member.nickname || "이름 없음")}</td>
            <td>${missing ? "미입력" : "입력"}</td>
            <td>${escapeHtml(raceLabel(member) || "없음")}</td>
            <td>${escapeHtml(isValidGoalTime(member.goalMarathonNetTime) ? formatHms(member.goalMarathonNetTime) : "없음")}</td>
            <td>${escapeHtml(goalOutcomeLabel(member))}</td>
            <td>${pb ? escapeHtml(pb) : "없음"}</td>
            <td>${escapeHtml(member.resolutionText || "")}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
  }

  function reviewSectionHtml(payload, attendanceMode, goalMode, query) {
    const members = (payload && payload.members) || [];
    const start = (payload && payload.programStartDate) || PROGRAM_START_DATE;
    const end = (payload && payload.attendanceEndDate) || ATTENDANCE_END_DATE;
    const example = payload && payload.example
      ? `<p class="review-example">예시 데이터입니다. 실제 회원이 아닙니다.</p>`
      : "";
    const attendance = filterAttendance(members.filter((member) => matchesQuery(member, query)), attendanceMode);
    const goals = filterGoals(members.filter((member) => matchesQuery(member, query)), goalMode);
    return `${example}
      <section class="review-block" id="attendance-review">
        <h3>시즌 출석 검수</h3>
        <p class="review-note">공식 출석 ${escapeHtml(start)} ~ ${escapeHtml(end)}. 출석 1점, 예외 0.5점. 그 주 목표는 3점과 그 주 훈련일 수 중 작은 값입니다. 베타 주, 휴무, 이 기간 밖은 유효 주차에 넣지 않습니다.</p>
        ${attendanceTableHtml(attendance)}
      </section>
      <section class="review-block" id="goal-review">
        <h3>목표 입력 현황</h3>
        <p class="review-note">목표 시간은 풀코스 넷타임 ${formatHms(GOAL_TIME_MIN_SEC)}~${formatHms(GOAL_TIME_MAX_SEC)}입니다. PB는 없어도 입력 완료입니다. 목표 거리 항목은 없습니다.</p>
        ${goalTableHtml(goals)}
      </section>`;
  }

  function coffeeNoteText(coffee) {
    if (!coffee) return "커피 요약이 없습니다.";
    if (coffee.example) return "예시 데이터입니다. 실제 회원이 아닙니다.";
    const warning = coffee.warning ? `${coffee.warning} ` : "";
    return `${warning}제공 자료의 coffee 날짜는 ${coffee.sourceMinDate}~${coffee.sourceMaxDate}입니다. 표는 공식 시즌3 ${coffee.seasonStart}~${coffee.seasonEnd} coffee ${coffee.seasonCoffeeRows}건입니다. 기간 밖 ${coffee.seasonCoffeeOutsideRows}건은 날짜를 바꾸지 않고 빼 두었습니다. 바나나 ${coffee.bananaRowsExcluded}건은 목록과 집계에서 제외했습니다. 단톡 원문은 포함하지 않습니다.`;
  }

  function filterCoffee(coffee, query) {
    const days = (coffee && coffee.days) || [];
    const members = (coffee && coffee.members) || [];
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return { days, members };
    const matched = members.filter((member) => String(member.buyer || "").toLowerCase().includes(needle));
    const names = new Set(matched.map((member) => member.buyer));
    return {
      days: days
        .map((day) => ({
          date: day.date,
          buyers: (day.buyers || []).filter((buyer) => names.has(buyer)),
        }))
        .filter((day) => day.buyers.length),
      members: matched,
    };
  }

  function coffeeDailyTableHtml(days) {
    const rows = days || [];
    if (!rows.length) {
      return `<p class="review-note">이 조건의 커피 기록이 없습니다.</p>`;
    }
    return `<table class="review-table">
      <thead><tr><th>날짜</th><th>커피를 산 회원</th></tr></thead>
      <tbody>
        ${rows.map((day) => `<tr>
          <td>${escapeHtml(day.date)}</td>
          <td>${escapeHtml((day.buyers || []).join(", "))}</td>
        </tr>`).join("")}
      </tbody>
    </table>`;
  }

  function coffeeMemberTableHtml(members) {
    const rows = members || [];
    if (!rows.length) {
      return `<p class="review-note">이 조건의 커피 기록이 없습니다.</p>`;
    }
    return `<table class="review-table">
      <thead><tr><th>회원</th><th>커피를 산 날</th><th>날짜</th></tr></thead>
      <tbody>
        ${rows.map((member) => `<tr>
          <td>${escapeHtml(member.buyer)}</td>
          <td>${escapeHtml(member.dayCount)}</td>
          <td>${escapeHtml((member.dates || []).join(", "))}</td>
        </tr>`).join("")}
      </tbody>
    </table>`;
  }

  function exampleSeasonResult(index, goalSec) {
    if (!goalSec) return null;
    if (index === 7) return { status: "finisher", netTimeSec: goalSec - 60, goalMet: true };
    if (index === 8) return { status: "finisher", netTimeSec: goalSec + 60, goalMet: false };
    if (index === 9) return { status: "dnf", netTimeSec: null, goalMet: false };
    if (index === 10) return { status: "dns", netTimeSec: null, goalMet: false };
    if (index === 11) return { status: "other", netTimeSec: null, goalMet: false };
    if (index === 13) return { status: "finisher", netTimeSec: 7200, goalMet: true };
    return null;
  }

  function exampleAwardsReview() {
    const weekNumbers = [];
    for (let week = 1; week <= 13; week += 1) weekNumbers.push(week);
    const members = [];
    for (let i = 1; i <= 40; i += 1) {
      const missWeeks = i % 5 === 0 ? [3, 7] : (i % 5 === 1 ? [2] : []);
      const weeks = weekNumbers.map((week) => {
        if (!missWeeks.includes(week)) {
          return { week, attendCount: 3, exceptionCount: 0, weekScore: 3, target: 3, met: true };
        }
        return { week, attendCount: 1, exceptionCount: 1, weekScore: 1.5, target: 3, met: false };
      });
      if (i === 8) {
        weeks[0] = { week: 1, attendCount: 2, exceptionCount: 0, weekScore: 2, target: 2, met: true };
      }
      const missing = i <= 6;
      const goalSec = missing ? null : 10800 + i * 60;
      members.push({
        memberId: `example-${i}`,
        nickname: `예시${String(i).padStart(2, "0")}`,
        profileComplete: !missing,
        goalMarathonNetTime: goalSec,
        seasonResult: exampleSeasonResult(i, goalSec),
        goalRace: missing ? null : (i % 3 === 0 ? "jtbc" : "chuncheon"),
        goalRaceNote: null,
        goalRaceDate: null,
        existingPbNetTime: !missing && i % 4 === 0 ? null : (missing ? null : 12000),
        resolutionText: missing ? null : "예시 다짐",
        seasonAttendCount: 40 - missWeeks.length * 2,
        seasonExceptionCount: missWeeks.length,
        seasonAttendRate: 80,
        seasonWeeksCount: weeks.length,
        seasonWeeksMetCount: weeks.filter((week) => week.met && Number(week.target) > 0).length,
        weeks,
      });
    }
    return {
      example: true,
      programStartDate: PROGRAM_START_DATE,
      attendanceEndDate: ATTENDANCE_END_DATE,
      weeklyTarget: 3,
      members,
      coffee: {
        example: true,
        seasonStart: PROGRAM_START_DATE,
        seasonEnd: ATTENDANCE_END_DATE,
        sourceMinDate: PROGRAM_START_DATE,
        sourceMaxDate: ATTENDANCE_END_DATE,
        sourceCoffeeRows: 2,
        bananaRowsExcluded: 1,
        seasonCoffeeRows: 2,
        seasonCoffeeOutsideRows: 0,
        matchesSeason: true,
        warning: null,
        days: [
          { date: "2026-08-01", buyers: ["예시커피"] },
          { date: "2026-08-08", buyers: ["예시커피", "예시다른"] },
        ],
        members: [
          { buyer: "예시커피", dayCount: 2, dates: ["2026-08-01", "2026-08-08"] },
          { buyer: "예시다른", dayCount: 1, dates: ["2026-08-08"] },
        ],
      },
    };
  }

  return {
    GOAL_TIME_MIN_SEC,
    GOAL_TIME_MAX_SEC,
    PROGRAM_START_DATE,
    ATTENDANCE_END_DATE,
    isValidGoalTime,
    isGoalMissing,
    formatHms,
    weekDetailText,
    missedWeeks,
    sortAttendanceRows,
    sortGoalRows,
    filterAttendance,
    filterGoals,
    attendanceTableHtml,
    goalTableHtml,
    goalOutcomeLabel,
    coffeeNoteText,
    filterCoffee,
    coffeeDailyTableHtml,
    coffeeMemberTableHtml,
    reviewSectionHtml,
    exampleAwardsReview,
  };
});
