/* chunbaek/js/intro.js
 * 춘백 S3 — 1주차 1일 인트로 애니메이션
 * 시즌 종료 후 이 파일 삭제 + index.html에서 script 1줄 제거
 *
 * ── 오늘(TARGET 전) 콘솔 테스트 ──
 *   localStorage.setItem('chunbaek-intro-target-override', '2026-07-19');
 *   localStorage.removeItem('chunbaek-intro-seen-2026-07-19');
 *   location.reload();
 * 또는 리로드 없이 즉시 재생:
 *   window.__chunbaekIntro.play()
 *   window.__chunbaekIntro.showReplay()
 * 테스트 해제:
 *   localStorage.removeItem('chunbaek-intro-target-override');
 */

const INTRO_DEFAULT_TARGET = '2026-07-20';
const INTRO_OVERRIDE_KEY = 'chunbaek-intro-target-override';

function getKstDate() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getIntroTarget() {
  try {
    const override = localStorage.getItem(INTRO_OVERRIDE_KEY);
    if (override) return override;
  } catch { /* ignore */ }
  return INTRO_DEFAULT_TARGET;
}

function getIntroFlag(target) {
  return `chunbaek-intro-seen-${target}`;
}

/* ── 유틸 ── */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function typeText(container, text, charDelay) {
  return new Promise((resolve) => {
    let i = 0;
    const interval = setInterval(() => {
      container.appendChild(document.createTextNode(text[i]));
      i++;
      if (i === text.length) { clearInterval(interval); resolve(); }
    }, charDelay);
  });
}

/* ── DOM 생성 ── */
function buildOverlay() {
  const el = document.createElement('div');
  el.className = 'intro-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '춘백 S3 시즌 시작 인트로');
  el.setAttribute('tabindex', '-1');

  el.innerHTML = `
    <div class="intro-typing-wrap" id="intro-typing-wrap"></div>
    <p class="intro-start" id="intro-start">START!</p>
    <p class="intro-hint" aria-live="polite" id="intro-hint">탭해서 시작</p>
  `;

  return el;
}

/* ── 타이핑 파트 ── */
async function runTypingPhase(overlay) {
  const typingWrap = overlay.querySelector('#intro-typing-wrap');

  await delay(400);

  const poemLines = [
    '가을의 전설이 될 당신,',
    '그리고',
    '우리들의 여정을',
    '이제 시작합니다.',
  ];

  for (const text of poemLines) {
    const p = document.createElement('p');
    p.className = 'intro-poem';
    typingWrap.appendChild(p);
    await typeText(p, text, 110);
    await delay(450);
  }

  const titleEl = document.createElement('p');
  titleEl.className = 'intro-title';
  typingWrap.appendChild(titleEl);
  await delay(200);
  await typeText(titleEl, '춘백방 S3', 140);

  await delay(1200);

  typingWrap.classList.add('fading');
  await delay(600);
  typingWrap.style.display = 'none';
}

/* ── START! 표시 ── */
function showStartState(overlay) {
  overlay.querySelector('#intro-start').classList.add('visible');
}

/* ── 핸들러 활성화 ── */
function activateHandler(overlay, trapTab) {
  overlay.querySelector('#intro-hint').classList.add('visible');

  const previousFocus = document.activeElement;

  function dismiss() {
    overlay.classList.add('dismissing');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', trapTab);

    overlay.addEventListener('transitionend', () => {
      overlay.remove();
      previousFocus?.focus();
    }, { once: true });
  }

  overlay.addEventListener('click', dismiss, { once: true });

  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Enter') {
      document.removeEventListener('keydown', onKey);
      dismiss();
    }
  });
}

/* ── 전체 타임라인 ── */
async function runTimeline(overlay, trapTab) {
  await runTypingPhase(overlay);
  showStartState(overlay);
  await delay(600);
  activateHandler(overlay, trapTab);
}

/**
 * @param {{ force?: boolean, skipFlag?: boolean }} [opts]
 *   force: 날짜·플래그 무시하고 즉시 재생
 *   skipFlag: 날짜는 지키되 이미 봤음 플래그 무시 (다시 보기용)
 */
function startIntro(opts = {}) {
  const { force = false, skipFlag = false } = opts;
  const target = getIntroTarget();
  const flag = getIntroFlag(target);
  const kstDate = getKstDate();

  if (!force && kstDate !== target) return;

  if (!force && !skipFlag) {
    try {
      if (localStorage.getItem(flag)) return;
      localStorage.setItem(flag, '1');
    } catch {
      return;
    }
  } else if (!force && skipFlag) {
    try { localStorage.setItem(flag, '1'); } catch { /* ignore */ }
  }

  document.querySelector('.intro-overlay')?.remove();

  const overlay = buildOverlay();
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const trapTab = (e) => { if (e.key === 'Tab') e.preventDefault(); };
  document.addEventListener('keydown', trapTab);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add('visible'));
  });

  overlay.focus();

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    showStartState(overlay);
    activateHandler(overlay, trapTab);
    return;
  }

  runTimeline(overlay, trapTab);
}

/* ── 실행 ── */
startIntro();

/* ── 다시 보기 버튼 ── */
function initReplayButton() {
  const target = getIntroTarget();
  const flag = getIntroFlag(target);
  const kstDate = getKstDate();

  if (kstDate !== target) return;

  const btn = document.getElementById('btn-replay-intro');
  if (!btn) return;

  btn.hidden = false;
  btn.addEventListener('click', () => {
    try { localStorage.removeItem(flag); } catch { /* ignore */ }
    startIntro({ skipFlag: true });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReplayButton);
} else {
  initReplayButton();
}

/* ── 콘솔 테스트 API ── */
window.__chunbaekIntro = {
  /** 날짜·플래그 무시하고 즉시 재생 */
  play() {
    startIntro({ force: true });
  },
  /** 다시 보기 버튼 강제 표시 */
  showReplay() {
    const btn = document.getElementById('btn-replay-intro');
    if (!btn) return;
    btn.hidden = false;
    if (!btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => startIntro({ force: true }));
    }
  },
  /**
   * 오늘 날짜를 TARGET으로 오버라이드 후 리로드
   * 예: window.enableTestToday()
   */
  enableTestToday() {
    try {
      localStorage.setItem(INTRO_OVERRIDE_KEY, getKstDate());
      localStorage.removeItem(getIntroFlag(getKstDate()));
    } catch { /* ignore */ }
    location.reload();
  },
  /** 오버라이드 해제 후 리로드 */
  disableTest() {
    try { localStorage.removeItem(INTRO_OVERRIDE_KEY); } catch { /* ignore */ }
    location.reload();
  },
};
