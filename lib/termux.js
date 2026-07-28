const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');
const os = require('os');

const TERMUX_PREFIX = process.env.PREFIX || '/data/data/com.termux/files/usr';
const isTermux = !!(
  process.env.PREFIX ||
  process.env.TERMUX_VERSION ||
  existsSync('/data/data/com.termux')
);

function getEnv() {
  return { TERMUX_PREFIX, isTermux };
}

function getPlatform() {
  return os.platform() === 'android' ? 'linux' : os.platform();
}

function getArch() {
  const a = os.arch();
  if (a === 'arm64') return 'arm64';
  if (a === 'x64') return 'x64';
  if (a === 'arm') return 'arm';
  return a;
}

function getRunner() {
  if (!isTermux) return null;
  if (existsSync(join(TERMUX_PREFIX, 'bin', 'grun'))) return 'grun';
  return null;
}

function checkPkg(name) {
  try { execSync(`command -v ${name} 2>/dev/null`, { stdio: 'pipe' }); return true; }
  catch { return false; }
}

function setupRgPath() {
  // Auto-configure CODEBUFF_rg_PATH for Termux
  if (isTermux && !process.env.CODEBUFF_rg_PATH) {
    const rgPath = join(TERMUX_PREFIX, 'bin', 'rg');
    if (existsSync(rgPath)) {
      process.env.CODEBUFF_rg_PATH = rgPath;
    }
  }
}

module.exports = {
  TERMUX_PREFIX,
  isTermux,
  getEnv,
  getPlatform,
  getArch,
  getRunner,
  checkPkg,
  setupRgPath,
};
