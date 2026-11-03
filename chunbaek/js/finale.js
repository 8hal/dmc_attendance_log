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
  const PENDING_RESULT_NOTE = "인천 마라톤 후 집계 예정";

  /** 단톡 분석으로 확정. 앱에는 커피 지출이 없다. */
  const COFFEE_AWARD = {
    nickname: "진달 김진규",
    days: 9,
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
      criterion: `${PROGRAM_START_DATE} 전에 갖고 있던 풀코스 PB(프로필 기존 PB)와, 그 날짜 이후 시즌 최종 완주 기록의 차이. 가장 많이 앞당긴 사람. 기존 PB가 없거나 완주가 2:00:00이면 비교하지 않습니다. 실제 기록이 저장되면 다시 계산합니다.`,
    };
  }

  function pendingResults(members) {
    return (members || [])
      .filter(isPlaceholderFinish)
      .sort(byName)
      .map((member) => {
        const nickname = member.nickname || "이름 없음";
        return {
          nickname,
          label: `${nickname}: ${PENDING_RESULT_NOTE}`,
        };
      });
  }

  function coffeeAward() {
    return {
      kind: "coffee",
      title: "카페인상",
      days: COFFEE_AWARD.days,
      winners: [{ nickname: COFFEE_AWARD.nickname, memberId: "" }],
      criterion: `시즌3 동안 커피를 산 날이 ${COFFEE_AWARD.days}일로 가장 많습니다. 단톡 분석으로 정했고, 앱에는 커피 지출이 없습니다.`,
    };
  }

  function thanksAward() {
    return {
      kind: "thanks",
      title: "당신때문에 고마웠다상",
      winners: [],
      criterion: "쫑파티에서 익명 투표로 정합니다. 앱 기록으로 계산하지 않으며, 당일 발표합니다.",
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
      pending: pendingResults(members),
      activity: activitySummary(members, weeklyTarget || WEEKLY_TARGET_POINTS),
    };
  }

  function previewModel() {
    return { ...modelFromMembers(previewMembers(), WEEKLY_TARGET_POINTS), preview: true };
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
    pendingResults,
    activitySummary,
    previewModel,
    modelFromMembers,
  };
});
