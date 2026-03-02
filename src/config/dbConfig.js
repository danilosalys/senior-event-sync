// src/config/dbConfig.js
require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env') });
const configManager = require('./configManager');
const sql = require('mssql');
const logger = require('../utils/logger');

let pool = null;
let poolConnect = null;

function createConnectionPool() {
  const config = configManager.getConfig();
  
  const sqlConfig = {
    server: config.database.server,
    user: config.database.user,
    password: config.database.password,
    database: config.database.database,
    port: config.database.port,
    options: {
      trustServerCertificate: config.database.trustServerCertificate,
      enableArithAbort: true,
      encrypt: false,
      instanceName: '',
      useUTC: false,
      connectionTimeout: 30000,
      requestTimeout: 30000,
      validateBulkLoadParameters: false,
      abortTransactionOnError: false,
      enableAnsiNullDefault: true,
      enableAnsiNull: true,
      enableAnsiWarnings: true,
      enableConcatNullYieldsNull: true,
      enableCursorCloseOnCommit: false,
      enableImplicitTransactions: false,
      enableNumericRoundabort: false,
      enableQuotedIdentifier: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 60000,
    }
  };

  pool = new sql.ConnectionPool(sqlConfig);
  poolConnect = pool.connect();
  
  return { pool, poolConnect };
}

// Inicializar pool
const { pool: initialPool, poolConnect: initialPoolConnect } = createConnectionPool();

module.exports = {
  get pool() {
    return pool || initialPool;
  },
  get poolConnect() {
    return poolConnect || initialPoolConnect;
  },
  get sql() {
    return sql;
  },
  // Método para recriar conexão quando configuração mudar
  recreateConnection() {
    if (pool) {
      pool.close();
    }
    const { pool: newPool, poolConnect: newPoolConnect } = createConnectionPool();
    pool = newPool;
    poolConnect = newPoolConnect;
  }
};

