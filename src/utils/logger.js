const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');
const { toZonedTime } = require('date-fns-tz');

const logDir = path.join(process.cwd(), 'logs');
const timeZone = 'America/Sao_Paulo';

// Níveis: debug < info < warn < error
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = () => {
  const env = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LEVELS[env] !== undefined ? LEVELS[env] : LEVELS.info;
};

const ensureLogDirectory = () => {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
};

const getLogFileName = () => {
  const now = new Date();
  const brazilTime = toZonedTime(now, timeZone);
  const today = format(brazilTime, 'yyyy-MM-dd');
  return path.join(logDir, `senior-sync-${today}.log`);
};

const formatMessage = (level, message, error = null, context = null) => {
  const now = new Date();
  const brazilTime = toZonedTime(now, timeZone);
  const timestamp = format(brazilTime, 'yyyy-MM-dd HH:mm:ss.SSS');
  let logMessage = `[${timestamp} BRT] [${level}]`;
  if (context && Object.keys(context).length > 0) {
    logMessage += ` [${JSON.stringify(context)}]`;
  }
  logMessage += ` ${message}`;
  if (error) {
    logMessage += `\nError: ${error.message || error}`;
    if (error.stack) {
      logMessage += `\nStack: ${error.stack}`;
    }
  }
  return logMessage + '\n';
};

const shouldLog = (level) => LEVELS[level] >= currentLevel();

const log = (level, message, error = null, context = null) => {
  if (!shouldLog(level)) return;
  const logMessage = formatMessage(level, message, error, context);
  const logFile = getLogFileName();
  console.log(logMessage.trim());
  try {
    fs.appendFileSync(logFile, logMessage);
  } catch (err) {
    console.error('Erro ao escrever no arquivo de log:', err);
  }
};

const createLogger = (context = null) => ({
  debug: (message) => log('debug', message, null, context),
  info: (message) => log('info', message, null, context),
  warn: (message, error = null) => log('warn', message, error, context),
  error: (message, error = null) => log('error', message, error, context),
  log: (level, message, error = null) => log(level, message, error, context),
  child: (metadata) => createLogger({ ...context, ...metadata })
});

ensureLogDirectory();

const logger = createLogger();

module.exports = logger;
