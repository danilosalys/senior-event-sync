const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger').child({ module: 'queryLoader' });

/**
 * Carrega todas as queries SQL da pasta queries/
 * Cada arquivo deve exportar um objeto com:
 * - EVENT_TYPE_CODE: código do tipo de evento
 * - DESCRIPTION: descrição da query
 * - SQL: string SQL a ser executada
 * A ativação/desativação é feita pela tabela AD_EVENT_TYPES (STATUS='ACTIVE').
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

        queries.push({
          ...queryConfig,
          fileName: file
        });
        logger.info(`Query carregada: ${queryConfig.EVENT_TYPE_CODE} (${file})`);
      } catch (error) {
        logger.error(`Erro ao carregar query ${file}:`, error);
      }
    }

    // Filtrar por .env só quando NÃO estiver usando a tabela AD_EVENT_TYPES como fonte
    const configManager = require('../config/configManager');
    const useDb = configManager.getConfig().service?.useEventTypesFromDatabase !== false;
    if (!useDb) {
      const enabledList = configManager.getConfig().service?.enabledEventTypes || [];
      if (Array.isArray(enabledList) && enabledList.length > 0) {
        const allowed = new Set(enabledList.map(c => c.toUpperCase()));
        const filtered = queries.filter(q => allowed.has((q.EVENT_TYPE_CODE || '').toUpperCase()));
        logger.info(`Total de ${filtered.length} queries carregadas (filtro por ENABLED_EVENT_TYPES)`);
        return filtered;
      }
    }

    logger.info(`Total de ${queries.length} queries carregadas`);
    return queries;
  } catch (error) {
    logger.error('Erro ao carregar queries', error);
    return queries;
  }
}

/**
 * Valida se todos os EVENT_TYPE_CODE das queries carregadas existem em AD_EVENT_TYPES.
 * Deve ser chamado após as conexões estarem estabelecidas (ex.: no startup).
 * Apenas registra aviso para códigos não encontrados; não impede a execução.
 */
async function validateQueriesEventTypes() {
  const queries = loadQueries();
  if (queries.length === 0) return;

  const eventTypeModel = require('../models/eventTypeModel');
  for (const q of queries) {
    try {
      const et = await eventTypeModel.getByCode(q.EVENT_TYPE_CODE);
      if (!et) {
        logger.warn(
          `EVENT_TYPE_CODE "${q.EVENT_TYPE_CODE}" (arquivo ${q.fileName}) não encontrado em AD_EVENT_TYPES. ` +
          'Cadastre o tipo no banco ou a criação de eventos poderá falhar.'
        );
      }
    } catch (err) {
      logger.error(`Erro ao validar tipo ${q.EVENT_TYPE_CODE} (${q.fileName})`, err);
    }
  }
}

module.exports = {
  loadQueries,
  validateQueriesEventTypes
};

