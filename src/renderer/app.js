// Andromeda window: tabs, views, prompt box, and the motion that ties them to the sky.
(function () {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const bridge = window.andromeda || null;
  const data = window.AndromedaPreview;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('andromeda:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('andromeda:' + k, JSON.stringify(v)); } catch { /* fine */ } },
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  document.documentElement.dataset.platform = bridge ? bridge.platform : 'web';

  // ---------- motion preference ----------
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motionPref = store.get('motion', 'system'); // system | full | reduced
  const reduced = () => motionPref === 'reduced' || (motionPref === 'system' && media.matches);

  // Twinkle strength, 0 to 100. The default is barely noticeable.
  let twinkle = store.get('twinkle', 20);
  const twinkleWord = (v) => (v === 0 ? 'Off' : v <= 25 ? 'Barely' : v <= 60 ? 'Gentle' : 'Lively');

  const sky = window.AndromedaSky.createSky($('#sky'), { reduceMotion: reduced, twinkle: () => (twinkle / 100) * 0.9 });

  // ---------- little constellation drawings for cards ----------
  const f = (n) => Math.round(n * 10) / 10;
  function conArt(p, e, r, gap) {
    const stars = p.map(([x, y, m = 1]) => {
      const R = r * m;
      return `<circle cx="${x}" cy="${y}" r="${f(R * 3.2)}" fill="rgba(233,236,245,0.10)"/><circle cx="${x}" cy="${y}" r="${f(R)}" fill="#F1F3F9"/>`;
    }).join('');
    const lines = e.map(([a, b]) => {
      const A = p[a], B = p[b], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, u = gap / L;
      return `M${f(A[0] + dx * u)},${f(A[1] + dy * u)}L${f(B[0] - dx * u)},${f(B[1] - dy * u)}`;
    }).join('');
    return { stars, lines };
  }

  // ---------- views ----------
  function renderCourses() {
    const cards = data.courses.map((c) => {
      const art = conArt(c.p, c.e, 1.6, 4);
      const cover = `linear-gradient(160deg, rgba(${c.tint},0.28) 0%, rgba(${c.tint},0.08) 48%, rgba(8,10,28,0.55) 100%)`;
      return `<button type="button" class="card m">
        <div class="cover" style="background:${cover}">
          <svg viewBox="0 0 240 96" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <path class="cl" d="${art.lines}" fill="none" stroke="rgba(233,236,245,0.38)" stroke-width="0.8"/>${art.stars}
          </svg>
          <span class="con">${esc(c.con)}</span>
        </div>
        <div class="body">
          <span class="name">${esc(c.name)}</span>
          <span class="meta">${esc(c.meta)}</span>
          <span class="up"><span class="d${c.none ? ' none' : ''}"></span><span style="color:${c.none ? 'var(--faint)' : 'inherit'}">${esc(c.up)}</span><span class="when">${esc(c.when)}</span></span>
        </div>
      </button>`;
    }).join('');
    $('#view-courses').innerHTML = `<div class="inner">
      <div class="head m">
        <div><h1>Courses</h1><p>Preview with sample courses · your real ones arrive in stage 2</p></div>
        <p class="overhead">Overhead · ${esc(sky.constellationName('courses'))}</p>
      </div>
      <div class="grid">${cards}</div>
    </div>`;
  }

  function renderGuides() {
    const cards = data.guides.map((g) => {
      const art = conArt(g.p, g.e, 1.5, 3);
      const pct = Math.round((100 * g.done) / g.total);
      const progress = g.done === 0 ? 'Not started' : g.done === g.total ? 'All practice done' : `${g.done} of ${g.total} answered`;
      return `<button type="button" class="gcard m">
        <span class="gtop">
          <svg width="60" height="60" viewBox="0 0 64 64" aria-hidden="true" style="flex:none">
            <circle cx="32" cy="32" r="31" fill="rgba(${g.tint},0.18)" stroke="rgba(233,236,245,0.16)"/>
            <path class="cl" d="${art.lines}" fill="none" stroke="rgba(233,236,245,0.45)" stroke-width="0.9"/>${art.stars}
          </svg>
          <span class="t"><b>${esc(g.title)}</b><span>${esc(g.course)}</span><small>${esc(g.con)}</small></span>
        </span>
        <span class="bar-row"><span class="meter"><i style="width:${pct}%"></i></span><span>${progress}</span></span>
      </button>`;
    }).join('');
    $('#view-guides').innerHTML = `<div class="inner">
      <div class="head m">
        <div><h1>Guides</h1><p>Preview with sample guides · guide building arrives in stage 3</p></div>
        <p class="overhead">Overhead · ${esc(sky.constellationName('guides'))}</p>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${cards}</div>
    </div>`;
  }

  function renderSettings() {
    const motionBtn = (v, label) => `<button type="button" data-motion="${v}" aria-pressed="${motionPref === v}">${label}</button>`;
    $('#view-settings').innerHTML = `<div class="inner" style="max-width:820px">
      <div class="head m">
        <div><h1>Settings</h1><p>Andromeda ${esc(data.version)} · stage 1 preview</p></div>
        <p class="overhead">Overhead · ${esc(sky.constellationName('settings'))}</p>
      </div>
      <div class="panel m">
        <h2>Motion</h2>
        <p>How much the sky and screens move. Reduced swaps every pan and slide for a quiet crossfade.</p>
        <div class="row"><span class="pill">Animations</span>
          <div class="seg" role="group" aria-label="Motion">${motionBtn('system', 'Match system')}${motionBtn('full', 'Full')}${motionBtn('reduced', 'Reduced')}</div>
        </div>
        <div class="row"><label class="pill" for="twinkle">Star twinkle</label>
          <div class="slide"><input type="range" id="twinkle" min="0" max="100" step="1" value="${twinkle}"><span id="twinkle-val">${twinkleWord(twinkle)}</span></div>
        </div>
      </div>
      <div class="panel m">
        <h2>Claude</h2>
        <p>Not connected yet. Stage 2 links Andromeda to Claude Code on this laptop, using your Pro plan.</p>
      </div>
      <div class="panel m">
        <h2>Sync</h2>
        <p>Not set up yet. A later stage keeps both laptops in step through your private Andromeda-data repo.</p>
      </div>
      <div class="panel m">
        <h2>About</h2>
        <p>The sky is drawn in code, with real constellations placed by hand. Shortcuts: Ctrl or Cmd + 1, 2, 3 to switch tabs, and Ctrl or Cmd + K for the prompt box.</p>
      </div>
    </div>`;
    $$('[data-motion]').forEach((b) => b.addEventListener('click', () => {
      motionPref = b.dataset.motion;
      store.set('motion', motionPref);
      $$('[data-motion]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      sky.redraw();
    }));
    const tw = $('#twinkle');
    const paint = () => tw.style.setProperty('--fill', tw.value + '%');
    paint();
    tw.addEventListener('input', () => {
      twinkle = +tw.value;
      $('#twinkle-val').textContent = twinkleWord(twinkle);
      paint();
      sky.redraw();
    });
    tw.addEventListener('change', () => store.set('twinkle', twinkle));
  }

  renderCourses();
  renderGuides();
  renderSettings();

  // ---------- tabs and transitions ----------
  const PLACEHOLDER = {
    courses: 'Add a course, drop in slides, or set a test date…',
    guides: 'Make a learning guide from these slides…',
    settings: 'Ask Claude to change a setting…',
  };
  let current = null;
  let busy = null;

  function moveIndicator(animate) {
    const tab = $(`.tabs [data-view="${current}"]`), ind = $('.tab-ind');
    if (!tab) return;
    if (!animate) ind.style.transition = 'none';
    ind.style.width = tab.offsetWidth + 'px';
    ind.style.transform = `translateX(${tab.offsetLeft}px)`;
    if (!animate) { ind.offsetWidth; ind.style.transition = ''; }
  }

  function show(id, { instant = false } = {}) {
    if (id === current || !$(`#view-${id}`)) return;
    const prevId = current;
    current = id;
    $$('.tabs [role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === id)));
    moveIndicator(!instant && !!prevId);
    $('#prompt-input').placeholder = PLACEHOLDER[id];

    const next = $(`#view-${id}`), prev = prevId ? $(`#view-${prevId}`) : null;
    const plan = sky.plan(id);
    sky.goTo(id, { instant: !!prevId && instant });
    // Jump any animation still running to its end before starting new ones.
    if (busy) busy.forEach((a) => { if (a.playState === 'running') a.finish(); });
    busy = [];

    if (!prev || instant) {
      $$('.view').forEach((v) => { v.hidden = v !== next; });
      if (!instant) enter(next, plan, 0);
      return;
    }

    if (reduced()) {
      const out = prev.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-out', fill: 'forwards' });
      busy.push(out);
      out.onfinish = () => {
        out.cancel();
        if (current !== prevId) prev.hidden = true;
        if (current !== id) return;
        next.hidden = false; next.scrollTop = 0;
        busy.push(next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-in' }));
      };
      return;
    }

    // The old screen drifts off with the stars and sinks back; the new one arrives from the far side.
    const d = 150, tx = plan.dx * d, ty = plan.dy * d * 0.6;
    const out = prev.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1, filter: 'blur(0px)' },
      { transform: `translate(${tx}px,${ty}px) scale(0.97)`, opacity: 0, filter: 'blur(3px)' },
    ], { duration: Math.min(420, plan.dur * 0.4), easing: 'cubic-bezier(.5,0,.75,.15)', fill: 'forwards' });
    busy.push(out);
    out.onfinish = () => { out.cancel(); if (current !== prevId) prev.hidden = true; };
    next.hidden = false;
    next.scrollTop = 0;
    enter(next, plan, plan.dur * 0.38);
  }

  // Pieces settle in one after another, nearest the incoming side first, with a little spring.
  function enter(view, plan, delay) {
    const items = $$('.m', view);
    const d = 120, tx = -plan.dx * d, ty = -plan.dy * d * 0.6;
    const order = items.map((el, i) => {
      const r = el.getBoundingClientRect();
      return { el, i, key: -(plan.dx * r.left + plan.dy * r.top) };
    });
    if (plan.dx || plan.dy) order.sort((a, b) => b.key - a.key);
    order.forEach(({ el }, n) => {
      const a = el.animate([
        { transform: `translate(${tx}px,${ty}px) scale(0.96)`, opacity: 0 },
        { opacity: 1, offset: 0.45 },
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
      ], { duration: 720, delay: delay + Math.min(n, 12) * 34, easing: 'cubic-bezier(.16,1.12,.3,1)', fill: 'backwards' });
      busy.push(a);
    });
  }

  $$('.tabs [role="tab"]').forEach((t) => t.addEventListener('click', () => show(t.dataset.view)));
  window.addEventListener('resize', () => moveIndicator(false));
  document.fonts.ready.then(() => moveIndicator(false));

  // ---------- prompt box ----------
  const input = $('#prompt-input');
  const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#prompt').requestSubmit(); }
  });
  $('#prompt').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!input.value.trim()) { input.focus(); return; }
    toast('Claude connects in stage 2. Your prompt box is ready for it.');
  });
  $('#attach').addEventListener('click', () => toast('Adding slides comes with courses in stage 2.'));

  let toastTimer = null, toastAnim = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    if (toastAnim) toastAnim.cancel();
    toastAnim = t.animate([
      { opacity: 0, transform: 'translate(-50%, 10px) scale(0.98)' },
      { opacity: 1, transform: 'translate(-50%, 0) scale(1)' },
    ], { duration: reduced() ? 1 : 380, easing: 'cubic-bezier(.16,1.12,.3,1)', fill: 'forwards' });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastAnim = t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
    }, 3200);
  }

  // ---------- model and effort ----------
  const MODELS = [['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']];
  const EFFORT = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['xhigh', 'X-High'], ['max', 'Max']];
  let choice = store.get('model', { model: 'sonnet', effort: 'high' });
  const label = (list, v) => (list.find((x) => x[0] === v) || list[0])[1];
  function renderModel() {
    $('#model').textContent = `${label(MODELS, choice.model)} · ${label(EFFORT, choice.effort)}`;
    $('#mm-models').innerHTML = MODELS.map(([v, l]) => `<button type="button" data-model="${v}" aria-pressed="${choice.model === v}">${l}</button>`).join('');
    $('#mm-effort').innerHTML = EFFORT.map(([v, l]) => `<button type="button" data-effort="${v}" aria-pressed="${choice.effort === v}">${l}</button>`).join('');
  }
  renderModel();
  const menu = $('#model-menu'), modelBtn = $('#model');
  function openMenu(open) {
    if (open === !menu.hidden) return;
    modelBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      menu.hidden = false;
      menu.animate([{ opacity: 0, transform: 'translateY(8px) scale(0.96)' }, { opacity: 1, transform: 'none' }],
        { duration: reduced() ? 1 : 320, easing: 'cubic-bezier(.16,1.12,.3,1)' });
    } else {
      const a = menu.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(6px) scale(0.98)' }], { duration: reduced() ? 1 : 160 });
      a.onfinish = () => { menu.hidden = true; };
    }
  }
  modelBtn.addEventListener('click', (e) => { e.stopPropagation(); openMenu(menu.hidden); });
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.model) choice.model = b.dataset.model;
    if (b.dataset.effort) choice.effort = b.dataset.effort;
    store.set('model', choice);
    renderModel();
  });
  document.addEventListener('click', () => openMenu(false));

  // ---------- shortcuts and menus ----------
  const focusPrompt = () => { openMenu(false); input.focus(); };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { openMenu(false); return; }
    const mod = e.metaKey || e.ctrlKey;
    if (!mod || e.altKey || e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === '1' || k === '2' || k === '3') { e.preventDefault(); show(['courses', 'guides', 'settings'][+k - 1]); }
    else if (k === 'k') { e.preventDefault(); focusPrompt(); }
    else if (k === '=' || k === '+' || k === '-' || k === '0') { e.preventDefault(); } // no page zoom
  });
  // Pinch or Ctrl+wheel zoom is a browser habit: block it.
  window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  // Dropping a file anywhere must never open it as a page.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { e.preventDefault(); toast('Dropping slides onto a course comes in stage 2.'); });

  if (bridge) {
    bridge.onNav((v) => show(v));
    bridge.onFocusPrompt(focusPrompt);
    if (bridge.platform !== 'darwin') {
      $('#brand').addEventListener('click', () => {
        const r = $('#brand').getBoundingClientRect();
        bridge.popupMenu(r.left, r.bottom + 6);
      });
    }
  }
  media.addEventListener('change', () => sky.redraw());

  show(store.get('view', 'courses'), { instant: true });
  window.addEventListener('beforeunload', () => store.set('view', current));
  // Arrive gently on launch.
  requestAnimationFrame(() => enter($(`#view-${current}`), { dx: 0, dy: -1, dur: 900 }, 120));
})();
