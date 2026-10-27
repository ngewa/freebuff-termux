/*  Streaming HTTP nativo (sin curl) + resume + proxy       */

const { spawnSync } = require('child_process');
const {
  existsSync, mkdirSync, unlinkSync, chmodSync, statSync,
  readFileSync, writeFileSync, copyFileSync, createWriteStream, createReadStream,
  openSync, readSync, closeSync,
} = require('fs');
const { join } = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const tar = require('tar');

const { spinIndeterminate, colors } = require('./spinner');
const { getPlatform, getArch, checkPkg, getRunner, isTermux, TERMUX_PREFIX } = require('./termux');

const CONFIG_DIR = join(os.homedir(), '.config', 'freebuff');
const METADATA_PATH = join(CONFIG_DIR, 'freebuff-metadata.json');

function getBinaryPath() {
  const configBin = join(CONFIG_DIR, 'freebuff');
  if (existsSync(configBin)) return configBin;
  const pkgBin = join(TERMUX_PREFIX, 'share', 'freebuff', 'freebuff.real');
  if (existsSync(pkgBin)) return pkgBin;
  return configBin;
}

function getMetadataPath() {
  return METADATA_PATH;
}

function installMotor() {
  const s = spinIndeterminate(1, 2, 'Instalando motor (glibc-repo + glibc-runner)...');
  try {
    spawnSync('pkg', ['install', 'glibc-repo', 'glibc-runner', '-y'], {
      stdio: 'pipe', timeout: 180000
    });
    s.succeed();
    return true;
  } catch {
    s.fail('Ejecuta manualmente: pkg install glibc-repo glibc-runner -y');
    return false;
  }
}

function installSkills() {
  const skills = [
    { bin: 'rg',   pkg: 'ripgrep' },
    { bin: 'git',  pkg: 'git' },
  ];

  const missing = skills.filter(s => !checkPkg(s.bin));
  if (missing.length === 0) {
    const s = spinIndeterminate(1, 1, 'Skills ya instaladas');
    s.succeed();
    return true;
  }

  let failed = 0;
  for (const skill of missing) {
    const s = spinIndeterminate(1, missing.length, `Instalando ${skill.pkg}...`);
    try {
      const r = spawnSync('pkg', ['install', skill.pkg, '-y'], {
        stdio: 'pipe', timeout: 120000
      });
      if (r.status === 0) { s.succeed(); }
      else { s.fail(`pkg install ${skill.pkg} falló`); failed++; }
    } catch {
      s.fail(`Error instalando ${skill.pkg}`); failed++;
    }
  }

  return failed === 0;
}

function getProxyUrl(protocol) {
  const env = process.env;
  if (protocol === 'http:') {
    return env.HTTP_PROXY || env.http_proxy || null;
  }
  return env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || null;
}

function shouldBypass(hostname) {
  const noProxy = process.env.NO_PROXY || process.env.no_proxy || '';
  if (!noProxy) return false;
  const domains = noProxy.split(',').map(d => d.trim().toLowerCase().replace(/:\d+$/, ''));
  const host = hostname.toLowerCase();
  return domains.some(d => d === '*' || host === d || host.endsWith('.' + d) || (d.startsWith('.') && host.endsWith(d)));
}

function connectProxy(proxyUrl, targetHost, targetPort, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proxy = new URL(proxyUrl);
    const opts = {
      hostname: proxy.hostname,
      port: proxy.port || (proxy.protocol === 'https:' ? 443 : 80),
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`,
      headers: { Host: `${targetHost}:${targetPort}` },
    };
    if (proxy.username || proxy.password) {
      opts.headers['Proxy-Authorization'] = 'Basic ' +
        Buffer.from(`${decodeURIComponent(proxy.username || '')}:${decodeURIComponent(proxy.password || '')}`).toString('base64');
    }
    const req = (proxy.protocol === 'https:' ? https : http).request(opts);
    req.on('connect', (res, socket) => {
      if (res.statusCode === 200) return resolve(socket);
      socket.destroy();
      reject(new Error(`Proxy CONNECT ${res.statusCode}`));
    });
    req.on('error', e => reject(new Error(`Proxy: ${e.message}`)));
    req.setTimeout(timeoutMs || 10000, () => { req.destroy(); reject(new Error('Proxy timeout')); });
    req.end();
  });
}

function makeRequest(url, method, headers, timeoutMs, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) {
      return reject(new Error('Demasiadas redirecciones HTTP'));
    }
    const u = new URL(url);
    const isHttps = u.protocol === 'https:';
    const proxyUrl = getProxyUrl(u.protocol);

    const handleResponse = (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const nextUrl = new URL(res.headers.location, url).toString();
        const nextMethod = res.statusCode === 303 ? 'GET' : method;
        makeRequest(nextUrl, nextMethod, headers, timeoutMs, maxRedirects - 1)
          .then(resolve)
          .catch(reject);
        return;
      }
      resolve(res);
    };

    if (proxyUrl && !shouldBypass(u.hostname)) {
      if (isHttps) {
        connectProxy(proxyUrl, u.hostname, u.port || 443, timeoutMs).then(socket => {
          const req = https.request({
            socket,
            hostname: u.hostname,
            port: u.port || 443,
            path: u.pathname + u.search,
            method, headers,
            agent: false,
          });
          req.on('response', handleResponse);
          req.on('error', reject);
          req.setTimeout(timeoutMs || 30000, () => { req.destroy(); reject(new Error('Request timeout')); });
          req.end();
        }).catch(reject);
        return;
      }
      const proxy = new URL(proxyUrl);
      const req = (proxy.protocol === 'https:' ? https : http).request({
        hostname: proxy.hostname,
        port: proxy.port || 80,
        path: url,
        method,
        headers: { ...headers, Host: u.host },
      });
      req.on('response', handleResponse);
      req.on('error', reject);
      req.setTimeout(timeoutMs || 30000, () => { req.destroy(); reject(new Error('Request timeout')); });
      req.end();
      return;
    }

    const req = (isHttps ? https : http).request({
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method, headers,
    });
    req.on('response', handleResponse);
    req.on('error', reject);
    req.setTimeout(timeoutMs || 30000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

function getLatestVersion(timeoutMs = 10000) {
  return new Promise((resolve) => {
    const req = https.get('https://registry.npmjs.org/freebuff/latest', {
      headers: {
        'User-Agent': 'freebuff-termux/1.0',
        'Accept': 'application/json',
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.version || null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function isRetryable(err, statusCode) {
  if (err && err.retryable === false) return false;
  if (['EACCES', 'ENOSPC', 'EPERM', 'EROFS'].includes(err && err.code)) return false;
  if (statusCode && !(statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500)) return false;
  return true;
}

async function downloadFile(url, destPath, { onProgress, timeoutMs = 180000 } = {}) {
  let attempt = 0;
  const maxAttempts = 3;

  while (attempt < maxAttempts) {
    attempt++;
    let resumedFrom = 0;
    try { resumedFrom = statSync(destPath).size; } catch {}

    const headers = {
      'User-Agent': 'freebuff-termux/1.0',
      'Accept': '*/*',
    };
    if (resumedFrom > 0) {
      headers['Range'] = `bytes=${resumedFrom}-`;
    }

    try {
      const res = await makeRequest(url, 'GET', headers, timeoutMs);
      const st = res.statusCode;

      if (st === 206) {
        const cr = res.headers['content-range'];
        if (cr) {
          const m = cr.match(/^bytes (\d+)-(\d+)\/(\d+)$/i);
          if (m && Number(m[1]) !== resumedFrom) {
            try { unlinkSync(destPath); } catch {}
            resumedFrom = 0;
            attempt--;
            continue;
          }
        }
      } else if (st === 200) {
        resumedFrom = 0;
        try { unlinkSync(destPath); } catch {}
      } else if (st === 416) {
        res.resume();
        return statSync(destPath).size;
      } else if (st >= 400) {
        res.resume();
        const err = new Error(`HTTP ${st}`);
        err.statusCode = st;
        if (!isRetryable(null, st)) throw err;
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }

      const totalBytes = Number(res.headers['content-length']) + resumedFrom || null;
      let downloaded = resumedFrom;

      const fileStream = createWriteStream(destPath, {
        flags: resumedFrom > 0 ? 'a' : 'w',
      });

      res.on('data', chunk => {
        downloaded += chunk.length;
        if (onProgress) onProgress({ downloadedBytes: downloaded, totalBytes });
      });

      try {
        await pipeline(res, fileStream);
      } catch (pipeErr) {
        if (attempt < maxAttempts && isRetryable(pipeErr)) {
          await sleep(1000 * 2 ** (attempt - 1));
          continue;
        }
        throw pipeErr;
      }

      const finalSize = statSync(destPath).size;
      if (totalBytes && finalSize !== totalBytes) {
        if (attempt < maxAttempts) {
          await sleep(1000 * 2 ** (attempt - 1));
          continue;
        }
        throw new Error(`Incompleto: ${formatBytes(finalSize)} de ${formatBytes(totalBytes)}`);
      }

      return finalSize;
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      if (!isRetryable(err)) throw err;
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }

  throw new Error('Max reintentos alcanzado');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function verifyIntegrity(filePath) {
  try {
    const size = statSync(filePath).size;
    if (size < 1024 * 1024) {
      return { ok: false, reason: 'too_small', detail: `${(size / 1024).toFixed(0)} KB` };
    }
    const fd = openSync(filePath, 'r');
    const buf = Buffer.alloc(2);
    readSync(fd, buf, 0, 2, 0);
    closeSync(fd);
    if (buf[0] !== 0x1f || buf[1] !== 0x8b) {
      return { ok: false, reason: 'invalid_archive', detail: 'No es un archivo gzip válido' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'verify_error', detail: e.message };
  }
}

function checkBinary(path) {
  const binaryPath = path || getBinaryPath();
  if (!existsSync(binaryPath)) return { ok: false, reason: 'not_found' };
  try {
    const st = statSync(binaryPath);
    if (!st.isFile()) return { ok: false, reason: 'not_file', size: st.size };
    if (st.size < 1024 * 1024) return { ok: false, reason: 'too_small', size: st.size };
    if (!(st.mode & 0o111)) return { ok: false, reason: 'not_executable', size: st.size };
    return { ok: true, size: st.size };
  } catch {
    return { ok: false, reason: 'stat_error' };
  }
}

async function downloadBinary(version) {
  if (!version) {
    version = await getLatestVersion();
  }
  if (!version) {
    const { VERSION } = require('./version');
    version = VERSION || '0.2.34';
  }

  const platform = getPlatform();
  const arch = getArch();
  const filename = `freebuff-${platform}-${arch}.tar.gz`;
  const url = `https://codebuff.com/api/releases/download/${version}/${filename}`;

  const tmpDir = process.env.TMPDIR || (os.tmpdir && existsSync(os.tmpdir()) ? os.tmpdir() : '/data/data/com.termux/files/usr/tmp');
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = join(tmpDir, filename);

  process.stdout.write(`\r ${colors.cyan}◷${colors.reset} [1/2] Descargando freebuff v${version}...\n`);

  let finalSize;
  try {
    finalSize = await downloadFile(url, tmpFile, {
      timeoutMs: 180000,
      onProgress: ({ downloadedBytes, totalBytes }) => {
        const pct = totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
        const bar = totalBytes
          ? `${pct}% de ${formatBytes(totalBytes)}`
          : formatBytes(downloadedBytes);
        process.stdout.write(`\r ${colors.cyan}◷${colors.reset} [1/2] Descargando freebuff v${version}... ${colors.dim}${bar}${colors.reset}`);
      },
    });
    process.stdout.write('\n');
    const check = colors.green + '✔' + colors.reset;
    process.stdout.write(`\r ${check} [1/2] Descargando freebuff v${version}... ${colors.dim}${formatBytes(finalSize)} completado${colors.reset}\n`);
  } catch (err) {
    process.stdout.write('\n');
    const x = colors.red + '✘' + colors.reset;
    process.stdout.write(`\r ${x} [1/2] Descargando freebuff v${version}... ERROR\n`);
    console.log(`  ${colors.dim}${err.message}${colors.reset}`);
    try { unlinkSync(tmpFile); } catch {}
    return false;
  }

  const integrity = verifyIntegrity(tmpFile);
  if (!integrity.ok) {
    console.log(`  ${colors.red}✘${colors.reset} Archivo corrupto: ${integrity.reason}`);
    try { unlinkSync(tmpFile); } catch {}
    return false;
  }

  const s2 = spinIndeterminate(2, 2, 'Extrayendo binario...');
  mkdirSync(CONFIG_DIR, { recursive: true });

  try {
    await pipeline(
      createReadStream(tmpFile),
      zlib.createGunzip(),
      tar.x({ cwd: CONFIG_DIR }),
    );
  } catch (err) {
    s2.fail(`Error al extraer: ${err.message}`);
    try { unlinkSync(tmpFile); } catch {}
    return false;
  }

  const extractedFile = join(CONFIG_DIR, 'freebuff');
  if (!existsSync(extractedFile)) {
    s2.fail('Binario no encontrado tras extracción');
    try { unlinkSync(tmpFile); } catch {}
    return false;
  }

  chmodSync(extractedFile, 0o755);

  const binCheck = checkBinary(extractedFile);
  if (!binCheck.ok) {
    s2.fail(`Binario extraído inválido: ${binCheck.reason}`);
    try { unlinkSync(tmpFile); } catch {}
    return false;
  }

  // Sincronizar también con el paquete de sistema Termux si existe
  const pkgShare = join(TERMUX_PREFIX, 'share', 'freebuff');
  if (existsSync(pkgShare)) {
    try {
      copyFileSync(extractedFile, join(pkgShare, 'freebuff.real'));
      chmodSync(join(pkgShare, 'freebuff.real'), 0o755);
      const wasm = join(CONFIG_DIR, 'tree-sitter.wasm');
      if (existsSync(wasm)) {
        copyFileSync(wasm, join(pkgShare, 'tree-sitter.wasm'));
      }
    } catch {}
  }

  writeFileSync(METADATA_PATH, JSON.stringify({
    version,
    target: `${platform}-${arch}`,
    installed: new Date().toISOString(),
  }, null, 2));

  try { unlinkSync(tmpFile); } catch {}
  s2.succeed(`v${version} · ${formatBytes(binCheck.size)}`);

  return true;
}

function getCurrentVersion() {
  try {
    if (existsSync(METADATA_PATH)) {
      const metadata = JSON.parse(readFileSync(METADATA_PATH, 'utf-8'));
      if (metadata.version) return metadata.version;
    }
  } catch {}

  try {
    const bin = getBinaryPath();
    if (existsSync(bin)) {
      const runner = getRunner();
      const cmd = runner === 'grun' ? 'grun' : bin;
      const args = runner === 'grun' ? [bin, '--version'] : ['--version'];
      const r = spawnSync(cmd, args, { timeout: 3000, encoding: 'utf-8' });
      if (r.status === 0 && r.stdout) {
        const m = r.stdout.trim().match(/\b\d+\.\d+\.\d+\b/);
        if (m) return m[0];
      }
    }
  } catch {}

  return null;
}

async function updateBinary(force = false) {
  const s = spinIndeterminate(1, 2, 'Verificando actualizaciones...');
  const latest = await getLatestVersion();
  if (!latest) {
    s.fail('No se pudo verificar la última versión');
    return false;
  }
  const current = getCurrentVersion();
  if (!force && current === latest) {
    s.succeed(`Ya tienes la última versión (v${current})`);
    return true;
  }
  s.succeed(`Nueva versión disponible: v${latest} (actual: v${current || 'ninguna'})`);
  return await downloadBinary(latest);
}

module.exports = {
  CONFIG_DIR,
  getBinaryPath,
  getMetadataPath,
  installMotor,
  installSkills,
  getLatestVersion,
  downloadBinary,
  checkBinary,
  getCurrentVersion,
  updateBinary,
};
