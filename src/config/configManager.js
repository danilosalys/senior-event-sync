require('dotenv').config();
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const crypto = require('../utils/crypto');

// Configuração do ConfigManager
const configPath = path.join(process.cwd(), 'config', 'secure', 'service-config.json');
const defaultConfig = {
  database: {
    server: process.env.DB_SERVER || '',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || '',
    port: parseInt(process.env.DB_PORT, 10) || 1433,
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
  },
  seniorDatabase: {
    server: process.env.SENIOR_DB_SERVER || '',
    user: process.env.SENIOR_DB_USER || '',
    password: process.env.SENIOR_DB_PASSWORD || '',
    database: process.env.SENIOR_DB_DATABASE || '',
    port: parseInt(process.env.SENIOR_DB_PORT, 10) || 1433,
    trustServerCertificate: process.env.SENIOR_DB_TRUST_SERVER_CERTIFICATE === 'true'
  },
  service: {
    cronSeniorToAD: process.env.CRON_SENIOR_TO_AD || '*/5 * * * *',
    cronADToSenior: process.env.CRON_AD_TO_SENIOR || '*/2 * * * *',
    maxRetries: parseInt(process.env.MAX_RETRIES, 10) || 3,
    retryDelay: parseInt(process.env.RETRY_DELAY, 10) || 5000,
    maxEventsPerRun: parseInt(process.env.MAX_EVENTS_PER_RUN, 10) || 100
  },
  logs: {
    retention: '1 week',
    maxFileSize: '10MB',
    maxFiles: 30,
    cleanupInterval: '0 2 * * *'
  },
  api: {
    port: parseInt(process.env.API_PORT, 10) || 3001,
    enableApi: process.env.API_ENABLED === 'true' || true
  }
};

// Variável para armazenar configuração atual
let currentConfig = null;

// Carregar configuração do arquivo
const loadConfig = () => {
  try {
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      // Merge com configurações padrão
      const mergedConfig = mergeConfig(defaultConfig, config);
      // Descriptografar senhas para uso interno
      return crypto.decryptConfigPasswords(mergedConfig);
    }
  } catch (error) {
    logger.error('Erro ao carregar configuração:', error);
  }
  return defaultConfig;
};

// Salvar configuração no arquivo
const saveConfig = (newConfig) => {
  try {
    // Garantir que o diretório existe
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Validar configuração antes de salvar
    const validatedConfig = validateConfig(newConfig);
    if (!validatedConfig.valid) {
      throw new Error(`Configuração inválida: ${validatedConfig.errors.join(', ')}`);
    }

    // Criptografar senhas antes de salvar
    const configToSave = crypto.encryptConfigPasswords(newConfig);
    
    fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2));
    currentConfig = newConfig; // Manter versão descriptografada em memória
    logger.info('Configuração salva com sucesso');
    return { success: true };
  } catch (error) {
    logger.error('Erro ao salvar configuração:', error);
    return { success: false, error: error.message };
  }
};

// Validar configuração
const validateConfig = (config) => {
  const errors = [];

  // Validar banco de dados AD_Sync
  if (!config.database?.server) errors.push('Servidor do banco AD_Sync é obrigatório');
  if (!config.database?.user) errors.push('Usuário do banco AD_Sync é obrigatório');
  if (!config.database?.database) errors.push('Nome do banco AD_Sync é obrigatório');
  if (!config.database?.port || config.database.port < 1 || config.database.port > 65535) {
    errors.push('Porta do banco AD_Sync deve ser entre 1 e 65535');
  }

  // Validar banco de dados Sênior
  if (!config.seniorDatabase?.server) errors.push('Servidor do banco Sênior é obrigatório');
  if (!config.seniorDatabase?.user) errors.push('Usuário do banco Sênior é obrigatório');
  if (!config.seniorDatabase?.database) errors.push('Nome do banco Sênior é obrigatório');
  if (!config.seniorDatabase?.port || config.seniorDatabase.port < 1 || config.seniorDatabase.port > 65535) {
    errors.push('Porta do banco Sênior deve ser entre 1 e 65535');
  }

  // Validar intervalos do cron
  if (!config.service?.cronSeniorToAD) errors.push('Intervalo do cron Sênior → AD é obrigatório');
  if (!config.service?.cronADToSenior) errors.push('Intervalo do cron AD → Sênior é obrigatório');

  return {
    valid: errors.length === 0,
    errors
  };
};

// Fazer merge de configurações
const mergeConfig = (defaultConfig, userConfig) => {
  const merged = JSON.parse(JSON.stringify(defaultConfig));
  
  for (const key in userConfig) {
    if (userConfig[key] && typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key])) {
      merged[key] = { ...merged[key], ...userConfig[key] };
    } else {
      merged[key] = userConfig[key];
    }
  }
  
  return merged;
};

// Obter configuração atual (com senhas descriptografadas)
const getConfig = () => {
  if (!currentConfig) {
    currentConfig = loadConfig();
  }
  return currentConfig;
};

// Obter configuração segura (com senhas mascaradas para API)
const getSafeConfig = () => {
  const config = getConfig();
  const safeConfig = JSON.parse(JSON.stringify(config));
  
  if (safeConfig.database && safeConfig.database.password) {
    safeConfig.database.password = '***';
  }
  
  if (safeConfig.seniorDatabase && safeConfig.seniorDatabase.password) {
    safeConfig.seniorDatabase.password = '***';
  }
  
  return safeConfig;
};

// Recarregar configuração sem reiniciar o serviço
const reloadConfig = () => {
  currentConfig = loadConfig();
  logger.info('Configuração recarregada');
  return currentConfig;
};

// Inicializar configuração
currentConfig = loadConfig();

// Exportar funções
module.exports = {
  getConfig,
  getSafeConfig,
  saveConfig,
  reloadConfig,
  validateConfig
};

