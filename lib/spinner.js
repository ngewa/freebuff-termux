const FRAMES   = ['◴', '◷', '◶', '◵'];
const BAR_W    = 15;
const MAX_LEN  = 52;

const gs = require('gradient-string');

const colors = {
  cyan: '\x1b[36m', yellow: '\x1b[33m', green: '\x1b[32m',
  red: '\x1b[31m', magenta: '\x1b[35m', blue: '\x1b[34m',
  white: '\x1b[37m',
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
};

const GRADIENT_FRAMES = [
  gs.default(['#6366f1', '#8b5cf6', '#a855f7']),  // indigo → purple
  gs.default(['#06b6d4', '#0ea5e9', '#3b82f6']),  // cyan → blue
  gs.default(['#10b981', '#34d399', '#6ee7b7']),  // emerald
  gs.default(['#f59e0b', '#f97316', '#ef4444']),  // amber → red
];

function progressBar(pct) {
  const f = Math.floor(pct / 100 * BAR_W);
  return '\x1b[2m' + '█'.repeat(f) + '░'.repeat(BAR_W - f) + '\x1b[0m';
}

function spinIndeterminate(n, total, text) {
  const padded = text.padEnd(MAX_LEN);
  const barStates = ['\x1b[2m[━━━⬡━━━]\x1b[0m', '\x1b[2m[━━⬡━━━━]\x1b[0m', '\x1b[2m[━⬡━━━━━]\x1b[0m', '\x1b[2m[⬡━━━━━━]\x1b[0m'];
  let i = 0;
  const id = setInterval(() => {
    const grad = GRADIENT_FRAMES[Math.floor(i / 8) % GRADIENT_FRAMES.length];
    const coloredFrame = grad(FRAMES[i % 4]);
    process.stdout.write(`\r ${coloredFrame} [${n}/${total}] ${padded} ${barStates[i % 4]}`);
    i++;
  }, 120);
  return {
    succeed(msg) {
      clearInterval(id);
      const grad = gs.default(['#10b981', '#34d399']);
      process.stdout.write(`\r ${grad('✔')} [${n}/${total}] ${padded} ${progressBar(100)} 100%\n`);
      if (msg) process.stdout.write(` ${colors.dim}${msg}${colors.reset}\n`);
    },
    fail(msg) {
      clearInterval(id);
      const grad = gs.default(['#ef4444', '#f97316']);
      process.stdout.write(`\r ${grad('✘')} [${n}/${total}] ${padded} ERROR\n`);
      if (msg) process.stdout.write(` ${colors.dim}${msg}${colors.reset}\n`);
    }
  };
}

module.exports = { colors, progressBar, spinIndeterminate };
