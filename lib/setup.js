const readline = require('readline');
const { colors } = require('./spinner');
const { getBinaryPath, checkBinary, downloadBinary, installMotor, installSkills, getCurrentVersion } = require('./download');
const { getPlatform, getArch, getRunner, isTermux, checkPkg, TERMUX_PREFIX } = require('./termux');
const { VERSION } = require('./version');

function question(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, answer => { rl.close(); resolve(answer); }));
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
      const version = getCurrentVersion() || VERSION;
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

async function interactiveSetup() {
  const binaryPath = getBinaryPath();
  const binCheck = checkBinary();
  const runner = getRunner();
  const needsBinary = !binCheck.ok;
  const needsRunner = isTermux && !runner;

  if (!needsBinary && !needsRunner) return true;

  console.log(`\n${colors.bold}${colors.yellow}╔══════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.yellow}║         CONFIGURACIÓN INCOMPLETA             ║${colors.reset}`);
  console.log(`${colors.bold}${colors.yellow}╚══════════════════════════════════════════════╝${colors.reset}\n`);
  console.log(`  Faltan componentes para ejecutar Freebuff.\n`);
  if (needsRunner) console.log(`  ${colors.yellow}•${colors.reset} Motor glibc (no instalado)`);
  if (needsBinary) console.log(`  ${colors.yellow}•${colors.reset} Binario Freebuff (no descargado)`);
  console.log(`\n  Ejecuta: ${colors.cyan}freebuff setup${colors.reset}`);
  console.log(`  Para una instalación completa.\n`);
  return false;
}

module.exports = { cmdSetup, interactiveSetup, printStatus };
