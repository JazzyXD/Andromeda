// Andromeda window: tabs, courses, the course page, the prompt box and its conversation panel,
// first-run setup, and the motion that ties them all to the sky.
(function () {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const api = window.andromeda;
  const CON = window.AndromedaConstellations;
  const local = {
    get(k, d) { try { const v = localStorage.getItem('andromeda:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('andromeda:' + k, JSON.stringify(v)); } catch { /* fine */ } },
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const prettyDate = (d) => {
    if (!d) return '';
    const [y, m, day] = d.split('-').map(Number);
    return `${MONTHS[m - 1]} ${day}${y !== new Date().getFullYear() ? ', ' + y : ''}`;
  };
  const SPRING = 'cubic-bezier(.16,1.12,.3,1)';

  document.documentElement.dataset.platform = api.platform;

  // ---------- motion and sky ----------
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motionPref = local.get('motion', 'system');
  const reduced = () => motionPref === 'reduced' || (motionPref === 'system' && media.matches);
  let twinkle = local.get('twinkle', 20);
  const twinkleWord = (v) => (v === 0 ? 'Off' : v <= 25 ? 'Barely' : v <= 60 ? 'Gentle' : 'Lively');
  const sky = window.AndromedaSky.createSky($('#sky'), { reduceMotion: reduced, twinkle: () => (twinkle / 100) * 0.9 });

  // ---------- state ----------
  const S = { courses: [], inbox: [], usage: {}, github: {}, claude: {}, dataDir: '', view: null, course: null };
  const courseById = (id) => S.courses.find((c) => c.id === id);
  const conFor = (c) => CON.COURSE[c.constellation] || CON.COURSE.lyra;

  // ---------- little constellation drawings ----------
  const f1 = (n) => Math.round(n * 10) / 10;
  function conArt(p, e, r, gap) {
    const stars = p.map(([x, y, m = 1]) => `<circle cx="${x}" cy="${y}" r="${f1(r * m * 3.2)}" fill="rgba(233,236,245,0.10)"/><circle cx="${x}" cy="${y}" r="${f1(r * m)}" fill="#F1F3F9"/>`).join('');
    const lines = e.map(([a, b]) => {
      const A = p[a], B = p[b], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, u = gap / L;
      return `M${f1(A[0] + dx * u)},${f1(A[1] + dy * u)}L${f1(B[0] - dx * u)},${f1(B[1] - dy * u)}`;
    }).join('');
    return `<path class="cl" d="${lines}" fill="none" stroke="rgba(233,236,245,0.38)" stroke-width="0.8"/>${stars}`;
  }
  const coverStyle = (tint) => `background:linear-gradient(160deg, rgba(${tint},0.28) 0%, rgba(${tint},0.08) 48%, rgba(8,10,28,0.55) 100%)`;
  const nextUp = (c) => (c.upcoming || []).find((u) => !u.done);

  // ---------- Courses ----------
  function renderCourses() {
    const el = $('#view-courses');
    if (!S.courses.length) {
      el.innerHTML = `<div class="inner">
        <div class="head m"><div><h1>Courses</h1><p>Nothing here yet</p></div><p class="overhead">Overhead · ${esc(sky.constellationName('courses'))}</p></div>
        <div class="empty m">
          <p class="big">Add your first course by asking below.</p>
          <p>Try: <button type="button" class="try" data-try="Add Income Tax 2, Tuesdays and Thursdays 2:25 to 4:10 pm with Dan Carli">“Add Income Tax 2, Tuesdays and Thursdays 2:25 to 4:10 pm with Dan Carli”</button></p>
          <p>You can add several at once, and drop slides onto a course once it exists.</p>
        </div></div>`;
      $$('[data-try]', el).forEach((b) => b.addEventListener('click', () => { input.value = b.dataset.try; grow(); input.focus(); }));
      return;
    }
    const cards = S.courses.map((c) => {
      const k = conFor(c), u = nextUp(c);
      return `<button type="button" class="card m" data-course="${esc(c.id)}">
        <div class="cover" style="${coverStyle(k.tint)}">
          <svg viewBox="0 0 240 96" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${conArt(k.p, k.e, 1.6, 4)}</svg>
          <span class="con">${esc(k.name)}</span>
        </div>
        <div class="body">
          <span class="name">${esc(c.name)}</span>
          <span class="meta">${esc([c.schedule, c.instructor].filter(Boolean).join(' · ') || 'Add a schedule or instructor by asking')}</span>
          <span class="up"><span class="d${u ? '' : ' none'}"></span><span${u ? '' : ' style="color:var(--faint)"'}>${esc(u ? u.title : 'Nothing coming up')}</span><span class="when">${esc(u ? (prettyDate(u.date) || 'Date not set') : '')}</span></span>
        </div>
      </button>`;
    }).join('');
    el.innerHTML = `<div class="inner">
      <div class="head m"><div><h1>Courses</h1><p>${S.courses.length} course${S.courses.length === 1 ? '' : 's'}</p></div><p class="overhead">Overhead · ${esc(sky.constellationName('courses'))}</p></div>
      <div class="grid">${cards}</div></div>`;
    $$('.card', el).forEach((card) => {
      card.addEventListener('click', () => openCourse(card.dataset.course, card));
      dropTarget(card, (paths) => attachToCourse(card.dataset.course, paths));
    });
  }

  // ---------- one course ----------
  function renderCourse(c) {
    const k = conFor(c);
    const up = (c.upcoming || []).map((u) => `<div class="cu-row${u.done ? ' done' : ''}">
        <span class="cu-dot"></span>
        <div class="cu-main"><b>${esc(u.title)}</b><span>${esc(u.covers || (u.done ? 'Done' : 'Scope not set yet'))}</span></div>
        <span class="cu-when">${esc([prettyDate(u.date) || 'Date not set', u.time].filter(Boolean).join(' · '))}</span>
      </div>`).join('') || '<p class="muted">Nothing coming up. Try “The final is Dec 15”.</p>';
    const weeks = (c.weeks || []).map((w, i) => `<div class="wk"><span class="num">${i + 1}</span><div><b>${esc(w.label)}${w.title ? ': ' + esc(w.title) : ''}</b>${w.files.length ? `<span>${esc(w.files.join(', '))}</span>` : ''}</div></div>`).join('')
      || '<p class="muted">No weeks yet. Try “Chapter 12 is taxable income for corporations”.</p>';
    const files = (c.files || []).map((fl) => `<div class="fl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>
        <span class="fl-name">${esc(fl.name)}${fl.note ? `<small>${esc(fl.note)}</small>` : ''}</span><span class="fl-kind">${esc((fl.kind || '').toUpperCase())}</span></div>`).join('')
      || '<p class="muted">Drop slides or PDFs anywhere on this page to add them.</p>';
    $('#view-course').innerHTML = `<div class="inner">
      <button type="button" class="back m" id="back"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>All courses</button>
      <div class="hero">
        <div class="hero-main m">
          <p class="overhead">Overhead · ${esc(k.name)}</p>
          <h1 class="course-title">${esc(c.name)}</h1>
          <p class="sub">${esc([c.school, c.instructor, c.schedule].filter(Boolean).join(' · ') || 'Ask to add the instructor or schedule')}</p>
          ${c.notes ? `<p class="sub notes">${esc(c.notes)}</p>` : ''}
        </div>
        <section class="panel cu m" aria-label="Coming up"><h2 class="cap">Coming up</h2>${up}</section>
      </div>
      <div class="cols">
        <section class="panel m"><h2>Weeks</h2>${weeks}</section>
        <section class="panel m"><h2>Guides</h2><p class="muted">Guides for ${esc(c.name)} will show here. Guide building arrives in stage 3.</p></section>
        <section class="panel m"><h2>Course files</h2>${files}</section>
      </div></div>`;
    $('#back').addEventListener('click', closeCourse);
  }

  function openCourse(id, card) {
    const c = courseById(id);
    if (!c) return;
    S.course = id;
    renderCourse(c);
    const page = $('#view-course'), list = $('#view-courses');
    sky.goTo('con:' + c.constellation);
    setPlaceholder();
    if (reduced() || !card) {
      list.hidden = true; page.hidden = false; page.scrollTop = 0;
      if (!reduced()) enter(page, { dx: 0, dy: -1 }, 0);
      return;
    }
    // The card grows into the page: a frosted panel expands from the card's spot to fill the view.
    const from = card.getBoundingClientRect(), stage = $('#stage').getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'grow-ghost';
    ghost.innerHTML = card.querySelector('.cover').outerHTML;
    document.body.appendChild(ghost);
    const to = { left: stage.left + 16, top: stage.top + 8, width: stage.width - 32, height: stage.height - 150 };
    const grow = ghost.animate([
      { left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px', borderRadius: '14px', opacity: 1 },
      { left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px', borderRadius: '22px', opacity: 1, offset: 0.8 },
      { left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px', borderRadius: '22px', opacity: 0 },
    ], { duration: 900, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'forwards' });
    $$('.card, .head', list).forEach((el) => {
      const a = el === card ? null : el.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.96)' }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
      if (a) setTimeout(() => a.cancel(), 950);
    });
    card.style.visibility = 'hidden';
    setTimeout(() => { list.hidden = true; card.style.visibility = ''; page.hidden = false; page.scrollTop = 0; enter(page, { dx: 0, dy: -1 }, 0); }, 480);
    grow.onfinish = () => ghost.remove();
  }

  function closeCourse() {
    if (!S.course) return;
    const id = S.course;
    S.course = null;
    const page = $('#view-course'), list = $('#view-courses');
    sky.goTo('courses');
    setPlaceholder();
    const out = page.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(16px) scale(.985)' }], { duration: reduced() ? 120 : 260, easing: 'ease-in', fill: 'forwards' });
    out.onfinish = () => {
      out.cancel(); page.hidden = true; list.hidden = false;
      if (reduced()) return;
      const card = $(`.card[data-course="${CSS.escape(id)}"]`, list);
      enter(list, { dx: 0, dy: 1 }, 0);
      if (card) card.animate([{ boxShadow: '0 0 0 1px rgba(159,201,196,.5), 0 0 34px rgba(47,127,134,.45)' }, { boxShadow: '0 10px 30px rgba(2,3,10,.30)' }], { duration: 1200, easing: 'ease-out' });
    };
  }

  // ---------- Guides and Settings ----------
  function renderGuides() {
    $('#view-guides').innerHTML = `<div class="inner">
      <div class="head m"><div><h1>Guides</h1><p>Every learning guide, each with its own constellation</p></div><p class="overhead">Overhead · ${esc(sky.constellationName('guides'))}</p></div>
      <div class="empty m"><p class="big">No guides yet.</p><p>Guide building arrives in stage 3. Your slides are already being saved with each course, ready for it.</p></div></div>`;
  }

  function usageText(u, key, label) {
    const w = u && u[key];
    if (!w || w.pct == null) return '';
    const pct = Math.round(w.pct * 100);
    let reset = '';
    if (w.resetsAt) {
      const d = new Date(w.resetsAt), soon = d - Date.now() < 20 * 3600e3;
      reset = ' · resets ' + (soon ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { weekday: 'short' }));
    }
    return `<span class="u">${label} <span class="meter mini"><i style="width:${Math.min(100, pct)}%;background:${pct > 85 ? '#E8A07A' : key === 'week' ? 'var(--lilac)' : 'var(--teal)'}"></i></span> ${pct}%${reset}</span>`;
  }
  function renderUsage() {
    const html = [usageText(S.usage, 'fiveHour', '5-hour'), usageText(S.usage, 'week', 'Weekly')].filter(Boolean).join('<span class="sep" aria-hidden="true">·</span>');
    $('#usage').innerHTML = html || 'Usage shows after your first prompt';
  }

  function renderSettings() {
    const motionBtn = (v, label) => `<button type="button" data-motion="${v}" aria-pressed="${motionPref === v}">${label}</button>`;
    const cl = S.claude || {}, gh = S.github || {};
    $('#view-settings').innerHTML = `<div class="inner" style="max-width:820px">
      <div class="head m"><div><h1>Settings</h1><p>Andromeda 0.2.0</p></div><p class="overhead">Overhead · ${esc(sky.constellationName('settings'))}</p></div>
      <div class="panel m">
        <h2>Motion</h2>
        <p>How much the sky and screens move. Reduced swaps every pan and slide for a quiet crossfade.</p>
        <div class="row"><span class="pill">Animations</span><div class="seg" role="group" aria-label="Motion">${motionBtn('system', 'Match system')}${motionBtn('full', 'Full')}${motionBtn('reduced', 'Reduced')}</div></div>
        <div class="row"><label class="pill" for="twinkle">Star twinkle</label><div class="slide"><input type="range" id="twinkle" min="0" max="100" step="1" value="${twinkle}"><span id="twinkle-val">${twinkleWord(twinkle)}</span></div></div>
      </div>
      <div class="panel m">
        <h2>Claude</h2>
        <p>${cl.installed ? `Claude Code ${esc(cl.version || '')} is set up on this laptop. Prompts use your own Claude plan.` : 'Claude Code isn\'t installed on this laptop yet.'}</p>
        ${cl.apiKey ? '<p class="warn">An API key is set on this laptop. Andromeda ignores it so prompts use your Pro plan, but other apps may bill it.</p>' : ''}
        <div class="row"><span class="pill">Course prompts default to Sonnet at medium effort. Change it under the prompt box.</span></div>
      </div>
      <div class="panel m">
        <h2>GitHub backup</h2>
        <p>${gh.connected ? `Connected as @${esc(gh.login)}. Every change is saved to ${esc(gh.repo)}.` : 'Not connected. Your courses are only on this laptop.'}</p>
        <div class="row"><span class="pill">${esc(S.dataDir)}</span><div style="display:flex;gap:8px">${gh.connected ? '' : '<button type="button" class="btn" id="gh-connect">Connect GitHub</button>'}<button type="button" class="btn ghost" id="open-data">Open data folder</button></div></div>
      </div>
      <div class="panel m">
        <h2>About</h2>
        <p>The sky is drawn in code, with real constellations placed by hand. Shortcuts: Ctrl or Cmd + 1, 2, 3 to switch tabs, and Ctrl or Cmd + K for the prompt box.</p>
      </div></div>`;
    $$('[data-motion]').forEach((b) => b.addEventListener('click', () => {
      motionPref = b.dataset.motion; local.set('motion', motionPref);
      $$('[data-motion]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      sky.redraw();
    }));
    const tw = $('#twinkle');
    const paint = () => tw.style.setProperty('--fill', tw.value + '%');
    paint();
    tw.addEventListener('input', () => { twinkle = +tw.value; $('#twinkle-val').textContent = twinkleWord(twinkle); paint(); sky.redraw(); });
    tw.addEventListener('change', () => local.set('twinkle', twinkle));
    $('#open-data').addEventListener('click', () => api.openDataFolder());
    const ghb = $('#gh-connect');
    if (ghb) ghb.addEventListener('click', () => showSetup(true));
  }

  function renderAll() {
    renderCourses(); renderGuides(); renderSettings(); renderUsage(); renderInbox();
    if (S.course) { const c = courseById(S.course); if (c) renderCourse(c); else closeCourse(); }
  }

  // ---------- tabs and screen changes ----------
  const PLACEHOLDER = {
    courses: 'Add a course, drop in slides, or set a test date…',
    guides: 'Guide building arrives in stage 3…',
    settings: 'Ask about your courses…',
  };
  function setPlaceholder() {
    const c = S.course && courseById(S.course);
    input.placeholder = c ? `Ask about ${c.name}, add slides, or set a date…` : PLACEHOLDER[S.view] || PLACEHOLDER.courses;
  }
  let busy = [];

  function moveIndicator(animate) {
    const tab = $(`.tabs [data-view="${S.view}"]`), ind = $('.tab-ind');
    if (!tab) return;
    if (!animate) ind.style.transition = 'none';
    ind.style.width = tab.offsetWidth + 'px';
    ind.style.transform = `translateX(${tab.offsetLeft}px)`;
    if (!animate) { void ind.offsetWidth; ind.style.transition = ''; }
  }

  function show(id, { instant = false } = {}) {
    if (id === S.view && !S.course) return;
    if (id === S.view && S.course) { closeCourse(); return; }
    const prevEl = S.course ? $('#view-course') : S.view ? $(`#view-${S.view}`) : null;
    const prevId = S.view;
    S.course = null;
    S.view = id;
    $$('.tabs [role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === id)));
    moveIndicator(!instant && !!prevId);
    setPlaceholder();
    const next = $(`#view-${id}`);
    const plan = sky.plan(id);
    sky.goTo(id, { instant: !!prevId && instant });
    busy.forEach((a) => { if (a.playState === 'running') a.finish(); });
    busy = [];
    if (!prevEl || instant) { $$('.view').forEach((v) => { v.hidden = v !== next; }); return; }
    if (reduced()) {
      const out = prevEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
      busy.push(out);
      out.onfinish = () => {
        out.cancel();
        if (prevEl !== $(`#view-${S.view}`)) prevEl.hidden = true;
        if (S.view !== id) return;
        $$('.view').forEach((v) => { if (v !== next) v.hidden = true; });
        next.hidden = false; next.scrollTop = 0;
        busy.push(next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 }));
      };
      return;
    }
    // The old screen drifts off with the stars and sinks back; the new one arrives from the far side.
    const d = 150, tx = plan.dx * d, ty = plan.dy * d * 0.6;
    const out = prevEl.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1, filter: 'blur(0px)' },
      { transform: `translate(${tx}px,${ty}px) scale(0.97)`, opacity: 0, filter: 'blur(3px)' },
    ], { duration: Math.min(420, plan.dur * 0.4), easing: 'cubic-bezier(.5,0,.75,.15)', fill: 'forwards' });
    busy.push(out);
    out.onfinish = () => { out.cancel(); if (prevEl !== $(`#view-${S.view}`)) prevEl.hidden = true; };
    if (prevEl.id === 'view-course') $('#view-courses').hidden = true;
    next.hidden = false; next.scrollTop = 0;
    enter(next, plan, plan.dur * 0.38);
    local.set('view', id);
  }

  // Pieces settle in one after another, nearest the incoming side first, with a little spring.
  function enter(view, plan, delay) {
    if (reduced()) return;
    const items = $$('.m', view);
    const d = 120, tx = -plan.dx * d, ty = -plan.dy * d * 0.6;
    const order = items.map((el) => { const r = el.getBoundingClientRect(); return { el, key: -(plan.dx * r.left + plan.dy * r.top) }; });
    if (plan.dx || plan.dy) order.sort((a, b) => b.key - a.key);
    order.forEach(({ el }, n) => {
      busy.push(el.animate([
        { transform: `translate(${tx}px,${ty}px) scale(0.96)`, opacity: 0 },
        { opacity: 1, offset: 0.45 },
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
      ], { duration: 720, delay: delay + Math.min(n, 12) * 34, easing: SPRING, fill: 'backwards' }));
    });
  }

  $$('.tabs [role="tab"]').forEach((t) => t.addEventListener('click', () => show(t.dataset.view)));
  window.addEventListener('resize', () => moveIndicator(false));
  document.fonts.ready.then(() => moveIndicator(false));

  // ---------- toast ----------
  let toastTimer = null, toastAnim = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    if (toastAnim) toastAnim.cancel();
    toastAnim = t.animate([{ opacity: 0, transform: 'translate(-50%, 10px) scale(0.98)' }, { opacity: 1, transform: 'translate(-50%, 0) scale(1)' }], { duration: reduced() ? 1 : 380, easing: SPRING, fill: 'forwards' });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastAnim = t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }); }, 3600);
  }

  // ---------- files: drag and drop, paperclip, waiting chips ----------
  function pathsFrom(e) { return [...(e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files : [])].map((fl) => api.pathFor(fl)).filter(Boolean); }
  function dropTarget(el, fn) {
    el.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('drop'); });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.remove('drop'); const p = pathsFrom(e); if (p.length) fn(p); });
  }
  async function attachToCourse(id, paths) {
    try {
      const r = await api.attachTo(id, paths);
      toast(r.changes.length ? `Added ${r.changes.map((c) => c.what).join(', ')}` : 'Nothing was added.');
    } catch (e) { toast(e.message); }
  }
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    const p = pathsFrom(e);
    if (!p.length) return;
    if (S.course) return attachToCourse(S.course, p);
    await api.receive(p);
    toast('Ready to file. Say which course they belong to.');
    input.focus();
  });
  $('#attach').addEventListener('click', async () => {
    const p = await api.pickFiles();
    if (!p.length) return;
    if (S.course) return attachToCourse(S.course, p);
    await api.receive(p);
    input.focus();
  });
  function renderInbox() {
    const box = $('#chips');
    if (!S.inbox.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = `<span class="chips-label">Waiting to be filed:</span>${S.inbox.map((n) => `<span class="chip-file">${esc(n)}</span>`).join('')}<button type="button" class="chip-x" id="clear-inbox">Clear</button>`;
    $('#clear-inbox').addEventListener('click', () => api.clearInbox());
  }

  // ---------- prompt box and conversation ----------
  const input = $('#prompt-input');
  const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#prompt').requestSubmit(); } });

  const convo = $('#convo'), log = $('#convo-log');
  let session = null, running = false, turn = null;

  function openConvo() {
    if (!convo.hidden) return;
    convo.hidden = false;
    $('.dock').classList.add('open');
    if (!reduced()) convo.animate([{ opacity: 0, transform: 'translateY(30px) scaleY(.6)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: SPRING });
    const c = S.course && courseById(S.course);
    $('#convo-chip').textContent = c ? c.name : 'All courses';
  }
  function closeConvo() {
    if (convo.hidden) return;
    if (running) api.stop();
    const done = () => { convo.hidden = true; $('.dock').classList.remove('open'); log.innerHTML = ''; session = null; turn = null; };
    if (reduced()) return done();
    const a = convo.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(40px) scaleY(.5)' }], { duration: 300, easing: 'ease-in' });
    a.onfinish = done;
  }
  $('#convo-close').addEventListener('click', closeConvo);
  $('#convo-new').addEventListener('click', () => { log.innerHTML = ''; session = null; input.focus(); });

  function setRunning(on) {
    running = on;
    $('.send').classList.toggle('stop', on);
    $('.send').setAttribute('aria-label', on ? 'Stop' : 'Send');
  }

  $('#prompt').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (running) { api.stop(); return; }
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    if (!S.claude.installed) { showSetup(true); return; }
    openConvo();
    const c = S.course && courseById(S.course);
    const prompt = c ? `(I'm looking at ${c.name}.) ${text}` : text;
    input.value = ''; grow();
    startTurn(text);
    setRunning(true);
    try { await api.run({ prompt, model: choice.model, effort: choice.effort, sessionId: session }); }
    catch (err) { finishTurn({ ok: false, error: { message: err.message } }); }
  });

  function startTurn(text) {
    const el = document.createElement('div');
    el.className = 'turn';
    el.innerHTML = `<div class="you">${esc(text)}</div>
      <div class="ai">
        <div class="thinking" hidden><button type="button" class="think-btn" aria-expanded="true"><svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.9 7.1L21 12l-7.1 1.9L12 22l-1.9-8.1L3 12l7.1-2.9z" fill="#E8C9A0"/></svg><span class="think-label">Thinking…</span></button><div class="think-text"></div></div>
        <div class="steps"></div>
        <div class="reply"><span class="pulse" aria-label="Working"></span></div>
        <div class="extras"></div>
      </div>`;
    log.appendChild(el);
    const btn = $('.think-btn', el);
    btn.addEventListener('click', () => { const open = btn.getAttribute('aria-expanded') !== 'true'; btn.setAttribute('aria-expanded', String(open)); $('.think-text', el).hidden = !open; });
    turn = { el, started: Date.now(), thinkStart: 0, text: '', changes: [], steps: new Map() };
    scrollLog();
  }
  const scrollLog = () => { const b = $('#convo-body'); b.scrollTop = b.scrollHeight; };

  function collapseThinking() {
    if (!turn || !turn.thinkStart || turn.thinkDone) return;
    turn.thinkDone = true;
    const secs = Math.max(1, Math.round((Date.now() - turn.thinkStart) / 1000));
    $('.think-label', turn.el).textContent = `Thought for ${secs} second${secs === 1 ? '' : 's'}`;
    $('.think-btn', turn.el).setAttribute('aria-expanded', 'false');
    $('.think-text', turn.el).hidden = true;
  }

  function changesCard(changes, stepId) {
    const box = document.createElement('div');
    box.className = 'changes';
    const courses = [...new Set(changes.map((c) => c.course))];
    box.innerHTML = `<div class="ch-head"><span>${changes.length} change${changes.length === 1 ? '' : 's'}${courses.length === 1 ? ' to ' + esc(courses[0]) : ''}</span>${stepId ? '<button type="button" class="pill-btn undo">Undo</button>' : ''}</div>
      ${changes.map((c) => `<div class="ch-row"><span class="plus">+</span><span><span class="muted">${esc(c.where)} · </span>${esc(c.what)}</span></div>`).join('')}`;
    const u = $('.undo', box);
    if (u) u.addEventListener('click', async () => {
      u.disabled = true;
      const r = await api.undo(stepId).catch((e) => ({ ok: false, message: e.message }));
      if (r.ok) { box.classList.add('undone'); u.textContent = 'Undone'; } else { u.disabled = false; toast(r.message || 'Couldn\'t undo that.'); }
    });
    return box;
  }

  function confirmCard(p) {
    const box = document.createElement('div');
    box.className = 'confirm';
    const what = p.kind === 'delete_course' ? `Delete <b>${esc(p.course)}</b> and everything in it?` : `Remove ${p.files.map((x) => `<b>${esc(x)}</b>`).join(', ')} from ${esc(p.course)}?`;
    box.innerHTML = `<p>${what}</p><div class="cf-btns"><button type="button" class="btn danger yes">${p.kind === 'delete_course' ? 'Delete course' : 'Remove'}</button><button type="button" class="btn ghost no">Keep it</button></div>`;
    const answer = async (yes) => {
      $$('button', box).forEach((b) => { b.disabled = true; });
      try {
        const r = await api.answer(p, yes);
        box.innerHTML = yes ? '' : `<p class="muted">Kept ${esc(p.course)}.</p>`;
        if (yes && r.changes.length) box.replaceWith(changesCard(r.changes, r.stepId));
      } catch (e) { toast(e.message); }
    };
    $('.yes', box).addEventListener('click', () => answer(true));
    $('.no', box).addEventListener('click', () => answer(false));
    return box;
  }

  const ERR_HELP = {
    signin: 'Open a terminal, type <code>claude</code>, and sign in with your Claude account once. Then try again.',
    install: 'Install Claude Code from Anthropic, then come back. Settings has a link.',
    limit: 'Your limit resets at the time shown under the prompt box.',
  };

  function finishTurn(ev) {
    if (!turn) return;
    setRunning(false);
    collapseThinking();
    const reply = $('.reply', turn.el), extras = $('.extras', turn.el);
    $('.pulse', reply) && $('.pulse', reply).remove();
    if (!ev.ok && ev.error) {
      reply.innerHTML = `<p class="err">${esc(ev.error.message)}</p>${ERR_HELP[ev.error.code] ? `<p class="muted">${ERR_HELP[ev.error.code]}</p>` : ''}`;
    } else if (ev.refused) {
      reply.innerHTML = '<p>I can only help with your courses here. Try: <button type="button" class="try">When\'s my next test?</button></p>';
      $('.try', reply).addEventListener('click', (e) => { input.value = e.target.textContent; grow(); input.focus(); });
    } else if (!turn.text && ev.text) {
      reply.textContent = ev.text;
    }
    if (ev.ok && ev.changes && ev.changes.length) extras.prepend(changesCard(ev.changes, ev.stepId));
    if (ev.sessionId) session = ev.sessionId;
    turn = null;
    scrollLog();
  }

  api.onClaude((ev) => {
    if (!turn) return;
    const el = turn.el;
    switch (ev.type) {
      case 'thinking-start': turn.thinkStart = Date.now(); $('.thinking', el).hidden = false; break;
      case 'thinking': $('.think-text', el).textContent += ev.delta; break;
      case 'step': {
        let row = turn.steps.get(ev.step.id);
        if (!row) {
          row = document.createElement('div'); row.className = 'step';
          $('.steps', el).appendChild(row); turn.steps.set(ev.step.id, row);
        }
        row.className = 'step ' + ev.step.state;
        row.innerHTML = `<span class="tick">${ev.step.state === 'done' ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>' : ev.step.state === 'failed' ? '!' : ''}</span><span>${esc(ev.step.label)}</span>`;
        break;
      }
      case 'text': {
        collapseThinking();
        const r = $('.reply', el);
        if (!turn.text) r.textContent = '';
        turn.text += ev.delta;
        r.textContent = turn.text;
        break;
      }
      case 'changes': for (const c of ev.changes) { const card = $(`.card[data-course="${CSS.escape(c.courseId || '')}"]`); if (card && !reduced()) card.animate([{ boxShadow: '0 0 0 1px rgba(159,201,196,.6), 0 0 34px rgba(47,127,134,.5)' }, { boxShadow: '0 10px 30px rgba(2,3,10,.30)' }], { duration: 1600, easing: 'ease-out' }); } break;
      case 'confirm': $('.extras', el).appendChild(confirmCard(ev.pending)); break;
      case 'usage': S.usage = ev.usage; renderUsage(); break;
      case 'warn': toast(ev.message); break;
      case 'done': finishTurn(ev); break;
      default: break;
    }
    scrollLog();
  });

  api.onData((d) => { S.courses = d.courses; S.inbox = d.inbox; renderAll(); });

  // ---------- model and effort ----------
  const MODELS = [['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']];
  const EFFORT = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['xhigh', 'X-High'], ['max', 'Max']];
  let choice = local.get('model2', { model: 'sonnet', effort: 'medium' });
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
    if (open) { menu.hidden = false; menu.animate([{ opacity: 0, transform: 'translateY(8px) scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: reduced() ? 1 : 320, easing: SPRING }); }
    else { const a = menu.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(6px) scale(0.98)' }], { duration: reduced() ? 1 : 160 }); a.onfinish = () => { menu.hidden = true; }; }
  }
  modelBtn.addEventListener('click', (e) => { e.stopPropagation(); openMenu(menu.hidden); });
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.model) choice.model = b.dataset.model;
    if (b.dataset.effort) choice.effort = b.dataset.effort;
    local.set('model2', choice);
    renderModel();
  });
  document.addEventListener('click', () => openMenu(false));

  // ---------- first-run setup ----------
  function showSetup(force) {
    const needClaude = !S.claude.installed, needGit = !S.github.connected && !local.get('skipGithub', false);
    if (!force && !needClaude && !needGit) return;
    const box = $('#setup');
    box.hidden = false;
    const render = (gh = {}) => {
      box.innerHTML = `<div class="setup-card glass">
        <h2>Welcome to Andromeda</h2>
        <p class="muted">Two quick things on this laptop, then you're in.</p>
        <div class="setup-step ${S.claude.installed ? 'ok' : ''}">
          <span class="s-num">${S.claude.installed ? '✓' : '1'}</span>
          <div><b>Claude Code</b>
          <p>${S.claude.installed ? `Found Claude Code ${esc(S.claude.version || '')}. Prompts run on your own Claude plan.` : 'Andromeda runs on Claude Code with your own Claude plan. Install it, sign in once by typing <code>claude</code> in a terminal, then check again.'}</p>
          ${S.claude.installed ? '' : '<div class="s-btns"><button type="button" class="btn" id="cc-guide">How to install</button><button type="button" class="btn ghost" id="cc-check">Check again</button></div>'}
          ${S.claude.apiKey ? '<p class="warn">An API key is set on this laptop. Andromeda ignores it so your prompts use your plan.</p>' : ''}</div>
        </div>
        <div class="setup-step ${S.github.connected ? 'ok' : ''}">
          <span class="s-num">${S.github.connected ? '✓' : '2'}</span>
          <div><b>GitHub backup</b>
          ${S.github.connected ? `<p>Connected as @${esc(S.github.login)}. Courses save to ${esc(S.github.repo)}.</p>`
            : gh.code ? `<p>Enter this code on GitHub, then click Authorize.</p><div class="code">${esc(gh.code)}</div><div class="s-btns"><button type="button" class="btn" id="gh-open">Open GitHub</button><span class="muted waiting">${gh.error ? esc(gh.error) : 'Waiting for you to approve…'}</span></div>`
            : `<p>Keeps your courses backed up and, later, the same on both laptops. You approve a short code on GitHub.</p><div class="s-btns"><button type="button" class="btn" id="gh-go">Connect GitHub</button><button type="button" class="btn ghost" id="gh-skip">Not now</button></div>${gh.error ? `<p class="warn">${esc(gh.error)}</p>` : ''}`}
          </div>
        </div>
        <div class="s-foot"><button type="button" class="btn" id="setup-done" ${S.claude.installed ? '' : 'disabled'}>${S.github.connected ? 'Start' : 'Continue'}</button></div>
      </div>`;
      const on = (id, fn) => { const b = $('#' + id, box); if (b) b.addEventListener('click', fn); };
      on('cc-guide', () => api.openExternal('https://code.claude.com/docs/en/setup'));
      on('cc-check', async () => { S.claude = await api.claudeStatus(); render(gh); });
      on('gh-skip', () => { local.set('skipGithub', true); hide(); });
      on('gh-go', async () => {
        try {
          const c = await api.githubStart();
          render(c);
          api.openExternal(c.url);
          S.github = await api.githubWait();
          render({});
          renderSettings();
        } catch (e) { render({ error: e.message }); }
      });
      on('gh-open', () => api.openExternal(gh.url || 'https://github.com/login/device'));
      on('setup-done', hide);
    };
    const hide = () => {
      const a = box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced() ? 1 : 260 });
      a.onfinish = () => { box.hidden = true; box.innerHTML = ''; };
      if (!S.github.connected) api.githubCancel();
    };
    render();
    if (!reduced()) $('.setup-card', box).animate([{ opacity: 0, transform: 'translateY(20px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 600, easing: SPRING });
  }

  // ---------- shortcuts and menus ----------
  const focusPrompt = () => { openMenu(false); input.focus(); };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!menu.hidden) openMenu(false); else if (S.course && document.activeElement !== input) closeCourse(); return; }
    const mod = e.metaKey || e.ctrlKey;
    if (!mod || e.altKey || e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === '1' || k === '2' || k === '3') { e.preventDefault(); show(['courses', 'guides', 'settings'][+k - 1]); }
    else if (k === 'k') { e.preventDefault(); focusPrompt(); }
    else if (k === '=' || k === '+' || k === '-' || k === '0') e.preventDefault();
  });
  window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  api.onNav((v) => show(v));
  api.onFocusPrompt(focusPrompt);
  if (api.platform !== 'darwin') {
    $('#brand').addEventListener('click', () => { const r = $('#brand').getBoundingClientRect(); api.popupMenu(r.left, r.bottom + 6); });
  }
  api.onPushed((r) => { if (r && !r.ok) toast('Saved on this laptop. GitHub backup will retry next time.'); });
  media.addEventListener('change', () => sky.redraw());

  // ---------- start ----------
  (async () => {
    try { Object.assign(S, await api.state()); } catch (e) { toast(e.message); }
    renderAll();
    const first = local.get('view', 'courses');
    show(['courses', 'guides', 'settings'].includes(first) ? first : 'courses', { instant: true });
    requestAnimationFrame(() => enter($(`#view-${S.view}`), { dx: 0, dy: -1, dur: 900 }, 120));
    showSetup(false);
  })();
})();
