/* chunbaek/js/intro.js
 * 춘백 S3 — 1주차 1일 인트로 애니메이션
 * 시즌 종료 후 이 파일 삭제 + index.html에서 script 1줄 제거
 */

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

  // 전체 페이드 아웃
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

/* ── 메인 진입점 ── */
function startIntro() {
  const TARGET = '2026-07-20';
  const FLAG   = `chunbaek-intro-seen-${TARGET}`;

  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  if (kstDate !== TARGET) return;

  try {
    if (localStorage.getItem(FLAG)) return;
    localStorage.setItem(FLAG, '1');
  } catch {
    return;
  }

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
  const TARGET = '2026-07-20';
  const FLAG   = `chunbaek-intro-seen-${TARGET}`;

  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  if (kstDate !== TARGET) return;

  const btn = document.getElementById('btn-replay-intro');
  if (!btn) return;

  btn.hidden = false;
  btn.addEventListener('click', () => {
    try { localStorage.removeItem(FLAG); } catch { /* ignore */ }
    startIntro();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReplayButton);
} else {
  initReplayButton();
}
