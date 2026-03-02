const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Carrega todas as queries SQL da pasta queries/
 * Cada arquivo deve exportar um objeto com:
 * - EVENT_TYPE_CODE: código do tipo de evento
 * - DESCRIPTION: descrição da query
 * - SQL: string SQL a ser executada
 * - ENABLED: boolean indicando se a query está habilitada
 */
function loadQueries() {
  const queriesDir = path.join(process.cwd(), 'src', 'queries');
  const queries = [];

  try {
    if (!fs.existsSync(queriesDir)) {
      logger.warn(`Diretório de queries não encontrado: ${queriesDir}`);
      return queries;
    }

    const files = fs.readdirSync(queriesDir);
    
    for (const file of files) {
      // Ignorar arquivos que não são .js
      if (!file.endsWith('.js')) {
        continue;
      }

      try {
        const queryPath = path.join(queriesDir, file);
        const queryConfig = require(queryPath);

        // Validar estrutura da query
        if (!queryConfig.EVENT_TYPE_CODE) {
          logger.warn(`Query ${file} não possui EVENT_TYPE_CODE. Ignorando...`);
          continue;
        }

        if (!queryConfig.SQL) {
          logger.warn(`Query ${file} não possui SQL. Ignorando...`);
          continue;
        }

        // Apenas adicionar se estiver habilitada
        if (queryConfig.ENABLED !== false) {
          queries.push({
            ...queryConfig,
            fileName: file
          });
          logger.info(`Query carregada: ${queryConfig.EVENT_TYPE_CODE} (${file})`);
        } else {
          logger.debug(`Query ${file} está desabilitada. Ignorando...`);
        }
      } catch (error) {
        logger.error(`Erro ao carregar query ${file}:`, error);
      }
    }

    logger.info(`Total de ${queries.length} queries carregadas`);
    return queries;
  } catch (error) {
    logger.error('Erro ao carregar queries:', error);
    return queries;
  }
}

module.exports = {
  loadQueries
};

