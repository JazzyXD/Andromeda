// Learning guides: planning, building them a piece at a time with Claude, and saving progress.
//
// Folder layout (inside your Andromeda data):
//   guides/<id>/guide.json        the plan and how far the build has got
//   guides/<id>/parts/<piece>.html  each finished piece (the opening, each week, the ending)
//   guides/<id>/progress.json     quiz scores, confidence ratings and typed answers
//
// Claude writes only the content of each piece, with the building blocks from the guide skills
// (boxes, quiz blocks, typed blanks, tables). Andromeda adds the page around it: title, table of
// contents, styling, quiz and blank scripts, the CHECK list and the confidence table.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { EventEmitter } = require('events');
const { Invalid } = require('./data');
const C = require('../shared/constellations');

const RULES_DIR = path.join(__dirname, 'guide-rules');
const SUBJECTS = {
  procedural: { file: 'guide-procedural', name: 'Procedures and calculations' },
  rules: { file: 'guide-rules', name: 'Rules and standards' },
  sciences: { file: 'guide-sciences', name: 'Sciences' },
  humanities: { file: 'guide-humanities', name: 'Humanities' },
  'social-sciences': { file: 'guide-social-sciences', name: 'Social sciences' },
};
const rules = (name) => fs.readFileSync(path.join(RULES_DIR, name + '.md'), 'utf8');

const now = () => new Date().toISOString();
const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 50) || 'guide';
const strip = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// ---------- checking a piece before it's saved ----------
// Claude's HTML only ever runs inside a locked-down frame with no internet and no access to the app,
// but anything that isn't plain content is still removed here.
function cleanPart(html) {
  let h = String(html || '');
  h = h.replace(/<!--[\s\S]*?-->/g, '');
  h = h.replace(/<(script|style|iframe|object|embed|svg|math|template|noscript|form|textarea|select|button)\b[\s\S]*?<\/\1\s*>/gi, '');
  h = h.replace(/<\/?(html|head|body|main|link|meta|base|img|video|audio|source|script|style|iframe|object|embed|form|button|select|textarea|frame|frameset)\b[^>]*>/gi, '');
  h = h.replace(/\s(on\w+|style|src|srcset|formaction|xlink:href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  h = h.replace(/\shref\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, ''); // only links within the guide
  return h.trim();
}

// Checks Claude can fix. Returns a list of problems (empty when it's good).
function checkPart(html, piece) {
  const problems = [];
  if (html.length < 200) problems.push('The piece is nearly empty.');
  const quizzes = [...html.matchAll(/<div\b[^>]*class="[^"]*\bquiz\b[^"]*"[^>]*>/g)].map((m) => m[0]);
  const quizId = (tag) => (/\sid="([^"]+)"/.exec(tag) || [])[1];
  for (const q of quizzes) if (!quizId(q)) problems.push('Every quiz block needs an id.');
  const ids = quizzes.map(quizId);
  const want = piece.id === 'start' ? 'warmup-quiz' : piece.id === 'finish' ? 'final-quiz' : `${piece.id}-quiz`;
  if (!ids.includes(want)) problems.push(`This piece must contain the quiz block with id "${want}".`);
  for (const m of html.matchAll(/<div\b[^>]*class="q"[^>]*>/g)) {
    const a = (/data-a="([^"]*)"/.exec(m[0]) || [])[1];
    if (!/^[A-D]$/.test(a || '')) { problems.push('Every quiz question needs data-a set to the letter of the right option (A to D).'); break; }
  }
  if (/<div\b[^>]*class="q"/.test(html) && !/class="why"/.test(html)) problems.push('Quiz questions need their "why" explanation.');
  for (const m of html.matchAll(/<input\b[^>]*>/g)) {
    if (!/class="blank"/.test(m[0]) || !/data-ans="[^"]+"/.test(m[0])) { problems.push('Every input must be a typed blank: <input class="blank" data-ans="answer" aria-label="what goes here">.'); break; }
  }
  if (/^w\d+$/.test(piece.id) && !new RegExp(`<h2\\b[^>]*id="${piece.id}"`).test(html)) problems.push(`Start the week with <h2 id="${piece.id}">.`);
  return problems;
}

// A short outline of a finished piece (headings and the exact-statement boxes), so later pieces can
// refer back to it without re-reading every slide.
function condense(html) {
  const out = [];
  const re = /<h([23])\b[^>]*>([\s\S]*?)<\/h\1>|<div class="box (key|watch)">([\s\S]*?)<\/div>\s*(?=<|$)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) out.push((m[1] === '2' ? '## ' : '- ') + strip(m[2]));
    else out.push(`  ${m[3] === 'key' ? 'KEY' : 'WATCH OUT'}: ${strip(m[4]).replace(/^(KEY|WATCH OUT):\s*/, '').slice(0, 260)}`);
  }
  return out.join('\n').slice(0, 6000);
}

// What a course name most likely is, for the subject skill. The user confirms it on the plan screen.
function guessSubjects(name) {
  const n = String(name).toLowerCase();
  if (/tax/.test(n)) return ['procedural', 'rules'];
  if (/audit|law|legal|ethic|assurance|governance/.test(n)) return ['rules'];
  if (/account|financ|statistic|quantitative|math|econom|cost|budget|controllership|business systems/.test(n)) return ['procedural'];
  if (/biolog|anatom|physiolog|chemi|physics|neuro|health sci/.test(n)) return ['sciences'];
  if (/relig|philos|histor|magic|witch|literat|theolog|classics/.test(n)) return ['humanities'];
  if (/psych|sociol|anthrop|social|behaviou?r|deviance|child|develop/.test(n)) return ['social-sciences'];
  return ['procedural'];
}

class GuideStore extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
  }

  dir(id, ...rest) { return this.store.p('guides', id, ...rest); }

  async list() {
    const dirs = await fsp.readdir(this.store.p('guides'), { withFileTypes: true }).catch(() => []);
    const out = [];
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      try {
        const g = JSON.parse(await fsp.readFile(this.dir(d.name, 'guide.json'), 'utf8'));
        g.results = await this.results(g);
        out.push(g);
      } catch { /* skip */ }
    }
    return out.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  }

  async get(id) {
    const g = JSON.parse(await fsp.readFile(this.dir(id, 'guide.json'), 'utf8'));
    const parts = {};
    for (const p of g.pieces) {
      try { parts[p.id] = await fsp.readFile(this.dir(id, 'parts', p.id + '.html'), 'utf8'); } catch { /* not built yet */ }
    }
    let progress = {};
    try { progress = JSON.parse(await fsp.readFile(this.dir(id, 'progress.json'), 'utf8')); } catch { /* none yet */ }
    return { guide: g, parts, progress };
  }

  async save(g) {
    g.updated = now();
    await fsp.mkdir(this.dir(g.id, 'parts'), { recursive: true });
    await fsp.writeFile(this.dir(g.id, 'guide.json'), JSON.stringify(g, null, 2));
    this.emit('changed', g);
  }

  // A new guide from the plan screen. Nothing is built until build() is called.
  async create(plan) {
    const c = await this.store.findCourse(plan.courseId);
    const weeks = (plan.weekIds || []).map((wid) => c.weeks.find((w) => w.id === wid)).filter(Boolean);
    if (!weeks.length) throw new Invalid('Pick at least one week.');
    if (!weeks.some((w) => w.files.length)) throw new Invalid('None of those weeks have files yet. Add slides to them first.');
    const subjects = (plan.subjects || []).filter((s) => SUBJECTS[s]).slice(0, 2);
    if (!subjects.length) throw new Invalid('Pick the kind of course.');
    const test = plan.testId ? c.upcoming.find((u) => u.id === plan.testId) : null;
    const title = test ? `${c.name}: ${test.title}` : `${c.name}: ${weeks.length === 1 ? weeks[0].label : `${weeks[0].label} to ${weeks[weeks.length - 1].label}`}`;
    const all = await this.list();
    let id = slug(title), n = 2;
    while (all.some((g) => g.id === id) || fs.existsSync(this.dir(id))) id = `${slug(title)}-${n++}`;
    const used = all.map((g) => g.badge);
    const badge = Object.keys(C.GUIDE).find((k) => !used.includes(k)) || Object.keys(C.GUIDE)[all.length % Object.keys(C.GUIDE).length];
    const g = {
      id, title, badge, courseId: c.id, courseName: c.name,
      test: test ? { id: test.id, title: test.title, date: test.date || '' } : null,
      weeks: weeks.map((w) => ({ id: w.id, label: w.label, title: w.title || '', files: w.files.slice() })),
      subjects, exam: String(plan.exam || '').slice(0, 400), shortOnTime: !!plan.shortOnTime,
      model: plan.model || 'opus', effort: plan.effort || 'high',
      pieces: [
        ...weeks.map((w, i) => ({ id: `w${i + 1}`, label: w.label, status: 'waiting' })),
        ...(weeks.length > 1 ? [{ id: 'finish', label: 'Final quiz', status: 'waiting' }] : []),
        { id: 'start', label: 'Opening', status: 'waiting' },
      ],
      status: 'planned', pausedUntil: null, created: now(), updated: now(),
    };
    await this.save(g);
    await this.store.commit(`Planned guide: ${title}`);
    return g;
  }

  async savePart(id, pieceId, html) {
    await fsp.mkdir(this.dir(id, 'parts'), { recursive: true });
    await fsp.writeFile(this.dir(id, 'parts', pieceId + '.html'), html);
  }

  // The latest first-try score and confidence for each week quiz and the final quiz, with the same
  // verdict the guide's score screen gives. For the guide cards; not saved into guide.json.
  async results(g) {
    let p = {};
    try { p = JSON.parse(await fsp.readFile(this.dir(g.id, 'progress.json'), 'utf8')); } catch { return []; }
    const verdict = (v) => (v.c > 3 && v.s / v.n < 0.7 ? 'Review first' : v.c && v.c < 3 && v.s / v.n >= 0.8 ? 'Better than you thought' : 'On track');
    return g.pieces.filter((x) => /^w\d+$/.test(x.id) || x.id === 'finish').map((x) => {
      const v = p['q:' + (x.id === 'finish' ? 'final' : x.id) + '-quiz'];
      return v && v.n ? { piece: x.id, label: x.label, s: v.s, n: v.n, c: v.c || null, verdict: verdict(v) } : { piece: x.id, label: x.label };
    });
  }

  async saveProgress(id, key, value) {
    const file = this.dir(id, 'progress.json');
    let p = {};
    try { p = JSON.parse(await fsp.readFile(file, 'utf8')); } catch { /* new */ }
    p[String(key).slice(0, 80)] = value;
    await fsp.writeFile(file, JSON.stringify(p));
    if (/^q:/.test(key)) this.emit('changed', null); // a quiz finished: the guide cards show results
  }

  async remove(id) {
    await fsp.rm(this.dir(id), { recursive: true, force: true });
    await this.store.commit(`Deleted guide ${id}`);
    this.emit('changed', null);
  }
}

// ---------- the instructions Claude gets for each piece ----------
async function textPaths(store, courseId, files) {
  const c = await store.findCourse(courseId);
  return files.map((name) => {
    const f = c.files.find((x) => x.name === name);
    if (!f) return null;
    const orig = ['courses', c.id, 'files', f.name].join('/');
    return f.text ? `- ${f.name}: text at ${f.text} (original at ${orig})` : `- ${f.name}: no text version, read the original at ${orig}`;
  }).filter(Boolean).join('\n');
}

function systemFor(g) {
  const today = new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const subjectText = g.subjects.map((s) => `# Rules: ${s} (subject skill)\n\n${rules(SUBJECTS[s].file)}`).join('\n\n');
  return `You are writing one piece of a learning guide inside Andromeda, a study app, following the user's own guide rules below.

How Andromeda differs from building a guide in chat:
- Andromeda builds the page around your piece: the title, the course and test line, the table of contents, all styling, the quiz, typed-blank and progress scripts, the progress bar and chip, the CHECK list for the instructor and the confidence table. Never write any of those.
- Write only the HTML for this piece, using the markup patterns in guide-core exactly (classes, data- attributes, ids). No <html>, <head>, <style>, <script>, <main>, images, or links to other sites.
- Save the piece by calling save_part once with the complete HTML. If it reports problems, fix them and call save_part again. Then reply with one short line; the user doesn't read your reply.
- The user already confirmed the subject type, test and exam format on Andromeda's plan screen, so skip "Confirm before building" and never ask questions. If something is missing, make the reasonable choice and add a CHECK: line.
- Course materials: read the text versions at the paths you're given. Open an original only when a table looks scrambled or a picture on a page matters. Hidden slides are already left out.
- Scores and typed answers save in Andromeda (and its backup), not "in this browser".

The guide:
- Course: ${g.courseName}
- Test: ${g.test ? `${g.test.title}${g.test.date ? ', on ' + g.test.date : ', date not set'}` : 'none named'}
- Today: ${today}
- Exam format: ${g.exam || 'not given; use guide-core\'s default split and say so in one line in the opening'}
- Weeks in this guide: ${g.weeks.map((w, i) => `${i + 1}. ${w.label}${w.title ? ': ' + w.title : ''}`).join('; ')}
- Kind of course: ${g.subjects.map((s) => SUBJECTS[s].name).join(' plus ')}
${g.shortOnTime ? '- Short-on-time mode is on (learning-guide section 5).\n' : ''}
# Rules: learning-guide

${rules('learning-guide')}

# Rules: guide-core

${rules('guide-core')}

${subjectText}`;
}

async function promptFor(store, g, piece, parts) {
  const weekIndex = (id) => Number(id.slice(1)) - 1;
  const outline = (upTo) => g.pieces.filter((p) => /^w\d+$/.test(p.id) && weekIndex(p.id) < upTo && parts[p.id]).map((p) => condense(parts[p.id])).join('\n');
  if (/^w\d+$/.test(piece.id)) {
    const i = weekIndex(piece.id), w = g.weeks[i];
    const earlier = i > 0 ? outline(i) : '';
    return `Write week ${i + 1} of the guide: ${w.label}${w.title ? ': ' + w.title : ''}.

Its materials:
${await textPaths(store, g.courseId, w.files) || '- (no files listed for this week; add a CHECK: line saying so)'}

Start with <h2 id="${piece.id}">${w.label}${w.title ? ': ' + w.title : ''}</h2> and its meta line. Give each topic an h3 with ids ${piece.id}-t1, ${piece.id}-t2 and so on. End with the week quiz (id "${piece.id}-quiz", data-title "${w.label} quiz", with data-ask), then any TRY IT practice with its collapsed answers.${earlier ? `\n\nEarlier weeks already in the guide (add 1 or 2 quiz questions from them):\n${earlier}` : ''}`;
  }
  if (piece.id === 'finish') {
    return `Write the end of the guide, after the last week: the final mixed quiz (id "final-quiz", data-title "Final quiz", with data-ask), built from look-alikes that sit in different weeks plus each week's main ideas, in the exam's format. Then "How the weeks connect" (<h2 id="connect">How the weeks connect</h2>) only if the weeks really build on each other. Andromeda adds the CHECK list and the confidence table itself.

What each week covers:
${outline(g.weeks.length)}`;
  }
  return `Write the opening of the guide, which sits under Andromeda's title and table of contents: <h2 id="start">Before you start</h2>, then the big picture (a short paragraph on what the material is about and how its parts fit, plus the course's frame as a flow if it has one), the how-to-use paragraph, the guess-first quiz (id "warmup-quiz", data-title "Warm-up: guess first", no data-ask)${g.test && g.test.date && g.weeks.length > 1 ? ', and a pacing plan from today to the test (a short list, one line per session)' : ''}.

What the guide covers, week by week:
${outline(g.weeks.length)}`;
}

// ---------- building ----------
class GuideBuilder {
  constructor({ guides, store, runner, getUsage, onCommit }) {
    this.guides = guides;
    this.store = store;
    this.runner = runner;
    this.getUsage = getUsage;
    this.onCommit = onCommit;
    this.current = null; // guide id being built
    this.timer = null;
    this.events = new EventEmitter();
  }

  status() { return { building: this.current }; }

  async build(id) {
    if (this.current && this.current !== id) throw new Invalid('Another guide is building. It goes one at a time.');
    if (this.current === id) return;
    this.current = id;
    clearTimeout(this.timer);
    try {
      for (;;) {
        const { guide: g, parts } = await this.guides.get(id);
        if (g.status === 'stopped') break;
        const piece = g.pieces.find((p) => p.status !== 'done');
        if (!piece) { g.status = 'done'; g.pausedUntil = null; await this.guides.save(g); this.events.emit('finished', g); break; }
        g.status = 'building'; g.pausedUntil = null; piece.status = 'building'; piece.error = '';
        await this.guides.save(g);
        const r = await this.runPiece(g, piece, parts);
        const fresh = (await this.guides.get(id)).guide;
        const fp = fresh.pieces.find((p) => p.id === piece.id);
        if (fresh.status === 'stopped') { fp.status = r.saved ? 'done' : 'waiting'; await this.guides.save(fresh); break; }
        if (r.saved) {
          fp.status = 'done';
          await this.guides.save(fresh);
          await this.store.commit(`Guide ${fresh.title}: ${fp.label}`);
          this.onCommit();
          continue;
        }
        fp.status = 'waiting';
        if (r.error && r.error.code === 'limit') {
          const u = this.getUsage() || {};
          const until = [u.fiveHour, u.week].map((w) => w && w.pct >= 0.98 && w.resetsAt).filter(Boolean).sort()[0]
            || (u.fiveHour && u.fiveHour.resetsAt) || Date.now() + 60 * 60e3;
          fresh.status = 'paused'; fresh.pausedUntil = until;
          await this.guides.save(fresh);
          this.schedule(id, until);
        } else {
          fp.error = (r.error && r.error.message) || 'Claude stopped before saving this part.';
          fp.tries = (fp.tries || 0) + 1;
          fresh.status = fp.tries >= 2 ? 'failed' : 'building';
          await this.guides.save(fresh);
          if (fresh.status === 'failed') this.events.emit('finished', fresh);
          if (fp.tries < 2) continue;
        }
        break;
      }
    } finally {
      this.current = null;
    }
  }

  runPiece(g, piece, parts) {
    return new Promise(async (resolve) => {
      let saved = false;
      const ctx = {
        save: async (html) => {
          const clean = cleanPart(html);
          const problems = checkPart(clean, piece);
          if (problems.length) return { ok: false, problems };
          await this.guides.savePart(g.id, piece.id, clean);
          saved = true;
          this.events.emit('part', { id: g.id, piece: piece.id });
          return { ok: true };
        },
      };
      const prompt = await promptFor(this.store, g, piece, parts);
      this.runner.run({ prompt, model: g.model, effort: g.effort, mode: 'guide', system: systemFor(g), ctx }, (ev) => {
        this.events.emit('claude', { id: g.id, piece: piece.id, ev });
        if (ev.type === 'done') resolve({ saved, error: ev.ok ? null : ev.error });
      });
    });
  }

  async stop(id) {
    const { guide: g } = await this.guides.get(id);
    if (g.status === 'done') return;
    g.status = 'stopped'; g.pausedUntil = null;
    await this.guides.save(g);
    clearTimeout(this.timer);
    if (this.current === id) this.runner.stop();
  }

  async resume(id) {
    const { guide: g } = await this.guides.get(id);
    g.status = 'building';
    g.pieces.forEach((p) => { if (p.status !== 'done') { p.status = 'waiting'; p.tries = 0; p.error = ''; } });
    await this.guides.save(g);
    return this.build(id);
  }

  // Carry on after a limit resets (a minute after, to be safe), as long as the app is open.
  schedule(id, until) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.build(id).catch(() => {}), Math.max(30e3, until - Date.now() + 60e3));
  }

  // On start: pick up anything that was building when the app closed, or whose pause has run out.
  async pickUp() {
    for (const g of await this.guides.list()) {
      if (g.status === 'building') { this.build(g.id).catch(() => {}); return; }
      if (g.status === 'paused') {
        if (!g.pausedUntil || g.pausedUntil <= Date.now()) { this.build(g.id).catch(() => {}); return; }
        this.schedule(g.id, g.pausedUntil); return;
      }
    }
  }
}

module.exports = { GuideStore, GuideBuilder, guessSubjects, SUBJECTS, cleanPart, checkPart, condense, systemFor, promptFor };
