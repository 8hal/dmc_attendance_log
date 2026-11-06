/**
 * 춘백 S3 쫑파티 결산 — 시상·활동 집계.
 * 브라우저(window.ChunbaekFinale)와 Node 테스트에서 같이 쓴다.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ChunbaekFinale = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const WEEKLY_TARGET_POINTS = 3;
  const PROGRAM_START_DATE = "2026-07-26";
  const ATTENDANCE_END_DATE = "2026-10-24";
  const LOW_ATTENDANCE_DAYS = 4;
  /** 완주 입력 하한. 2:00:00은 아직 확정 기록이 아니다. */
  const PLACEHOLDER_NET_SEC = 7200;

  /** 제공 CSV buyer는 "*Josh조상현*"이다. 별표는 이 이름만 앞뒤를 감싸서, 카드에는 빼 둔다. */
  const COFFEE_AWARD = {
    nickname: "Josh조상현",
    days: 8,
  };

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function byName(a, b) {
    return String(a.nickname || "").localeCompare(String(b.nickname || ""), "ko");
  }

  function formatClock(seconds) {
    const n = num(seconds);
    if (n == null || n < 0) return "—";
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const s = Math.round(n % 60);
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function formatImprovement(seconds) {
    const abs = Math.abs(Math.round(Number(seconds) || 0));
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = abs % 60;
    const parts = [];
    if (h) parts.push(`${h}시간`);
    if (m) parts.push(`${m}분`);
    if (s || !parts.length) parts.push(`${s}초`);
    return parts.join(" ");
  }

  function isPlaceholderFinish(member) {
    const sr = member && member.seasonResult;
    if (!sr || sr.status !== "finisher") return false;
    return num(sr.netTimeSec) === PLACEHOLDER_NET_SEC;
  }

  function goalAchieved(member) {
    if (isPlaceholderFinish(member)) return false;
    const sr = member && member.seasonResult;
    if (!sr || sr.status !== "finisher") return false;
    const net = num(sr.netTimeSec);
    const goal = num(member.goalMarathonNetTime);
    if (net == null || goal == null || goal <= 0) return false;
    return net <= goal;
  }

  function goalAward(members) {
    const winners = (members || []).filter(goalAchieved).sort((a, b) => {
      const diff = num(a.seasonResult.netTimeSec) - num(b.seasonResult.netTimeSec);
      if (diff) return diff;
      return byName(a, b);
    });
    return {
      kind: "goal",
      title: "목표 달성상",
      winners,
      criterion: `완주 넷타임이 출정식에 적은 풀코스 목표 이하인 사람 전부. 100일 출석과 별개이고, DNF·DNS·대회 취소·미등록은 뺍니다. 2:00:00은 입력 하한이라 빼며, 실제 기록이 저장되면 다시 넣습니다. 시즌 시작은 ${PROGRAM_START_DATE}입니다.`,
    };
  }

  function attendanceAward(members) {
    const list = members || [];
    let best = -1;
    for (const member of list) {
      const count = num(member.seasonAttendCount) || 0;
      if (count > best) best = count;
    }
    const winners = best < 0
      ? []
      : list.filter((member) => (num(member.seasonAttendCount) || 0) === best).sort(byName);
    return {
      kind: "attendance",
      title: "최다 참여상",
      value: best < 0 ? 0 : best,
      tied: winners.length > 1,
      winners,
      criterion: `공식 시즌(${PROGRAM_START_DATE}~${ATTENDANCE_END_DATE}) 출석 일수가 가장 많은 사람. 그 전·후와 예외 처리일은 출석 일수에 넣지 않습니다. 동점이면 모두 적습니다.`,
    };
  }

  function beforeSeconds(member) {
    return num(member && member.pbBeforeSec) ?? num(member && member.existingPbNetTime);
  }

  function afterSeconds(member) {
    if (isPlaceholderFinish(member)) return null;
    if (num(member && member.pbAfterSec) != null && num(member.pbAfterSec) !== PLACEHOLDER_NET_SEC) {
      return num(member.pbAfterSec);
    }
    const sr = member && member.seasonResult;
    if (!sr || sr.status !== "finisher") return null;
    return num(sr.netTimeSec);
  }

  function improvementAward(members) {
    const rows = [];
    let excludedNoPb = 0;
    for (const member of members || []) {
      const before = beforeSeconds(member);
      const after = afterSeconds(member);
      if (after == null) continue;
      if (before == null || before <= 0) {
        excludedNoPb += 1;
        continue;
      }
      rows.push({ member, seconds: before - after, before, after });
    }
    const positive = rows.filter((row) => row.seconds > 0);
    const best = positive.reduce((max, row) => Math.max(max, row.seconds), 0);
    const winners = positive
      .filter((row) => row.seconds === best && best > 0)
      .map((row) => ({
        ...row.member,
        improvementSeconds: row.seconds,
        pbBeforeSec: row.before,
        pbAfterSec: row.after,
      }))
      .sort(byName);
    return {
      kind: "improvement",
      title: "최우수상",
      seconds: winners.length ? best : 0,
      excludedNoPb,
      winners,
      criterion: `${PROGRAM_START_DATE} 전에 갖고 있던 풀코스 PB(프로필 기존 PB)와, 그 날짜 이후 시즌 최종 완주 기록의 차이. 가장 많이 앞당긴 사람.`,
    };
  }

  function coffeeAward() {
    return {
      kind: "coffee",
      title: "카페인상",
      days: COFFEE_AWARD.days,
      winners: [{ nickname: COFFEE_AWARD.nickname, memberId: "" }],
      criterion: `시즌3(2026-07-26~2026-10-24) coffee 집계에서 커피를 산 날이 ${COFFEE_AWARD.days}일로 가장 많습니다.`,
    };
  }

  function thanksAward() {
    return {
      kind: "thanks",
      title: "당신때문에 고마웠다상",
      winners: [],
      criterion: "멤버가 동료 1명에게 투표합니다. 득표와 이유는 운영진만 보고, 당선자는 이 운영 화면에 모읍니다.",
    };
  }

  function activitySummary(members, weeklyTarget = WEEKLY_TARGET_POINTS) {
    const list = members || [];
    const rates = list.map((member) => num(member.seasonAttendRate) || 0);
    const averageAttendRate = list.length
      ? Math.round(rates.reduce((sum, rate) => sum + rate, 0) / list.length)
      : 0;
    const belowFourDays = list
      .filter((member) => (num(member.seasonAttendCount) || 0) < LOW_ATTENDANCE_DAYS)
      .sort(byName);
    const noPenalty = list.filter((member) => {
      const weeks = num(member.seasonWeeksCount) || 0;
      const met = num(member.seasonWeeksMetCount) || 0;
      return weeks > 0 && met === weeks;
    }).sort(byName);
    const withPenalty = list.filter((member) => {
      const weeks = num(member.seasonWeeksCount) || 0;
      const met = num(member.seasonWeeksMetCount) || 0;
      return weeks > met;
    }).sort(byName);
    const penaltyWeekCount = list.reduce((sum, member) => {
      const weeks = num(member.seasonWeeksCount) || 0;
      const met = num(member.seasonWeeksMetCount) || 0;
      return sum + Math.max(0, weeks - met);
    }, 0);
    return {
      participantCount: list.length,
      weeklyTargetPoints: weeklyTarget,
      lowAttendanceDays: LOW_ATTENDANCE_DAYS,
      programStartDate: PROGRAM_START_DATE,
      attendanceEndDate: ATTENDANCE_END_DATE,
      averageAttendRate,
      belowFourDays,
      noPenalty,
      withPenalty,
      penaltyWeekCount,
    };
  }

  function previewMembers() {
    return [
      {
        memberId: "preview-a",
        nickname: "예시러너",
        goalMarathonNetTime: 10800,
        existingPbNetTime: 12000,
        seasonAttendCount: 40,
        seasonAttendRate: 80,
        seasonWeeksCount: 13,
        seasonWeeksMetCount: 13,
        seasonResult: { status: "finisher", netTimeSec: 10700, raceLabel: "JTBC 서울마라톤" },
      },
      {
        memberId: "preview-b",
        nickname: "예시페이스",
        goalMarathonNetTime: 14000,
        existingPbNetTime: 15000,
        seasonAttendCount: 40,
        seasonAttendRate: 70,
        seasonWeeksCount: 13,
        seasonWeeksMetCount: 9,
        seasonResult: { status: "finisher", netTimeSec: 14100, raceLabel: "춘천 마라톤" },
      },
      {
        memberId: "preview-c",
        nickname: "예시쉼",
        goalMarathonNetTime: 16000,
        seasonAttendCount: 2,
        seasonAttendRate: 10,
        seasonWeeksCount: 13,
        seasonWeeksMetCount: 1,
        seasonResult: { status: "dns", raceLabel: "춘천 마라톤" },
      },
      {
        memberId: "preview-dimo",
        nickname: "디모",
        goalMarathonNetTime: 9359,
        existingPbNetTime: 10800,
        seasonAttendCount: 30,
        seasonAttendRate: 60,
        seasonWeeksCount: 13,
        seasonWeeksMetCount: 10,
        seasonResult: { status: "finisher", netTimeSec: PLACEHOLDER_NET_SEC, raceLabel: "인천 마라톤" },
      },
    ];
  }

  function modelFromMembers(members, weeklyTarget) {
    return {
      preview: false,
      weeklyTarget: weeklyTarget || WEEKLY_TARGET_POINTS,
      goal: goalAward(members),
      attendance: attendanceAward(members),
      improvement: improvementAward(members),
      coffee: coffeeAward(),
      thanks: thanksAward(),
      activity: activitySummary(members, weeklyTarget || WEEKLY_TARGET_POINTS),
    };
  }

  function previewModel() {
    return { ...modelFromMembers(previewMembers(), WEEKLY_TARGET_POINTS), preview: true };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function nameList(people) {
    if (!people || !people.length) return "<p class=\"finale-meta\">해당 없음</p>";
    return `<ul class="finale-names">${people.map((person) => `<li>${escapeHtml(person.nickname || "이름 없음")}</li>`).join("")}</ul>`;
  }

  function awardInfoButton(title, criterion) {
    if (!criterion) return "";
    return `<button type="button" class="finale-info" aria-expanded="false" aria-controls="finale-info-layer" aria-label="${escapeHtml(title)} 집계 기준">ⓘ</button>
      <p class="finale-info-source" hidden>${escapeHtml(criterion)}</p>`;
  }

  function awardCard(award, bodyHtml) {
    const tie = award.winners && award.winners.length > 1
      ? `<p class="finale-meta">동점 ${award.winners.length}명</p>`
      : "";
    return `<article class="finale-card">
      <div class="finale-card-head">
        <h3>${escapeHtml(award.title)}</h3>
        ${awardInfoButton(award.title, award.criterion)}
      </div>
      ${bodyHtml}
      ${tie}
    </article>`;
  }

  function awardsHtml(model) {
    const activity = model.activity;
    const goalNames = model.goal.winners.map((member) => {
      const net = formatClock(member.seasonResult && member.seasonResult.netTimeSec);
      const goal = formatClock(member.goalMarathonNetTime);
      return `${member.nickname} · 기록 ${net} / 목표 ${goal}`;
    });
    const attendNames = model.attendance.winners.map((member) =>
      `${member.nickname} · ${model.attendance.value}일`);
    const improveNames = model.improvement.winners.map((member) =>
      `${member.nickname} · ${formatClock(member.pbBeforeSec)} → ${formatClock(member.pbAfterSec)} (${formatImprovement(member.improvementSeconds)} 단축)`);
    return `<div class="finale-awards">
      <section class="finale-section">
        <div class="finale-grid">
          ${awardCard(model.attendance, nameList(attendNames.map((nickname) => ({ nickname }))))}
          ${awardCard(model.goal, nameList(goalNames.map((nickname) => ({ nickname }))))}
          ${awardCard(model.coffee, `<p class="finale-winner">${escapeHtml(model.coffee.winners[0].nickname)}</p><p class="finale-meta">커피를 산 날 ${model.coffee.days}일</p>`)}
          ${awardCard(model.improvement, nameList(improveNames.map((nickname) => ({ nickname }))))}
        </div>
      </section>
      <section class="finale-section">
        <h2>시즌3 활동 결산</h2>
        <div class="finale-stats">
          <div class="finale-stat"><b>${activity.participantCount}</b><span><span class="stat-line">프로필을 만든 </span><span class="stat-line">참가자</span></span></div>
          <div class="finale-stat"><b>${activity.averageAttendRate}%</b><span>평균 출석률</span></div>
          <div class="finale-stat"><b>${activity.noPenalty.length}</b><span>매주 ${activity.weeklyTargetPoints}점 달성</span></div>
        </div>
        <div class="finale-grid">
          <article class="finale-card">
            <div class="finale-card-head">
              <h3>주간 기준은 ${activity.weeklyTargetPoints}점</h3>
              ${awardInfoButton("주간 기준", `출석 1점, 승인 예외 0.5점, 한 주 ${activity.weeklyTargetPoints}점 이상이면 달성입니다. 앱에는 벌금 금액이 없어서, 3점 미달 주를 벌금 해당 주로 셉니다. 주간 집계는 2026-07-27~${activity.attendanceEndDate}입니다. 7/20~7/26은 0주차라 집계에서 제외하고, 1주차는 7/27~8/2입니다.`)}
            </div>
            <p class="finale-meta">3점 미달 주 합계 ${activity.penaltyWeekCount}주 · 한 주라도 미달인 사람 ${activity.withPenalty.length}명</p>
          </article>
          <article class="finale-card">
            <h3>매주 ${activity.weeklyTargetPoints}점을 채운 사람</h3>
            ${nameList(activity.noPenalty)}
          </article>
        </div>
      </section>
    </div>`;
  }

  return {
    WEEKLY_TARGET_POINTS,
    PROGRAM_START_DATE,
    ATTENDANCE_END_DATE,
    COFFEE_AWARD,
    PLACEHOLDER_NET_SEC,
    formatClock,
    formatImprovement,
    goalAward,
    attendanceAward,
    improvementAward,
    coffeeAward,
    thanksAward,
    activitySummary,
    previewModel,
    modelFromMembers,
    awardsHtml,
  };
});
