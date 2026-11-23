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
  const prettyTime = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  };

  document.documentElement.dataset.platform = api.platform;

  // ---------- motion and sky ----------
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motionPref = local.get('motion', 'system');
  const reduced = () => motionPref === 'reduced' || (motionPref === 'system' && media.matches);
  let twinkle = local.get('twinkle', 20);
  const twinkleWord = (v) => (v === 0 ? 'Off' : v <= 25 ? 'Barely' : v <= 60 ? 'Gentle' : 'Lively');
  // Sky darkness: how much light pollution, from a city sky to a truly dark one. 80 is the sky as first designed.
  let darkness = local.get('darkness', 80);
  const darkWord = (v) => (v < 34 ? 'City' : v < 67 ? 'Suburbs' : 'Dark sky');
  const sky = window.AndromedaSky.createSky($('#sky'), { reduceMotion: reduced, twinkle: () => (twinkle / 100) * 0.9, darkness: () => darkness / 100 });

  // ---------- state ----------
  const S = { courses: [], inbox: [], usage: {}, github: {}, claude: {}, dataDir: '', view: null, course: null, guides: [], subjects: {}, guide: null, plan: null, guideScroll: {}, guideStep: {}, device: null, sync: { state: 'off' } };
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
  // Exams (tests, midterms, finals) and assignments (everything else). Same rule as data.js, for
  // items saved before they had a kind.
  const EXAM_WORDS = /\b(tests?|midterms?|mid-terms?|exams?|examinations?|finals?)\b/i;
  const NOT_EXAM_WORDS = /\b(projects?|papers?|essays?|reports?|presentations?|assignments?|cases?|quiz(zes)?|labs?)\b/i;
  const kindOf = (u) => (u.kind === 'exam' || u.kind === 'assignment' ? u.kind : EXAM_WORDS.test(u.title) && !NOT_EXAM_WORDS.test(u.title) ? 'exam' : 'assignment');
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const isPast = (u) => u.done || (!!u.date && u.date < todayIso());
  const nextUp = (c) => (c.upcoming || []).find((u) => !isPast(u));

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
      card.addEventListener('click', () => openCourse(card.dataset.course));
      dropTarget(card, (paths) => attachToCourse(card.dataset.course, paths));
    });
  }

  // ---------- a course's Exams and Assignments ----------
  // Two tabs. Each shows what's ahead (the next 4, then "Show all"), with past items folded away.
  // Exams show their scope and a Make a guide button; assignments are one line each.
  // Both lists sit in the same spot, so switching tabs never changes the card's height.
  S.cuTab = {}; S.cuOpen = {};
  const TICK = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  function renderComing(c) {
    const box = $('#cu');
    if (!box) return;
    const all = c.upcoming || [];
    const lists = { exam: all.filter((u) => kindOf(u) === 'exam'), assignment: all.filter((u) => kindOf(u) === 'assignment') };
    const ahead = (k) => lists[k].filter((u) => !isPast(u));
    const tab = S.cuTab[c.id] || (ahead('exam').length || !ahead('assignment').length ? 'exam' : 'assignment');
    const when = (u) => esc([prettyDate(u.date) || 'Date not set', prettyTime(u.time)].filter(Boolean).join(' · '));
    const row = (u, k, past) => k === 'exam'
      ? `<div class="cu-row${past ? ' done' : ''}"><span class="cu-dot"></span><div class="cu-main"><b>${esc(u.title)}</b><span${u.covers ? ` title="${esc(u.covers)}"` : ''}>${esc(u.covers || (past ? (u.done ? 'Done' : 'Past') : 'Scope not set yet'))}</span></div>${past ? '' : `<button type="button" class="pill-btn mg" data-test="${esc(u.id)}" title="Plan a learning guide for ${esc(u.title)}">Make a guide</button>`}<span class="cu-when">${when(u)}</span></div>`
      : `<div class="cu-row one${u.done ? ' is-done' : past ? ' done' : ''}${past ? ' past' : ''}" data-id="${esc(u.id)}"><button type="button" class="cu-tick" title="${u.done ? 'Mark not done' : 'Mark done'}" aria-label="${u.done ? 'Mark ' + esc(u.title) + ' not done' : 'Mark ' + esc(u.title) + ' done'}" aria-pressed="${!!u.done}"><i>${u.done ? TICK : ''}</i></button><div class="cu-main"><b>${esc(u.title)}${u.covers ? ` <span>${esc(u.covers)}</span>` : ''}</b></div><span class="cu-when">${when(u)}</span></div>`;
    const list = (k) => {
      const open = S.cuOpen[c.id + k] || {}, next = ahead(k), past = lists[k].filter(isPast);
      const shown = open.all ? next : next.slice(0, 4);
      const empty = k === 'exam' ? 'No exams ahead. Try “The midterm is Oct 22”.' : 'No assignments ahead. Try “Quiz 4 is due Oct 10”.';
      return `<div class="cu-list" data-k="${k}"${k === tab ? '' : ' aria-hidden="true" inert'}>
        ${shown.map((u) => row(u, k, false)).join('') || `<p class="muted">${lists[k].length ? 'Nothing ahead.' : empty}</p>`}
        ${next.length > 4 ? `<button type="button" class="cu-more" data-more="all">${open.all ? 'Show fewer' : `Show all ${next.length}`}</button>` : ''}
        ${past.length ? `<button type="button" class="cu-more" data-more="past" aria-expanded="${!!open.past}">${foldLabel(past)}</button>${open.past ? past.map((u) => row(u, k, true)).join('') : ''}` : ''}
      </div>`;
    };
    const count = (k) => (ahead(k).length ? ` <small>${ahead(k).length}</small>` : '');
    // "5 done", "3 past", or "4 done · 2 past" when it's a mix.
    function foldLabel(items) {
      const d = items.filter((u) => u.done).length, p = items.length - d;
      return [d ? `${d} done` : '', p ? `${p} past` : ''].filter(Boolean).join(' · ');
    }
    box.innerHTML = `<div class="seg cu-tabs" role="tablist"><button type="button" role="tab" data-tab="exam" aria-pressed="${tab === 'exam'}">Exams${count('exam')}</button><button type="button" role="tab" data-tab="assignment" aria-pressed="${tab === 'assignment'}">Assignments${count('assignment')}</button></div>
      <div class="cu-lists">${list('exam')}${list('assignment')}</div>`;
    $$('[data-tab]', box).forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.tab === tab) return;
      S.cuTab[c.id] = b.dataset.tab;
      renderComing(c);
      const shown = $(`.cu-list[data-k="${b.dataset.tab}"]`, box);
      if (!reduced()) shown.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: SPRING });
    }));
    $$('[data-more]', box).forEach((b) => b.addEventListener('click', () => {
      const k = b.closest('.cu-list').dataset.k, o = S.cuOpen[c.id + k] = S.cuOpen[c.id + k] || {};
      o[b.dataset.more] = !o[b.dataset.more];
      renderComing(c);
    }));
    $$('.mg', box).forEach((b) => b.addEventListener('click', () => openPlan({ courseId: c.id, testId: b.dataset.test })));
    // Ticking an assignment: no Claude, saved straight away. One still ahead shows its tick, then
    // slides into the folded list; in the folded list, a click just flips it back.
    $$('.cu-tick', box).forEach((b) => b.addEventListener('click', () => {
      const r = b.closest('.cu-row'), id = r.dataset.id, it = all.find((u) => u.id === id);
      if (!it || b.disabled) return;
      const done = !it.done, save = () => api.setDone(c.id, id, done).catch((e) => toast(e.message));
      b.disabled = true;
      if (!done || r.classList.contains('past')) { save(); return; }
      r.classList.add('is-done'); $('i', b).innerHTML = TICK;
      if (reduced()) { save(); return; }
      setTimeout(() => { r.classList.add('leaving'); setTimeout(save, 340); }, 850);
    }));
  }

  // ---------- one course ----------
  function renderCourse(c) {
    const k = conFor(c);
    const weeks = (c.weeks || []).map((w, i) => `<div class="wk"><span class="num">${i + 1}</span><div><b>${esc(w.label)}${w.title ? ': ' + esc(w.title) : ''}</b>${w.files.length ? `<span>${esc(w.files.join(', '))}</span>` : ''}</div></div>`).join('')
      || '<p class="muted">No weeks yet. Try “Chapter 12 is taxable income for corporations”.</p>';
    const files = (c.files || []).map((fl) => `<div class="fl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>
        <span class="fl-name">${esc(fl.name)}${fl.note ? `<small>${esc(fl.note)}</small>` : ''}</span><span class="fl-kind">${esc((fl.kind || '').toUpperCase())}</span><button type="button" class="fl-more" data-file="${esc(fl.name)}" data-kind="${esc(fl.kind || '')}" aria-haspopup="menu" aria-expanded="false" aria-label="More for ${esc(fl.name)}">${DOTS}</button></div>`).join('')
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
        <section class="panel side m"><div class="panel-head"><h2>Guides</h2><button type="button" class="pill-btn" id="cg-make" title="Plan a learning guide for this course">Make a guide</button></div>${(() => { const gs = S.guides.filter((g) => g.courseId === c.id); return gs.length ? gs.map((g) => `<button type="button" class="cg-row" data-guide="${esc(g.id)}"><b>${esc(g.title.replace(c.name + ': ', ''))}</b><span>${esc(guideStatus(g).text)}</span></button>`).join('') : '<p class="muted">No guides yet.</p>'; })()}</section>
      </div>
      <div class="cols">
        <section class="panel m"><h2>Weeks</h2>${weeks}</section>
        <section class="panel cu m" aria-label="Exams and assignments" id="cu"></section>
        <section class="panel m"><h2>Course files</h2>${files}</section>
      </div></div>`;
    $('#back').addEventListener('click', closeCourse);
    $$('.cg-row', $('#view-course')).forEach((b) => b.addEventListener('click', () => { show('guides'); setTimeout(() => openGuide(b.dataset.guide), 50); }));
    $$('.fl-more', $('#view-course')).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); fileMenu(c, b); }));
    renderComing(c);
    $('#cg-make').addEventListener('click', () => { const ex = (c.upcoming || []).find((u) => kindOf(u) === 'exam' && !isPast(u)); openPlan({ courseId: c.id, testId: ex ? ex.id : undefined }); });
  }

  // Opening and closing a course move like a tab change: the old screen drifts off with the stars
  // while the sky pans, and the new one settles in from the far side. No zoom, no flash.
  function swapScreens(from, to, plan, stillCurrent) {
    busy.forEach((a) => { if (a.playState === 'running') a.finish(); });
    busy = [];
    if (reduced()) { from.hidden = true; to.hidden = false; to.scrollTop = 0; return; }
    const d = 150, tx = plan.dx * d, ty = plan.dy * d * 0.6;
    const out = from.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1, filter: 'blur(0px)' },
      { transform: `translate(${tx}px,${ty}px) scale(0.97)`, opacity: 0, filter: 'blur(3px)' },
    ], { duration: Math.min(420, plan.dur * 0.4), easing: 'cubic-bezier(.5,0,.75,.15)', fill: 'forwards' });
    busy.push(out);
    out.onfinish = () => { out.cancel(); if (stillCurrent()) from.hidden = true; };
    to.hidden = false; to.scrollTop = 0;
    enter(to, plan, plan.dur * 0.38);
  }

  function openCourse(id) {
    const c = courseById(id);
    if (!c) return;
    S.course = id;
    renderCourse(c);
    const plan = sky.plan('con:' + c.constellation);
    sky.goTo('con:' + c.constellation);
    setPlaceholder();
    swapScreens($('#view-courses'), $('#view-course'), plan, () => S.course === id);
  }

  function closeCourse() {
    if (!S.course) return;
    const id = S.course;
    S.course = null;
    const plan = sky.plan('courses');
    sky.goTo('courses');
    setPlaceholder();
    swapScreens($('#view-course'), $('#view-courses'), plan, () => !S.course);
    // A soft glow on the course you just left, so it's easy to find again.
    const card = $(`.card[data-course="${CSS.escape(id)}"]`);
    if (card && !reduced()) busy.push(card.animate([{ boxShadow: '0 0 0 1px rgba(159,201,196,.5), 0 0 34px rgba(47,127,134,.45)' }, { boxShadow: '0 10px 30px rgba(2,3,10,.30)' }], { duration: 1200, delay: plan.dur * 0.5, easing: 'ease-out', fill: 'backwards' }));
  }

  // ---------- Guides and Settings ----------
  // ---------- Guides: the list, the plan screen and the reader ----------
  const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  function guideStatus(g) {
    const pieces = g.pieces || [], done = pieces.filter((p) => p.status === 'done').length;
    const now = pieces.find((p) => p.status === 'building');
    const frac = pieces.length ? done / pieces.length : 0;
    if (g.status === 'done') return { text: 'Ready', frac: 1, tone: 'ok' };
    // Building on the other laptop: say where. If that laptop went quiet, this one can carry on.
    const other = g.lock && S.device && g.lock.device !== S.device.id ? g.lock : null;
    if (other && ['building', 'planned', 'paused'].includes(g.status)) {
      if (other.until <= Date.now()) return { text: `${other.name} stopped answering · ${done} of ${pieces.length} parts`, frac, tone: 'wait', takeover: true };
      if (g.status === 'paused') return { text: `Paused on ${other.name} until ${g.pausedUntil ? clock(g.pausedUntil) : 'the limit resets'} · ${done} of ${pieces.length} parts`, frac, tone: 'wait', elsewhere: true };
      return { text: `Building on ${other.name} · ${done} of ${pieces.length} parts`, frac, tone: 'run', elsewhere: true };
    }
    if (g.status === 'paused') return { text: `Paused until ${g.pausedUntil ? clock(g.pausedUntil) : 'your limit resets'} · ${done} of ${pieces.length} parts`, frac, tone: 'wait' };
    if (g.status === 'stopped') return { text: `Stopped · ${done} of ${pieces.length} parts`, frac, tone: 'wait' };
    if (g.status === 'failed') return { text: `Couldn't finish ${(pieces.find((p) => p.error) || {}).label || 'a part'}`, frac, tone: 'bad' };
    if (g.status === 'planned') return { text: 'Starting…', frac, tone: 'run' };
    const step = S.guideStep[g.id];
    return { text: `Writing ${now ? now.label : 'the next part'}${step ? ' · ' + step : ''} · ${done} of ${pieces.length} parts`, frac, tone: 'run' };
  }
  // What the quizzes say so far: the weeks to review first, or how many quizzes are done.
  function resultsLine(g) {
    const r = g.results || [], taken = r.filter((x) => x.n);
    if (!taken.length) return '';
    const review = taken.filter((x) => x.verdict === 'Review first');
    if (review.length) return `<span class="gres warn">Review first: ${esc(review.map((x) => x.label).join(', '))}</span>`;
    return `<span class="gres">${taken.length === r.length ? 'All quizzes on track' : `Quizzes done: ${taken.length} of ${r.length}, on track so far`}</span>`;
  }
  const badgeArt = (g) => { const b = CON.GUIDE[g.badge] || Object.values(CON.GUIDE)[0]; return `<svg viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">${conArt(b.p, b.e, 1.6, 3)}</svg>`; };

  // The prompt box steps aside where there's nothing to ask: Settings, the guide plan, and a guide being read.
  const placeDock = () => $('.dock').toggleAttribute('data-off', !S.course && (S.view === 'settings' || !!S.guide || (S.view === 'guides' && !!S.plan)));

  function renderGuides() {
    const el = $('#view-guides');
    placeDock();
    const head = `<div class="head m"><div><h1>Guides</h1><p>${S.guides.length ? `${S.guides.length} guide${S.guides.length === 1 ? '' : 's'}` : 'Learning guides built from your slides'}</p></div><p class="overhead">Overhead · ${esc(sky.constellationName('guides'))}</p></div>`;
    if (S.plan) { el.innerHTML = `<div class="inner">${head}${planHtml()}</div>`; wirePlan(); return; }
    const cards = S.guides.map((g) => {
      const st = guideStatus(g);
      return `<button type="button" class="gcard m" data-guide="${esc(g.id)}">
        <div class="gtop">${badgeArt(g)}<div class="t"><small>${esc(g.courseName)}</small><b>${esc(g.title.replace(g.courseName + ': ', ''))}</b><span>${esc(g.weeks.map((w) => w.label).join(', '))}</span></div></div>
        <div class="bar-row"><span class="meter"><i style="width:${Math.round(st.frac * 100)}%;${st.tone === 'wait' ? 'background:var(--gold)' : st.tone === 'bad' ? 'background:#E8A07A' : ''}"></i></span><span>${esc(st.text)}</span></div>
        ${resultsLine(g)}
      </button>`;
    }).join('');
    el.innerHTML = `<div class="inner">${head}
      <div class="g-actions m"><button type="button" class="btn" id="g-new">Plan a guide</button></div>
      ${S.guides.length ? `<div class="ggrid">${cards}</div>` : `<div class="empty m"><p class="big">No guides yet.</p><p>Plan one here, or press Make a guide beside an exam in a course.</p></div>`}</div>`;
    $('#g-new').addEventListener('click', () => openPlan({}));
    $$('.gcard', el).forEach((b) => b.addEventListener('click', () => openGuide(b.dataset.guide)));
  }

  // ---------- a course file's "⋯" menu: Find dates, Remove file ----------
  const DOTS = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="19" cy="12" r="1.7" fill="currentColor"/></svg>';
  const ICON = (d) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const FILE_ICONS = {
    open: ICON('<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>'),
    dates: ICON('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    remove: ICON('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
  };
  let fileMenuBtn = null;
  function closeFileMenu() {
    const m = $('.fl-menu');
    if (fileMenuBtn) fileMenuBtn.setAttribute('aria-expanded', 'false');
    fileMenuBtn = null;
    if (m) m.remove();
  }
  // A bubble beside the "⋯": to its right, or to its left when there isn't room.
  function fileMenu(c, btn) {
    const row = btn.closest('.fl'), open = btn.getAttribute('aria-expanded') === 'true';
    closeDropdowns(); closeFileMenu();
    if (open) return;
    const name = btn.dataset.file, image = /^(png|jpe?g|webp|gif)$/.test(btn.dataset.kind);
    const item = (a, label, title) => `<button type="button" role="menuitem" data-a="${a}"${a === 'remove' ? ' class="danger"' : ''}${title ? ` title="${title}"` : ''}>${FILE_ICONS[a]}<span>${label}</span></button>`;
    const m = document.createElement('div');
    m.className = 'dd-menu fl-menu';
    m.setAttribute('role', 'menu');
    m.innerHTML = item('open', 'Open', 'Opens the original in its usual app')
      + (image ? '' : item('dates', 'Find dates', 'Reads this file for due dates with Sonnet. You check them before anything is added.'))
      + '<hr>' + item('remove', 'Remove');
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight, gap = 12;
    const right = r.right + gap + w <= window.innerWidth - 12;
    const top = Math.max(12, Math.min(window.innerHeight - h - 12, r.top + r.height / 2 - 26));
    m.style.left = (right ? r.right + gap : r.left - gap - w) + 'px';
    m.style.top = top + 'px';
    m.style.setProperty('--tip', (r.top + r.height / 2 - top) + 'px');
    m.classList.add(right ? 'tip-left' : 'tip-right');
    fileMenuBtn = btn;
    btn.setAttribute('aria-expanded', 'true');
    m.animate([{ opacity: 0, transform: `translateX(${right ? -6 : 6}px) scale(.97)` }, { opacity: 1, transform: 'none' }], { duration: reduced() ? 1 : 280, easing: SPRING });
    $('button', m).focus({ preventScroll: true });
    m.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = e.target.closest('[data-a]');
      if (!a) return;
      closeFileMenu();
      if (a.dataset.a === 'open') api.openFile(c.id, name).catch((err) => toast(err.message));
      else if (a.dataset.a === 'dates') checkSize(c, row, name);
      else confirmRemove(c, row, name);
    });
    m.addEventListener('keydown', (e) => {
      const items = $$('button', m), i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFileMenu(); btn.focus(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
    });
  }
  // The bubble sits over the page, so it closes when the page scrolls or the window changes size.
  document.addEventListener('scroll', (e) => { if (fileMenuBtn && !(e.target.closest && e.target.closest('.fl-menu'))) closeFileMenu(); }, true);
  window.addEventListener('resize', () => closeFileMenu());
  // Removing a file asks first, right in its row. No Claude involved, and it can be undone.
  // Find dates on a long file (over 10 pages or slides, or about that many words) asks first,
  // showing roughly what it will cost. Short files go straight ahead.
  async function checkSize(c, row, name) {
    let size = null;
    try { size = await api.fileSize(c.id, name); } catch { /* go ahead */ }
    if (!size || !size.long) { findDates(c.id, name); return; }
    const was = row.innerHTML;
    const restore = () => { row.classList.remove('asking'); row.innerHTML = was; $('.fl-more', row).addEventListener('click', (e) => { e.stopPropagation(); fileMenu(c, $('.fl-more', row)); }); };
    const length = size.pages ? `${size.pages} ${size.unit}` : `about ${size.words.toLocaleString()} words`;
    row.classList.add('asking');
    row.innerHTML = `<span class="fl-ask"><b>${esc(name)}</b> is ${length}. Finding dates in it uses roughly ${size.tokens}k tokens.</span><button type="button" class="btn" data-a="yes">Find dates</button><button type="button" class="btn ghost" data-a="no">Cancel</button>`;
    $('[data-a="no"]', row).focus({ preventScroll: true });
    $('[data-a="no"]', row).addEventListener('click', restore);
    $('[data-a="yes"]', row).addEventListener('click', () => { restore(); findDates(c.id, name); });
  }

  function confirmRemove(c, row, name) {
    const was = row.innerHTML;
    row.classList.add('asking');
    row.innerHTML = `<span class="fl-ask">Remove <b>${esc(name)}</b> from ${esc(c.name)}?</span><button type="button" class="btn danger" data-a="yes">Remove</button><button type="button" class="btn ghost" data-a="no">Keep it</button>`;
    $('[data-a="no"]', row).focus({ preventScroll: true });
    $('[data-a="no"]', row).addEventListener('click', () => { row.classList.remove('asking'); row.innerHTML = was; $('.fl-more', row).addEventListener('click', (e) => { e.stopPropagation(); fileMenu(c, $('.fl-more', row)); }); });
    $('[data-a="yes"]', row).addEventListener('click', async () => {
      $$('button', row).forEach((b) => { b.disabled = true; });
      try {
        const r = await api.answer({ kind: 'remove_files', courseId: c.id, course: c.name, files: [name] }, true);
        toast(`Removed ${name}`, r.stepId ? { label: 'Undo', fn: async () => { const u = await api.undo(r.stepId).catch((e) => ({ ok: false, message: e.message })); toast(u.ok ? `${name} is back` : u.message || 'Couldn\'t undo that.'); } } : null);
      } catch (e) { toast(e.message); row.classList.remove('asking'); row.innerHTML = was; }
    });
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('.fl-menu')) closeFileMenu(); });

  // A frosted dropdown in place of the browser's own menus (keyboard: arrows, Enter, Escape).
  const CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  function ddHtml(id, opts, value) {
    const cur = opts.find((o) => o[0] === value) || opts[0] || ['', ''];
    // Each dropdown gets its own slight variation of the purple, fixed for that dropdown.
    let h = [...id].reduce((a, ch) => Math.imul(a ^ ch.charCodeAt(0), 16777619), 2166136261);
    const r = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
    const pct = (a, b) => Math.round(a + r() * (b - a)) + '%';
    const look = `--cx:${pct(30, 70)};--cy:${pct(30, 70)};--ca:${(0.08 + r() * 0.05).toFixed(3)};--px:${pct(0, 35)};--py:${pct(0, 35)};--pa:${(0.05 + r() * 0.06).toFixed(3)};--tx:${pct(65, 100)};--ty:${pct(65, 100)};--ta:${(0.05 + r() * 0.06).toFixed(3)};--ang:${Math.round(130 + r() * 60)}deg`;
    return `<div class="dd" id="${id}"><button type="button" class="dd-btn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="${id}-l ${id}-v"><span id="${id}-v">${esc(cur[1])}${cur[2] ? ` <small>${esc(cur[2])}</small>` : ''}</span>${CHEV}</button>
      <div class="dd-menu" role="listbox" style="${look}" hidden>${opts.map(([v, l, sub]) => `<button type="button" role="option" data-v="${esc(v)}" aria-selected="${v === cur[0]}"><span>${esc(l)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`).join('')}</div></div>`;
  }
  function closeDropdowns(except) {
    $$('.dd').forEach((d) => { if (d !== except) { $('.dd-menu', d).hidden = true; $('.dd-btn', d).setAttribute('aria-expanded', 'false'); } });
  }
  function wireDd(id, onChange) {
    const root = $('#' + id), btn = $('.dd-btn', root), menu = $('.dd-menu', root);
    const items = () => $$('[data-v]', menu);
    const open = (on) => {
      if (on === !menu.hidden) return;
      btn.setAttribute('aria-expanded', String(on));
      if (!on) { menu.hidden = true; return; }
      closeDropdowns(root);
      menu.hidden = false;
      menu.animate([{ opacity: 0, transform: 'translateY(-6px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: reduced() ? 1 : 280, easing: SPRING });
      (menu.querySelector('[aria-selected="true"]') || items()[0]).focus({ preventScroll: true });
    };
    btn.addEventListener('click', (e) => { e.stopPropagation(); open(menu.hidden); });
    menu.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('[data-v]');
      if (!b) return;
      open(false); btn.focus();
      if (b.getAttribute('aria-selected') !== 'true') onChange(b.dataset.v);
    });
    root.addEventListener('keydown', (e) => {
      const list = items(), i = list.indexOf(document.activeElement);
      if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); e.stopPropagation(); open(false); btn.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (menu.hidden) open(true); else list[Math.min(list.length - 1, i + 1)].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (!menu.hidden) list[Math.max(0, i - 1)].focus(); }
      else if (e.key === 'Tab' && !menu.hidden) open(false);
    });
  }
  document.addEventListener('click', () => closeDropdowns());

  // The plan: everything a guide needs, filled in as far as the app can, with nothing built until Start.
  async function openPlan({ courseId, testId }) {
    const c = courseById(courseId) || S.courses[0];
    if (!c) { toast('Add a course first.'); return; }
    S.plan = { courseId: c.id, testId: testId || '', weekIds: [], subjects: [], exam: '', shortOnTime: false, model: 'opus', effort: 'high', busy: false };
    planCourse(c);
    try { S.plan.subjects = await api.guideGuess(c.name); } catch { S.plan.subjects = ['procedural']; }
    if (S.view !== 'guides' || S.course || S.guide) { renderGuides(); show('guides'); return; }
    swapGuides(-1);
  }
  // Within the Guides tab: the heading stays put (it doesn't change); only what's under it moves.
  // The old part eases away, then the new part settles in.
  function swapGuides(dir, change) {
    const el = $('#view-guides');
    const inHead = (x) => !!x.closest('.head');
    const old = $$('.m', el).filter((x) => !inHead(x) && !(x.parentElement && x.parentElement.closest('.m')));
    const go = () => { if (change) change(); renderGuides(); el.scrollTop = 0; enter(el, { dx: 0, dy: dir }, 0, inHead); };
    if (reduced() || !old.length) { go(); return; }
    const outs = old.map((x) => x.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateY(${dir * -14}px) scale(.985)` }], { duration: 200, easing: 'ease-in', fill: 'forwards' }));
    outs[0].onfinish = go;
  }
  function planCourse(c) {
    const P = S.plan;
    P.courseId = c.id;
    if (P.testId && !(c.upcoming || []).some((u) => u.id === P.testId)) P.testId = '';
    P.weekIds = (c.weeks || []).filter((w) => w.files.length).map((w) => w.id);
  }
  const daysTo = (d) => (d ? Math.ceil((new Date(d + 'T00:00:00') - new Date(new Date().toDateString())) / 864e5) : null);
  function planHtml() {
    const P = S.plan, c = courseById(P.courseId);
    const test = (c.upcoming || []).find((u) => u.id === P.testId);
    const weeks = (c.weeks || []).map((w) => `<label class="pl-week${w.files.length ? '' : ' off'}"><input type="checkbox" data-week="${esc(w.id)}" ${P.weekIds.includes(w.id) ? 'checked' : ''} ${w.files.length ? '' : 'disabled'}><span><b>${esc(w.label)}${w.title ? ': ' + esc(w.title) : ''}</b><small>${w.files.length ? esc(w.files.join(', ')) : 'No files yet'}</small></span></label>`).join('')
      || `<p class="muted">${esc(c.name)} has no weeks yet. Ask below, like “Chapter 12 is taxable income for corporations”, and add its slides.</p>`;
    const days = test ? daysTo(test.date) : null;
    const u = S.usage && S.usage.fiveHour;
    const warn = u && u.pct >= 0.7 ? `<p class="pl-warn m">Your 5-hour limit is at ${Math.round(u.pct * 100)}%. The guide will pause when it runs out and carry on by itself after ${u.resetsAt ? clock(u.resetsAt) : 'it resets'}, as long as Andromeda is open.</p>` : '';
    const nWeeks = P.weekIds.length;
    return `<section class="panel plan m" aria-label="Plan a guide">
      <div class="pl-head m"><h2>Plan a learning guide</h2><button type="button" class="pill-btn" id="pl-cancel">Cancel</button></div>
      <div class="pl-grid m">
        <div class="pl-f"><span id="pl-course-l">Course</span>${ddHtml('pl-course', S.courses.map((x) => [x.id, x.name]), c.id)}</div>
        <div class="pl-f"><span id="pl-test-l">For</span>${ddHtml('pl-test', [['', 'No particular test'], ...(c.upcoming || []).filter((x) => !x.done).map((x) => [x.id, x.title, x.date ? prettyDate(x.date) : 'Date not set'])], P.testId)}</div>
      </div>
      <div class="pl-f m"><span>Weeks</span><div class="pl-weeks">${weeks}</div></div>
      <div class="pl-f m"><span>Kind of course</span><div class="seg pl-subj" role="group" aria-label="Kind of course">${Object.entries(S.subjects).map(([k, l]) => `<button type="button" data-subj="${k}" aria-pressed="${P.subjects.includes(k)}">${esc(l)}</button>`).join('')}</div><small class="pl-note">Guessed from the course name. Pick up to two.</small></div>
      <label class="pl-f m"><span>Exam format</span><input type="text" id="pl-exam" value="${esc(P.exam)}" placeholder="For example: 40 multiple choice and 2 short answer, 2 hours"><small class="pl-note">Optional. Practice questions follow it.</small></label>
      ${days != null && days >= 0 && days < 4 ? `<label class="pl-check m"><input type="checkbox" id="pl-short" ${P.shortOnTime ? 'checked' : ''}> <span>Short on time: ${esc(test.title)} is ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}. Tighter notes, most likely topics first.</span></label>` : ''}
      <div class="pl-grid m">
        <div class="pl-f"><span id="pl-model-l">Model</span>${ddHtml('pl-model', MODELS.map(([v, l]) => [v, l]), P.model)}</div>
        <div class="pl-f"><span id="pl-effort-l">Effort</span>${ddHtml('pl-effort', EFFORT.map(([v, l]) => [v, l]), P.effort)}</div>
      </div>
      ${warn}
      <div class="pl-foot m"><span class="muted">${nWeeks ? `Builds ${nWeeks} week${nWeeks === 1 ? '' : 's'}${nWeeks > 1 ? ', a final quiz' : ''} and an opening, one at a time. You can read each week as soon as it's done.` : 'Pick at least one week with files.'}</span><button type="button" class="btn" id="pl-start" ${nWeeks && P.subjects.length && !P.busy ? '' : 'disabled'}>Build guide</button></div>
    </section>`;
  }
  function wirePlan() {
    const P = S.plan, el = $('#view-guides'), re = () => { const y = el.scrollTop; renderGuides(); el.scrollTop = y; };
    $('#pl-cancel').addEventListener('click', () => swapGuides(1, () => { S.plan = null; }));
    wireDd('pl-course', async (v) => {
      const c = courseById(v); planCourse(c); P.testId = '';
      try { P.subjects = await api.guideGuess(c.name); } catch { /* keep */ }
      re();
    });
    wireDd('pl-test', (v) => { P.testId = v; P.shortOnTime = false; re(); });
    $$('[data-week]', el).forEach((b) => b.addEventListener('change', () => { P.weekIds = $$('[data-week]', el).filter((x) => x.checked).map((x) => x.dataset.week); re(); }));
    $$('[data-subj]', el).forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.subj;
      P.subjects = P.subjects.includes(k) ? P.subjects.filter((x) => x !== k) : [...P.subjects, k].slice(-2);
      re();
    }));
    $('#pl-exam').addEventListener('input', (e) => { P.exam = e.target.value; });
    const sh = $('#pl-short'); if (sh) sh.addEventListener('change', () => { P.shortOnTime = sh.checked; });
    wireDd('pl-model', (v) => { P.model = v; re(); });
    wireDd('pl-effort', (v) => { P.effort = v; re(); });
    $('#pl-start').addEventListener('click', async () => {
      P.busy = true; $('#pl-start').disabled = true;
      try {
        const c = courseById(P.courseId);
        const weekIds = (c.weeks || []).map((w) => w.id).filter((id) => P.weekIds.includes(id));
        const g = await api.guideCreate({ courseId: P.courseId, testId: P.testId || null, weekIds, subjects: P.subjects, exam: P.exam, shortOnTime: P.shortOnTime, model: P.model, effort: P.effort });
        S.plan = null;
        S.guides = [g, ...S.guides.filter((x) => x.id !== g.id)];
        renderGuides();
        openGuide(g.id);
      } catch (e) { P.busy = false; toast(e.message); re(); }
    });
  }

  // Reading a guide: it sits in a locked-down frame and reports scores and scroll position back.
  async function openGuide(id) {
    const g = S.guides.find((x) => x.id === id);
    if (!g) return;
    S.guide = id;
    renderGuideBar();
    await loadGuide();
    swapScreens($('#view-guides'), $('#view-guide'), { dx: 0, dy: -1, dur: 900 }, () => S.guide === id);
    placeDock();
  }
  function closeGuide() {
    if (!S.guide) return;
    S.guide = null;
    renderGuides();
    swapScreens($('#view-guide'), $('#view-guides'), { dx: 0, dy: 1, dur: 900 }, () => !S.guide);
  }
  function renderGuideBar() {
    const g = S.guides.find((x) => x.id === S.guide);
    if (!g) return;
    let v = $('#view-guide');
    if (!$('#gr-frame', v)) {
      v.innerHTML = `<div class="gr"><div class="gr-bar m"><button type="button" class="back" id="gr-back"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>All guides</button><div class="gr-info" id="gr-info"></div><div class="gr-act" id="gr-act"></div></div><div class="gr-frame m"><iframe id="gr-frame" sandbox="allow-scripts" title="Guide"></iframe></div></div>`;
      $('#gr-back', v).addEventListener('click', closeGuide);
    }
    const st = guideStatus(g);
    $('#gr-info', v).innerHTML = `<b>${esc(g.title)}</b><span class="gr-st ${st.tone}">${esc(st.text)}</span>`;
    const act = $('#gr-act', v);
    const busy = ['building', 'planned', 'paused'].includes(g.status);
    const any = (g.pieces || []).some((p) => p.status === 'done');
    act.innerHTML = `${any ? '<button type="button" class="pill-btn" id="gr-save" title="A copy that opens in any browser, in the light version">Save as HTML</button><button type="button" class="pill-btn" id="gr-print" title="Print, or save as a PDF">Print</button>' : ''}${busy ? '<button type="button" class="pill-btn" id="gr-stop">Stop building</button>' : ''}${['stopped', 'failed'].includes(g.status) ? '<button type="button" class="pill-btn" id="gr-resume">Carry on building</button>' : st.takeover ? '<button type="button" class="pill-btn" id="gr-resume" title="Build the rest on this laptop instead">Carry on here</button>' : ''}<button type="button" class="pill-btn" id="gr-del">Delete</button>`;
    const on = (sel, fn) => { const b = $(sel, act); if (b) b.addEventListener('click', fn); };
    on('#gr-stop', () => api.guideStop(g.id).catch((e) => toast(e.message)));
    const standalone = async () => window.AndromedaGuidePage.page({ ...(await api.guideGet(g.id)), standalone: true });
    on('#gr-save', async () => { try { const p = await api.guideExport(g.title, await standalone()); if (p) toast('Saved ' + p.split(/[\\/]/).pop()); } catch (e) { toast(e.message); } });
    on('#gr-print', async () => { try { await api.guidePrint(g.title, await standalone()); } catch (e) { toast(e.message); } });
    on('#gr-resume', () => api.guideResume(g.id).catch((e) => toast(e.message)));
    on('#gr-del', () => {
      act.innerHTML = `<span class="muted">Delete this guide and its scores?</span><button type="button" class="btn danger" id="gr-yes">Delete</button><button type="button" class="btn ghost" id="gr-no">Keep it</button>`;
      $('#gr-no', act).addEventListener('click', renderGuideBar);
      $('#gr-yes', act).addEventListener('click', async () => { const gid = g.id; closeGuide(); try { await api.guideDelete(gid); } catch (e) { toast(e.message); } });
    });
  }
  async function loadGuide() {
    const id = S.guide;
    if (!id) return;
    try {
      const data = await api.guideGet(id);
      if (S.guide !== id) return;
      $('#gr-frame').srcdoc = window.AndromedaGuidePage.page({ ...data, scroll: S.guideScroll[id] || 0 });
    } catch (e) { toast(e.message); }
  }
  window.addEventListener('message', (e) => {
    const f = $('#gr-frame');
    if (!f || e.source !== f.contentWindow || !S.guide || !e.data || typeof e.data !== 'object') return;
    if (e.data.andromeda === 'progress' && typeof e.data.k === 'string') api.guideProgress(S.guide, e.data.k, e.data.v).catch(() => {});
    if (e.data.andromeda === 'scroll' && typeof e.data.y === 'number') S.guideScroll[S.guide] = e.data.y;
  });
  api.onGuides((list) => {
    const before = S.guide && S.guides.find((x) => x.id === S.guide), after = S.guide && list.find((x) => x.id === S.guide);
    if (before && after && before.status !== after.status) setTimeout(loadGuide, 0);
    S.guides = list;
    if (S.view === 'guides' && !S.plan && !S.guide) renderGuides();
    if (S.guide) renderGuideBar();
    if (S.course) { const c = courseById(S.course); if (c) renderCourse(c); }
  });
  api.onGuidePart((p) => { if (S.guide === p.id) loadGuide(); });
  api.onGuideStep((p) => {
    S.guideStep[p.id] = p.label;
    if (S.guide === p.id) renderGuideBar();
    else if (S.view === 'guides' && !S.plan && !S.guide) renderGuides();
  });
  api.onUsage((u) => { S.usage = u; renderUsage(); });

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
      <div class="head m"><div><h1>Settings</h1><p>Andromeda ${esc(S.version || '')}</p></div><p class="overhead">Overhead · ${esc(sky.constellationName('settings'))}</p></div>
      <div class="panel m">
        <h2>Sky and motion</h2>
        <p>How the sky looks and how much it moves. Sky darkness works like light pollution: towards City the faint stars and the Milky Way fade. Reduced animations swap every pan and slide for a quiet crossfade.</p>
        <div class="row"><span class="pill">Animations</span><div class="seg" role="group" aria-label="Motion">${motionBtn('system', 'Match system')}${motionBtn('full', 'Full')}${motionBtn('reduced', 'Reduced')}</div></div>
        <div class="row"><label class="pill" for="twinkle">Star twinkle</label><div class="slide"><input type="range" id="twinkle" min="0" max="100" step="1" value="${twinkle}"><span id="twinkle-val">${twinkleWord(twinkle)}</span></div></div>
        <div class="row"><label class="pill" for="darkness">Sky darkness</label><div class="slide"><input type="range" id="darkness" min="0" max="100" step="1" value="${darkness}"><span id="darkness-val">${darkWord(darkness)}</span></div></div>
      </div>
      <div class="panel m">
        <h2>Interface size</h2>
        <p>Auto picks a size from your screen. You can also use Ctrl or Cmd with = and - to change it, and 0 to go back to Auto.</p>
        <div class="row"><span class="pill" id="zoom-now"></span><div class="seg" role="group" aria-label="Interface size" id="zoom-seg"></div></div>
      </div>
      <div class="panel m">
        <h2>Claude</h2>
        <p>${cl.installed ? `Claude Code ${esc(cl.version || '')} is set up on this laptop. Prompts use your own Claude plan.` : 'Claude Code isn\'t installed on this laptop yet.'}</p>
        ${cl.apiKey ? '<p class="warn">An API key is set on this laptop. Andromeda ignores it so prompts use your Pro plan, but other apps may bill it.</p>' : ''}
        <div class="row"><span class="pill">Course prompts default to Haiku at medium effort; change it under the prompt box. Guides default to Opus at high effort, set on each guide's plan.</span></div>
      </div>
      <div class="panel m">
        <h2>Sync and backup</h2>
        <p>${gh.connected ? `Connected as @${esc(gh.login)}. Every change is saved to ${esc(gh.repo)}, and your other laptop picks it up within a couple of minutes. To set up a second laptop, install Andromeda there and connect the same GitHub account.` : gh.expired ? `Your GitHub sign-in${gh.login ? ` for @${esc(gh.login)}` : ''} stopped working (GitHub cancels older sign-ins after a while). Your courses are safe on this laptop and on GitHub. Reconnect to keep syncing.` : 'Not connected. Your courses are only on this laptop.'}</p>
        ${gh.connected ? '<p class="sync-note" id="set-sync"></p>' : ''}
        <div class="row"><label class="pill" for="dev-name">This laptop</label><div class="sync-row"><input type="text" id="dev-name" maxlength="40" value="${esc((S.device && S.device.name) || '')}" placeholder="For example: school laptop" spellcheck="false"></div></div>
        <div class="row"><span class="pill">${esc(S.dataDir)}</span><div style="display:flex;gap:8px">${gh.connected ? '<button type="button" class="btn ghost" id="sync-now">Sync now</button>' : `<button type="button" class="btn" id="gh-connect">${gh.expired ? 'Reconnect GitHub' : 'Connect GitHub'}</button>`}<button type="button" class="btn ghost" id="open-data">Open data folder</button></div></div>
      </div>
      <div class="panel m">
        <h2>About <span class="ver">v${esc(S.version || '')}</span></h2>
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
    const dk = $('#darkness');
    const paintDark = () => dk.style.setProperty('--fill', dk.value + '%');
    paintDark();
    dk.addEventListener('input', () => { darkness = +dk.value; $('#darkness-val').textContent = darkWord(darkness); paintDark(); sky.redraw(); });
    dk.addEventListener('change', () => local.set('darkness', darkness));
    $('#open-data').addEventListener('click', () => api.openDataFolder());
    const sn = $('#sync-now');
    if (sn) sn.addEventListener('click', syncNow);
    // The name the other laptop sees ("Building on your school laptop"). Saved when you leave the box.
    const dn = $('#dev-name');
    const saveName = async () => {
      if (!S.device || dn.value.trim() === S.device.name) return;
      try { S.device.name = await api.renameDevice(dn.value); dn.value = S.device.name; toast(`This laptop is now called ${S.device.name}`); } catch (e) { toast(e.message); }
    };
    dn.addEventListener('change', saveName);
    dn.addEventListener('keydown', (e) => { if (e.key === 'Enter') dn.blur(); });
    renderSync();
    renderZoom();
    const ghb = $('#gh-connect');
    if (ghb) ghb.addEventListener('click', () => showSetup(true));
  }

  // ---------- sync status (header, and the line in Settings) ----------
  const ago = (t) => {
    const m = Math.floor((Date.now() - t) / 60e3);
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 120 ? 'an hour ago' : `at ${clock(t)}`;
  };
  function syncLine() {
    const st = S.sync || { state: 'off' };
    if (S.github && S.github.expired) return { dot: 'wait', text: 'Reconnect GitHub', title: 'Your GitHub sign-in stopped working. Click to reconnect in Settings.' };
    if (!S.github || !S.github.connected) return { dot: 'off', text: 'Saved on this laptop', title: 'Connect GitHub in Settings to sync your laptops' };
    if (st.state === 'syncing') return { dot: 'run', text: st.at ? `Synced ${ago(st.at)}` : 'Syncing…', title: 'Swapping changes with GitHub' };
    if (st.state === 'offline') return { dot: 'wait', text: 'Offline, saved here', title: st.message };
    if (st.state === 'error') return { dot: 'bad', text: 'Sync problem', title: st.message + ' Click to try again.' };
    if (st.state === 'ok' && st.at) return { dot: '', text: `Synced ${ago(st.at)}`, title: 'Click to sync now' };
    return { dot: 'off', text: 'Not synced yet', title: 'Click to sync now' };
  }
  function renderSync() {
    const l = syncLine(), b = $('#sync');
    b.querySelector('.dot').className = 'dot ' + l.dot;
    $('#sync-text').textContent = l.text;
    b.title = l.title;
    const set = $('#set-sync');
    if (set) {
      const st = S.sync || {};
      set.innerHTML = `<span class="dot ${l.dot}"></span><span>${esc(st.state === 'error' || st.state === 'offline' ? st.message : l.text)}</span>`;
    }
  }
  async function syncNow() {
    if (!S.github || !S.github.connected) { show('settings'); return; }
    try { S.sync = await api.syncNow(); renderSync(); } catch (e) { toast(e.message); }
  }
  $('#sync').addEventListener('click', syncNow);
  api.onSync((st) => { S.sync = st; renderSync(); });
  api.onGithub((gh) => {
    S.github = gh;
    renderSettings(); renderSync();
    if (gh.expired) toast('GitHub sign-in stopped working. Reconnect it in Settings to keep syncing.');
  });
  setInterval(renderSync, 30e3);

  // ---------- interface size ----------
  let zoom = { mode: 'auto', factor: 1, auto: 1, levels: [0.9, 1, 1.1, 1.25, 1.5, 1.75] };
  const pct = (z) => Math.round(z * 100) + '%';
  function renderZoom() {
    const seg = $('#zoom-seg');
    if (!seg) return;
    const opts = [['auto', 'Auto']].concat(zoom.levels.map((z) => [z, pct(z)]));
    seg.innerHTML = opts.map(([v, l]) => `<button type="button" data-zoom="${v}" aria-pressed="${String(zoom.mode) === String(v)}">${l}</button>`).join('');
    $('#zoom-now').textContent = zoom.mode === 'auto' ? `Auto is ${pct(zoom.auto)} on this screen` : `Set to ${pct(zoom.factor)}`;
    $$('[data-zoom]', seg).forEach((b) => b.addEventListener('click', () => api.zoomSet(b.dataset.zoom === 'auto' ? 'auto' : +b.dataset.zoom).then(showZoom)));
  }
  function showZoom(z) {
    if (!z) return;
    zoom = z;
    renderZoom();
    moveIndicator(false);
  }
  api.onZoom(showZoom);
  api.zoomGet().then(showZoom).catch(() => {});

  function renderAll() {
    renderCourses(); renderGuides(); renderSettings(); renderUsage(); renderInbox();
    if (S.course) { const c = courseById(S.course); if (c) renderCourse(c); else closeCourse(); }
  }

  // ---------- tabs and screen changes ----------
  const PLACEHOLDER = {
    courses: 'Add a course, drop in slides, or set a test date…',
    guides: 'Ask about your courses, or ask for a guide…',
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
    if (id === S.view && !S.course && !S.guide) { if (S.plan) { S.plan = null; renderGuides(); } return; }
    if (id === S.view && S.course) { closeCourse(); return; }
    if (id === S.view && S.guide) { closeGuide(); return; }
    const prevEl = S.course ? $('#view-course') : S.guide ? $('#view-guide') : S.view ? $(`#view-${S.view}`) : null;
    const prevId = S.view;
    S.course = null;
    if (S.guide) { S.guide = null; renderGuides(); }
    S.view = id;
    $$('.tabs [role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === id)));
    moveIndicator(!instant && !!prevId);
    setPlaceholder();
    // Settings has nothing to ask Claude about, so the prompt box steps aside there.
    placeDock();
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
  function enter(view, plan, delay, keep) {
    if (reduced()) return;
    const items = $$('.m', view).filter((el) => !(keep && keep(el)));
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
  // action: an optional button in the toast, such as { label: 'Undo', fn }. It stays up a little longer.
  function toast(msg, action) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('has-act', !!action);
    if (action) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'toast-act'; b.textContent = action.label;
      b.addEventListener('click', () => { b.disabled = true; action.fn(); });
      t.append(b);
    }
    if (toastAnim) toastAnim.cancel();
    toastAnim = t.animate([{ opacity: 0, transform: 'translate(-50%, 10px) scale(0.98)' }, { opacity: 1, transform: 'translate(-50%, 0) scale(1)' }], { duration: reduced() ? 1 : 380, easing: SPRING, fill: 'forwards' });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('has-act'); toastAnim = t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }); }, action ? 7000 : 3600);
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
  // Pasting files or a screenshot: they join the waiting files, like dropping them in. Text pastes
  // as text. Word and Excel put a picture of what you copied on the clipboard too; the text wins there.
  input.addEventListener('paste', async (e) => {
    const cd = e.clipboardData, files = cd ? [...cd.files] : [];
    if (!files.length) return;
    const paths = files.map((f) => api.pathFor(f)).filter(Boolean);
    const isImg = (f) => /^image\//.test(f.type);
    if (!paths.length && files.every(isImg) && cd.getData('text/plain').trim()) return;
    e.preventDefault();
    try {
      if (paths.length) await api.receive(paths);
      else for (const f of files) await api.receiveData(f.name, new Uint8Array(await f.arrayBuffer()));
      const pics = !paths.length && files.every(isImg);
      toast(pics ? (files.length > 1 ? 'Pictures added.' : 'Picture added.') + ' Say what to do with it, like “add these dates”.' : 'Ready to file. Say which course they belong to.');
    } catch (err) { toast(err.message); }
  });
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

  // Find dates runs on Sonnet, and only from a click. Nothing saves until you tick and add.
  async function findDates(courseId, file) {
    if (running) { toast('Claude is still working on the last prompt.'); return; }
    const c = courseById(courseId);
    openConvo();
    $('#convo-chip').textContent = c ? c.name : 'All courses';
    startTurn(`Find dates in ${file}`);
    turn.job = { courseId, file };
    setRunning(true);
    try { await api.findDates({ courseId, file }); }
    catch (err) { finishTurn({ ok: false, error: { message: err.message } }); }
  }

  // The checklist: tick what's right, click a name or date to fix it, add any others.
  const PENCIL = '<svg class="pen" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>';
  function datesCard(job, items) {
    const c = courseById(job.courseId);
    const box = document.createElement('div');
    box.className = 'dates';
    const has = (it) => !!(c && (c.upcoming || []).some((u) => u.title.toLowerCase() === it.title.toLowerCase() && (u.date || '') === (it.date || '')));
    const rows = items.map((it) => ({ ...it, on: !has(it), dup: has(it), edited: false }));
    let editing = null; // { i, field }

    box.innerHTML = `<div class="dt-head"><span>${items.length ? `Found ${items.length} date${items.length === 1 ? '' : 's'} in ${esc(job.file)}` : `No dates found in ${esc(job.file)}`}</span></div>
      <p class="dt-sub">${items.length ? 'Click a name or date to fix it, untick anything that doesn\'t belong, and add any others.' : 'You can still add your own.'}</p>
      <div class="dt-rows"></div>
      <button type="button" class="dt-more">+ Add a date</button>
      <div class="dt-foot"><button type="button" class="btn dt-add"></button><button type="button" class="btn ghost dt-skip">Skip</button></div>`;
    const list = $('.dt-rows', box), add = $('.dt-add', box);

    const when = (r) => [prettyDate(r.date) || 'No date', prettyTime(r.time)].filter(Boolean).join(' · ');
    function render() {
      list.innerHTML = rows.map((r, i) => {
        const titleField = editing && editing.i === i && editing.field === 'title'
          ? `<input class="ed-input ed-title-in" value="${esc(r.title)}" placeholder="Name, like Assignment 2" aria-label="Name">`
          : `<button type="button" class="ed ed-title" data-i="${i}" data-f="title" aria-label="Edit name: ${esc(r.title || 'no name yet')}">${esc(r.title || 'Add a name')}${PENCIL}</button>`;
        const dateField = editing && editing.i === i && editing.field === 'date'
          ? `<span class="ed-when-in"><input type="date" class="ed-input ed-date-in" value="${esc(r.date)}" aria-label="Date"><input type="time" class="ed-input ed-time-in" value="${esc(r.time)}" aria-label="Time (optional)"><button type="button" class="pill-btn ed-done">Done</button></span>`
          : `<button type="button" class="ed ed-date${r.date ? '' : ' empty'}" data-i="${i}" data-f="date" aria-label="Edit date: ${esc(when(r))}">${esc(when(r))}${PENCIL}</button>`;
        const src = r.manual ? 'Added by you' : `“${esc(r.quote)}”`;
        const tags = [r.dup && !r.edited ? 'already added' : '', r.edited && !r.manual ? 'edited by you' : ''].filter(Boolean).join(' · ');
        return `<div class="dt-row${r.on ? '' : ' off'}${r.dup ? ' dup' : ''}">
          <label class="dt-check"><input type="checkbox" data-i="${i}" ${r.on ? 'checked' : ''} aria-label="Include ${esc(r.title || 'this item')}"><span class="dt-box" aria-hidden="true"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg></span></label>
          <span class="dt-main"><span class="dt-line">${titleField}${dateField}</span>
            ${r.covers ? `<span class="dt-covers">${esc(r.covers)}</span>` : ''}
            <span class="dt-quote">${src}${tags ? ' · ' + tags : ''}</span></span>
        </div>`;
      }).join('');
      const n = rows.filter((r) => r.on && r.title.trim()).length;
      add.textContent = n ? `Add ${n}` : 'Nothing ticked';
      add.disabled = !n || !!editing;

      $$('input[type=checkbox]', list).forEach((b) => b.addEventListener('change', () => { rows[+b.dataset.i].on = b.checked; render(); }));
      $$('.ed', list).forEach((b) => b.addEventListener('click', () => { commit(); editing = { i: +b.dataset.i, field: b.dataset.f }; render(); }));
      const ti = $('.ed-title-in', list);
      if (ti) {
        ti.focus(); ti.select();
        ti.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); render(); } if (e.key === 'Escape') { editing = null; render(); } });
        ti.addEventListener('blur', () => setTimeout(() => { if (editing && editing.field === 'title') { commit(); render(); } }, 120));
      }
      const di = $('.ed-date-in', list);
      if (di) {
        di.focus();
        const wrap = di.parentElement;
        wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); render(); } if (e.key === 'Escape') { editing = null; render(); } });
        $('.ed-done', wrap).addEventListener('click', () => { commit(); render(); });
      }
    }
    // Save whatever field is open into the row.
    function commit() {
      if (!editing) return;
      const r = rows[editing.i];
      if (editing.field === 'title') {
        const v = ($('.ed-title-in', list) || {}).value;
        if (v != null && v.trim() && v.trim() !== r.title) { r.title = v.trim().slice(0, 80); r.edited = true; r.on = true; }
      } else {
        const d = ($('.ed-date-in', list) || {}).value || '', t = ($('.ed-time-in', list) || {}).value || '';
        if (d !== r.date || t !== r.time) { r.date = d; r.time = t; r.edited = true; r.on = true; }
      }
      if (r.manual && !r.title.trim() && editing.field === 'title') { rows.splice(editing.i, 1); }
      editing = null;
    }
    render();

    $('.dt-more', box).addEventListener('click', () => {
      commit();
      rows.push({ title: '', date: '', time: '', covers: '', quote: '', page: null, on: true, manual: true, edited: false });
      editing = { i: rows.length - 1, field: 'title' };
      render();
    });
    add.addEventListener('click', async () => {
      commit();
      const picked = rows.filter((r) => r.on && r.title.trim()).map(({ title, kind, date, time, covers }) => ({ title, kind, date, time, covers }));
      if (!picked.length) return render();
      add.disabled = true;
      try {
        const r = await api.addDates(job.courseId, picked);
        box.replaceWith(r.changes.length ? changesCard(r.changes, r.stepId) : Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Those are all added already.' }));
      } catch (e) { add.disabled = false; toast(e.message); }
    });
    $('.dt-skip', box).addEventListener('click', () => { box.innerHTML = '<p class="muted">Skipped. Nothing was added.</p>'; });
    return box;
  }

  // Claude's replies: paragraphs, **bold**, `code`, and "- " or "1. " lists. Everything is escaped first.
  function richText(t) {
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    const out = [];
    let list = null, para = [];
    const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
    const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((x) => `<li>${inline(x)}</li>`).join('')}</${list.tag}>`); list = null; } };
    for (const line of String(t).split('\n')) {
      const m = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/.exec(line);
      if (m) {
        flushPara();
        const tag = m[1] ? 'ul' : 'ol';
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push(m[3]);
      } else if (!line.trim()) { flushPara(); flushList(); }
      else { flushList(); para.push(line); }
    }
    flushPara(); flushList();
    return out.join('');
  }

  // Weeks found in a document: the same tick-and-fix checklist as dates. Click a label or what it
  // covers to rename it, untick what doesn't belong, add any that are missing.
  function weeksCard(ev) {
    const c = courseById(ev.courseId);
    const box = document.createElement('div');
    box.className = 'dates weeks';
    const has = (w) => !!(c && (c.weeks || []).some((x) => x.label.toLowerCase() === w.label.toLowerCase()));
    const rows = ev.items.map((w) => ({ ...w, on: !has(w), dup: has(w), edited: false }));
    let editing = null; // { i, field }
    box.innerHTML = `<div class="dt-head"><span>Found ${rows.length} week${rows.length === 1 ? '' : 's'} for ${esc(ev.course)}</span></div>
      <p class="dt-sub">Click a week or what it covers to rename it, untick anything that doesn't belong, and add any others.</p>
      <div class="dt-rows"></div>
      <button type="button" class="dt-more">+ Add a week</button>
      <div class="dt-foot"><button type="button" class="btn dt-add"></button><button type="button" class="btn ghost dt-skip">Skip</button></div>`;
    const list = $('.dt-rows', box), add = $('.dt-add', box);
    const field = (r, i, f, ph) => (editing && editing.i === i && editing.field === f
      ? `<input class="ed-input ed-${f}-in" value="${esc(r[f])}" placeholder="${ph}" aria-label="${f === 'label' ? 'Week' : 'What it covers'}">`
      : `<button type="button" class="ed ed-${f}${r[f] ? '' : ' empty'}" data-i="${i}" data-f="${f}" aria-label="Edit ${f === 'label' ? 'week' : 'what it covers'}: ${esc(r[f] || 'nothing yet')}">${esc(r[f] || (f === 'label' ? 'Name this week' : 'What it covers'))}${PENCIL}</button>`);
    function render() {
      list.innerHTML = rows.map((r, i) => `<div class="dt-row${r.on ? '' : ' off'}${r.dup ? ' dup' : ''}">
          <label class="dt-check"><input type="checkbox" data-i="${i}" ${r.on ? 'checked' : ''} aria-label="Include ${esc(r.label || 'this week')}"><span class="dt-box" aria-hidden="true"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg></span></label>
          <span class="dt-main"><span class="dt-line wk-line">${field(r, i, 'label', 'Week 3')}${field(r, i, 'title', 'Chapter 3: Ethics')}</span>
            ${r.dup || r.edited || r.manual ? `<span class="dt-quote">${[r.manual ? 'Added by you' : '', r.dup && !r.edited ? 'already in this course' : '', r.edited && !r.manual ? 'edited by you' : ''].filter(Boolean).join(' · ')}</span>` : ''}</span>
        </div>`).join('');
      const n = rows.filter((r) => r.on && r.label.trim()).length;
      add.textContent = n ? `Add ${n} week${n === 1 ? '' : 's'}` : 'Nothing ticked';
      add.disabled = !n || !!editing;
      $$('input[type=checkbox]', list).forEach((b) => b.addEventListener('change', () => { rows[+b.dataset.i].on = b.checked; render(); }));
      $$('.ed', list).forEach((b) => b.addEventListener('click', () => { commit(); editing = { i: +b.dataset.i, field: b.dataset.f }; render(); }));
      const inp = $('.ed-input', list);
      if (inp) {
        inp.focus(); inp.select();
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); const next = editing.field === 'label' && !e.shiftKey ? 'title' : null; const i = editing.i; commit(); if (next && rows[i]) editing = { i, field: next }; render(); } if (e.key === 'Escape') { editing = null; render(); } });
        inp.addEventListener('blur', () => setTimeout(() => { if (editing && $('.ed-input', list) === inp) { commit(); render(); } }, 120));
      }
    }
    function commit() {
      if (!editing) return;
      const r = rows[editing.i], inp = $('.ed-input', list);
      const v = inp ? inp.value.trim().slice(0, editing.field === 'label' ? 40 : 120) : r[editing.field];
      if (v !== r[editing.field]) { r[editing.field] = v; r.edited = true; r.on = true; if (editing.field === 'label') r.dup = has(r); }
      if (r.manual && !r.label.trim() && !r.title.trim() && editing.field === 'title') rows.splice(editing.i, 1);
      editing = null;
    }
    render();
    $('.dt-more', box).addEventListener('click', () => {
      commit();
      rows.push({ label: `Week ${rows.length + 1}`, title: '', on: true, manual: true, edited: false, dup: false });
      editing = { i: rows.length - 1, field: 'title' };
      render();
    });
    add.addEventListener('click', async () => {
      commit();
      const picked = rows.filter((r) => r.on && r.label.trim()).map(({ label, title }) => ({ label, title }));
      if (!picked.length) return render();
      add.disabled = true;
      try {
        const r = await api.addWeeks(ev.courseId, picked);
        box.replaceWith(r.changes.length ? changesCard(r.changes, r.stepId) : Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Those weeks are all in the course already.' }));
      } catch (e) { add.disabled = false; toast(e.message); }
    });
    $('.dt-skip', box).addEventListener('click', () => { box.innerHTML = '<p class="muted">Skipped. No weeks were added.</p>'; });
    return box;
  }

  function offerCard(ev) {
    const box = document.createElement('div');
    box.className = 'offer';
    box.innerHTML = `<div><b>Find dates in ${esc(ev.file)}</b><span>Runs once on Sonnet. You check and fix every date before anything is added.</span></div><button type="button" class="btn">Find dates</button>`;
    $('.btn', box).addEventListener('click', () => { box.remove(); findDates(ev.courseId, ev.file); });
    return box;
  }

  function guideOfferCard(ev) {
    const box = document.createElement('div');
    box.className = 'offer';
    box.innerHTML = `<div><b>Plan a guide${ev.test ? ' for ' + esc(ev.test) : ''}</b><span>${esc(ev.course)}. You pick the weeks and check the details before anything is built.</span></div><button type="button" class="btn">Open the plan</button>`;
    $('.btn', box).addEventListener('click', () => openPlan({ courseId: ev.courseId, testId: ev.testId }));
    return box;
  }

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
      reply.innerHTML = richText(ev.text);
    }
    if (ev.ok && ev.changes && ev.changes.length) extras.prepend(changesCard(ev.changes, ev.stepId));
    // A quiet note of what this prompt used. "Reused" is text Claude had seen recently, which counts for much less.
    if (ev.tokens) {
      const t = ev.tokens, k = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));
      const fresh = t.input + t.cacheWrite + t.output, reused = t.cacheRead;
      const note = document.createElement('div');
      note.className = 'tok';
      note.title = `New input ${t.input + t.cacheWrite}, reply ${t.output}, reused ${reused}`;
      const who = ev.model ? ev.model[0].toUpperCase() + ev.model.slice(1) + ' · ' : '';
      note.textContent = `${who}${k(fresh)} tokens${reused ? ` · ${k(reused)} reused` : ''}`;
      turn.el.querySelector('.ai').appendChild(note);
    }
    if (turn.job && ev.ok && !ev.proposed) $('.extras', turn.el).appendChild(datesCard(turn.job, []));
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
        r.innerHTML = richText(turn.text);
        break;
      }
      case 'text-reset': turn.text = ''; $('.reply', el).innerHTML = '<span class="pulse" aria-label="Working"></span>'; break;
      case 'changes': for (const c of ev.changes) { const card = $(`.card[data-course="${CSS.escape(c.courseId || '')}"]`); if (card && !reduced()) card.animate([{ boxShadow: '0 0 0 1px rgba(159,201,196,.6), 0 0 34px rgba(47,127,134,.5)' }, { boxShadow: '0 10px 30px rgba(2,3,10,.30)' }], { duration: 1600, easing: 'ease-out' }); } break;
      case 'confirm': $('.extras', el).appendChild(confirmCard(ev.pending)); break;
      case 'dates': if (turn.job) $('.extras', el).appendChild(datesCard(turn.job, ev.items)); break;
      case 'offer': $('.extras', el).appendChild(offerCard(ev)); break;
      case 'weeks': $('.extras', el).appendChild(weeksCard(ev)); break;
      case 'guide-offer': $('.extras', el).appendChild(guideOfferCard(ev)); break;
      case 'usage': S.usage = ev.usage; renderUsage(); break;
      case 'warn': toast(ev.message); break;
      case 'done': finishTurn(ev); break;
      default: break;
    }
    scrollLog();
  });

  api.onData((d) => { S.courses = d.courses; S.inbox = d.inbox; if (S.plan && !courseById(S.plan.courseId)) S.plan = null; renderAll(); });

  // ---------- model and effort ----------
  const MODELS = [['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']];
  const EFFORT = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['xhigh', 'X-High'], ['max', 'Max']];
  let choice = local.get('model4', { model: 'haiku', effort: 'medium' });
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
    local.set('model4', choice);
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
  const focusPrompt = () => { openMenu(false); if (S.view === 'settings' && !S.course) show('courses'); input.focus(); };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if ($('.fl-menu')) closeFileMenu(); else if (!menu.hidden) openMenu(false); else if (S.course && document.activeElement !== input) closeCourse(); return; }
    const mod = e.metaKey || e.ctrlKey;
    if (!mod || e.altKey || e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === '1' || k === '2' || k === '3') { e.preventDefault(); show(['courses', 'guides', 'settings'][+k - 1]); }
    else if (k === 'k') { e.preventDefault(); focusPrompt(); }
    else if (k === '=' || k === '+') { e.preventDefault(); api.zoomStep(1).then(showZoom); }
    else if (k === '-') { e.preventDefault(); api.zoomStep(-1).then(showZoom); }
    else if (k === '0') { e.preventDefault(); api.zoomStep(0).then(showZoom); }
  });
  window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  api.onNav((v) => show(v));
  api.onFocusPrompt(focusPrompt);
  if (api.platform !== 'darwin') {
    $('#brand').addEventListener('click', () => { const r = $('#brand').getBoundingClientRect(); api.popupMenu(r.left, r.bottom + 6); });
  }
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
