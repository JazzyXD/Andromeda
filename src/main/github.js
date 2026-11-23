// Connecting GitHub: a short code you approve in the browser (GitHub's "device" sign-in), the key kept
// in the laptop's secure keychain, and your data folder linked to your private Andromeda-data repo.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { safeStorage } = require('electron');

const CLIENT_ID = 'Ov23li1S0a9lMgDYvPnr'; // Andromeda's public GitHub app id (not a secret)
const DATA_REPO = 'Andromeda-data';

const form = (o) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class GitHub {
  constructor(userDataDir, store) {
    this.file = path.join(userDataDir, 'github.key');
    this.store = store;
    this.token = null;
    this.login = null;
    this.repo = null;
    this.cancelled = false;
  }

  async load() {
    try {
      const raw = await fsp.readFile(this.file);
      const saved = JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString());
      Object.assign(this, { token: saved.token, login: saved.login, repo: saved.repo });
    } catch { /* not connected yet */ }
    return this.state();
  }

  async save() {
    const body = JSON.stringify({ token: this.token, login: this.login, repo: this.repo });
    // Encrypted by the system keychain (Keychain on Mac, Windows' own credential protection).
    await fsp.writeFile(this.file, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(body) : body, { mode: 0o600 });
  }

  state() { return { connected: !!this.token, login: this.login, repo: this.repo }; }

  api(p, opts = {}) {
    return fetch('https://api.github.com' + p, {
      ...opts,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) },
    });
  }

  // Step 1: get a short code to show. Step 2 (wait) polls until the user approves it.
  async start() {
    this.cancelled = false;
    const r = await fetch('https://github.com/login/device/code', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ client_id: CLIENT_ID, scope: 'repo' }),
    });
    const j = await r.json();
    if (!j.device_code) throw new Error(j.error_description || 'GitHub didn\'t give a code.');
    this.pendingCode = j;
    return { code: j.user_code, url: j.verification_uri, expiresIn: j.expires_in };
  }

  async wait() {
    const j = this.pendingCode;
    if (!j) throw new Error('No sign-in in progress.');
    let interval = (j.interval || 5) * 1000;
    const until = Date.now() + j.expires_in * 1000;
    while (Date.now() < until && !this.cancelled) {
      await sleep(interval);
      const r = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ client_id: CLIENT_ID, device_code: j.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
      });
      const t = await r.json();
      if (t.access_token) {
        this.token = t.access_token;
        const me = await (await this.api('/user')).json();
        this.login = me.login;
        this.repo = `${me.login}/${DATA_REPO}`;
        await this.save();
        this.pendingCode = null;
        return this.state();
      }
      if (t.error === 'slow_down') interval += 5000;
      else if (t.error && t.error !== 'authorization_pending') throw new Error(t.error_description || t.error);
    }
    throw new Error(this.cancelled ? 'Cancelled.' : 'The code expired. Try again.');
  }

  cancel() { this.cancelled = true; }

  async disconnect() {
    this.token = this.login = this.repo = null;
    await fsp.rm(this.file, { force: true });
  }

  // The key is passed to git for each command only, never written into the folder's settings.
  gitAuth() {
    const basic = Buffer.from(`x-access-token:${this.token}`).toString('base64');
    return ['-c', `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`];
  }

  async git(args) { return this.store.runGit([...this.gitAuth(), ...args]); }

  // Link the data folder to the repo. Makes the repo if it doesn't exist yet (private).
  async link() {
    if (!this.token) throw new Error('GitHub isn\'t connected.');
    let r = await this.api(`/repos/${this.repo}`);
    if (r.status === 404) {
      r = await this.api('/user/repos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: DATA_REPO, private: true, description: 'My Andromeda courses and guides' }) });
      if (!r.ok) throw new Error('Couldn\'t create the Andromeda-data repo on GitHub.');
    } else if (!r.ok) throw new Error('Couldn\'t reach the Andromeda-data repo on GitHub.');
    const url = `https://github.com/${this.repo}.git`;
    const has = await this.store.runGit(['remote', 'get-url', 'origin']);
    await this.store.runGit(has.ok ? ['remote', 'set-url', 'origin', url] : ['remote', 'add', 'origin', url]);

    const f = await this.git(['fetch', '-q', 'origin']);
    if (!f.ok) throw new Error('Couldn\'t download from GitHub: ' + f.stderr.slice(0, 160));
    const remoteMain = await this.store.runGit(['rev-parse', '--verify', '-q', 'origin/main']);
    if (remoteMain.ok) {
      const courses = await this.store.listCourses();
      if (!courses.length) {
        // A fresh laptop: take what's already on GitHub.
        await this.store.runGit(['reset', '-q', '--hard', 'origin/main']);
      } else {
        // Both sides have something: combine them (courses live in separate folders, so this is clean).
        const m = await this.store.runGit(['merge', '-q', '--no-edit', '--allow-unrelated-histories', 'origin/main']);
        if (!m.ok) { await this.store.runGit(['merge', '--abort']); throw new Error('This laptop and GitHub both have changes that clash. Two-laptop syncing in stage 4 will handle this.'); }
      }
    }
    await this.store.runGit(['branch', '-q', '--set-upstream-to=origin/main', 'main']);
    await this.push();
    this.store.emit('changed');
    return this.state();
  }

  // Back up to GitHub after a change. Quietly tries again next time if offline.
  async push() {
    if (!this.token) return false;
    const r = await this.git(['push', '-q', '-u', 'origin', 'main']);
    this.lastPush = { ok: r.ok, at: Date.now() };
    return r.ok;
  }
}

module.exports = { GitHub, CLIENT_ID };
