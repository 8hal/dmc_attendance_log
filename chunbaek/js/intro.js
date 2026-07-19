/* chunbaek/js/intro.js
 * 춘백 S3 — 1주차 1일 인트로 애니메이션
 * 시즌 종료 후 이 파일 삭제 + index.html에서 script 1줄 제거
 */

/* ── 유틸 ── */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * container에 text를 한 글자씩 타이핑한다.
 * lastCharSpan: 마지막 글자를 감쌀 span (S3의 "3" 분리용)
 */
function typeText(container, text, charDelay, lastCharSpan) {
  return new Promise((resolve) => {
    let i = 0;
    const interval = setInterval(() => {
      const char = text[i];
      i++;
      const isLast = i === text.length;

      if (isLast && lastCharSpan) {
        lastCharSpan.textContent = char;
        container.appendChild(lastCharSpan);
      } else {
        container.appendChild(document.createTextNode(char));
      }

      if (isLast) {
        clearInterval(interval);
        resolve();
      }
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
    <div class="intro-typing-wrap">
      <p class="intro-title" id="intro-title-line"></p>
      <p class="intro-subtitle" id="intro-subtitle-line"></p>
    </div>
    <div class="intro-count" aria-hidden="true" id="intro-count"></div>
    <p class="intro-start" id="intro-start">START!</p>
    <p class="intro-hint" aria-live="polite" id="intro-hint">탭해서 시작</p>
  `;

  return el;
}

/* ── 타이핑 파트 ── */
async function runTypingPhase(overlay) {
  const titleEl    = overlay.querySelector('#intro-title-line');
  const subtitleEl = overlay.querySelector('#intro-subtitle-line');

  // S3의 "3"을 별도 span으로 분리
  const cnt3 = document.createElement('span');
  cnt3.className = 'cnt-3';
  cnt3.setAttribute('aria-hidden', 'true');

  await delay(300); // overlay fade-in 여유

  // "춘백방 S3" 타이핑: 마지막 "3"은 cnt3 span에
  await typeText(titleEl, '춘백방 S3', 120, cnt3);

  await delay(80); // 여유

  // "지금 시작합니다." 타이핑
  await typeText(subtitleEl, '지금 시작합니다.', 100);

  await delay(800); // 완료 후 유지

  // 페이드 아웃 (cnt3 제외)
  await separateAndExpand(overlay, cnt3);
}

/* ── S3 "3" 분리 + 중앙 확대 ── */
async function separateAndExpand(overlay, cnt3El) {
  const typingWrap = overlay.querySelector('.intro-typing-wrap');

  // cnt3의 현재 화면 좌표 기록 (부모 fade-out 전)
  const rect   = cnt3El.getBoundingClientRect();
  const startX = rect.left + rect.width / 2;
  const startY = rect.top  + rect.height / 2;

  // cnt3를 잠깐 숨기고 fixed 전환 준비
  cnt3El.style.opacity = '0';
  typingWrap.classList.add('fading');

  await delay(80); // 레이아웃 정착 여유

  // cnt3를 body에 fixed로 뽑아내어 기존 좌표에 배치
  cnt3El.style.removeProperty('opacity');
  cnt3El.style.left = `${startX}px`;
  cnt3El.style.top  = `${startY}px`;
  document.body.appendChild(cnt3El);   // overlay 밖으로 이동
  cnt3El.classList.add('expanding');    // → CSS가 translate(-50%,-50%) scale(6) 으로 확대

  await delay(700); // expand 완료

  cnt3El.classList.replace('expanding', 'expanded');
  await delay(200); // 잠시 유지

  cnt3El.classList.replace('expanded', 'exit');
  await delay(400); // 퇴장

  cnt3El.remove();
}

/* ── 카운트다운 (2, 1) ── */
async function runCountdown(overlay) {
  const countEl = overlay.querySelector('#intro-count');

  for (const num of ['2', '1']) {
    countEl.textContent = num;
    countEl.classList.remove('exit');
    void countEl.offsetWidth; // reflow — 애니메이션 재시작 강제
    countEl.classList.add('enter');
    await delay(400);

    countEl.classList.replace('enter', 'exit');
    await delay(400);
  }
  countEl.classList.remove('exit');
}

/* ── START! 즉시 표시 (reduced-motion 포함) ── */
function showStartState(overlay) {
  const typingWrap = overlay.querySelector('.intro-typing-wrap');
  const countEl    = overlay.querySelector('#intro-count');
  const startEl    = overlay.querySelector('#intro-start');

  if (typingWrap) typingWrap.style.display = 'none';
  if (countEl)    countEl.style.display    = 'none';

  startEl.classList.add('visible');
}

/* ── 핸들러 활성화 ── */
function activateHandler(overlay, trapTab) {
  const hintEl = overlay.querySelector('#intro-hint');
  hintEl.classList.add('visible');

  const previousFocus = document.activeElement;

  function dismiss() {
    overlay.classList.add('dismissing');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', trapTab);

    overlay.addEventListener('transitionend', () => {
      overlay.remove();
      // body에 직접 붙인 cnt3이 혹시 남아있으면 제거
      document.querySelectorAll('.cnt-3').forEach((el) => el.remove());
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
  await runTypingPhase(overlay);   // 타이핑 + S3→3 확대
  await runCountdown(overlay);     // 2 → 1
  showStartState(overlay);         // START! 표시
  await delay(600);                // pulse 시작 여유
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
    return; // Safari 개인정보 모드 등 — skip
  }

  /* overlay 삽입 */
  const overlay = buildOverlay();
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  /* Tab 포커스 트랩 — overlay 삽입 즉시 등록 */
  const trapTab = (e) => { if (e.key === 'Tab') e.preventDefault(); };
  document.addEventListener('keydown', trapTab);

  /* overlay fade-in */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add('visible'));
  });

  overlay.focus();

  /* reduced-motion 분기 */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    showStartState(overlay);
    activateHandler(overlay, trapTab);
    return;
  }

  /* 일반 흐름 */
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
