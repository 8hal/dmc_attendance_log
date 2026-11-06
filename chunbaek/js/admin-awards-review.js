/**
 * 운영진 시상 화면 — 시즌 출석 검수와 목표 입력 현황.
 * 앱에 있는 출석 집계와 프로필 필드만 보여 준다.
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
      members.push({
        memberId: `example-${i}`,
        nickname: `예시${String(i).padStart(2, "0")}`,
        profileComplete: !missing,
        goalMarathonNetTime: missing ? null : 10800 + i * 60,
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
    reviewSectionHtml,
    exampleAwardsReview,
  };
});
