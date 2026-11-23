// Updates: Andromeda's installers are posted as releases on its private code repo (built by GitHub,
// see .github/workflows/release.yml). The installed app checks for a newer release with the GitHub
// sign-in it already has, and shows a notice. One click downloads the installer and opens it:
// on Windows it installs over the old version and starts again; on a Mac you drag the new
// Andromeda into Applications. Only the installed app checks, never `npm start`.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { shell } = require('electron');

const APP_REPO = 'JazzyXD/Andromeda';

// "0.5.10" is newer than "0.5.9".
const newer = (a, b) => {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0), pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

class Updater extends EventEmitter {
  constructor({ github, app }) {
    super();
    this.github = github;
    this.app = app;
    this.available = null; // { version, notes, asset: { id, name, size } }
    this.busy = false;
  }

  state() { return { available: this.available && { version: this.available.version, notes: this.available.notes }, busy: this.busy }; }

  async check() {
    if (!this.app.isPackaged || !this.github.token || this.busy) return this.state();
    try {
      const r = await this.github.api(`/repos/${APP_REPO}/releases/latest`);
      if (!r.ok) return this.state();
      const j = await r.json();
      const version = String(j.tag_name || '').replace(/^v/, '');
      const want = process.platform === 'win32' ? /\.exe$/i : process.platform === 'darwin' ? /\.dmg$/i : null;
      const asset = want && (j.assets || []).find((a) => want.test(a.name));
      if (asset && newer(version, this.app.getVersion())) {
        const fresh = !this.available || this.available.version !== version;
        this.available = { version, notes: String(j.body || '').slice(0, 1200), asset: { id: asset.id, name: asset.name, size: asset.size } };
        if (fresh) this.emit('available', this.state());
      }
    } catch { /* offline: try again later */ }
    return this.state();
  }

  // Download the installer (reporting progress 0 to 1), then hand over to it.
  async install(onProgress = () => {}) {
    const a = this.available;
    if (!a) throw new Error('There\'s no update waiting.');
    if (this.busy) throw new Error('The update is already downloading.');
    this.busy = true;
    try {
      const r = await this.github.api(`/repos/${APP_REPO}/releases/assets/${a.asset.id}`, { headers: { Accept: 'application/octet-stream' } });
      if (!r.ok || !r.body) throw new Error('Couldn\'t download the update from GitHub.');
      const dir = await fsp.mkdtemp(path.join(this.app.getPath('temp'), 'andromeda-update-'));
      const file = path.join(dir, path.basename(a.asset.name));
      const out = fs.createWriteStream(file);
      let got = 0;
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.length;
        if (!out.write(Buffer.from(value))) await new Promise((res) => out.once('drain', res));
        onProgress(a.asset.size ? Math.min(1, got / a.asset.size) : 0);
      }
      await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
      if (a.asset.size && got < a.asset.size) throw new Error('The download stopped early. Try again.');
      onProgress(1);
      if (process.platform === 'win32') {
        // The installer replaces this version and starts Andromeda again when it's done.
        spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
      } else {
        const err = await shell.openPath(file);
        if (err) throw new Error('Couldn\'t open the installer: ' + err);
      }
      return { platform: process.platform };
    } finally {
      this.busy = false;
    }
  }
}

module.exports = { Updater, newer, APP_REPO };
