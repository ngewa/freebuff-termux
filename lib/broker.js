/*  Reparación del broker de comandos de terminal en Termux.      */
/*                                                                */
/*  Síntoma: cada comando del agente falla con                     */
/*    terminal command broker failed: ... protocol response was    */
/*    missing                                                     */
/*  y $TMPDIR/codebuff-process-<id>/stderr.log contiene            */
/*    ld-linux-aarch64.so.1: unrecognized option                   */
/*    '--terminal-command-broker'                                  */
/*                                                                */
/*  Causa: el CLI arranca a través del loader glibc (grun o el     */
/*  helper ELF de $PREFIX/bin/freebuff). Con el loader explícito,  */
/*  /proc/self/exe es el loader, así que el broker que el CLI se   */
/*  auto-lanza queda como `ld-linux-aarch64.so.1 --terminal-...`.  */
/*                                                                */
/*  Solución: marcar el binario real con PT_INTERP + RUNPATH       */
/*  (`grun -c`) y ejecutarlo directamente, de modo que             */
/*  /proc/self/exe vuelva a ser el binario real.                   */

const { spawnSync } = require('child_process');
const {
  existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync,
  chmodSync, statSync, openSync, readSync, closeSync, renameSync, unlinkSync,
} = require('fs');
const { join } = require('path');
const os = require('os');

const { colors } = require('./spinner');
const { getBinaryPath, CONFIG_DIR } = require('./download');
const { TERMUX_PREFIX, isTermux, getRunner } = require('./termux');

const GLIBC_PREFIX = join(TERMUX_PREFIX, 'glibc');
const LOADER = join(GLIBC_PREFIX, 'lib', 'ld-linux-aarch64.so.1');
const GLIBC_CA = join(TERMUX_PREFIX, 'etc', 'tls', 'cert.pem');
const WRAPPER = join(TERMUX_PREFIX, 'bin', 'freebuff');
const WRAPPER_BAK = join(TERMUX_PREFIX, 'bin', 'freebuff-helper.bak');
const SHARE_REAL = join(TERMUX_PREFIX, 'share', 'freebuff', 'freebuff.real');
const CONFIG_REAL = join(os.homedir(), '.config', 'freebuff', 'freebuff');
const STATE_PATH = join(CONFIG_DIR, 'broker.json');

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeState(data) {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(data, null, 2));
  } catch {}
}

function fingerprint(path) {
  try {
    const st = statSync(path);
    return `${path}:${st.size}:${Math.round(st.mtimeMs)}`;
  } catch {
    return null;
  }
}

function isElf(path) {
  try {
    const fd = openSync(path, 'r');
    const buf = Buffer.alloc(4);
    readSync(fd, buf, 0, 4, 0);
    closeSync(fd);
    return buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46;
  } catch {
    return false;
  }
}

function wrapperKind() {
  if (!existsSync(WRAPPER)) return 'missing';
  return isElf(WRAPPER) ? 'elf' : 'script';
}

function execEnv() {
  const env = Object.assign({}, process.env);
  // No anteponer $PREFIX/glibc/lib a LD_LIBRARY_PATH. El binario real ya lleva
  // RUNPATH hacia esa carpeta; si se exporta, los procesos biónicos hijos
  // (bash, rg, git) resuelven `libc.so` al ld-script de glibc y mueren con
  // "invalid ELF header" / "bad ELF magic: 2f2a2047".
  // LD_PRELOAD bionik (libtermux-exec-ld-preload.so) meracuni loader glibc:
  // biner glibc gagal dengan "invalid ELF header" bila diwarisi.
  delete env.LD_LIBRARY_PATH;
  delete env.LD_PRELOAD;
  if (!env.SSL_CERT_FILE && existsSync(GLIBC_CA)) env.SSL_CERT_FILE = GLIBC_CA;
  return env;
}

function testDirect(path) {
  const r = spawnSync(path, ['--version'], { env: execEnv(), timeout: 8000, encoding: 'utf-8' });
  if (r.error) return { ok: false, reason: r.error.code || r.error.message };
  if (r.status !== 0) return { ok: false, reason: `exit ${r.status}` };
  const out = String(r.stdout || '').trim().split('\n')[0];
  if (!out) return { ok: false, reason: 'sin salida' };
  return { ok: true, output: out };
}

function findGrun() {
  const candidates = [join(TERMUX_PREFIX, 'bin', 'grun'), join(GLIBC_PREFIX, 'bin', 'grun')];
  for (const p of candidates) if (existsSync(p)) return p;
  return null;
}

function findPatchelf() {
  const candidates = [join(TERMUX_PREFIX, 'bin', 'patchelf'), join(GLIBC_PREFIX, 'bin', 'patchelf')];
  for (const p of candidates) if (existsSync(p)) return p;
  return null;
}

function patchInterpreter(path) {
  const backup = `${path}.bak`;
  try {
    if (!existsSync(backup)) copyFileSync(path, backup);
  } catch {}

  const libDir = join(GLIBC_PREFIX, 'lib');
  const grun = findGrun();
  let grunError = grun ? null : 'grun no encontrado';

  if (grun) {
    const r = spawnSync(grun, ['-c', path], { stdio: 'pipe', timeout: 30000 });
    if (!r.error && r.status === 0) return { ok: true, via: 'grun -c' };
    grunError = r.error ? r.error.message : `grun -c falló (exit ${r.status})`;
  }

  let patchelf = findPatchelf();
  if (!patchelf) {
    spawnSync('pkg', ['install', 'patchelf', '-y'], { stdio: 'pipe', timeout: 120000 });
    patchelf = findPatchelf();
  }

  if (patchelf) {
    const interp = spawnSync(patchelf, ['--set-interpreter', LOADER, path], { stdio: 'pipe', timeout: 30000 });
    if (!interp.error && interp.status === 0) {
      const rpath = spawnSync(patchelf, ['--set-rpath', libDir, path], { stdio: 'pipe', timeout: 30000 });
      if (!rpath.error && rpath.status === 0) return { ok: true, via: 'patchelf' };
      return { ok: false, reason: `patchelf --set-rpath falló (exit ${rpath.status})` };
    }
    return { ok: false, reason: `patchelf --set-interpreter falló (exit ${interp.status})` };
  }

  if (!existsSync(LOADER)) {
    return { ok: false, reason: `loader no encontrado: ${LOADER} (pkg install glibc-repo glibc-runner)` };
  }
  return { ok: false, reason: `${grunError}; patchelf no disponible (pkg install patchelf)` };
}

function ensureDirectExec({ force = false } = {}) {
  if (!isTermux) return { direct: false, reason: 'no es Termux' };
  if (process.env.FREEBUFF_NO_BROKER_FIX === '1') {
    return { direct: false, reason: 'desactivado por FREEBUFF_NO_BROKER_FIX=1' };
  }

  const binary = getBinaryPath();
  if (!existsSync(binary)) return { direct: false, reason: 'binario no instalado' };

  const fp = fingerprint(binary);
  const state = readState();
  if (!force && fp && state.fingerprint === fp && state.direct === true) {
    return { direct: true, cached: true, binary };
  }

  let test = testDirect(binary);
  let patchedVia = null;
  if (!test.ok && existsSync(LOADER)) {
    const patch = patchInterpreter(binary);
    if (!patch.ok) {
      writeState({ fingerprint: fp, direct: false, reason: patch.reason, at: new Date().toISOString() });
      return { direct: false, binary, reason: patch.reason };
    }
    patchedVia = patch.via;
    test = testDirect(binary);
  }

  writeState({
    fingerprint: fp,
    direct: test.ok,
    reason: test.ok ? null : test.reason,
    at: new Date().toISOString(),
  });

  return test.ok
    ? { direct: true, binary, version: test.output, via: patchedVia }
    : { direct: false, binary, reason: test.reason };
}

const LAUNCHER_VERSION = '3';

function launcherScript() {
  return `#!/data/data/com.termux/files/usr/bin/bash
# freebuff-launcher-version: ${LAUNCHER_VERSION}
# Freebuff launcher: ejecuta el binario glibc directamente (PT_INTERP + RUNPATH
# fijados por grun -c), de modo que /proc/self/exe sea el binario real y el
# broker de comandos de terminal funcione. Si no puede ejecutarse, usa grun.
GLIBC_PREFIX="${GLIBC_PREFIX}"
REAL="${CONFIG_REAL}"
[ -f "$REAL" ] || REAL="${SHARE_REAL}"
# No exportar LD_LIBRARY_PATH: el binario glibc ya trae RUNPATH a
# $GLIBC_PREFIX/lib. Exportarlo hace que los hijos biónicos (bash, rg, git)
# carguen el ld-script libc.so de glibc y fallen con "bad ELF magic".
unset LD_LIBRARY_PATH
unset LD_PRELOAD
[ -f "${GLIBC_CA}" ] && export SSL_CERT_FILE="${GLIBC_CA}"
"$REAL" "$@"
status=$?
if [ "$status" = 126 ] || [ "$status" = 127 ]; then
  exec grun "$REAL" "$@"
fi
exit $status
`;
}

function wrapperIsCurrent() {
  try {
    return readFileSync(WRAPPER, 'utf-8').includes(`freebuff-launcher-version: ${LAUNCHER_VERSION}`);
  } catch {
    return false;
  }
}

function repairWrapper({ force = false } = {}) {
  const kind = wrapperKind();
  if (kind === 'missing') return { changed: false, reason: `no existe ${WRAPPER}` };
  if (kind !== 'elf' && !force && wrapperIsCurrent()) {
    return { changed: false, reason: 'el lanzador ya está actualizado' };
  }

  const binary = getBinaryPath();
  if (!existsSync(binary)) return { changed: false, reason: 'no hay binario real instalado' };

  if (kind === 'elf') {
    try {
      if (!existsSync(WRAPPER_BAK)) copyFileSync(WRAPPER, WRAPPER_BAK);
    } catch (err) {
      return { changed: false, reason: `no se pudo respaldar: ${err.message}` };
    }
  }

  const tmp = `${WRAPPER}.new.${process.pid}`;
  try {
    writeFileSync(tmp, launcherScript());
    chmodSync(tmp, 0o755);
    renameSync(tmp, WRAPPER);
  } catch (err) {
    try { unlinkSync(tmp); } catch {}
    return { changed: false, reason: `no se pudo escribir ${WRAPPER}: ${err.message}` };
  }

  return { changed: true };
}

function revertWrapper() {
  if (!existsSync(WRAPPER_BAK)) return { changed: false, reason: `sin respaldo en ${WRAPPER_BAK}` };
  const tmp = `${WRAPPER}.revert.${process.pid}`;
  try {
    copyFileSync(WRAPPER_BAK, tmp);
    chmodSync(tmp, 0o755);
    renameSync(tmp, WRAPPER);
  } catch (err) {
    try { unlinkSync(tmp); } catch {}
    return { changed: false, reason: `no se pudo restaurar: ${err.message}` };
  }
  return { changed: true };
}

function cmdBroker(opts = {}) {
  const { fix = false, revert = false } = opts;

  console.log(`\n${colors.bold}${colors.cyan}╔══════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}║      BROKER DE TERMINAL (DIAGNÓSTICO)        ║${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}╚══════════════════════════════════════════════╝${colors.reset}\n`);

  console.log(`  ${colors.dim}Termux:${colors.reset} ${isTermux ? 'Sí' : 'No'}`);
  console.log(`  ${colors.dim}Loader:${colors.reset} ${existsSync(LOADER) ? LOADER : colors.yellow + 'no encontrado' + colors.reset}`);
  console.log(`  ${colors.dim}Binario:${colors.reset} ${getBinaryPath()}`);
  console.log(`  ${colors.dim}Lanzador:${colors.reset} ${WRAPPER} ${colors.dim}(${wrapperKind()})${colors.reset}`);
  console.log(`  ${colors.dim}Runner:${colors.reset} ${getRunner() || 'ninguno'}\n`);

  if (revert) {
    const r = revertWrapper();
    if (r.changed) console.log(`  ${colors.green}✔${colors.reset} Lanzador restaurado desde ${WRAPPER_BAK}\n`);
    else console.log(`  ${colors.yellow}⚠${colors.reset} ${r.reason}\n`);
    return r.changed;
  }

  const direct = ensureDirectExec({ force: fix });
  if (direct.direct) {
    const extra = [direct.version, direct.via ? 'parcheado con ' + direct.via : null]
      .filter(Boolean).join(' · ');
    console.log(`  ${colors.green}✔${colors.reset} Ejecución directa OK${extra ? colors.dim + ' (' + extra + ')' + colors.reset : ''} — el broker funciona.`);
  } else {
    console.log(`  ${colors.red}✘${colors.reset} Ejecución directa no disponible: ${direct.reason}`);
    console.log(`    ${colors.dim}El CLI arranca vía loader, así que el broker se auto-lanza como loader y falla.${colors.reset}`);
  }

  if (fix) {
    const wrapper = repairWrapper({ force: fix });
    if (wrapper.changed) {
      console.log(`  ${colors.green}✔${colors.reset} Lanzador ${WRAPPER} reemplazado (respaldo: ${WRAPPER_BAK})`);
    } else {
      console.log(`  ${colors.dim}·${colors.reset} Lanzador: ${wrapper.reason}`);
    }
  }

  console.log('');
  if (!direct.direct) {
    console.log(`  ${colors.dim}Reintenta con:${colors.reset} ${colors.cyan}freebuff broker --fix${colors.reset}\n`);
    return false;
  }
  if (!fix) {
    console.log(`  ${colors.dim}Reparación completa:${colors.reset} ${colors.cyan}freebuff broker --fix${colors.reset}\n`);
  }
  return true;
}

module.exports = {
  LOADER,
  WRAPPER,
  WRAPPER_BAK,
  wrapperKind,
  ensureDirectExec,
  repairWrapper,
  revertWrapper,
  cmdBroker,
};
