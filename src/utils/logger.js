const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

class Logger {
  constructor() {
    this.isProd = process.env.NODE_ENV === 'production';
  }

  _log(prefix, color, msg, ...args) {
    const timestamp = new Date().toISOString();
    console.log(`${colors.gray}[${timestamp}]${colors.reset} ${color}${prefix}${colors.reset} ${msg}`, ...args);
  }

  info(msg, ...args) { this._log('INFO', colors.cyan, msg, ...args); }
  warn(msg, ...args) { this._log('WARN', colors.yellow, msg, ...args); }
  error(msg, ...args) { this._log('❌ ERROR', colors.red, msg, ...args); }
  success(msg, ...args) { this._log('✅ SUCCESS', colors.green, msg, ...args); }
  
  debug(msg, ...args) {
    if (!this.isProd) {
      this._log('DEBUG', colors.gray, msg, ...args);
    }
  }

  cloud(msg) { this._log('⚡ CLOUD', colors.blue, msg); }
  local(msg) { this._log('💻 LOCAL', colors.magenta, msg); }
  scraper(msg) { this._log('🕷️ SCRAPER', colors.gray, msg); }
  failover(msg) { this._log('🛡️ FAILOVER', colors.yellow, msg); }
  sse(msg) { this._log('📡 SSE', colors.cyan, msg); }
  retry(msg) { this._log('🔄 RETRY', colors.yellow, msg); }
}

const logger = new Logger();
export default logger;
