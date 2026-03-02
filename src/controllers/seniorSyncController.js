const queryLoaderService = require('../services/queryLoaderService');
const seniorQueryService = require('../services/seniorQueryService');
const eventCreatorService = require('../services/eventCreatorService');
const seniorUpdateService = require('../services/seniorUpdateService');
const eventModel = require('../models/eventModel');
const configManager = require('../config/configManager');
const logger = require('../utils/logger');
const { withRetry } = require('../utils/retry');

let isRunning = false;
/** Guard: evita execução simultânea de syncEmailADToSenior (race condition). */
let isRunningEmailSync = false;

/**
 * Sincronização Sênior → AD
 * Executa queries SQL no banco Sênior e cria eventos em AD_EVENTS
 */
async function syncSeniorToAD() {
  if (isRunning) {
    logger.warn('[Senior→AD] Sincronização já em execução. Pulando...');
    return;
  }

  try {
    isRunning = true;
    logger.info('[Senior→AD] Iniciando sincronização Sênior → AD...');

    // Carregar queries configuradas
    const queries = queryLoaderService.loadQueries();
    
    if (queries.length === 0) {
      logger.warn('[Senior→AD] Nenhuma query configurada. Pulando sincronização.');
      return;
    }

    let totalEventsCreated = 0;

    // Para cada query configurada
    for (const queryConfig of queries) {
      try {
        logger.info(`[Senior→AD] Executando query: ${queryConfig.EVENT_TYPE_CODE}`);

        // Executar query no banco Sênior (com retry para falhas transitórias)
        const results = await withRetry(
          () => seniorQueryService.executeQuery(queryConfig.SQL),
          { maxRetries: 3, delayMs: 1000 }
        );

        if (!results || results.length === 0) {
          logger.debug(`[Senior→AD] Nenhum resultado encontrado para ${queryConfig.EVENT_TYPE_CODE}`);
          continue;
        }

        logger.info(`[Senior→AD] ${results.length} registros encontrados para ${queryConfig.EVENT_TYPE_CODE}`);

        // Para cada resultado, criar evento
        for (const row of results) {
          try {
            // Validar campos obrigatórios (employee ID ou nome)
            const employeeId = row.SENIOR_EMPLOYEE_ID || row.SENIOR_MATRICULA;
            const employeeName = row.SENIOR_EMPLOYEE_NAME || row.SENIOR_NOME_FUNCIONARIO;
            
            if (!employeeId && !employeeName) {
              logger.warn(`[Senior→AD] Registro sem SENIOR_EMPLOYEE_ID ou SENIOR_EMPLOYEE_NAME ignorado:`, row);
              continue;
            }

            // Criar evento (sem username - será resolvido pelo imediato-ad-sync)
            const eventId = await eventCreatorService.createEvent({
              EVENT_TYPE_CODE: queryConfig.EVENT_TYPE_CODE,
              SENIOR_EMPLOYEE_ID: employeeId || null,
              SENIOR_EMPLOYEE_NAME: employeeName || null,
              AD_ATTRIBUTE_VALUE: row.NEW_VALUE || row.AD_ATTRIBUTE_VALUE || null,
              CREATED_BY: 'senior-event-sync'
            });

            if (eventId) {
              totalEventsCreated++;
            }
          } catch (error) {
            const employeeId = row.SENIOR_EMPLOYEE_ID || row.SENIOR_MATRICULA || 'N/A';
            logger.error(`[Senior→AD] Erro ao criar evento (Employee ID: ${employeeId}):`, error);
            // Continuar processando outros registros
          }
        }
      } catch (error) {
        logger.error(`[Senior→AD] Erro ao processar query ${queryConfig.EVENT_TYPE_CODE}:`, error);
        // Continuar com próxima query
      }
    }

    logger.info(`[Senior→AD] Sincronização concluída. ${totalEventsCreated} eventos criados.`);
  } catch (error) {
    logger.error('[Senior→AD] Erro crítico na sincronização:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * Sincronização AD → Sênior (apenas email)
 * Monitora eventos de email completados e atualiza no Sênior
 */
async function syncEmailADToSenior() {
  if (isRunningEmailSync) {
    logger.warn('[AD→Senior] Sincronização já em execução. Pulando...');
    return;
  }

  try {
    isRunningEmailSync = true;
    logger.info('[AD→Senior] Iniciando sincronização AD → Sênior (email)...');

    // Buscar eventos de email completados não sincronizados (limitado por maxEventsPerRun)
    const limit = configManager.getConfig().service?.maxEventsPerRun ?? 100;
    const events = await eventModel.getCompletedEmailEvents(limit);

    if (!events || events.length === 0) {
      logger.debug('[AD→Senior] Nenhum evento de email pendente de sincronização.');
      return;
    }

    logger.info(`[AD→Senior] ${events.length} eventos de email encontrados para sincronizar.`);

    let totalSynced = 0;
    let totalErrors = 0;

    // Para cada evento
    for (const event of events) {
      try {
        // Validar dados obrigatórios
        const employeeId = event.SENIOR_EMPLOYEE_ID || event.SENIOR_MATRICULA;
        if (!employeeId) {
          logger.warn(`[AD→Senior] Evento ${event.ID} sem SENIOR_EMPLOYEE_ID. Ignorando...`);
          continue;
        }

        if (!event.NEW_EMAIL) {
          logger.warn(`[AD→Senior] Evento ${event.ID} sem NEW_EMAIL. Ignorando...`);
          continue;
        }

        // Atualizar email no Sênior (com retry para falhas transitórias)
        const updated = await withRetry(
          () => seniorUpdateService.updateEmail(employeeId, event.NEW_EMAIL),
          { maxRetries: 3, delayMs: 1000 }
        );

        if (updated) {
          // Marcar como sincronizado (retry apenas na marcação; não reexecutar update no Sênior)
          try {
            await withRetry(
              () => eventModel.markAsSyncedToSenior(event.ID),
              { maxRetries: 3, delayMs: 1000 }
            );
            totalSynced++;
            logger.info(`[AD→Senior] Email sincronizado: ${event.USERNAME} (Employee ID: ${employeeId})`);
          } catch (markError) {
            totalErrors++;
            logger.error(`[AD→Senior] Erro crítico: email já atualizado no Sênior mas falha ao marcar SYNCED_TO_SENIOR (evento ID=${event.ID}). Corrija manualmente se necessário.`, markError);
          }
        } else {
          totalErrors++;
          logger.warn(`[AD→Senior] Falha ao atualizar email para ${event.USERNAME}`);
        }
      } catch (error) {
        totalErrors++;
        logger.error(`[AD→Senior] Erro ao sincronizar email para evento ${event.ID}:`, error);
        // Continuar com próximo evento
      }
    }

    logger.info(`[AD→Senior] Sincronização concluída. ${totalSynced} sincronizados, ${totalErrors} erros.`);
  } catch (error) {
    logger.error('[AD→Senior] Erro crítico na sincronização:', error);
  } finally {
    isRunningEmailSync = false;
  }
}

/** Retorna se alguma sincronização está em execução (para graceful shutdown). */
function isSyncRunning() {
  return isRunning || isRunningEmailSync;
}

module.exports = {
  syncSeniorToAD,
  syncEmailADToSenior,
  isSyncRunning
};

