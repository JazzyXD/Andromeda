// Keeping both laptops the same: download the other laptop's changes, combine them with this one's,
// then upload. Everything that touches Git goes through one queue, so a sync, a Claude edit and a
// guide build never trip over each other.
//
// Combining: course.json and guide.json are marked in .gitattributes so Git never half-merges them.
// When both laptops changed one, Andromeda combines them itself, item by item: a test added on one
// laptop and a week added on the other both stay. Only when the very same item changed on both does
// the newer change win (the other stays in the history). Scores live in one file per laptop, so they
// never clash.
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

// ---------- this laptop ----------
const prettyHost = (h) => String(h || 'This laptop').replace(/\.(local|lan|home)$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 40) || 'This laptop';
function loadDevice(dir) {
  const file = path.join(dir, 'device.json');
  let d = null;
  try { d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  if (!d || !d.id) {
    d = { id: crypto.randomBytes(6).toString('hex'), name: prettyHost(os.hostname()) };
    try { fs.writeFileSync(file, JSON.stringify(d)); } catch { /* not critical */ }
  }
  return {
    ...d,
    rename(name) {
      this.name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40) || prettyHost(os.hostname());
      try { fs.writeFileSync(file, JSON.stringify({ id: this.id, name: this.name })); } catch { /* not critical */ }
      return this.name;
    },
  };
}

// ---------- combining two versions of a file ----------
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const parse = (s) => { try { return s == null ? null : JSON.parse(s); } catch { return null; } };

// Three-way: base is what both laptops started from (null if both created it separately).
function mergeCourse(b, o, t) {
  const newerIsOurs = String(o.updated || '') >= String(t.updated || '');
  const blank = (v) => v == null || v === '';
  const pick = (bv, ov, tv) => {
    if (same(ov, bv)) return tv;
    if (same(tv, bv)) return ov;
    // Made separately on both laptops: a filled-in field beats an empty one.
    if (bv === undefined) { if (blank(ov)) return tv; if (blank(tv)) return ov; }
    return newerIsOurs ? ov : tv;
  };
  // Lists of things with ids: union them, item by item. dup() spots the same thing added separately.
  const list = (key, idOf, dup) => {
    const B = new Map(((b && b[key]) || []).map((x) => [idOf(x), x]));
    const O = new Map((o[key] || []).map((x) => [idOf(x), x]));
    const T = new Map((t[key] || []).map((x) => [idOf(x), x]));
    const out = [];
    for (const id of [...new Set([...O.keys(), ...T.keys()])]) {
      const bv = B.get(id), ov = O.get(id), tv = T.get(id);
      let v;
      if (ov && tv) v = pick(bv, ov, tv);
      else if (ov) { if (bv && same(ov, bv)) continue; v = ov; } // they removed it and we didn't touch it
      else { if (bv && same(tv, bv)) continue; v = tv; }
      if (!bv && dup && out.some((x) => dup(x) === dup(v))) continue;
      out.push(v);
    }
    return out;
  };
  const r = {};
  for (const k of new Set([...Object.keys(o), ...Object.keys(t)])) {
    if (['upcoming', 'weeks', 'files', 'updated'].includes(k)) continue;
    r[k] = pick(b ? b[k] : undefined, o[k], t[k]);
  }
  r.files = list('files', (x) => x.name, (x) => x.name);
  r.upcoming = list('upcoming', (x) => x.id, (x) => `${String(x.title).toLowerCase()}|${x.date || ''}`)
    .sort((x, y) => (x.date || '9999').localeCompare(y.date || '9999'));
  r.weeks = list('weeks', (x) => x.id, (x) => String(x.label).toLowerCase());
  const names = new Set(r.files.map((f) => f.name));
  r.weeks.forEach((w) => { w.files = (w.files || []).filter((n) => names.has(n)); });
  r.updated = String(o.updated || '') >= String(t.updated || '') ? o.updated : t.updated;
  return r;
}

// Guides: a part that's finished on either laptop stays finished; the rest comes from whichever
// laptop got further (or changed it last).
function mergeGuide(b, o, t) {
  const rank = { done: 3, building: 2, waiting: 1 };
  const done = (g) => (g.pieces || []).filter((p) => p.status === 'done').length;
  const lead = done(o) !== done(t) ? (done(o) > done(t) ? o : t) : String(o.updated || '') >= String(t.updated || '') ? o : t;
  const r = JSON.parse(JSON.stringify(lead));
  const other = lead === o ? t : o;
  r.pieces = (r.pieces || []).map((p) => {
    const q = (other.pieces || []).find((x) => x.id === p.id);
    return q && (rank[q.status] || 0) > (rank[p.status] || 0) && q.status === 'done' ? { ...p, status: 'done' } : p;
  });
  // Stopped on either laptop (since they last agreed) stays stopped, so a Stop is never undone by
  // the other laptop saving its next part.
  const stoppedNow = (g) => g.status === 'stopped' && (!b || b.status !== 'stopped');
  if (stoppedNow(o) || stoppedNow(t)) { r.status = 'stopped'; r.pausedUntil = null; r.lock = null; }
  if (r.pieces.length && r.pieces.every((p) => p.status === 'done')) { r.status = 'done'; r.pausedUntil = null; r.lock = null; }
  return r;
}

// ---------- the sync itself ----------
class Sync extends EventEmitter {
  constructor({ store, net, canSync, device, busy = () => false }) {
    super();
    this.busy = busy; // true while Claude is part-way through changing a course
    this.store = store;
    this.net = net; // runs a git command that talks to GitHub (with sign-in)
    this.canSync = canSync;
    this.device = device;
    this.pending = null;
    this.waiting = false;
    this.state = { state: 'off', at: null, message: '' };
  }

  set(state, message = '') {
    this.state = { state, message, at: state === 'ok' ? Date.now() : this.state.at };
    this.emit('state', this.state);
  }

  // Sync now. Calls that arrive while one is already waiting share it. While Claude is part-way
  // through changing a course, the sync waits (its changes would otherwise be split in two, and
  // Undo would only take back half).
  now() {
    if (this.pending) return this.pending;
    if (this.busy()) { this.waiting = true; return Promise.resolve({ changed: false }); }
    this.pending = this.store.exclusive(async () => { this.pending = null; return this.once(); });
    return this.pending;
  }

  // Claude finished: run the sync that waited, if any.
  idle() { if (this.waiting) { this.waiting = false; this.now().catch(() => {}); } }

  // Sync, but don't hold things up for long if GitHub is slow or offline.
  async soon(ms = 8000) {
    return Promise.race([this.now().catch(() => {}), new Promise((r) => setTimeout(r, ms))]);
  }

  async once() {
    const git = (a) => this.store.runGit(a);
    if (!(await this.canSync())) { this.set('off'); return { changed: false }; }
    this.set('syncing');
    try {
      await this.store.commitNow(`Changes on ${this.device.name}`);
      const before = (await git(['rev-parse', 'HEAD'])).stdout.trim();
      for (let attempt = 0; attempt < 3; attempt++) {
        const f = await this.net(['fetch', '-q', 'origin']);
        if (!f.ok) { this.set('offline', 'Saved on this laptop. Will sync when GitHub can be reached.'); return { changed: false }; }
        const remote = await git(['rev-parse', '--verify', '-q', 'origin/main']);
        if (remote.ok && !(await git(['merge-base', '--is-ancestor', 'origin/main', 'HEAD'])).ok) {
          const m = await git(['merge', '-q', '--no-edit', '--allow-unrelated-histories', '-m', 'Combined with changes from the other laptop', 'origin/main']);
          if (!m.ok) {
            const ok = await this.resolve();
            if (!ok) {
              await git(['merge', '--abort']);
              this.set('error', 'This laptop and GitHub have changes Andromeda couldn\'t combine. Nothing was lost; both are kept.');
              return { changed: false };
            }
          }
        }
        const head = (await git(['rev-parse', 'HEAD'])).stdout.trim();
        const rhead = remote.ok ? (await git(['rev-parse', 'origin/main'])).stdout.trim() : '';
        if (head === rhead) break;
        const p = await this.net(['push', '-q', '-u', 'origin', 'main']);
        if (p.ok) break;
        if (attempt === 2) { this.set('error', 'Couldn\'t upload to GitHub: ' + (p.stderr || '').trim().slice(0, 140)); return { changed: false }; }
        // The other laptop uploaded in the meantime: fetch and combine again.
      }
      const after = (await git(['rev-parse', 'HEAD'])).stdout.trim();
      const changed = before !== after;
      this.set('ok');
      if (changed) { await this.store.writeSummary(); this.store.emit('changed'); this.emit('pulled'); }
      return { changed };
    } catch (e) {
      this.set('error', 'Sync stopped: ' + String(e.message || e).slice(0, 140));
      return { changed: false };
    }
  }

  // Settle every file both sides changed. Returns false if something couldn't be settled.
  async resolve() {
    const git = (a) => this.store.runGit(a);
    const u = await git(['ls-files', '-u', '-z']);
    const stages = new Map();
    for (const line of u.stdout.split('\0').filter(Boolean)) {
      const m = /^\d+ ([0-9a-f]+) ([123])\t(.+)$/.exec(line);
      if (!m) continue;
      if (!stages.has(m[3])) stages.set(m[3], {});
      stages.get(m[3])[m[2]] = m[1];
    }
    if (!stages.size) return false;
    const blob = async (sha) => (sha ? (await git(['cat-file', 'blob', sha])).stdout : null);
    for (const [file, st] of stages) {
      const full = this.store.p(...file.split('/'));
      const isCourse = /^courses\/[^/]+\/course\.json$/.test(file), isGuide = /^guides\/[^/]+\/guide\.json$/.test(file);
      if ((isCourse || isGuide) && st[2] && st[3]) {
        const b = parse(await blob(st[1])), o = parse(await blob(st[2])), t = parse(await blob(st[3]));
        if (!o || !t) return false;
        const merged = isCourse ? mergeCourse(b, o, t) : mergeGuide(b, o, t);
        await fsp.mkdir(path.dirname(full), { recursive: true });
        await fsp.writeFile(full, JSON.stringify(merged, null, 2));
      } else {
        // Anything else (or one side removed it while the other changed it): keep a version that
        // exists, preferring this laptop's, so nothing someone changed is thrown away.
        const r = await git(['checkout', st[2] ? '--ours' : '--theirs', '--', file]);
        if (!r.ok) return false;
      }
      const a = await git(['add', '--', file]);
      if (!a.ok) return false;
    }
    const c = await git(['commit', '-q', '--no-edit']);
    return c.ok;
  }
}

module.exports = { Sync, loadDevice, mergeCourse, mergeGuide };
