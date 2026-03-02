/**
 * Utilitário de retry com backoff para falhas transitórias (rede, timeout, deadlock).
 * Não aplica retry em erros de validação ou negócio.
 */

const logger = require('./logger');

/** Códigos/condições consideradas retentáveis (SQL Server, rede). */
function isRetriableError(error) {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const code = error.code || error.number;
  // SQL Server: timeout, connection, deadlock, connection reset
  if (code === 121 || code === 122 || code === 1205) return true; // timeout, deadlock
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ECONNREFUSED') return true;
  if (msg.includes('timeout') || msg.includes('connection') || msg.includes('deadlock')) return true;
  if (msg.includes('connection closed') || msg.includes('socket hang up')) return true;
  return false;
}

/**
 * Executa fn() com retry e backoff exponencial.
 * @param {Function} fn - Função async () => result
 * @param {Object} [options]
 * @param {number} [options.maxRetries=3]
 * @param {number} [options.delayMs=1000]
 * @param {boolean} [options.exponentialBackoff=true]
 * @returns {Promise<any>} - Resultado de fn()
 */
async function withRetry(fn, options = {}) {
  const maxRetries = options.maxRetries ?? 3;
  const delayMs = options.delayMs ?? 1000;
  const exponentialBackoff = options.exponentialBackoff !== false;
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries || !isRetriableError(error)) {
        throw error;
      }
      const wait = exponentialBackoff ? delayMs * Math.pow(2, attempt) : delayMs;
      logger.warn(`Retry ${attempt + 1}/${maxRetries} após erro transitório (aguardando ${wait}ms):`, error.message);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError;
}

module.exports = {
  withRetry,
  isRetriableError
};
