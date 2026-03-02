const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');
const { toZonedTime } = require('date-fns-tz');

// Configuração do logger
const logDir = path.join(process.cwd(), 'logs');
const timeZone = 'America/Sao_Paulo'; // Horário de Brasília

// Garantir que o diretório de logs existe
const ensureLogDirectory = () => {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
};

// Obter nome do arquivo de log baseado na data (horário de Brasília)
const getLogFileName = () => {
  const now = new Date();
  const brazilTime = toZonedTime(now, timeZone);
  const today = format(brazilTime, 'yyyy-MM-dd');
  return path.join(logDir, `senior-sync-${today}.log`);
};

// Formatar mensagem de log com horário de Brasília
const formatMessage = (level, message, error = null) => {
  const now = new Date();
  const brazilTime = toZonedTime(now, timeZone);
  const timestamp = format(brazilTime, 'yyyy-MM-dd HH:mm:ss.SSS');
  let logMessage = `[${timestamp} BRT] [${level}] ${message}`;
  
  if (error) {
    logMessage += `\nError: ${error.message || error}`;
    if (error.stack) {
      logMessage += `\nStack: ${error.stack}`;
    }
  }
  
  return logMessage + '\n';
};

// Função principal de log
const log = (level, message, error = null) => {
  const logMessage = formatMessage(level, message, error);
  const logFile = getLogFileName();
  
  // Log no console também
  console.log(logMessage.trim());
  
  // Log no arquivo
  try {
    fs.appendFileSync(logFile, logMessage);
  } catch (err) {
    console.error('Erro ao escrever no arquivo de log:', err);
  }
};

// Funções específicas de log
const info = (message) => log('INFO', message);
const warn = (message, error = null) => log('WARN', message, error);
const error = (message, error = null) => log('ERROR', message, error);
const debug = (message) => log('DEBUG', message);

// Inicializar diretório de logs
ensureLogDirectory();

// Exportar funções
module.exports = {
  info,
  warn,
  error,
  debug,
  log
};

