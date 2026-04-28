// Carregar .env primeiro (caminho explícito)
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const { validateEnv } = require('./config/envValidator');
try {
  validateEnv();
} catch (error) {
  console.error('Erro de configuração:', error.message);
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const dbConfig = require('./config/dbConfig');
const seniorDbConfig = require('./config/seniorDbConfig');
const configManager = require('./config/configManager');
const statusApi = require('./api/statusApi');
const seniorSyncController = require('./controllers/seniorSyncController');
const queryLoaderService = require('./services/queryLoaderService');
const cron = require('node-cron');
const logger = require('./utils/logger').child({ module: 'app' });

const app = express();

// CORS: origens via CORS_ORIGINS (separadas por vírgula) ou padrão localhost:3000
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];
app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// APIs REST
if (configManager.getConfig().api.enableApi) {
  app.use('/api', statusApi);
}

// Middleware de erro global (4 args) — deve vir após as rotas
app.use((err, req, res, next) => {
  logger.error('Erro não tratado na API', err);
  res.status(500).json({
    service: 'senior-event-sync',
    status: 'error',
    error: process.env.NODE_ENV === 'production' ? 'Erro interno' : err.message
  });
});

let isDatabaseConnected = false;
let isSeniorDatabaseConnected = false;
let cronJobSeniorToAD = null;
let cronJobADToSenior = null;

/** Valida configuração mínima dos bancos; encerra com mensagem clara se estiver vazia. */
function validateConfigOrExit() {
  const config = configManager.getConfig();
  const missing = [];
  if (!config.database?.server?.trim()) missing.push('DB_SERVER');
  if (!config.database?.user?.trim()) missing.push('DB_USER');
  if (!config.database?.database?.trim()) missing.push('DB_DATABASE');
  if (!config.seniorDatabase?.server?.trim()) missing.push('SENIOR_DB_SERVER');
  if (!config.seniorDatabase?.user?.trim()) missing.push('SENIOR_DB_USER');
  if (!config.seniorDatabase?.database?.trim()) missing.push('SENIOR_DB_DATABASE');
  if (missing.length > 0) {
    logger.error(
      'Configuração de banco incompleta. Defina no .env ou em config/secure/service-config.json: ' +
      missing.join(', ') +
      '. Ex.: DB_SERVER=localhost, DB_USER=sa, DB_DATABASE=AD_Sync (e SENIOR_DB_* para o Sênior).'
    );
    process.exit(1);
  }
}

/** Verifica conectividade com um pool (SELECT 1). */
async function pingPool(pool, sql) {
  try {
    const req = new sql.Request(pool);
    await req.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/** Verifica e reconecta pools se a conexão tiver caído (rede, timeout, SQL reiniciado). */
async function checkAndReconnectPools() {
  const adSyncOk = await pingPool(dbConfig.pool, dbConfig.sql);
  if (adSyncOk) {
    isDatabaseConnected = true;
  } else {
    logger.warn('Pool AD_Sync indisponível, tentando reconectar...');
    try {
      dbConfig.recreateConnection();
      await dbConfig.poolConnect;
      isDatabaseConnected = true;
      logger.info('Reconexão AD_Sync estabelecida.');
    } catch (err2) {
      isDatabaseConnected = false;
      logger.error('Falha na reconexão AD_Sync.', err2);
    }
  }

  const seniorOk = await pingPool(seniorDbConfig.pool, seniorDbConfig.sql);
  if (seniorOk) {
    isSeniorDatabaseConnected = true;
  } else {
    logger.warn('Pool Sênior indisponível, tentando reconectar...');
    try {
      seniorDbConfig.recreateConnection();
      await seniorDbConfig.poolConnect;
      isSeniorDatabaseConnected = true;
      logger.info('Reconexão Sênior estabelecida.');
    } catch (err2) {
      isSeniorDatabaseConnected = false;
      logger.error('Falha na reconexão Sênior.', err2);
    }
  }
}

// Inicializar conexões. Em falha, encerra o processo (evitar rodar sem banco).
async function initializeConnections() {
  try {
    logger.info('Tentando conectar com o banco de dados AD_Sync...');
    await dbConfig.poolConnect;
    isDatabaseConnected = true;
    logger.info('Conexão com SQL Server (AD_Sync) estabelecida com sucesso.');
  } catch (error) {
    isDatabaseConnected = false;
    logger.error('Falha ao conectar com o banco de dados AD_Sync. Encerrando serviço.', error);
    process.exit(1);
  }

  try {
    logger.info('Tentando conectar com o banco de dados Sênior...');
    await seniorDbConfig.poolConnect;
    isSeniorDatabaseConnected = true;
    logger.info('Conexão com SQL Server (Sênior) estabelecida com sucesso.');
  } catch (error) {
    isSeniorDatabaseConnected = false;
    logger.error('Falha ao conectar com o banco de dados Sênior. Encerrando serviço.', error);
    process.exit(1);
  }
}

// Shutdown graceful: para crons, aguarda sync em andamento, depois fecha pools.
async function gracefulShutdown() {
  logger.info('Recebido sinal de encerramento. Fechando conexões...');
  try {
    if (cronJobSeniorToAD) cronJobSeniorToAD.destroy();
    if (cronJobADToSenior) cronJobADToSenior.destroy();

    const shutdownTimeoutMs = 30000;
    const pollIntervalMs = 500;
    const deadline = Date.now() + shutdownTimeoutMs;
    while (seniorSyncController.isSyncRunning() && Date.now() < deadline) {
      logger.info('Aguardando conclusão da sincronização em andamento...');
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    if (seniorSyncController.isSyncRunning()) {
      logger.warn('Timeout aguardando sync. Encerrando mesmo assim.');
    }

    if (isDatabaseConnected) {
      await dbConfig.pool.close();
      logger.info('Conexão com o banco de dados AD_Sync fechada.');
    }
    if (isSeniorDatabaseConnected) {
      await seniorDbConfig.pool.close();
      logger.info('Conexão com o banco de dados Sênior fechada.');
    }
    process.exit(0);
  } catch (error) {
    logger.error('Erro ao fechar conexões:', error);
    process.exit(1);
  }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Inicializar aplicação
async function startService() {
  logger.info('=== INICIANDO SERVIÇO SENIOR EVENT SYNC ===');

  const config = configManager.getConfig();
  validateConfigOrExit();

  // Inicializar conexões
  await initializeConnections();

  // Validar que EVENT_TYPE_CODE das queries existem em AD_EVENT_TYPES (apenas avisos)
  queryLoaderService.validateQueriesEventTypes().catch((err) => {
    logger.error('Validação de tipos de evento das queries', err);
  });

  // Iniciar servidor da API (se habilitado)
  if (config.api.enableApi) {
    const PORT = config.api.port || 3001;
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`API rodando na porta ${PORT} e acessível em toda a rede`);
    });
  }
  
  // Iniciar cron job Sênior → AD
  const cronSeniorToAD = config.service.cronSeniorToAD || '*/5 * * * *';
  logger.info(`Cron job Sênior → AD configurado para executar: ${cronSeniorToAD}`);
  cronJobSeniorToAD = cron.schedule(cronSeniorToAD, async () => {
    await checkAndReconnectPools();
    if (isDatabaseConnected && isSeniorDatabaseConnected) {
      await seniorSyncController.syncSeniorToAD();
    } else {
      logger.warn('[Senior→AD] Conexões não disponíveis. Pulando sincronização.');
    }
  });

  // Iniciar cron job AD → Sênior (email)
  const cronADToSenior = config.service.cronADToSenior || '*/2 * * * *';
  logger.info(`Cron job AD → Sênior (email) configurado para executar: ${cronADToSenior}`);
  cronJobADToSenior = cron.schedule(cronADToSenior, async () => {
    await checkAndReconnectPools();
    if (isDatabaseConnected) {
      await seniorSyncController.syncEmailADToSenior();
    } else {
      logger.warn('[AD→Senior] Conexão AD_Sync não disponível. Pulando sincronização.');
    }
  });
  
  // Executar uma vez imediatamente (após 5 segundos), com verificação de conexão
  setTimeout(async () => {
    await checkAndReconnectPools();
    if (isDatabaseConnected && isSeniorDatabaseConnected) {
      await seniorSyncController.syncSeniorToAD();
    }
    if (isDatabaseConnected) {
      await seniorSyncController.syncEmailADToSenior();
    }
  }, 5000);
  
  logger.info('Serviço iniciado com sucesso!');
}

startService().catch((error) => {
  logger.error('Falha crítica ao inicializar serviço:', error);
  process.exit(1);
});

