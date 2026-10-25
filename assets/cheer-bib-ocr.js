/**
 * 응원 보드 배번 사진 OCR.
 * 엔진은 setCustomEngine으로 바꿀 수 있다. 기본 엔진은 chunbaek/js/ocr.js와 같은 Tesseract.js CDN이다.
 * 숫자 후보는 pickBibCandidate가 고르고, 선수는 그 값을 직접 고칠 수 있다.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CheerBibOcr = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TESSERACT_CDN_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  const DISTANCE_NUMBERS = new Set(["42195", "21097", "21098", "10000"]);

  let customEngine = null;
  let tesseractPromise = null;
  let workerPromise = null;

  function setCustomEngine(fn) {
    customEngine = typeof fn === "function" ? fn : null;
  }

  function rosterModeLength(rosterBibs) {
    const counts = new Map();
    for (const bib of rosterBibs || []) {
      const value = String(bib || "").trim();
      if (!/^\d{3,6}$/.test(value)) continue;
      counts.set(value.length, (counts.get(value.length) || 0) + 1);
    }
    let best = null;
    let bestCount = 0;
    for (const [len, count] of counts) {
      if (count > bestCount || (count === bestCount && best != null && len > best)) {
        best = len;
        bestCount = count;
      }
    }
    return best;
  }

  function stripClocks(text) {
    return String(text || "")
      .replace(/\d{1,2}\s*[:.;]\s*\d{2}\s*[:.;]\s*\d{2}/g, " ")
      .replace(/\d{1,2}\s*[:.;]\s*\d{2}/g, " ");
  }

  function collapseSplitDigits(text) {
    return text.replace(/([0-9oOlIsSB])[ \t]+(?=[0-9oOlIsSB])/g, "$1");
  }

  function normalizeToken(token) {
    if (!/[0-9]/.test(token)) return "";
    return String(token)
      .replace(/[oO]/g, "0")
      .replace(/[lI|]/g, "1")
      .replace(/[sS]/g, "5")
      .replace(/B/g, "8");
  }

  function collectNumbers(text) {
    const found = [];
    const re = /[0-9oOlIsSB]{3,6}/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      const value = normalizeToken(match[0]);
      if (!/^\d{3,6}$/.test(value)) continue;
      found.push({ value: value, index: match.index, source: text });
    }
    return found;
  }

  function contextScore(candidate) {
    // 배번 글자는 숫자 앞에 붙는다. 뒤쪽까지 보면 앞 번호가 다음 줄의 '배번'을 가져간다.
    const before = candidate.source.slice(Math.max(0, candidate.index - 8), candidate.index);
    if (/배번|번호/.test(before) || /\b(?:BIB|NO)\b/i.test(before)) return 30;
    return 0;
  }

  function scoreCandidate(candidate, modeLen, rosterSet) {
    let score = 0;
    if (modeLen) {
      if (candidate.value.length !== modeLen) return -1000;
      score += 50;
    } else if (candidate.value.length >= 4 && candidate.value.length <= 6) {
      score += 20;
    } else {
      return -1000;
    }
    if (/^20[2-3]\d$/.test(candidate.value)) score -= 40;
    if (DISTANCE_NUMBERS.has(candidate.value)) score -= 60;
    score += contextScore(candidate);
    if (rosterSet.has(candidate.value)) score += 10;
    return score;
  }

  function pickBibCandidate(rawText, rosterBibs) {
    const roster = (rosterBibs || []).map(function (bib) { return String(bib || "").trim(); });
    const rosterSet = new Set(roster.filter(function (bib) { return /^\d{3,6}$/.test(bib); }));
    const modeLen = rosterModeLength(roster);
    const stripped = stripClocks(rawText);
    const sources = [stripped, collapseSplitDigits(stripped)];
    const seen = new Set();
    let best = null;
    let bestScore = 0;
    sources.forEach(function (source) {
      collectNumbers(source).forEach(function (candidate) {
        const key = candidate.value + "@" + candidate.index + ":" + (source === stripped ? "a" : "b");
        if (seen.has(candidate.value + ":" + candidate.index + ":" + source.length)) return;
        seen.add(key);
        const score = scoreCandidate(candidate, modeLen, rosterSet);
        if (score > bestScore) {
          bestScore = score;
          best = candidate.value;
        }
      });
    });
    return best;
  }

  function loadTesseractScript() {
    if (typeof window === "undefined") {
      return Promise.reject(new Error("브라우저에서만 배번을 읽을 수 있습니다"));
    }
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tesseractPromise) return tesseractPromise;
    tesseractPromise = new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = TESSERACT_CDN_URL;
      script.async = true;
      script.onload = function () {
        if (window.Tesseract) resolve(window.Tesseract);
        else reject(new Error("Tesseract 로드 실패"));
      };
      script.onerror = function () {
        tesseractPromise = null;
        reject(new Error("문자 인식을 불러오지 못했습니다"));
      };
      document.head.appendChild(script);
    });
    return tesseractPromise;
  }

  async function defaultEngine(image) {
    const Tesseract = await loadTesseractScript();
    if (!workerPromise) {
      workerPromise = Tesseract.createWorker("eng").then(async function (worker) {
        try {
          await worker.setParameters({ tessedit_char_whitelist: "0123456789" });
        } catch (err) {
          // 숫자만 읽기 설정이 없어도 후보 선택에서 숫자를 고른다.
        }
        return worker;
      });
    }
    const worker = await workerPromise;
    const result = await worker.recognize(image);
    return (result && result.data && result.data.text) || "";
  }

  async function recognizeBib(image, options) {
    const opts = options || {};
    const engine = customEngine || defaultEngine;
    try {
      const text = await engine(image, opts);
      const bib = pickBibCandidate(text, opts.rosterBibs || []);
      return { bib: bib, fromPhoto: !!bib, error: "" };
    } catch (err) {
      return {
        bib: null,
        fromPhoto: false,
        error: err && err.message ? String(err.message) : "ocr failed",
      };
    }
  }

  return {
    pickBibCandidate: pickBibCandidate,
    recognizeBib: recognizeBib,
    setCustomEngine: setCustomEngine,
  };
});
