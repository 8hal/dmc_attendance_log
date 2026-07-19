/**
 * Meeting training (정모 훈련) — pure helpers + cafe paste parser.
 * Collection: meeting_training / docId: YYYY-MM-DD_TUE|THU|SAT
 */

const REGULAR_TYPES = ["TUE", "THU", "SAT"];

function normalizeMeetingDateKey(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.replace(/-/g, "/");
  return "";
}

function toDashDate(dateKey) {
  const n = normalizeMeetingDateKey(dateKey);
  return n ? n.replace(/\//g, "-") : "";
}

function trainingDocId(meetingDate, meetingType) {
  const dash = toDashDate(meetingDate);
  const type = String(meetingType || "")
    .trim()
    .toUpperCase();
  if (!dash || !REGULAR_TYPES.includes(type)) return "";
  return `${dash}_${type}`;
}

function emptyTrainingRow(meetingDateKey, meetingType) {
  return {
    meetingDateKey: normalizeMeetingDateKey(meetingDateKey) || String(meetingDateKey || ""),
    meetingType: String(meetingType || "")
      .trim()
      .toUpperCase(),
    time: "",
    place: "",
    trainBefore: "",
    trainMain: "",
    trainAfter: "",
    supporters: "",
    note: "",
  };
}

function normalizeTrainingRow(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const meetingDateKey = normalizeMeetingDateKey(
    src.meetingDateKey || src.meetingDate || ""
  );
  const meetingType = String(src.meetingType || "")
    .trim()
    .toUpperCase();
  return {
    meetingDateKey,
    meetingType,
    time: String(src.time == null ? "" : src.time).trim(),
    place: String(src.place == null ? "" : src.place).trim(),
    trainBefore: String(src.trainBefore == null ? "" : src.trainBefore).trim(),
    trainMain: String(src.trainMain == null ? "" : src.trainMain).trim(),
    trainAfter: String(src.trainAfter == null ? "" : src.trainAfter).trim(),
    supporters: String(src.supporters == null ? "" : src.supporters).trim(),
    note: String(src.note == null ? "" : src.note).trim(),
  };
}

/**
 * Mon-based week containing anchor → Tue/Thu/Sat dateKeys.
 * @param {string} anchor YYYY-MM-DD or YYYY/MM/DD
 */
function resolveWeekMeetingDates(anchor) {
  const dash = toDashDate(anchor);
  if (!dash) return { TUE: "", THU: "", SAT: "" };
  const [ys, ms, ds] = dash.split("-").map(Number);
  const d = new Date(ys, ms - 1, ds);
  const day = d.getDay(); // 0=Sun
  const toMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(ys, ms - 1, ds + toMon);
  function addDays(base, n) {
    const x = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const dd = String(x.getDate()).padStart(2, "0");
    return `${y}/${m}/${dd}`;
  }
  return {
    TUE: addDays(mon, 1),
    THU: addDays(mon, 3),
    SAT: addDays(mon, 5),
  };
}

function defaultEmptySlots() {
  return {
    TUE: emptyTrainingRow("", "TUE"),
    THU: emptyTrainingRow("", "THU"),
    SAT: emptyTrainingRow("", "SAT"),
  };
}

/**
 * Accept plain paste, contentHtml, or cafe article API JSON
 * ({ result: { article: { contentHtml } } }).
 */
function unwrapCafePasteInput(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s.startsWith("{")) return s;
  try {
    const obj = JSON.parse(s);
    const html =
      (obj &&
        obj.result &&
        obj.result.article &&
        obj.result.article.contentHtml) ||
      (obj && obj.article && obj.article.contentHtml) ||
      (obj && obj.contentHtml) ||
      "";
    if (String(html).trim()) return String(html);
  } catch (_) {
    /* not JSON — treat as plain text */
  }
  return s;
}

/**
 * Shrink a cafe article API payload (object or JSON string) to the fields
 * the training paste parser needs. Empty string if contentHtml is missing.
 */
function minifyCafeArticleForPaste(raw) {
  let obj = raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return "";
    try {
      obj = JSON.parse(s);
    } catch (_) {
      return "";
    }
  }
  if (!obj || typeof obj !== "object") return "";
  const article =
    (obj.result && obj.result.article) || obj.article || obj;
  const contentHtml = article && article.contentHtml;
  if (!String(contentHtml || "").trim()) return "";
  const subject = String((article && article.subject) || "").trim();
  return JSON.stringify({
    result: {
      article: {
        subject,
        contentHtml: String(contentHtml),
      },
    },
  });
}

function stripHtml(text) {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/td>/gi, "\n")
    .replace(/<\/th>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\u200b/g, "")
    .replace(/\r/g, "");
}

/** Fix Naver cafe line-broken labels / spaced titles before line split */
function normalizeCafePaste(text) {
  let t = String(text || "");
  // Anchor at line start so "보강훈련\n후" is not rewritten to "보강훈련후"
  t = t.replace(/(?:^|\n)([ \t]*)훈\s*련\s*전(?=\s*(?:\n|$))/g, "\n$1훈련전");
  t = t.replace(/(?:^|\n)([ \t]*)훈\s*련\s*본(?=\s*(?:\n|$))/g, "\n$1훈련본");
  t = t.replace(/(?:^|\n)([ \t]*)훈\s*련\s*후(?=\s*(?:\n|$))/g, "\n$1훈련후");
  t = t.replace(/급\s*수\s*및\s*\n?\s*서\s*포\s*터\s*즈/g, "급수및서포터즈");
  t = t.replace(/급\s*수\s*및/g, "급수및");
  t = t.replace(/시\s*간\s*\/\s*장\s*소|시\s*간\s*장\s*소/g, "시간/장소");
  t = t.replace(/화\s*요\s*일\s*정\s*모/g, "화요일 정모");
  t = t.replace(/목\s*요\s*일\s*정\s*모/g, "목요일 정모");
  t = t.replace(/토\s*요\s*일\s*정\s*모/g, "토요일 정모");
  return t;
}

function compactLabel(s) {
  return String(s || "")
    .replace(/\s+/g, "")
    .replace(/[·・./／]/g, "")
    .toLowerCase();
}

function detectMeetingTypeFromHeader(line) {
  const compact = compactLabel(line);
  if (!compact) return null;
  if (/화요.*정모|^화요일정모/.test(compact)) return "TUE";
  if (/목요.*정모|^목요일정모/.test(compact)) return "THU";
  if (/토요.*정모|^토요일정모/.test(compact)) return "SAT";
  return null;
}

function parseTimePlaceValue(value) {
  const v = String(value || "").trim();
  if (!v) return { time: "", place: "" };
  const slash = v.split(/\s*[/／]\s*/);
  if (slash.length >= 2) {
    return { time: slash[0].trim(), place: slash.slice(1).join(" / ").trim() };
  }
  const m = v.match(/^(\d{1,2}:\d{2})\s+(.+)$/);
  if (m) return { time: m[1], place: m[2].trim() };
  if (/^\d{1,2}:\d{2}$/.test(v)) return { time: v, place: "" };
  return { time: "", place: v };
}

function detectFieldLabel(line) {
  const compact = compactLabel(line);
  if (!compact) return null;
  if (compact === "시간장소" || compact.startsWith("시간장소")) return "timePlace";
  if (compact === "시간") return "time";
  if (compact === "장소") return "place";
  if (compact === "전" || compact === "훈련전") return "trainBefore";
  if (compact === "본" || compact === "훈련본") return "trainMain";
  if (compact === "후" || compact === "훈련후") return "trainAfter";
  if (compact.includes("서포터") || compact === "급수및서포터즈" || compact === "급수및")
    return "supporters";
  if (compact === "메모" || compact === "안내") return "note";
  return null;
}

function appendField(slot, field, value) {
  const v = String(value || "").trim();
  if (!v || !slot || !field) return;
  if (field === "timePlace") {
    const tp = parseTimePlaceValue(v);
    if (tp.time) slot.time = tp.time;
    if (tp.place) slot.place = tp.place;
    return;
  }
  if (field === "time") {
    slot.time = v;
    return;
  }
  if (field === "place") {
    slot.place = v;
    return;
  }
  if (slot[field]) slot[field] = slot[field] + "\n" + v;
  else slot[field] = v;
}

/**
 * Parse cafe notice paste into { TUE, THU, SAT } training field objects (no dates).
 * Accepts colon lines and Naver cafe multiline label/value paste.
 * First untitled block → TUE (common weekly cafe layout).
 */
function parseCafeTrainingPaste(raw) {
  const text = normalizeCafePaste(stripHtml(unwrapCafePasteInput(raw)));
  const result = defaultEmptySlots();
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && !/^https?:\/\//i.test(l));

  let current = null;
  let field = null;
  let untitledBlock = 0;
  const order = ["TUE", "THU", "SAT"];

  function ensureCurrent() {
    if (current) return;
    current = order[Math.min(untitledBlock, 2)];
    untitledBlock += 1;
    field = null;
  }

  for (const line of lines) {
    const headerType = detectMeetingTypeFromHeader(line);
    if (headerType && /정모/.test(compactLabel(line))) {
      current = headerType;
      field = null;
      continue;
    }

    const colon = line.match(/^([^:：]{1,40})[:：]\s*(.*)$/);
    if (colon) {
      const label = detectFieldLabel(colon[1]);
      if (label) {
        ensureCurrent();
        field = label;
        if (colon[2].trim()) {
          appendField(result[current], field, colon[2]);
          if (field === "timePlace") field = null;
        }
        continue;
      }
    }

    const labelOnly = detectFieldLabel(line);
    if (labelOnly) {
      ensureCurrent();
      field = labelOnly;
      continue;
    }

    if (!current && /^\d{1,2}:\d{2}/.test(line)) {
      ensureCurrent();
      field = "timePlace";
    }

    if (!current || !field) {
      if (current && result[current].supporters) {
        appendField(result[current], "note", line);
      }
      continue;
    }

    appendField(result[current], field, line);
    if (field === "timePlace") field = null;
    else if (field === "supporters") field = "note";
  }

  REGULAR_TYPES.forEach((t) => {
    result[t].meetingType = t;
    result[t].meetingDateKey = "";
    ["trainBefore", "trainMain", "trainAfter", "note", "supporters", "place"].forEach((k) => {
      if (result[t][k]) result[t][k] = String(result[t][k]).trim();
    });
  });
  return result;
}

function applyParsedToWeek(parsed, weekDates) {
  const rows = [];
  REGULAR_TYPES.forEach((t) => {
    const base = emptyTrainingRow(weekDates[t] || "", t);
    const p = (parsed && parsed[t]) || {};
    rows.push({
      ...base,
      time: p.time || "",
      place: p.place || "",
      trainBefore: p.trainBefore || "",
      trainMain: p.trainMain || "",
      trainAfter: p.trainAfter || "",
      supporters: p.supporters || "",
      note: p.note || "",
    });
  });
  return rows;
}

function assertSaveRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return "ROWS_REQUIRED";
  for (const raw of rows) {
    const row = normalizeTrainingRow(raw);
    if (!row.meetingDateKey || !REGULAR_TYPES.includes(row.meetingType)) {
      return "INVALID_ROW";
    }
  }
  return null;
}

module.exports = {
  REGULAR_TYPES,
  normalizeMeetingDateKey,
  trainingDocId,
  emptyTrainingRow,
  normalizeTrainingRow,
  resolveWeekMeetingDates,
  parseCafeTrainingPaste,
  applyParsedToWeek,
  assertSaveRows,
  unwrapCafePasteInput,
  minifyCafeArticleForPaste,
  stripHtml,
  normalizeCafePaste,
};
