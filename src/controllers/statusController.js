const configManager = require('../config/configManager');
const dbConfig = require('../config/dbConfig');
const seniorDbConfig = require('../config/seniorDbConfig');
const logger = require('../utils/logger').child({ module: 'status' });

/** Testa conectividade com um pool (SELECT 1). */
async function pingPool(pool, sql) {
  try {
    const request = new sql.Request(pool);
    await request.query('SELECT 1');
    return true;
  } catch (err) {
    return false;
  }
}

async function getStatus(req, res) {
  try {
    const config = configManager.getSafeConfig();
    const pool = dbConfig.pool;
    const seniorPool = seniorDbConfig.pool;

    const dbStatus = (await pingPool(pool, dbConfig.sql)) ? 'connected' : 'disconnected';
    const seniorDbStatus = (await pingPool(seniorPool, seniorDbConfig.sql)) ? 'connected' : 'disconnected';

    if (dbStatus !== 'connected') {
      logger.warn('Conexão AD_Sync indisponível ao obter status');
    }
    if (seniorDbStatus !== 'connected') {
      logger.warn('Conexão Sênior indisponível ao obter status');
    }

    const useEventTypesFromDb = config.service?.useEventTypesFromDatabase !== false;
    const configPayload = {
      cronSeniorToAD: config.service.cronSeniorToAD,
      cronADToSenior: config.service.cronADToSenior,
      apiEnabled: config.api.enableApi,
      apiPort: config.api.port,
      useEventTypesFromDatabase: useEventTypesFromDb,
      enabledEventTypes: config.service.enabledEventTypes || []
    };

    // Se usar banco, incluir tipos ativos de AD_EVENT_TYPES (ImediatoADSync)
    if (useEventTypesFromDb && dbStatus === 'connected') {
      try {
        const eventTypeModel = require('../models/eventTypeModel');
        const activeTypes = await eventTypeModel.getActive();
        configPayload.activeEventTypesFromDb = (activeTypes || []).map(t => t.EVENT_TYPE_CODE).filter(Boolean);
      } catch (e) {
        configPayload.activeEventTypesFromDb = null;
        configPayload.activeEventTypesError = e.message;
      }
    }

    res.json({
      service: 'senior-event-sync',
      status: 'running',
      timestamp: new Date().toISOString(),
      connections: {
        adSync: dbStatus,
        senior: seniorDbStatus
      },
      config: configPayload
    });
  } catch (error) {
    logger.error('Erro ao obter status', error);
    res.status(500).json({
      service: 'senior-event-sync',
      status: 'error',
      error: error.message
    });
  }
}

/**
 * Health check real: verifica conectividade com ambos os bancos.
 * Retorna 200 se ambos ok, 503 se algum indisponível (útil para load balancer/Kubernetes).
 */
async function getHealth(req, res) {
  const pool = dbConfig.pool;
  const seniorPool = seniorDbConfig.pool;

  const adSyncOk = await pingPool(pool, dbConfig.sql);
  const seniorOk = await pingPool(seniorPool, seniorDbConfig.sql);

  const healthy = adSyncOk && seniorOk;
  const status = healthy ? 'healthy' : 'unhealthy';

  const body = {
    service: 'senior-event-sync',
    status,
    timestamp: new Date().toISOString(),
    connections: {
      adSync: adSyncOk ? 'connected' : 'disconnected',
      senior: seniorOk ? 'connected' : 'disconnected'
    }
  };

  if (healthy) {
    res.status(200).json(body);
  } else {
    res.status(503).json(body);
  }
}

module.exports = {
  getStatus,
  getHealth
};

