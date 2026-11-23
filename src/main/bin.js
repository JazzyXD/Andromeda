// Finding programs (Claude Code, Git) on the laptop, even when the app was opened from the Dock or
// Start menu, which start with a much shorter PATH than a terminal does.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const isWin = process.platform === 'win32';
const home = os.homedir();

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 15000, windowsHide: true, ...opts }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err ? err.code : 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

const CANDIDATES = {
  claude: isWin
    ? [path.join(home, '.local', 'bin', 'claude.exe'), path.join(process.env.APPDATA || '', 'npm', 'claude.cmd')]
    : [path.join(home, '.local', 'bin', 'claude'), path.join(home, '.claude', 'local', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'],
  git: isWin
    ? ['C:\\Program Files\\Git\\cmd\\git.exe', 'C:\\Program Files (x86)\\Git\\cmd\\git.exe']
    : ['/usr/bin/git', '/opt/homebrew/bin/git', '/usr/local/bin/git'],
};

const cache = {};

async function find(name) {
  if (cache[name]) return cache[name];
  // For testing with a stand-in: ANDROMEDA_CLAUDE=/path/to/fake-claude
  if (name === 'claude' && process.env.ANDROMEDA_CLAUDE) return process.env.ANDROMEDA_CLAUDE;
  let found = null;
  if (isWin) {
    const r = await run('where.exe', [name]);
    if (r.ok) found = r.stdout.split(/\r?\n/).map((s) => s.trim()).find((s) => /\.(exe|cmd)$/i.test(s)) || null;
  } else {
    // Ask the user's own login shell, which knows the PATH their terminal uses.
    const shell = process.env.SHELL || '/bin/zsh';
    const r = await run(shell, ['-lc', `command -v ${name}`]);
    if (r.ok && r.stdout.trim()) found = r.stdout.trim().split('\n').pop();
  }
  if (!found) found = CANDIDATES[name].find((p) => p && fs.existsSync(p)) || null;
  if (found) cache[name] = found;
  return found;
}

// Windows .cmd files have to go through the command shell.
function spawnSpec(file, args) {
  if (isWin && /\.cmd$/i.test(file)) return { cmd: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', file, ...args] };
  return { cmd: file, args };
}

module.exports = { find, run, spawnSpec, isWin };
