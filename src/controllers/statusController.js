const configManager = require('../config/configManager');
const { pool } = require('../config/dbConfig');
const { pool: seniorPool } = require('../config/seniorDbConfig');
const logger = require('../utils/logger');

async function getStatus(req, res) {
  try {
    const config = configManager.getSafeConfig();
    
    // Testar conexões
    let dbStatus = 'disconnected';
    let seniorDbStatus = 'disconnected';

    try {
      await pool.connect();
      dbStatus = 'connected';
    } catch (error) {
      logger.error('Erro ao testar conexão AD_Sync:', error);
    }

    try {
      await seniorPool.connect();
      seniorDbStatus = 'connected';
    } catch (error) {
      logger.error('Erro ao testar conexão Sênior:', error);
    }

    res.json({
      service: 'senior-event-sync',
      status: 'running',
      timestamp: new Date().toISOString(),
      connections: {
        adSync: dbStatus,
        senior: seniorDbStatus
      },
      config: {
        cronSeniorToAD: config.service.cronSeniorToAD,
        cronADToSenior: config.service.cronADToSenior,
        apiEnabled: config.api.enableApi,
        apiPort: config.api.port
      }
    });
  } catch (error) {
    logger.error('Erro ao obter status:', error);
    res.status(500).json({
      service: 'senior-event-sync',
      status: 'error',
      error: error.message
    });
  }
}

async function getHealth(req, res) {
  res.json({
    service: 'senior-event-sync',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  getStatus,
  getHealth
};

