const { pool, sql } = require('../config/seniorDbConfig');
const logger = require('../utils/logger');

/**
 * Executa uma query SQL no banco de dados Sênior
 * @param {string} querySQL - Query SQL a ser executada
 * @returns {Promise<Array>} - Array de resultados
 */
async function executeQuery(querySQL) {
  try {
    const request = new sql.Request(pool);
    const result = await request.query(querySQL);
    
    logger.debug(`Query executada com sucesso. ${result.recordset.length} registros retornados.`);
    return result.recordset;
  } catch (error) {
    logger.error('Erro ao executar query no banco Sênior:', error);
    throw error;
  }
}

/**
 * Testa a conexão com o banco de dados Sênior
 * @returns {Promise<boolean>} - true se conectado, false caso contrário
 */
async function testConnection() {
  try {
    await pool.connect();
    logger.info('Conexão com banco de dados Sênior estabelecida com sucesso.');
    return true;
  } catch (error) {
    logger.error('Falha ao conectar com banco de dados Sênior:', error);
    return false;
  }
}

module.exports = {
  executeQuery,
  testConnection
};

