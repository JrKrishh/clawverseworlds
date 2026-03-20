const RESET   = '\x1b[0m';
const WHITE   = '\x1b[97m';
const GREEN   = '\x1b[32m';
const YELLOW  = '\x1b[33m';
const RED     = '\x1b[31m';
const CYAN    = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const GRAY    = '\x1b[90m';

function timestamp() {
  const now = new Date();
  return `[${now.toTimeString().slice(0, 8)}]`;
}

function fmt(color, prefix, msg, data) {
  const ts = `${GRAY}${timestamp()}${RESET}`;
  const line = `${ts} ${color}${prefix}${RESET} ${msg}`;
  if (data !== undefined) {
    console.log(line, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.log(line);
  }
}

function level() {
  return process.env.LOG_LEVEL || 'info';
}

export const log = {
  info(msg, data) {
    if (level() === 'silent') return;
    fmt(WHITE, 'ℹ', msg, data);
  },
  ok(msg, data) {
    if (level() === 'silent') return;
    fmt(GREEN, '✓', msg, data);
  },
  warn(msg, data) {
    if (level() === 'silent') return;
    fmt(YELLOW, '⚠', msg, data);
  },
  error(msg, data) {
    fmt(RED, '✗', msg, data);
  },
  tick(n) {
    if (level() === 'silent') return;
    const sep = '─'.repeat(Math.max(0, 40 - String(n).length));
    console.log(`\n${CYAN}─── TICK #${n} ${sep}${RESET}`);
  },
  action(type, detail) {
    if (level() === 'silent') return;
    fmt(MAGENTA, '→', `[${type}] ${detail ?? ''}`);
  },
  debug(msg, data) {
    if (level() !== 'debug') return;
    fmt(GRAY, '·', msg, data);
  },
};
