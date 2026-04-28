/**
 * Factory de pools de conexão SQL Server.
 * Elimina duplicação entre dbConfig e seniorDbConfig; cada um chama createDbModule com a chave de config.
 */
const configManager = require('./configManager');
const sql = require('mssql');

const defaultOptions = {
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
};

const defaultPoolOptions = {
  max: 10,
  min: 0,
  idleTimeoutMillis: 30000,
  acquireTimeoutMillis: 60000,
};

function createConnectionPool(configKey) {
  const config = configManager.getConfig();
  const db = config[configKey];
  if (!db) {
    throw new Error(`Config key not found: ${configKey}`);
  }
  const sqlConfig = {
    server: db.server,
    user: db.user,
    password: db.password,
    database: db.database,
    port: db.port,
    options: {
      trustServerCertificate: db.trustServerCertificate,
      ...defaultOptions,
    },
    pool: defaultPoolOptions,
  };
  const pool = new sql.ConnectionPool(sqlConfig);
  const poolConnect = pool.connect();
  return { pool, poolConnect };
}

/**
 * Cria o módulo de conexão (mesma interface de dbConfig/seniorDbConfig).
 * @param {string} configKey - 'database' ou 'seniorDatabase'
 */
function createDbModule(configKey) {
  let pool = null;
  let poolConnect = null;

  function init() {
    const result = createConnectionPool(configKey);
    pool = result.pool;
    poolConnect = result.poolConnect;
    return result;
  }

  const initial = init();

  return {
    get pool() {
      return pool || initial.pool;
    },
    get poolConnect() {
      return poolConnect || initial.poolConnect;
    },
    get sql() {
      return sql;
    },
    recreateConnection() {
      if (pool) {
        pool.close().catch(() => {});
      }
      const next = init();
      pool = next.pool;
      poolConnect = next.poolConnect;
    },
  };
}

module.exports = { createDbModule };
