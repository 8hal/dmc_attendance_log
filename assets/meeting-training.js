/**
 * Meeting training helpers (browser UMD). Keep in sync with functions/lib/meeting-training.js
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DmcMeetingTraining = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
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

function stripHtml(text) {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\r/g, "");
}

function detectMeetingTypeFromHeader(line) {
  const s = String(line || "");
  if (/화요|화요일/.test(s)) return "TUE";
  if (/목요|목요일/.test(s)) return "THU";
  if (/토요|토요일/.test(s)) return "SAT";
  return null;
}

function parseFieldLine(line) {
  const m = String(line || "").match(/^([^:：]+)[:：]\s*(.*)$/);
  if (!m) return null;
  const label = m[1].replace(/\s+/g, "").toLowerCase();
  const value = m[2].trim();
  if (/시간.?장소|시간\/장소|시간장소/.test(label) || label.includes("시간") && label.includes("장소")) {
    const parts = value.split(/\s*[/／]\s*/);
    return { time: (parts[0] || "").trim(), place: (parts.slice(1).join(" / ") || "").trim() };
  }
  if (/^시간$/.test(label) || label === "time") return { time: value };
  if (/^장소$/.test(label) || label === "place") return { place: value };
  if (/전/.test(label) && /훈련|전/.test(label)) return { trainBefore: value };
  if (/본/.test(label) && (/훈련/.test(label) || label.includes("본"))) return { trainMain: value };
  if (/후/.test(label) && (/훈련/.test(label) || label.includes("후"))) return { trainAfter: value };
  if (/서포터|급수/.test(label)) return { supporters: value };
  if (/메모|안내/.test(label)) return { note: value };
  return null;
}

/**
 * Parse cafe notice paste into { TUE, THU, SAT } training field objects (no dates).
 */
function parseCafeTrainingPaste(raw) {
  const text = stripHtml(raw);
  const result = defaultEmptySlots();
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  let current = null;
  for (const line of lines) {
    const headerType = detectMeetingTypeFromHeader(line);
    if (headerType && (/정모/.test(line) || headerType)) {
      // Prefer lines that look like section headers
      if (/정모/.test(line) || /^(화|목|토)/.test(line)) {
        current = headerType;
        continue;
      }
    }
    if (!current) {
      // Orphan field before any header — skip
      const maybeHeader = detectMeetingTypeFromHeader(line);
      if (maybeHeader) {
        current = maybeHeader;
        continue;
      }
      continue;
    }
    const fields = parseFieldLine(line);
    if (!fields) continue;
    Object.assign(result[current], fields);
  }

  // Clear empty meetingDateKey on slots
  REGULAR_TYPES.forEach((t) => {
    result[t].meetingType = t;
    result[t].meetingDateKey = "";
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

return {
  REGULAR_TYPES,
  normalizeMeetingDateKey,
  trainingDocId,
  emptyTrainingRow,
  normalizeTrainingRow,
  resolveWeekMeetingDates,
  parseCafeTrainingPaste,
  applyParsedToWeek,
  assertSaveRows,
  stripHtml,
};

});
