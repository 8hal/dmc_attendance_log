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

  function seasonCloseWeekNote(end) {
    const until = end || "2026-10-24";
    return `주간 출석 집계는 2026-07-27 ~ ${until}입니다. 7/20~7/26은 0주차라 집계에서 제외하고, 7/27~8/2는 1주차입니다. 출석 1점, 예외 0.5점. 그 주 목표는 3점과 그 주 훈련일 수 중 작은 값입니다.`;
  }

  function opsWeekNumber(week) {
    const start = String(week && week.startDate || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      if (start < "2026-07-27") return 0;
      const [y, m, d] = start.split("-").map(Number);
      const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 6, 27)) / 86400000);
      return Math.floor(diff / 7) + 1;
    }
    const stored = Number(week && week.week);
    if (!Number.isFinite(stored)) return null;
    return stored <= 0 ? stored : stored - 1;
  }

  function opsWeekLabel(week) {
    const n = opsWeekNumber(week);
    return n == null ? "" : `${n}주`;
  }

  function weekRangeText(week) {
    const short = (iso) => {
      const text = String(iso || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
      return `${Number(text.slice(5, 7))}/${Number(text.slice(8, 10))}`;
    };
    const start = short(week && week.startDate);
    const end = short(week && week.endDate);
    return start && end ? ` ${start}~${end}` : "";
  }

  function weekDetailText(week) {
    const range = weekRangeText(week);
    const label = opsWeekLabel(week) || `${week.week}주`;
    if (!week || !(Number(week.target) > 0)) {
      return `${label}${range} 유효 훈련일 없음`;
    }
    const score = Number(week.weekScore).toFixed(1);
    const head = `${label}${range} ${score}/${targetText(week.target)}점`;
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

  function missWeekText(week) {
    return `${opsWeekLabel(week)}${weekRangeText(week)}`.trim();
  }

  function attendanceTotals(members) {
    const list = members || [];
    let missedPeople = 0;
    let missedWeekCount = 0;
    list.forEach((member) => {
      const count = missedWeeks(member).length;
      if (!count) return;
      missedPeople += 1;
      missedWeekCount += count;
    });
    return { total: list.length, missedPeople, missedWeekCount };
  }

  function attendanceTotalsHtml(members) {
    const totals = attendanceTotals(members);
    return `<p class="review-note" id="attendance-totals">전체 ${totals.total}명 · 미달 ${totals.missedPeople}명 · 미달 ${totals.missedWeekCount}주</p>`;
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
            ? missed.map((week) => `<button type="button" class="review-chip miss review-week-line" data-open-week="${week.week}">${opsWeekLabel(week)}${escapeHtml(weekRangeText(week))}</button>`).join("")
            : `<span class="review-chip ok">전 주차 달성</span>`;
          const details = (member.weeks || []).map((week) => (
            `<li class="${week.met ? "met" : "miss"}">${escapeHtml(weekDetailText(week))}</li>`
          )).join("");
          return `<tr class="review-row" data-review-toggle="${escapeHtml(member.memberId)}">
            <td class="review-card-title" data-label="닉네임">${escapeHtml(member.nickname || "이름 없음")}</td>
            <td data-label="출석 일수">${Number(member.seasonAttendCount) || 0}</td>
            <td data-label="예외 일수">${Number(member.seasonExceptionCount) || 0}</td>
            <td data-label="출석률">${Number(member.seasonAttendRate) || 0}%</td>
            <td data-label="달성 주차">${Number(member.seasonWeeksMetCount) || 0}/${Number(member.seasonWeeksCount) || 0}</td>
            <td class="col-prose" data-label="미달 주차">${chips}</td>
          </tr>
          <tr class="review-detail" data-review-detail="${escapeHtml(member.memberId)}" hidden>
            <td class="review-span col-prose" colspan="6" data-label="주차 상세"><ul class="review-weeks">${details}</ul></td>
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

  function raceResultLabel(member) {
    const sr = member && member.seasonResult;
    if (!sr || !sr.status) return "아직 없음";
    const net = Number(sr.netTimeSec);
    if (sr.status === "finisher" && net === placeholderNetSec()) return "집계 대기";
    if (sr.status === "finisher" && Number.isFinite(net) && net > 0) {
      return `완주 ${formatHms(net)}`;
    }
    return seasonStatusLabel(sr.status) || "아직 없음";
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

  function seasonNoteText(member) {
    const note = member && member.seasonResult && member.seasonResult.note;
    const text = String(note || "").trim();
    return text || "없음";
  }

  function goalTableHtml(members) {
    const rows = sortGoalRows(members);
    if (!rows.length) return `<p class="review-empty">해당하는 회원이 없습니다.</p>`;
    return `<table class="review-table goal-columns">
      <thead>
        <tr>
          <th>닉네임</th>
          <th>입력</th>
          <th>대회</th>
          <th class="col-time">목표 시간</th>
          <th class="col-time">기존 PB</th>
          <th class="col-time">대회 결과</th>
          <th>달성 여부</th>
          <th>다짐</th>
          <th class="col-note">대회 소감</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((member) => {
          const missing = isGoalMissing(member);
          const goal = isValidGoalTime(member.goalMarathonNetTime) ? formatHms(member.goalMarathonNetTime) : "";
          const pb = formatStoredTime(member.existingPbNetTime);
          return `<tr class="${missing ? "goal-missing" : ""}">
            <td data-label="닉네임">${escapeHtml(member.nickname || "이름 없음")}</td>
            <td data-label="입력">${missing ? "미입력" : "입력"}</td>
            <td data-label="대회">${escapeHtml(raceLabel(member) || "없음")}</td>
            <td class="col-time" data-label="목표 시간">${escapeHtml(goal ? goal : "목표 없음")}</td>
            <td class="col-time" data-label="기존 PB">${escapeHtml(pb ? pb : "PB 없음")}</td>
            <td class="col-time" data-label="대회 결과">${escapeHtml(raceResultLabel(member))}</td>
            <td data-label="달성 여부">${escapeHtml(goalOutcomeLabel(member))}</td>
            <td class="col-prose" data-label="다짐">${escapeHtml(member.resolutionText || "")}</td>
            <td class="col-note col-prose" data-label="대회 소감">${escapeHtml(seasonNoteText(member))}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
  }

  function reviewSectionHtml(payload, attendanceMode, goalMode, query) {
    const members = (payload && payload.members) || [];
    const end = (payload && payload.attendanceEndDate) || ATTENDANCE_END_DATE;
    const example = payload && payload.example
      ? `<p class="review-example">예시 데이터입니다. 실제 회원이 아닙니다.</p>`
      : "";
    const attendance = filterAttendance(members.filter((member) => matchesQuery(member, query)), attendanceMode);
    const goals = filterGoals(members.filter((member) => matchesQuery(member, query)), goalMode);
    return `${example}
      <section class="review-block" id="attendance-review">
        <h3>시즌 출석 검수</h3>
        <p class="review-note">${escapeHtml(seasonCloseWeekNote(end))}</p>
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

  function coffeeMemberTableHtml(members) {
    const rows = members || [];
    if (!rows.length) {
      return `<p class="review-note">이 조건의 커피 기록이 없습니다.</p>`;
    }
    return `<table class="review-table">
      <thead><tr><th>회원</th><th>커피를 산 날</th><th>날짜</th></tr></thead>
      <tbody>
        ${rows.map((member) => `<tr>
          <td data-label="회원">${escapeHtml(member.buyer)}</td>
          <td data-label="커피를 산 날">${escapeHtml(member.dayCount)}</td>
          <td class="col-prose" data-label="날짜">${escapeHtml((member.dates || []).join(", "))}</td>
        </tr>`).join("")}
      </tbody>
    </table>`;
  }

  function exampleSeasonResult(index, goalSec) {
    if (!goalSec) return null;
    if (index === 7) return { status: "finisher", netTimeSec: goalSec - 60, goalMet: true, note: "예시 소감" };
    if (index === 8) return { status: "finisher", netTimeSec: goalSec + 60, goalMet: false };
    if (index === 9) return { status: "dnf", netTimeSec: null, goalMet: false };
    if (index === 10) return { status: "dns", netTimeSec: null, goalMet: false };
    if (index === 11) return { status: "other", netTimeSec: null, goalMet: false };
    if (index === 13) return { status: "finisher", netTimeSec: 7200, goalMet: true };
    return null;
  }

  function exampleAwardsReview() {
    const weekNumbers = [];
    for (let week = 2; week <= 14; week += 1) weekNumbers.push(week);
    const sheetStart = Date.UTC(2026, 6, 20);
    const aggEnd = "2026-10-24";
    const members = [];
    for (let i = 1; i <= 40; i += 1) {
      const missWeeks = i % 5 === 0 ? [3, 7] : (i % 5 === 1 ? [2] : []);
      const weeks = weekNumbers.map((week) => {
        const startDate = new Date(sheetStart + (week - 1) * 7 * 86400000).toISOString().slice(0, 10);
        let endDate = new Date(sheetStart + ((week - 1) * 7 + 6) * 86400000).toISOString().slice(0, 10);
        if (endDate > aggEnd) endDate = aggEnd;
        if (!missWeeks.includes(week)) {
          return { week, startDate, endDate, attendCount: 3, exceptionCount: 0, weekScore: 3, target: 3, met: true };
        }
        return { week, startDate, endDate, attendCount: 1, exceptionCount: 1, weekScore: 1.5, target: 3, met: false };
      });
      if (i === 8) {
        const opening = weeks.find((week) => week.week === 2);
        opening.attendCount = 2;
        opening.exceptionCount = 0;
        opening.weekScore = 2;
        opening.target = 2;
        opening.met = true;
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
        resolutionText: missing ? null : (i === 8
          ? "예시 다짐입니다. 위험한 나 일기를 전 시기 전에는 작은 상자에 몇 개 유품과 유서를 담곤 했다. 오래전을 답습하는 것이긴 해도 나는 얼마 전에 11월의 관을 짜 놓았다. 내일을 생각하면 오늘 나를 내던지기가 어렵다."
          : "예시 다짐"),
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
    seasonCloseWeekNote,
    missedWeeks,
    sortAttendanceRows,
    sortGoalRows,
    filterAttendance,
    filterGoals,
    attendanceTableHtml,
    attendanceTotals,
    attendanceTotalsHtml,
    opsWeekNumber,
    goalTableHtml,
    goalOutcomeLabel,
    raceResultLabel,
    seasonNoteText,
    coffeeNoteText,
    filterCoffee,
    coffeeMemberTableHtml,
    reviewSectionHtml,
    exampleAwardsReview,
  };
});
