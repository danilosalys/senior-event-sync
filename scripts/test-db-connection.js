const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const dbConfig = require('../src/config/dbConfig');
const seniorDbConfig = require('../src/config/seniorDbConfig');
const logger = require('../src/utils/logger');

async function testConnection(name, config) {
  const { pool, poolConnect, sql } = config;

  try {
    logger.info(`Testando conexão com o banco "${name}"...`);

    // Garante que o pool conecte
    await poolConnect;

    // Executa uma query simples para validar a conexão
    const request = new sql.Request(pool);
    await request.query('SELECT 1 AS test');

    logger.info(`Conexão com o banco "${name}" OK.`);
  } catch (error) {
    logger.error(`Falha ao conectar no banco "${name}"`, error);
  } finally {
    try {
      if (pool && typeof pool.close === 'function') {
        await pool.close();
      }
    } catch (e) {
      logger.warn(`Erro ao fechar conexão do banco "${name}"`, e);
    }
  }
}

(async () => {
  await testConnection('AD_Sync (DB_)', dbConfig);
  await testConnection('Sênior (SENIOR_DB_)', seniorDbConfig);

  logger.info('Teste de conexão finalizado.');
  process.exit(0);
})();

