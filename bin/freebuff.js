#!/data/data/com.termux/files/usr/bin/node



const { spawn, spawnSync } = require('child_process');
const { dirname, join } = require('path');
const { existsSync, readdirSync, statSync, unlinkSync } = require('fs');
const os = require('os');

const { isTermux, getRunner, getPlatform, getArch, setupRgPath, TERMUX_PREFIX } = require('../lib/termux');
const { colors } = require('../lib/spinner');
const { getBinaryPath, checkBinary, getCurrentVersion, getMetadataPath } = require('../lib/download');
const { cmdSetup, interactiveSetup, printStatus } = require('../lib/setup');
const { VERSION, PKG_NAME } = require('../lib/version');

const BIN_DIR = join(__dirname, '..');


function showHelp() {
  console.log('\n ' + colors.bold + colors.cyan + '\u2554' + '\u2550'.repeat(46) + '\u2557' + colors.reset);
  console.log(' ' + colors.bold + colors.cyan + '\u2551' + '           FREEBUFF  COMANDOS               ' + '\u2551' + colors.reset);
  console.log(' ' + colors.bold + colors.cyan + '\u255A' + '\u2550'.repeat(46) + '\u255D' + colors.reset + '\n');

  const section = (title, cmds) => {
    console.log('  ' + colors.bold + colors.yellow + title + colors.reset);
    for (const { cmd, desc } of cmds) {
      console.log('    ' + colors.cyan + cmd.padEnd(20) + colors.reset + colors.dim + desc + colors.reset);
    }
    console.log('');
  };

  section('Sistema', [
    { cmd: 'setup', desc: 'Instalaci\u00f3n interactiva del sistema' },
    { cmd: '--version', desc: 'Informaci\u00f3n de la versi\u00f3n' },
    { cmd: '--help', desc: 'Mostrar esta ayuda' },
    { cmd: '--no-banner', desc: 'Omitir banner animado' },
    { cmd: '--json', desc: 'Salida JSON (para --version)' },
  ]);

  section('Diagn\u00f3stico', [
    { cmd: 'doctor', desc: 'Diagn\u00f3stico completo del sistema' },
    { cmd: 'doctor --fix', desc: 'Diagn\u00f3stico + reparaci\u00f3n autom\u00e1tica' },
  ]);

  section('Escritorio', [
    { cmd: 'desktop', desc: 'Iniciar entorno gr\u00e1fico LXQt + Termux:X11' },
  ]);

  section('Mantenimiento', [
    { cmd: 'clean', desc: 'Limpiar archivos temporales y cach\u00e9' },
    { cmd: 'changelog', desc: 'Historial de cambios' },
    { cmd: '/bypass', desc: 'Iniciar con permisos totales' },
  ]);

  console.log('  ' + colors.dim + 'Documentaci\u00f3n: https://freebuff.com' + colors.reset + '\n');
}


const gs = require('gradient-string');

function showBanner() {
  const w = 68;
  const pad = function(text, width) {
    var visible = text.replace(/\x1b\[[0-9;]*m/g, '');
    return text + ' '.repeat(Math.max(0, width - visible.length));
  };

  var GRADS = [
    gs.pastel,
    gs.rainbow,
    gs.cristal,
    gs.mind,
    gs.retro,
    gs.teen,
    gs.default(['#f97316', '#fbbf24', '#a3e635']),
    gs.default(['#ec4899', '#f43f5e', '#fb923c']),
    gs.default(['#8B5CF6', '#3B82F6', '#06B6D4']),
  ];

  var logo = [
    '\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557',
    '\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d',
    '\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2557',
    '\u2588\u2588\u2554\u2550\u2550\u255d  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u255d  \u2588\u2588\u2554\u2550\u2550\u255d  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u255d  \u2588\u2588\u2554\u2550\u2550\u255d',
    '\u2588\u2588\u2551     \u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d\u255a\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d\u2588\u2588\u2551     \u2588\u2588\u2551',
    '\u255a\u2550\u255d     \u255a\u2550\u255d  \u255a\u2550\u255d\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u2550\u2550\u2550\u2550\u255d  \u255a\u2550\u2550\u2550\u2550\u2550\u255d \u255a\u2550\u255d     \u255a\u2550\u255d',
  ];

  var line = function(t) { return colors.cyan + '\u2551' + colors.reset + pad(t, w) + colors.cyan + '\u2551' + colors.reset; };
  var top = colors.cyan + '\u2554' + '\u2550'.repeat(w) + '\u2557' + colors.reset;
  var bot = colors.cyan + '\u255A' + '\u2550'.repeat(w) + '\u255D' + colors.reset;

  var render = function(grad) {
    var out = [];
    out.push('');
    out.push(top);
    out.push(line(''));
    for (var i = 0; i < logo.length; i++) {
      out.push(line(' ' + grad(logo[i])));
    }
    out.push(line(''));
    out.push(line('   ' + colors.cyan + 'v' + VERSION + colors.reset + ' ' + colors.dim + '\u00b7 Termux/Android \u00b7 Fork nyxur' + colors.reset));
    out.push(line(''));
    out.push(bot);
    out.push('');
    process.stdout.write(out.join('\n') + '\n');
  };

  // Primer frame
  render(GRADS[0]);

  // Animacion: 14 lineas del banner
  var LINES = 14;
  var frame = 0;
  var anim = setInterval(function() {
    frame++;
    process.stdout.write('\x1b[' + LINES + 'A');
    render(GRADS[frame % GRADS.length]);
  }, 130);

  return function() {
    clearInterval(anim);
    process.stdout.write('\x1b[' + LINES + 'A');
    render(GRADS[frame % GRADS.length]);
  };
}


var CHANGELOG = [
  { version: '0.0.125', changes: [
    'Banner animado con 9 gradientes rotando sobre logo FREEBUFF',
    'Descarga HTTP nativa Node (sin dependencia curl)',
    'Soporte proxy (HTTP_PROXY/HTTPS_PROXY) y resume HTTP Range',
    'Reintentos con backoff exponencial en descargas',
    'C\u00f3digo muerto eliminado (launcher.js, http.js, ~770 l\u00edneas)',
    'Doctor async con await correcto en reparaciones',
    'Versi\u00f3n desde version.js (sin hardcodeo)',
    'Skills simplificadas (rg, git - sin curl)',
    'await downloadBinary en setup',
  ]},
  { version: '0.0.124', changes: [
    'Banner con gradient-string (11 gradientes fluidos)',
    'Logo FREEBUFF en ASCII art con box-drawing',
    'Comando --help con lista completa de comandos',
    'Comando doctor para diagn\u00f3stico del sistema',
    'Comando clean para limpiar cach\u00e9',
    'Comando changelog con historial de versiones',
    'version.js para versi\u00f3n centralizada',
    'Spinners con colores gradient (indigo, cyan, emerald, amber)',
    'Verificaci\u00f3n de integridad gzip en descargas',
    'checkBinary mejorado con validaci\u00f3n ejecutable',
    'Paleta de colores consistente en toda la UI',
    'Mejor manejo de errores con diagn\u00f3stico',
    'Soporte --json para salida estructurada',
  ]},
  { version: '0.0.123', changes: [
    'Setup interactivo con 3 preguntas guiadas',
    'Descarga con reintentos (3 intentos)',
    'Instalaci\u00f3n de motor glibc-runner',
    'Instalaci\u00f3n de skills (ripgrep, curl, git)',
    'Banner animado con colores pastel',
  ]},
];

function showChangelog() {
  console.log('\n ' + colors.bold + colors.cyan + '\u2554' + '\u2550'.repeat(46) + '\u2557' + colors.reset);
  console.log(' ' + colors.bold + colors.cyan + '\u2551' + '         HISTORIAL DE CAMBIOS               ' + '\u2551' + colors.reset);
  console.log(' ' + colors.bold + colors.cyan + '\u255A' + '\u2550'.repeat(46) + '\u255D' + colors.reset + '\n');
  for (var i = 0; i < CHANGELOG.length; i++) {
    var entry = CHANGELOG[i];
    var isCurrent = entry.version === VERSION;
    var tag = isCurrent ? ' ' + colors.green + '\u2190 actual' + colors.reset : '';
    console.log('  ' + colors.bold + colors.yellow + 'v' + entry.version + colors.reset + tag);
    for (var j = 0; j < entry.changes.length; j++) {
      console.log('    ' + colors.green + '\u2022' + colors.reset + ' ' + entry.changes[j]);
    }
    console.log('');
  }
}

var _installMotor = require('../lib/download').installMotor;
var _installSkills = require('../lib/download').installSkills;
var _checkPkgTermux = require('../lib/termux').checkPkg;

async function showDoctor(fix) {
  if (fix === undefined) fix = false;
  var fixes = [];

  console.log('\n ' + colors.bold + colors.cyan + '\u2554' + '\u2550'.repeat(46) + '\u2557' + colors.reset);
  console.log(' ' + colors.bold + colors.cyan + '\u2551' + '       ' + (fix ? 'DIAGN\u00d3STICO \u2014 MODO REPARACI\u00d3N' : 'DIAGN\u00d3STICO DEL SISTEMA') + '       ' + '\u2551' + colors.reset);
  console.log(' ' + colors.bold + colors.cyan + '\u255A' + '\u2550'.repeat(46) + '\u255D' + colors.reset + '\n');

  var checks = [];

  checks.push({
    name: 'Entorno Termux',
    ok: isTermux,
    detail: isTermux ? 'PREFIX: ' + TERMUX_PREFIX : colors.yellow + 'No detectado' + colors.reset,
  });

  checks.push({
    name: 'Node.js',
    ok: true,
    detail: process.version,
  });

  var runner = getRunner();
  var needsRunner = isTermux && !runner;
  checks.push({
    name: 'Motor (glibc-runner)',
    ok: !!runner,
    detail: runner ? 'Disponible: ' + runner : colors.yellow + 'No instalado' + colors.reset,
  });
  if (needsRunner && fix) fixes.push(function() { return _installMotor(); });

  var binCheck = checkBinary();
  checks.push({
    name: 'Binario Freebuff',
    ok: binCheck.ok,
    detail: binCheck.ok ? (binCheck.size / 1024 / 1024).toFixed(1) + ' MB' : colors.yellow + 'Falta: ' + binCheck.reason + colors.reset,
  });
  if (!binCheck.ok && fix) fixes.push(function() {
    var _downloadBinary = require('../lib/download').downloadBinary;
    var ver = getCurrentVersion() || VERSION;
    return _downloadBinary(ver);
  });

  var binVer = getCurrentVersion();
  checks.push({
    name: 'Versi\u00f3n binario',
    ok: !!binVer,
    detail: binVer || colors.yellow + 'Desconocida' + colors.reset,
  });

  var skills = ['rg', 'git'];
  var installedSkills = skills.filter(function(s) { return _checkPkgTermux(s); });
  checks.push({
    name: 'Skills',
    ok: installedSkills.length === skills.length,
    detail: installedSkills.length + '/' + skills.length + ' instaladas',
  });
  if (installedSkills.length < skills.length && fix) fixes.push(function() { return _installSkills(); });

  for (var i = 0; i < checks.length; i++) {
    var c = checks[i];
    var icon = c.ok ? colors.green + '\u2714' : colors.yellow + '\u26A0';
    console.log('  ' + icon + colors.reset + ' ' + colors.bold + c.name.padEnd(22) + colors.reset + ' ' + (c.ok ? colors.green + 'OK' : colors.red + 'FALTA') + colors.reset);
    console.log('    ' + colors.dim + c.detail + colors.reset);
  }

  var passed = checks.filter(function(c) { return c.ok; }).length;
  console.log('\n  ' + colors.bold + 'Resumen:' + colors.reset + ' ' + passed + '/' + checks.length + ' checks ' + (passed === checks.length ? colors.green + '\u2705' : colors.yellow + '\u26A0\uFE0F') + colors.reset + '\n');

  if (fix && fixes.length > 0) {
    console.log(' ' + colors.bold + colors.yellow + '\u2554' + '\u2550'.repeat(46) + '\u2557' + colors.reset);
    console.log(' ' + colors.bold + colors.yellow + '\u2551' + '       REPARANDO ' + fixes.length + ' PROBLEMA(S)              ' + '\u2551' + colors.reset);
    console.log(' ' + colors.bold + colors.yellow + '\u255A' + '\u2550'.repeat(46) + '\u255D' + colors.reset + '\n');
    for (var j = 0; j < fixes.length; j++) {
      try { await fixes[j](); } catch (e) {
        console.log('  ' + colors.red + '\u2718' + colors.reset + ' Error en reparaci\u00f3n: ' + e.message);
      }
    }
    console.log('\n  ' + colors.green + '\u2714' + colors.reset + ' ' + colors.bold + colors.green + 'Reparaci\u00f3n completada.' + colors.reset + " Ejecuta 'freebuff doctor' para verificar\n");
  } else if (fix && fixes.length === 0) {
    console.log('  ' + colors.green + '\u2714' + colors.reset + ' ' + colors.bold + colors.green + 'No hay problemas que reparar' + colors.reset + '\n');
  }
}


function cmdClean() {
  console.log('\n ' + colors.bold + colors.cyan + '\u2554' + '\u2550'.repeat(46) + '\u2557' + colors.reset);
  console.log(' ' + colors.bold + colors.cyan + '\u2551' + '           LIMPIAR CACH\u00c9                    ' + '\u2551' + colors.reset);
  console.log(' ' + colors.bold + colors.cyan + '\u255A' + '\u2550'.repeat(46) + '\u255D' + colors.reset + '\n');

  var cleaned = 0;
  var freed = 0;

  var tmpDir = os.tmpdir();
  var tmpFiles = [];
  try {
    var allFiles = readdirSync(tmpDir);
    for (var i = 0; i < allFiles.length; i++) {
      if (allFiles[i].startsWith('freebuff-')) tmpFiles.push(allFiles[i]);
    }
  } catch (e) {}

  for (var j = 0; j < tmpFiles.length; j++) {
    try {
      var filePath = join(tmpDir, tmpFiles[j]);
      var st = statSync(filePath);
      freed += st.size;
      unlinkSync(filePath);
      cleaned++;
      console.log('  ' + colors.green + '\u2714' + colors.reset + ' ' + colors.dim + tmpFiles[j] + colors.reset);
    } catch (e) {}
  }

  var metaPath = getMetadataPath();
  if (existsSync(metaPath)) {
    try {
      var meta = JSON.parse(require('fs').readFileSync(metaPath, 'utf-8'));
      var binPath = getBinaryPath();
      if (!existsSync(binPath)) {
        unlinkSync(metaPath);
        cleaned++;
        freed += 100;
        console.log('  ' + colors.green + '\u2714' + colors.reset + ' ' + colors.dim + 'Metadata hu\u00e9rfana eliminada' + colors.reset);
      }
    } catch (e) {}
  }

  if (cleaned === 0) {
    console.log('  ' + colors.cyan + '\u2139' + colors.reset + ' No hay archivos temporales que limpiar\n');
  } else {
    var freedMB = (freed / 1024 / 1024).toFixed(2);
    console.log('\n  ' + colors.green + '\u2714' + colors.reset + ' ' + colors.bold + colors.green + cleaned + ' archivo(s) eliminado(s), ' + freedMB + ' MB liberados' + colors.reset + '\n');
  }
}


function showVersion(json) {
  if (json === undefined) json = false;
  var binCheck = checkBinary();
  var runner = getRunner();
  var currentVer = getCurrentVersion();

  if (json) {
    console.log(JSON.stringify({
      package: PKG_NAME,
      version: VERSION,
      binary: binCheck.ok ? {
        path: getBinaryPath(),
        size: (binCheck.size / 1024 / 1024).toFixed(1) + ' MB',
      } : null,
      platform: getPlatform(),
      arch: getArch(),
      termux: isTermux,
      runner: runner || null,
      binaryVersion: currentVer,
    }, null, 2));
    return;
  }

  console.log('\n ' + colors.bold + colors.cyan + PKG_NAME + colors.reset + ' ' + colors.green + 'v' + VERSION + colors.reset);
  if (binCheck.ok) {
    console.log('   ' + colors.dim + 'Binario:' + colors.reset + ' ' + getBinaryPath() + ' ' + colors.dim + '(' + (binCheck.size / 1024 / 1024).toFixed(1) + ' MB)' + colors.reset);
  } else {
    console.log('   ' + colors.yellow + 'Binario: No descargado (' + binCheck.reason + ')' + colors.reset);
  }
  console.log('   ' + colors.dim + 'Plataforma:' + colors.reset + ' ' + getPlatform() + '-' + getArch());
  if (isTermux) {
    console.log('   ' + colors.dim + 'Runner:' + colors.reset + ' ' + (runner || colors.yellow + 'No instalado' + colors.reset));
  }
  if (currentVer) {
    console.log('   ' + colors.dim + 'Versi\u00f3n binario:' + colors.reset + ' ' + currentVer);
  }
  console.log('');
}


async function main() {
  var rawArgs = process.argv.slice(2);

  setupRgPath();

  
  var noBannerIndex = rawArgs.indexOf('--no-banner');
  var isNoBanner = noBannerIndex !== -1;
  if (isNoBanner) rawArgs.splice(noBannerIndex, 1);

  var setupIndex = rawArgs.indexOf('setup');
  var isSetup = setupIndex !== -1;
  if (isSetup) rawArgs.splice(setupIndex, 1);

  var bypassIndex = rawArgs.indexOf('--bypass');
  var isBypass = bypassIndex !== -1;
  if (isBypass) rawArgs.splice(bypassIndex, 1);

  
  var subcommand = rawArgs.length > 0 && !rawArgs[0].startsWith('-') ? rawArgs[0].toLowerCase() : null;

  
  if (rawArgs[0] === '--help' || rawArgs[0] === '-h') {
    showHelp();
    process.exit(0);
  }

  
  if (rawArgs[0] === '--version' || rawArgs[0] === '-v') {
    var json = rawArgs.includes('--json');
    showVersion(json);
    process.exit(0);
  }

  
  if (subcommand === 'doctor') {
    var fix = rawArgs.includes('--fix');
    await showDoctor(fix);
    process.exit(0);
  }

  if (subcommand === 'clean') {
    cmdClean();
    process.exit(0);
  }

  if (subcommand === 'changelog') {
    showChangelog();
    process.exit(0);
  }

  
  if (subcommand === 'desktop') {
    var desktopScript = join(os.homedir(), '.termux', 'desktop.sh');
    if (!existsSync(desktopScript)) {
      console.log('\n ' + colors.red + '\u2718' + colors.reset + ' Script desktop no encontrado.');
      console.log('   Ejecuta: ' + colors.cyan + 'freebuff setup' + colors.reset + '\n');
      process.exit(1);
    }
    var child = spawn('bash', [desktopScript], { stdio: 'inherit' });
    child.on('exit', function(code) { process.exit(code || 0); });
    return;
  }

  
  if (isSetup) {
    await cmdSetup();
    process.exit(0);
  }

  
  await interactiveSetup();

  
  var binCheck = checkBinary();
  if (!binCheck.ok) {
    console.log('\n ' + colors.red + '\u2718' + colors.reset + ' Binario no encontrado.');
    console.log('   Ejecuta: ' + colors.cyan + 'freebuff setup' + colors.reset);
    console.log('   O:      ' + colors.cyan + 'freebuff doctor --fix' + colors.reset + '\n');
    process.exit(1);
  }

  
  if (!isNoBanner) {
    var stopBanner = showBanner();
    await new Promise(function(r) { setTimeout(r, 700); });
    stopBanner();
    await new Promise(function(r) { setTimeout(r, 100); });
  }

  
  var binaryPath = getBinaryPath();
  var runner = getRunner();
  var spawnCmd = binaryPath;
  var spawnArgs = rawArgs;

  if (runner === 'grun') {
    spawnCmd = 'grun';
    spawnArgs = [binaryPath].concat(rawArgs);
  }

  var env = Object.assign({}, process.env, {
    PATH: process.env.PATH + ':' + join(TERMUX_PREFIX, 'bin'),
    TERM: process.env.TERM || 'xterm-256color',
  });

  if (isTermux && !env.CODEBUFF_rg_PATH) {
    var rgPath = join(TERMUX_PREFIX, 'bin', 'rg');
    if (existsSync(rgPath)) {
      env.CODEBUFF_rg_PATH = rgPath;
    }
  }

  var child2 = spawn(spawnCmd, spawnArgs, { stdio: 'inherit', env: env });
  child2.on('exit', function(code) { process.exit(code || 0); });
  child2.on('error', function(err) {
    console.error('\n ' + colors.red + '\u2718' + colors.reset + ' Error al iniciar Freebuff: ' + err.message);
    console.log('   ' + colors.dim + 'Binario: ' + binaryPath + colors.reset);
    console.log('   ' + colors.dim + 'Ejecuta: ' + colors.cyan + 'freebuff doctor --fix' + colors.reset + colors.dim + ' para diagnosticar' + colors.reset + '\n');
    process.exit(1);
  });
}

main().catch(function(err) {
  console.error('\n ' + colors.red + '\u2718' + colors.reset + ' Error fatal: ' + err.message);
  console.error('   ' + colors.dim + 'Ejecuta: freebuff doctor para diagn\u00f3stico' + colors.reset + '\n');
  process.exit(1);
});
