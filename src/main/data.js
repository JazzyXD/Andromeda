// Your Andromeda data: courses, their files, and a saved history of every change (git).
//
// Folder layout:
//   courses/<id>/course.json        everything about one course
//   courses/<id>/files/<name>       the original slides and PDFs
//   courses/<id>/text/<name>.md     their text, pulled out once (hidden slides skipped)
//   .andromeda/inbox/               files you added that Claude hasn't filed yet
//   .andromeda/summary.md           the short course summary sent with each prompt
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { EventEmitter } = require('events');
const C = require('../shared/constellations');
const bin = require('./bin');

const MAX_TEXT = 400;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

class Invalid extends Error {}
const fail = (msg) => { throw new Invalid(msg); };

const clean = (v, max = MAX_TEXT) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim().slice(0, max));
const slugify = (s) => clean(s, 80).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'course';
const uid = () => Math.random().toString(36).slice(2, 8);
const now = () => new Date().toISOString();

function validDate(d) {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d).trim());
  if (!m) fail(`"${d}" isn't a date in YYYY-MM-DD form.`);
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (dt.getUTCMonth() !== +m[2] - 1) fail(`"${d}" isn't a real date.`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}
function validTime(t) {
  if (!t) return '';
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
  if (!m || +m[1] > 23 || +m[2] > 59) fail(`"${t}" isn't a time in 24-hour HH:MM form.`);
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}
const prettyDate = (d) => {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return `${MONTHS[m - 1]} ${day}${y !== new Date().getFullYear() ? ', ' + y : ''}`;
};

class DataStore extends EventEmitter {
  constructor(dir) {
    super();
    this.dir = dir;
    this.git = null;
  }

  p(...parts) { return path.join(this.dir, ...parts); }

  async init() {
    await fsp.mkdir(this.p('courses'), { recursive: true });
    await fsp.mkdir(this.p('.andromeda', 'inbox'), { recursive: true });
    if (!fs.existsSync(this.p('andromeda.json'))) {
      await fsp.writeFile(this.p('andromeda.json'), JSON.stringify({ format: 1, created: now() }, null, 2));
    }
    // The inbox and the summary are working files, not part of your history.
    const ignore = this.p('.gitignore');
    if (!fs.existsSync(ignore)) await fsp.writeFile(ignore, '.andromeda/\n.DS_Store\n');
    this.git = await bin.find('git');
    if (this.git && !fs.existsSync(this.p('.git'))) {
      await this.runGit(['init', '-q', '-b', 'main']);
      await this.commit('Start Andromeda data');
    }
    await this.writeSummary();
  }

  // ---------- history ----------
  runGit(args) {
    if (!this.git) return Promise.resolve({ ok: false, stdout: '', stderr: 'Git not found' });
    return bin.run(this.git, ['-C', this.dir, '-c', 'user.name=Andromeda', '-c', 'user.email=andromeda@localhost', ...args]);
  }

  // Save everything changed since the last save as one step. Returns its id, or null if nothing changed.
  async commit(message) {
    if (!this.git) return null;
    await this.runGit(['add', '-A']);
    const st = await this.runGit(['status', '--porcelain']);
    if (!st.stdout.trim() && message !== 'Start Andromeda data') return null;
    const r = await this.runGit(['commit', '-q', '--allow-empty', '-m', clean(message, 200) || 'Change']);
    if (!r.ok) return null;
    const h = await this.runGit(['rev-parse', 'HEAD']);
    return h.stdout.trim() || null;
  }

  // Undo one saved step by adding a new step that reverses it, so nothing is ever lost.
  async undo(stepId) {
    if (!this.git || !/^[0-9a-f]{7,40}$/.test(stepId || '')) return { ok: false, message: 'Nothing to undo.' };
    const r = await this.runGit(['revert', '--no-edit', stepId]);
    if (!r.ok) {
      await this.runGit(['revert', '--abort']);
      return { ok: false, message: 'That change was built on by later ones, so it can\'t be undone on its own.' };
    }
    await this.writeSummary();
    this.emit('changed');
    return { ok: true };
  }

  // ---------- reading ----------
  async listCourses() {
    const dirs = await fsp.readdir(this.p('courses'), { withFileTypes: true }).catch(() => []);
    const out = [];
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      try { out.push(JSON.parse(await fsp.readFile(this.p('courses', d.name, 'course.json'), 'utf8'))); } catch { /* skip broken */ }
    }
    return out.sort((a, b) => String(a.created).localeCompare(String(b.created)));
  }

  async findCourse(ref) {
    const r = clean(ref, 120).toLowerCase();
    if (!r) fail('Say which course.');
    const all = await this.listCourses();
    const hit = all.find((c) => c.id === r) || all.find((c) => c.name.toLowerCase() === r)
      || all.find((c) => c.name.toLowerCase().includes(r) || r.includes(c.name.toLowerCase()));
    if (!hit) fail(`There's no course called "${ref}". Courses: ${all.map((c) => c.name).join(', ') || 'none yet'}.`);
    return hit;
  }

  async saveCourse(c) {
    c.updated = now();
    await fsp.mkdir(this.p('courses', c.id, 'files'), { recursive: true });
    await fsp.writeFile(this.p('courses', c.id, 'course.json'), JSON.stringify(c, null, 2));
  }

  // ---------- changes (each returns a list of plain-language changes for the changes card) ----------
  async addCourses(list) {
    if (!Array.isArray(list) || !list.length) fail('Give at least one course.');
    const all = await this.listCourses();
    const used = all.map((c) => c.constellation);
    const changes = [];
    for (const raw of list) {
      const name = clean(raw.name, 80);
      if (!name) fail('Every course needs a name.');
      if (all.some((c) => c.name.toLowerCase() === name.toLowerCase())) fail(`"${name}" already exists.`);
      let id = slugify(name), n = 2;
      while (all.some((c) => c.id === id) || fs.existsSync(this.p('courses', id))) id = `${slugify(name)}-${n++}`;
      const con = C.pickForCourse(used);
      used.push(con);
      const c = {
        id, name, constellation: con,
        instructor: clean(raw.instructor, 80), schedule: clean(raw.schedule, 120), school: clean(raw.school, 80),
        notes: clean(raw.notes), upcoming: [], weeks: [], files: [], created: now(), updated: now(),
      };
      await this.saveCourse(c);
      all.push(c);
      changes.push({ course: name, courseId: id, where: 'Courses', what: `Added ${name}` });
    }
    return changes;
  }

  async updateCourse(ref, fields) {
    const c = await this.findCourse(ref);
    const changes = [];
    for (const k of ['name', 'instructor', 'schedule', 'school', 'notes']) {
      if (fields[k] === undefined) continue;
      const v = clean(fields[k], k === 'notes' ? MAX_TEXT : 120);
      if (k === 'name' && !v) fail('A course name can\'t be blank.');
      if (v === c[k]) continue;
      changes.push({ course: v && k === 'name' ? v : c.name, courseId: c.id, where: 'Details', what: v ? `${k[0].toUpperCase() + k.slice(1)}: ${v}` : `Cleared ${k}` });
      c[k] = v;
    }
    await this.saveCourse(c);
    return changes;
  }

  async setUpcoming(ref, items) {
    const c = await this.findCourse(ref);
    if (!Array.isArray(items) || !items.length) fail('Give at least one item.');
    const changes = [];
    for (const raw of items) {
      const title = clean(raw.title, 80);
      let it = (raw.id && c.upcoming.find((u) => u.id === raw.id)) || (title && c.upcoming.find((u) => u.title.toLowerCase() === title.toLowerCase()));
      if (raw.id && !it) fail(`There's no Coming up item with id ${raw.id} in ${c.name}.`);
      const fresh = !it;
      if (fresh) { if (!title) fail('Each upcoming item needs a title.'); it = { id: uid(), title, date: '', time: '', covers: '', done: false }; c.upcoming.push(it); }
      if (raw.date !== undefined) it.date = validDate(raw.date);
      if (raw.time !== undefined) it.time = validTime(raw.time);
      if (raw.covers !== undefined) it.covers = clean(raw.covers, 160);
      if (raw.done !== undefined) it.done = !!raw.done;
      const when = [prettyDate(it.date), it.time].filter(Boolean).join(' ');
      const was = !fresh && raw.id && title && it.title !== title ? it.title : '';
      if (title) it.title = title;
      changes.push({ course: c.name, courseId: c.id, where: 'Coming up', what: (was ? `${was} renamed to ` : '') + [it.title, when, it.covers].filter(Boolean).join(', ') + (fresh || was ? '' : ' (updated)') });
    }
    c.upcoming.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    await this.saveCourse(c);
    return changes;
  }

  async removeUpcoming(ref, which) {
    const c = await this.findCourse(ref);
    const keys = (which || []).map((w) => clean(w, 80).toLowerCase());
    const gone = c.upcoming.filter((u) => keys.includes(u.id) || keys.includes(u.title.toLowerCase()));
    if (!gone.length) fail('None of those are in Coming up.');
    c.upcoming = c.upcoming.filter((u) => !gone.includes(u));
    await this.saveCourse(c);
    return gone.map((u) => ({ course: c.name, courseId: c.id, where: 'Coming up', what: `Removed ${u.title}` }));
  }

  async setWeeks(ref, weeks) {
    const c = await this.findCourse(ref);
    if (!Array.isArray(weeks) || !weeks.length) fail('Give at least one week.');
    const changes = [];
    for (const raw of weeks) {
      const label = clean(raw.label, 40);
      let w = (raw.id && c.weeks.find((x) => x.id === raw.id)) || (label && c.weeks.find((x) => x.label.toLowerCase() === label.toLowerCase()));
      if (raw.id && !w) fail(`There's no week with id ${raw.id} in ${c.name}.`);
      const fresh = !w;
      if (fresh) { if (!label) fail('Each week needs a label, like "Week 3" or "Chapter 12".'); w = { id: uid(), label, title: '', files: [] }; c.weeks.push(w); }
      if (label) w.label = label;
      if (raw.title !== undefined) w.title = clean(raw.title, 120);
      if (Array.isArray(raw.files)) {
        const known = c.files.map((f) => f.name);
        for (const f of raw.files) { if (!known.includes(f)) fail(`"${f}" isn't one of this course's files.`); }
        w.files = raw.files.slice(0, 40);
      }
      changes.push({ course: c.name, courseId: c.id, where: 'Weeks', what: [label, w.title].filter(Boolean).join(': ') + (fresh ? '' : ' (updated)') });
    }
    await this.saveCourse(c);
    return changes;
  }

  async inbox() {
    return (await fsp.readdir(this.p('.andromeda', 'inbox')).catch(() => [])).filter((n) => !n.startsWith('.'));
  }

  // Copy files into the inbox (from drag and drop or the paperclip).
  async receive(paths) {
    const names = [];
    for (const src of paths) {
      let name = path.basename(src), n = 2;
      while (fs.existsSync(this.p('.andromeda', 'inbox', name))) name = path.basename(src).replace(/(\.[^.]+)?$/, ` (${n++})$1`);
      await fsp.copyFile(src, this.p('.andromeda', 'inbox', name));
      names.push(name);
    }
    return names;
  }

  // Move inbox files into a course and pull their text out once.
  async attachFiles(ref, names, extract) {
    const c = await this.findCourse(ref);
    const waiting = await this.inbox();
    const changes = [];
    for (const raw of names || []) {
      const name = path.basename(String(raw));
      if (!waiting.includes(name)) fail(`"${name}" isn't waiting to be added. Waiting: ${waiting.join(', ') || 'nothing'}.`);
      let final = name, n = 2;
      while (c.files.some((f) => f.name === final)) final = name.replace(/(\.[^.]+)?$/, ` (${n++})$1`);
      const dest = this.p('courses', c.id, 'files', final);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.rename(this.p('.andromeda', 'inbox', name), dest);
      const entry = { name: final, added: now(), kind: path.extname(final).slice(1).toLowerCase(), text: '', note: '' };
      try {
        const r = await extract(dest);
        if (r && r.text) {
          const rel = path.join('courses', c.id, 'text', final.replace(/\.[^.]+$/, '') + '.md');
          await fsp.mkdir(path.dirname(this.p(rel)), { recursive: true });
          await fsp.writeFile(this.p(rel), r.text);
          entry.text = rel.split(path.sep).join('/');
          entry.note = r.note || '';
        } else if (r && r.note) entry.note = r.note;
      } catch (e) { entry.note = 'Text could not be read: ' + clean(e.message, 120); }
      c.files.push(entry);
      changes.push({ course: c.name, courseId: c.id, where: 'Course files', what: final + (entry.note ? ` (${entry.note})` : '') });
    }
    await this.saveCourse(c);
    return changes;
  }

  // Deleting never happens from a tool call: it waits for the user's Yes.
  async deleteCourse(id) {
    const c = await this.findCourse(id);
    await fsp.rm(this.p('courses', c.id), { recursive: true, force: true });
    return [{ course: c.name, courseId: c.id, where: 'Courses', what: `Deleted ${c.name}` }];
  }

  async removeFiles(id, names) {
    const c = await this.findCourse(id);
    const gone = c.files.filter((f) => names.includes(f.name));
    for (const f of gone) {
      await fsp.rm(this.p('courses', c.id, 'files', f.name), { force: true });
      if (f.text) await fsp.rm(this.p(f.text), { force: true });
      for (const w of c.weeks) w.files = w.files.filter((x) => x !== f.name);
    }
    c.files = c.files.filter((f) => !gone.includes(f));
    await this.saveCourse(c);
    return gone.map((f) => ({ course: c.name, courseId: c.id, where: 'Course files', what: `Removed ${f.name}` }));
  }

  // ---------- the short summary sent with every prompt ----------
  // Written by code, only when something changes, and identical between changes so Claude's
  // servers can reuse it cheaply.
  async buildSummary() {
    const all = await this.listCourses();
    if (!all.length) return 'No courses yet.';
    return all.map((c) => {
      const lines = [`## ${c.name} (id: ${c.id})`];
      const meta = [c.instructor && `Instructor: ${c.instructor}`, c.schedule && `Schedule: ${c.schedule}`, c.school && `School: ${c.school}`].filter(Boolean);
      if (meta.length) lines.push(meta.join(' | '));
      if (c.notes) lines.push(`Notes: ${c.notes}`);
      if (c.upcoming.length) lines.push('Coming up: ' + c.upcoming.map((u) => `[id ${u.id}] ${u.title}${u.date ? ' ' + u.date : ''}${u.time ? ' ' + u.time : ''}${u.covers ? ' (' + u.covers + ')' : ''}${u.done ? ' [done]' : ''}`).join('; '));
      if (c.weeks.length) lines.push('Weeks: ' + c.weeks.map((w) => `[id ${w.id}] ${w.label}${w.title ? ' ' + w.title : ''}${w.files.length ? ' [' + w.files.join(', ') + ']' : ''}`).join('; '));
      if (c.files.length) lines.push('Files: ' + c.files.map((f) => `${f.name}${f.text ? ' -> text at ' + f.text : ''}${f.note ? ' (' + f.note + ')' : ''}`).join('; '));
      return lines.join('\n');
    }).join('\n\n');
  }

  async writeSummary() {
    const s = await this.buildSummary();
    const file = this.p('.andromeda', 'summary.md');
    const old = await fsp.readFile(file, 'utf8').catch(() => null);
    if (old !== s) await fsp.writeFile(file, s);
    this.summary = s;
    return s;
  }
}

module.exports = { DataStore, Invalid, prettyDate };
