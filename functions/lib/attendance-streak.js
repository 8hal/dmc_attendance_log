/**
 * 연속 정모 출석(streak) 계산 헬퍼.
 * 순수 함수 — node --test 친화적.
 *
 * DEFAULT_TZ: Asia/Seoul
 */

const DEFAULT_TZ = "Asia/Seoul";

function isValidDateKey(dateKey) {
  return typeof dateKey === "string" && /^\d{4}\/\d{2}\/\d{2}$/.test(dateKey);
}

/** KST 기준 오늘 날짜 키 (YYYY/MM/DD). todayOverride로 테스트 시 날짜 고정 가능. */
function kstTodayKey(todayOverride) {
  const now = todayOverride || new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now).replace(/-/g, "/");
}

/** KST 기준 전날 dateKey (YYYY/MM/DD) */
function prevCalendarDayKst(dateKey) {
  if (!isValidDateKey(dateKey)) return "";
  const [y, m, d] = dateKey.split("/").map((x) => parseInt(x, 10));
  const inst = Date.UTC(y, m - 1, d, 3, 0, 0) - 86400000;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(inst))
    .replace(/-/g, "/");
}

/** 화·목·토 정모일(KST 달력) 여부 */
function isRegularClubMeetingDateKey(dateKey) {
  if (!isValidDateKey(dateKey)) return false;
  const [y, m, d] = dateKey.split("/").map((x) => parseInt(x, 10));
  const inst = Date.UTC(y, m - 1, d, 3, 0, 0);
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_TZ,
    weekday: "short",
  }).format(new Date(inst));
  return wd === "Tue" || wd === "Thu" || wd === "Sat";
}

/** dateKey 이전의 가장 가까운 화/목/토 정모일 (없으면 null) */
function prevRegularClubMeetingDateKey(dateKey) {
  let cur = dateKey;
  for (let i = 0; i < 14; i++) {
    cur = prevCalendarDayKst(cur);
    if (!cur) return null;
    if (isRegularClubMeetingDateKey(cur)) return cur;
  }
  return null;
}

/**
 * 화/목/토 출석 기록만으로 연속 정모 출석(역방향: 가장 최근 정모일부터).
 *
 * 시작점 결정 규칙:
 *  - 오늘이 정모일이고 이미 출석했으면 → 오늘부터 역방향 계산
 *  - 오늘이 정모일인데 아직 미출석이면 → 직전 정모일부터 계산 (오늘 기회 유지)
 *  - 오늘이 정모일이 아니면 → 가장 최근 정모일부터 계산
 *
 * @param {Set<string>} attendedDateSet - 출석한 날짜 키(YYYY/MM/DD) 집합
 * @param {Date} [todayOverride] - 테스트용 날짜 고정
 * @returns {number}
 */
function computeClubStreakFromDateSet(attendedDateSet, todayOverride) {
  const today = kstTodayKey(todayOverride);

  // 오늘 출석했으면 오늘 포함, 아니면 직전 정모일부터 계산
  const startDate =
    isRegularClubMeetingDateKey(today) && attendedDateSet.has(today)
      ? today
      : prevRegularClubMeetingDateKey(today);

  if (!startDate) return 0;

  let streak = 0;
  let cur = startDate;
  while (cur && attendedDateSet.has(cur)) {
    streak++;
    cur = prevRegularClubMeetingDateKey(cur);
  }
  return streak;
}

module.exports = {
  kstTodayKey,
  isRegularClubMeetingDateKey,
  prevCalendarDayKst,
  prevRegularClubMeetingDateKey,
  computeClubStreakFromDateSet,
};
