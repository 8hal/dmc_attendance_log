/**
 * 춘백 S3 기록증 사진 OCR 모듈 (클라이언트 1번 안 + 플러그인 아키텍처)
 * - 브라우저(window.ChunbaekOcr) 및 Node.js(module.exports) 양쪽에서 동작
 * - 추후 2번 안(서버 Vision AI) 교체 시 setCustomEngine(fn) 또는 options.engine으로 즉시 대체 가능
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ChunbaekOcr = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MIN_MARATHON_SEC = 2 * 3600;       // 2:00:00
  const MAX_MARATHON_SEC = 8 * 3600 - 1;   // 7:59:59
  const TESSERACT_CDN_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

  let _tesseractPromise = null;
  let _customEngine = null;

  /**
   * OCR 오인식 숫자 보정 (시간 패턴 주변에서 흔히 발생하는 O->0, l/I->1, S->5, B->8)
   */
  function normalizeOcrDigits(token) {
    return String(token || "")
      .replace(/[oO]/g, "0")
      .replace(/[lI|]/g, "1")
      .replace(/[sS]/g, "5")
      .replace(/B/g, "8");
  }

  function formatHmsLabel(h, m, s) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function scoreContextWindow(fullText, matchIndex, matchLength = 8) {
    // 같은 줄 또는 바로 앞(최대 32자)·뒤(최대 16자) 범위만 검사하여 다른 줄의 NET/GUN 키워드 간섭 방지
    const beforeRaw = fullText.slice(Math.max(0, matchIndex - 32), matchIndex);
    const afterRaw = fullText.slice(matchIndex + matchLength, Math.min(fullText.length, matchIndex + matchLength + 16));
    const lineBefore = beforeRaw.split(/\r?\n/).pop() || "";
    const lineAfter = afterRaw.split(/\r?\n/)[0] || "";
    const ctx = `${lineBefore} ${lineAfter}`.toUpperCase();
    let score = 0;

    if (/NET\s*TIME|NET\s*RECORD|순수\s*기록|넷\s*타임|넷타임|순수기록/.test(ctx)) {
      score += 30;
    } else if (/FINISH|완주\s*기록|완주기록|공식\s*기록|기록|RECORD|TIME/.test(ctx)) {
      score += 12;
    }

    if (/GUN\s*TIME|총\s*소요|출발/.test(ctx) && !/NET/.test(ctx)) {
      score -= 15;
    }

    if (/10\s*K|HALF|하프|20\s*K|30\s*K|PACE|페이스/.test(ctx) && !/FULL|풀코스|NET/.test(ctx)) {
      score -= 15;
    }

    return score;
  }

  /**
   * OCR 원문 텍스트에서 마라톤 풀코스 시간(2:00:00 ~ 7:59:59) 후보를 추출하고 우선순위를 매긴다.
   * @param {string} rawText
   */
  function parseMarathonTimesFromText(rawText) {
    const text = String(rawText || "");
    if (!text.trim()) {
      return { bestMatch: null, candidates: [] };
    }

    const foundBySec = new Map();

    function addCandidate(hRaw, mRaw, sRaw, index, matchLen, bonusScore = 0) {
      const h = parseInt(normalizeOcrDigits(hRaw), 10);
      const m = parseInt(normalizeOcrDigits(mRaw), 10);
      const s = parseInt(normalizeOcrDigits(sRaw), 10);
      if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s)) return;
      if (h < 2 || h > 7 || m < 0 || m > 59 || s < 0 || s > 59) return;
      const totalSec = h * 3600 + m * 60 + s;
      if (totalSec < MIN_MARATHON_SEC || totalSec > MAX_MARATHON_SEC) return;

      const score = scoreContextWindow(text, index, matchLen) + bonusScore;
      const existing = foundBySec.get(totalSec);
      if (!existing || score > existing.score) {
        foundBySec.set(totalSec, {
          h,
          m,
          s,
          totalSec,
          label: formatHmsLabel(h, m, s),
          score,
          index,
        });
      }
    }

    // 1. 콜론/점/세미콜론 구분자 포맷 (예: 03:45:12, 4:12:05, 04.25.48, O4:12:O8)
    const colonRegex = /(?:^|[^\d])([0O]?[2-7])\s*[:.;]\s*([0-5oOlIsSB][\doOlIsSB])\s*[:.;]\s*([0-5oOlIsSB][\doOlIsSB])(?!\d)/g;
    let match;
    while ((match = colonRegex.exec(text)) !== null) {
      addCandidate(match[1], match[2], match[3], match.index, match[0].length, 5);
    }

    // 2. 한글 시간/분/초 포맷 (예: 4시간 12분 05초, 3시간 58분)
    const koRegex = /([0O]?[2-7])\s*시간\s*([0-5oOlIsSB]?[\doOlIsSB])\s*분(?:\s*([0-5oOlIsSB]?[\doOlIsSB])\s*초?)?/g;
    while ((match = koRegex.exec(text)) !== null) {
      addCandidate(match[1], match[2], match[3] || "0", match.index, match[0].length, 8);
    }

    const sorted = [...foundBySec.values()]
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.index - b.index;
      })
      .map(({ h, m, s, totalSec, label }) => ({ h, m, s, totalSec, label }));

    return {
      bestMatch: sorted[0] || null,
      candidates: sorted,
    };
  }

  /**
   * 브라우저 환경에서 이미지를 그레이스케일 + 고대비 Canvas로 전처리해 OCR 인식률·속도 향상
   */
  function preprocessImageForOcr(imageFile, maxEdge = 1500) {
    if (typeof document === "undefined" || typeof Image === "undefined" || typeof URL === "undefined") {
      return Promise.resolve(imageFile);
    }
    if (!imageFile || (typeof Blob !== "undefined" && !(imageFile instanceof Blob))) {
      return Promise.resolve(imageFile);
    }
    return new Promise((resolve) => {
      const img = new Image();
      const objUrl = URL.createObjectURL(imageFile);
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        try {
          const scale = Math.min(1, maxEdge / Math.max(img.width || 1, img.height || 1));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          const imgData = ctx.getImageData(0, 0, width, height);
          const d = imgData.data;
          // 대비 강화 그레이스케일 변환
          for (let i = 0; i < d.length; i += 4) {
            const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            const contrasted = Math.max(0, Math.min(255, (lum - 128) * 1.35 + 128));
            d[i] = contrasted;
            d[i + 1] = contrasted;
            d[i + 2] = contrasted;
          }
          ctx.putImageData(imgData, 0, 0);
          canvas.toBlob((blob) => resolve(blob || imageFile), "image/jpeg", 0.9);
        } catch {
          resolve(imageFile);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        resolve(imageFile);
      };
      img.src = objUrl;
    });
  }

  function loadTesseractScript() {
    if (typeof window === "undefined") {
      return Promise.reject(new Error("브라우저 환경에서만 기본 OCR을 사용할 수 있습니다"));
    }
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (_tesseractPromise) return _tesseractPromise;

    _tesseractPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TESSERACT_CDN_URL;
      script.async = true;
      script.onload = () => {
        if (window.Tesseract) resolve(window.Tesseract);
        else reject(new Error("Tesseract 로드 실패"));
      };
      script.onerror = () => {
        _tesseractPromise = null;
        reject(new Error("OCR 라이브러리를 불러오지 못했습니다"));
      };
      document.head.appendChild(script);
    });
    return _tesseractPromise;
  }

  async function runTesseractEngine(imageFile, options = {}) {
    const Tesseract = await loadTesseractScript();
    const processed = await preprocessImageForOcr(imageFile);
    const result = await Tesseract.recognize(processed, "eng+kor", {
      logger: (m) => {
        if (m && m.status === "recognizing text" && typeof options.onProgress === "function") {
          options.onProgress(Math.round((m.progress || 0) * 100));
        }
      },
    });
    return result?.data?.text || "";
  }

  /**
   * 1번 안 성능 테스트용 샘플 마라톤 기록증 이미지를 Canvas로 즉석 생성한다.
   */
  function createSampleCertificateBlob(sampleTime = "03:45:12", raceTitle = "2026 CHUNCHEON MARATHON") {
    if (typeof document === "undefined") return Promise.resolve(null);
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 420;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 4;
      ctx.strokeRect(20, 20, 680, 380);

      ctx.fillStyle = "#111111";
      ctx.font = "bold 28px sans-serif";
      ctx.fillText(raceTitle, 50, 80);

      ctx.font = "22px sans-serif";
      ctx.fillText("COURSE: FULL COURSE (42.195km)   BIB: 10425", 50, 135);
      ctx.fillText("GUN TIME : 03:48:05", 50, 205);

      ctx.font = "bold 46px monospace";
      ctx.fillText(`NET TIME : ${sampleTime}`, 50, 285);

      ctx.font = "20px sans-serif";
      ctx.fillText("10K 00:52:10   HALF 01:51:20", 50, 350);

      canvas.toBlob((blob) => resolve(blob), "image/png");
    });
  }

  function setCustomEngine(engineFn) {
    _customEngine = typeof engineFn === "function" ? engineFn : null;
  }

  /**
   * 기록증 사진에서 마라톤 완주 기록을 추출한다.
   * @param {File|Blob|object} imageFile
   * @param {{ engine?: Function, onProgress?: (pct: number) => void }} options
   */
  async function extractRaceRecord(imageFile, options = {}) {
    const startMs = Date.now();
    const engine = options.engine || _customEngine || runTesseractEngine;
    const provider = (options.engine || _customEngine) ? "custom" : "tesseract";
    try {
      const rawText = await engine(imageFile, options);
      const elapsedMs = Math.max(0, Date.now() - startMs);
      const parsed = parseMarathonTimesFromText(rawText);
      return {
        ok: true,
        provider,
        elapsedMs,
        rawText: String(rawText || "").trim(),
        bestMatch: parsed.bestMatch,
        candidates: parsed.candidates,
      };
    } catch (err) {
      const elapsedMs = Math.max(0, Date.now() - startMs);
      return {
        ok: false,
        provider,
        elapsedMs,
        rawText: "",
        bestMatch: null,
        candidates: [],
        error: err?.message || "OCR 인식 중 오류가 발생했습니다",
      };
    }
  }

  return {
    parseMarathonTimesFromText,
    preprocessImageForOcr,
    createSampleCertificateBlob,
    setCustomEngine,
    extractRaceRecord,
  };
});
