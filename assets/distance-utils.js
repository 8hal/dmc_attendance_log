/**
 * Distance 정규화 및 표시 유틸리티
 * - my.html의 DIST_LABELS와 동일한 규칙
 * - functions/lib/raceDistance.js의 normalizeRaceDistance와 호환
 */

const DIST_LABELS = {
  "5K": "5K",
  "3K": "3K",
  "10K": "10K",
  "30K": "30K",
  "32K": "32K",
  "half": "하프",
  "full": "풀",
  "ultra": "울트라",
  "unknown": "?"
};

/**
 * distance를 한글 레이블로 변환
 * @param {string} distance - 정규화된 distance (예: "half", "full", "10K")
 * @returns {string} - 한글 레이블 (예: "하프", "풀", "10K")
 */
function formatDistance(distance) {
  if (!distance) return '-';
  return DIST_LABELS[distance] || distance;
}

/**
 * distance 배지 HTML 생성 (my.html의 distBadge와 동일)
 * @param {string} distance - 정규화된 distance
 * @returns {string} - HTML 문자열
 */
function distBadge(distance) {
  const label = formatDistance(distance);
  const safeCls = String(distance || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `<span class="dist-badge dist-${safeCls}">${escapeHtml(label)}</span>`;
}

/**
 * HTML 이스케이프
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DIST_LABELS, formatDistance, distBadge };
}
