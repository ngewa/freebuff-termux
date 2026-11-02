const readline = require('readline');
const { colors } = require('./spinner');
const {
  getBinaryPath,
  checkBinary,
  downloadBinary,
  installMotor,
  installSkills,
  getCurrentVersion,
  getLatestVersion,
  getAvailableVersions,
} = require('./download');
const { getPlatform, getArch, getRunner, isTermux, checkPkg, TERMUX_PREFIX } = require('./termux');
const { VERSION } = require('./version');

function question(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, answer => { rl.close(); resolve(answer); }));
}

function printBox(title) {
  const line = '═'.repeat(46);
  console.log(`\n${colors.bold}${colors.cyan}╔${line}╗${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}║${title.padEnd(46)}║${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}╚${line}╝${colors.reset}\n`);
}

function isValidVersion(v) {
  return /^v?\d+\.\d+\.\d+$/.test(String(v || '').trim());
}

function normalizeVersion(v) {
  return String(v || '').trim().replace(/^v/i, '');
}

function versionBadges(version, index, current) {
  const badges = [];
  if (index === 0) badges.push(`${colors.green}${colors.bold}[última ⭐]${colors.reset}`);
  if (current && version === current) badges.push(`${colors.cyan}[activa ✔]${colors.reset}`);
  return badges.length ? '  ' + badges.join(' ') : '';
}

function printVersionList(versions, current) {
  versions.forEach((v, i) => {
    console.log(`   ${colors.cyan}•${colors.reset} ${colors.bold}v${v}${colors.reset}${versionBadges(v, i, current)}`);
  });
  console.log('');
}

async function chooseVersion(current, versions) {
  console.log(`${colors.bold}${colors.cyan}▸ Elige una versión${colors.reset}`);
  if (current) console.log(`  ${colors.dim}Instalada:${colors.reset} v${current}`);
  console.log('');
  versions.forEach((v, i) => {
    console.log(`   ${colors.bold}${String(i + 1).padStart(2)})${colors.reset} v${v.padEnd(10)}${versionBadges(v, i, current)}`);
  });
  console.log(`   ${colors.yellow} c)${colors.reset} Escribir una versión manual (subir o bajar de versión)`);
  console.log(`   ${colors.red} 0)${colors.reset} Cancelar\n`);

  const answer = (await question(`  ${colors.green}?${colors.reset} Opción [1-${versions.length}, c, 0] (def. 1): `)).trim();

  if (answer === '0' || /^(cancel|cancelar|q|salir)$/i.test(answer)) return null;
  if (/^c$/i.test(answer)) {
    const manual = (await question(`  ${colors.green}?${colors.reset} Versión exacta (ej. ${versions[0]}): `)).trim();
    if (!isValidVersion(manual)) {
      console.log(`  ${colors.red}✘${colors.reset} Versión inválida: "${manual}"\n`);
      return null;
    }
    return normalizeVersion(manual);
  }
  if (answer === '') return versions[0];
  const index = Number(answer);
  if (Number.isInteger(index) && index >= 1 && index <= versions.length) return versions[index - 1];
  if (isValidVersion(answer)) return normalizeVersion(answer);
  console.log(`  ${colors.red}✘${colors.reset} Opción inválida: "${answer}"\n`);
  return null;
}

async function printVersionStatus({ refresh = false } = {}) {
  printBox('        VERSIONES DE FREEBUFF');

  const current = getCurrentVersion();
  process.stdout.write(`  ${colors.cyan}◷${colors.reset} Consultando el registro npm...\n`);

  const versions = await getAvailableVersions({ refresh });
  if (versions.length === 0) {
    console.log(`  ${colors.red}✘${colors.reset} No se pudo consultar la lista de versiones.`);
    console.log(`  ${colors.dim}Revisa la conexión (o el proxy) y reintenta con --refresh${colors.reset}\n`);
    return { current, latest: null, upToDate: false, versions };
  }

  const latest = versions[0];
  console.log(`  ${colors.dim}Instalada:${colors.reset} ${current ? 'v' + current : colors.yellow + 'no instalada' + colors.reset}`);
  console.log(`  ${colors.dim}Upstream:${colors.reset} v${latest}\n`);

  console.log(`  ${colors.bold}Rilis recientes${colors.reset} ${colors.dim}(registry.npmjs.org/freebuff)${colors.reset}`);
  printVersionList(versions, current);

  const upToDate = current === latest;
  const status = !current
    ? `${colors.yellow}sin binario${colors.reset}`
    : upToDate ? `${colors.green}al día${colors.reset}` : `${colors.red}actualización disponible${colors.reset}`;

  console.log(`  ${colors.bold}Estado:${colors.reset} ${status}`);
  console.log(`  ${colors.dim}Instalar:${colors.reset} ${colors.cyan}freebuff update${colors.reset} ${colors.dim}·${colors.reset} ${colors.cyan}freebuff install${colors.reset}\n`);
  return { current, latest, upToDate, versions };
}

function printHeader() {
  console.log(`\n${colors.bold}${colors.cyan}╔══════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}║          INSTALACIÓN DE FREEBUFF             ║${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}╚══════════════════════════════════════════════╝${colors.reset}\n`);
  console.log(`  ${colors.dim}Plataforma:${colors.reset} ${getPlatform()}-${getArch()}`);
  console.log(`  ${colors.dim}Termux:${colors.reset} ${isTermux ? 'Sí' : 'No'}`);
  console.log(`  ${colors.dim}Versión:${colors.reset} ${getCurrentVersion() || 'No instalado'}\n`);
}

function printStatus() {
  const binaryPath = getBinaryPath();
  const binCheck = checkBinary();
  const runner = getRunner();

  console.log(`${colors.bold}${colors.cyan}╔══════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}║           ESTADO DEL SISTEMA                 ║${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}╚══════════════════════════════════════════════╝${colors.reset}\n`);

  const motorOk = isTermux ? !!runner : true;
  const engineOk = binCheck.ok;

  console.log(`  ${motorOk ? colors.green + '✔' : colors.red + '✘'}${colors.reset} Motor (glibc-runner)     ${motorOk ? colors.green + 'OK' : colors.red + 'FALTA'}${colors.reset}`);
  console.log(`  ${engineOk ? colors.green + '✔' : colors.red + '✘'}${colors.reset} Binario Freebuff        ${engineOk ? colors.green + 'OK' : colors.red + 'FALTA'}${colors.reset}`);

  if (engineOk) {
    console.log(`    ${colors.dim}${binaryPath} (${(binCheck.size / 1024 / 1024).toFixed(1)} MB)${colors.reset}`);
  }

  const rgOk = checkPkg('rg');
  console.log(`  ${rgOk ? colors.green + '✔' : colors.yellow + '⚠'}${colors.reset} Ripgrep (code_searcher) ${rgOk ? colors.green + 'OK' : colors.yellow + 'FALTA'}${colors.reset}`);
  console.log('');
}

async function cmdSetup() {
  printHeader();

  const binaryPath = getBinaryPath();
  const binCheck = checkBinary();
  const runner = getRunner();

  const needsMotor = isTermux && !runner;
  const needsBinary = !binCheck.ok;

  if (!needsMotor && !needsBinary) {
    console.log(`  ${colors.green}✔${colors.reset} Motor y binario ya instalados.\n`);
    printStatus();
    return true;
  }

  if (needsMotor) {
    console.log(`${colors.bold}${colors.yellow}▸ Motor (glibc-repo + glibc-runner)${colors.reset}`);
    console.log(`  ${colors.dim}Sin esto, el binario de Freebuff no puede ejecutarse en Termux.${colors.reset}\n`);
    const ans1 = await question(`  ${colors.green}?${colors.reset} ¿Instalar el motor? [Y/n] `);
    if (ans1.toLowerCase() !== 'n' && ans1.toLowerCase() !== 'no') {
      const ok = installMotor();
      if (!ok) {
        console.log(`\n  ${colors.red}✘ No se pudo instalar el motor.${colors.reset}`);
        console.log(`  ${colors.dim}Instala manualmente: pkg install glibc-repo glibc-runner -y${colors.reset}\n`);
      }
    } else {
      console.log(`\n  ${colors.yellow}⚠${colors.reset} Motor no instalado. Freebuff no podrá ejecutarse.\n`);
    }
    console.log('');
  }

  const rgOk = checkPkg('rg');
  if (!rgOk) {
    console.log(`${colors.bold}${colors.yellow}▸ Skills / Habilidades${colors.reset}`);
    console.log(`  ${colors.dim}Paquetes: ripgrep (necesario para code_searcher)${colors.reset}\n`);
    const ans2 = await question(`  ${colors.green}?${colors.reset} ¿Instalar las skills? [Y/n] `);
    if (ans2.toLowerCase() !== 'n' && ans2.toLowerCase() !== 'no') {
      const ok = installSkills();
      if (!ok) {
        console.log(`\n  ${colors.yellow}⚠${colors.reset} Algunas skills no se pudieron instalar.\n`);
      }
    } else {
      console.log(`\n  ${colors.yellow}⚠${colors.reset} Skills no instaladas. code_searcher no funcionará.\n`);
    }
    console.log('');
  }

  if (needsBinary) {
    console.log(`${colors.bold}${colors.yellow}▸ Binario Freebuff${colors.reset}`);
    console.log(`  ${colors.dim}Binario nativo descargado desde codebuff.com${colors.reset}\n`);
    const ans3 = await question(`  ${colors.green}?${colors.reset} ¿Descargar el binario? [Y/n] `);
    if (ans3.toLowerCase() !== 'n' && ans3.toLowerCase() !== 'no') {
      const latest = await getLatestVersion();
      const version = latest || getCurrentVersion() || VERSION;
      const ok = await downloadBinary(version);
      if (!ok) {
        console.log(`\n  ${colors.red}✘ No se pudo descargar el binario.${colors.reset}`);
        console.log(`  ${colors.dim}Descarga manual: https://codebuff.com${colors.reset}\n`);
      }
    } else {
      console.log(`\n  ${colors.red}✘ Sin binario, Freebuff no puede funcionar.${colors.reset}\n`);
    }
    console.log('');
  }

  printStatus();

  console.log(`${colors.green}${colors.bold}  ✔ Instalación completada${colors.reset}`);
  console.log(`  ${colors.dim}Ejecuta 'freebuff' para iniciar${colors.reset}\n`);
  return true;
}

async function cmdUpdate(opts = {}) {
  const { version, force = false, refresh = false } = opts;
  printBox('      ACTUALIZACIÓN DE FREEBUFF');

  const current = getCurrentVersion();
  console.log(`  ${colors.dim}Instalada:${colors.reset} ${current ? 'v' + current : colors.yellow + 'no instalada' + colors.reset}`);
  process.stdout.write(`  ${colors.cyan}◷${colors.reset} Consultando el registro npm...\n`);

  const versions = await getAvailableVersions({ refresh });
  if (versions.length === 0 && !version) {
    console.log(`  ${colors.red}✘${colors.reset} No se pudo consultar la lista de versiones.`);
    console.log(`  ${colors.dim}Revisa la conexión (o el proxy) y reintenta con --refresh${colors.reset}\n`);
    return false;
  }

  const latest = versions[0] || null;
  if (latest) console.log(`  ${colors.dim}Última disponible:${colors.reset} v${latest}\n`);

  let target = version ? normalizeVersion(version) : null;
  if (target && !isValidVersion(target)) {
    console.log(`  ${colors.red}✘${colors.reset} Versión inválida: "${version}". Usa el formato 0.2.34\n`);
    return false;
  }

  if (!target) {
    if (process.stdin.isTTY) {
      target = await chooseVersion(current, versions);
      if (!target) {
        console.log(`  ${colors.yellow}⚠${colors.reset} Actualización cancelada.\n`);
        return false;
      }
    } else {
      target = latest;
    }
  }

  if (!force && current === target) {
    console.log(`  ${colors.green}✔${colors.reset} Ya tienes instalada la versión v${target}.\n`);
    return true;
  }

  console.log(`  ${colors.yellow}${current ? `Cambiando de v${current} a v${target}` : `Instalando v${target}`}...${colors.reset}\n`);
  const ok = await downloadBinary(target);
  if (ok) {
    console.log(`\n${colors.green}${colors.bold}  ✔ Actualización completada: v${target}.${colors.reset}\n`);
  } else {
    console.log(`\n${colors.red}${colors.bold}  ✘ Error al instalar v${target}.${colors.reset}`);
    console.log(`  ${colors.dim}Consulta las versiones con: freebuff update --check --refresh${colors.reset}\n`);
  }
  return ok;
}

async function cmdInstall(opts = {}) {
  const { version, force = false } = opts;
  printBox('        INSTALACIÓN DE FREEBUFF');

  console.log(`  ${colors.dim}Plataforma:${colors.reset} ${getPlatform()}-${getArch()}`);
  console.log(`  ${colors.dim}Termux:${colors.reset} ${isTermux ? 'Sí' : 'No'}`);
  console.log(`  ${colors.dim}Versión:${colors.reset} ${getCurrentVersion() || 'no instalada'}\n`);

  const target = version ? normalizeVersion(version) : null;
  if (target && !isValidVersion(target)) {
    console.log(`  ${colors.red}✘${colors.reset} Versión inválida: "${version}". Usa el formato 0.2.34\n`);
    return false;
  }

  const { installed, failed } = await autoInstall({ version: target, force });

  if (installed.length === 0 && failed.length === 0) {
    console.log(`  ${colors.green}✔${colors.reset} Motor, skills y binario ya instalados.\n`);
  } else {
    for (const item of installed) console.log(`  ${colors.green}✔${colors.reset} ${item}`);
    for (const item of failed) console.log(`  ${colors.red}✘${colors.reset} ${item}`);
    console.log('');
  }

  printStatus();

  if (failed.length > 0) {
    console.log(`  ${colors.red}✘${colors.reset} Instalación incompleta.`);
    console.log(`  ${colors.dim}Revisa la conexión y reintenta: freebuff install --force${colors.reset}\n`);
    return false;
  }

  console.log(`  ${colors.green}${colors.bold}  ✔ Instalación completada${colors.reset}`);
  console.log(`  ${colors.dim}Ejecuta 'freebuff' para iniciar${colors.reset}\n`);
  return true;
}

async function autoInstall({ version = null, force = false } = {}) {
  const installed = [];
  const failed = [];

  if (isTermux && !getRunner()) {
    console.log(`  ${colors.cyan}◷${colors.reset} Instalando motor glibc (glibc-repo + glibc-runner)...`);
    if (installMotor()) installed.push('motor glibc');
    else failed.push('motor glibc');
  }

  if (['rg', 'git'].some(p => !checkPkg(p))) {
    console.log(`  ${colors.cyan}◷${colors.reset} Instalando skills (ripgrep, git)...`);
    if (installSkills()) installed.push('skills');
    else failed.push('skills');
  }

  if (!checkBinary().ok || force) {
    const target = version || (await getLatestVersion()) || getCurrentVersion() || VERSION;
    console.log(`  ${colors.cyan}◷${colors.reset} Descargando binario Freebuff v${target}...`);
    if (await downloadBinary(target)) installed.push(`binario v${target}`);
    else failed.push('binario');
  }

  return { installed, failed };
}

async function autoUpdate() {
  const latest = await getLatestVersion(5000);
  if (!latest) return { status: 'unreachable' };

  const current = getCurrentVersion();
  if (current === latest) return { status: 'current', version: current };

  console.log(`  ${colors.cyan}◷${colors.reset} Actualizando${current ? ' de v' + current + ' a' : ' a'} v${latest}...`);
  const ok = await downloadBinary(latest);
  return ok
    ? { status: 'updated', version: latest, from: current }
    : { status: 'failed', version: latest, from: current };
}

async function interactiveSetup({ autoUpdate: shouldAutoUpdate = true } = {}) {
  const needsBinary = !checkBinary().ok;
  const needsRunner = isTermux && !getRunner();

  if (needsRunner || needsBinary) {
    console.log(`\n${colors.bold}${colors.yellow}╔══════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bold}${colors.yellow}║         INSTALACIÓN AUTOMÁTICA               ║${colors.reset}`);
    console.log(`${colors.bold}${colors.yellow}╚══════════════════════════════════════════════╝${colors.reset}\n`);

    const { installed, failed } = await autoInstall();
    for (const item of installed) console.log(`  ${colors.green}✔${colors.reset} ${item}`);
    for (const item of failed) console.log(`  ${colors.red}✘${colors.reset} ${item}`);
    console.log('');

    if (!checkBinary().ok) {
      console.log(`  ${colors.red}✘ No se pudo instalar el binario de Freebuff.${colors.reset}`);
      console.log(`  ${colors.dim}Prueba: freebuff setup   ·   freebuff doctor --fix${colors.reset}\n`);
      return false;
    }
  }

  if (shouldAutoUpdate) {
    const result = await autoUpdate();
    if (result.status === 'updated') {
      console.log(`  ${colors.green}✔${colors.reset} Actualizado a v${result.version}${result.from ? `${colors.dim} (antes v${result.from})` : ''}${colors.reset}\n`);
    } else if (result.status === 'failed') {
      console.log(`  ${colors.yellow}⚠${colors.reset} No se pudo actualizar a v${result.version}${colors.dim} — se usa la versión instalada${colors.reset}\n`);
    }
  }

  return true;
}

module.exports = { cmdSetup, cmdUpdate, cmdInstall, interactiveSetup, autoInstall, autoUpdate, printStatus, printVersionStatus };
