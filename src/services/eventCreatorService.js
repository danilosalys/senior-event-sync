const eventModel = require('../models/eventModel');
const eventTypeModel = require('../models/eventTypeModel');
const logger = require('../utils/logger');
const { withRetry } = require('../utils/retry');

/**
 * Cria um evento em AD_EVENTS
 * @param {Object} eventData - Dados do evento
 * @param {string} eventData.EVENT_TYPE_CODE - Código do tipo de evento
 * @param {string} eventData.USERNAME - Nome de usuário (sAMAccountName)
 * @param {string} eventData.SENIOR_EMPLOYEE_ID - Employee ID (matrícula) no Sênior
 * @param {string} eventData.SENIOR_EMPLOYEE_NAME - Nome completo do funcionário no Sênior
 * @param {string} eventData.SENIOR_COST_CENTER_CODE - Código do centro de custo no Sênior
 * @param {string} eventData.SENIOR_COST_CENTER_DESCRIPTION - Descrição do centro de custo no Sênior
 * @param {string} eventData.AD_ATTRIBUTE_VALUE - Valor do atributo a ser atualizado
 * @param {string} eventData.CREATED_BY - Quem criou o evento
 * @returns {Promise<number>} - ID do evento criado
 */
async function createEvent(eventData) {
  try {
    const toNullableString = (value, maxLen = null) => {
      if (value === undefined || value === null) return null;
      // mssql/tedious valida VarChar como string; normalize números/BigInt
      let str = typeof value === 'string' ? value : String(value);
      str = str.trim();
      if (str.length === 0) return null;
      if (typeof maxLen === 'number' && maxLen > 0 && str.length > maxLen) {
        str = str.slice(0, maxLen);
      }
      return str;
    };

    // Validar dados obrigatórios
    if (!eventData.EVENT_TYPE_CODE) {
      throw new Error('EVENT_TYPE_CODE é obrigatório');
    }
    if (!eventData.SENIOR_EMPLOYEE_ID && !eventData.SENIOR_EMPLOYEE_NAME && !eventData.SENIOR_MATRICULA && !eventData.SENIOR_NOME_FUNCIONARIO) {
      throw new Error('SENIOR_EMPLOYEE_ID ou SENIOR_EMPLOYEE_NAME é obrigatório');
    }

    // Buscar EVENT_TYPE_ID pelo código
    const eventType = await eventTypeModel.getByCode(eventData.EVENT_TYPE_CODE);
    if (!eventType) {
      throw new Error(`Tipo de evento não encontrado: ${eventData.EVENT_TYPE_CODE}`);
    }

    const employeeId = toNullableString(eventData.SENIOR_EMPLOYEE_ID ?? eventData.SENIOR_MATRICULA, 50);
    // Evitar duplicidade: já existe evento pendente para este employee + tipo?
    if (employeeId) {
      const hasPending = await eventModel.hasPendingEventByEmployeeId(employeeId, eventData.EVENT_TYPE_CODE);
      if (hasPending) {
        logger.debug(`Evento duplicado ignorado: ${eventData.EVENT_TYPE_CODE} (Employee ID: ${employeeId})`);
        return null;
      }
    }

    // Criar evento SEM username (será resolvido pelo imediato-ad-sync), com retry para falhas transitórias
    const eventId = await withRetry(
      () =>
        eventModel.create({
          EVENT_TYPE_ID: eventType.ID,
          SENIOR_EMPLOYEE_ID: employeeId,
          SENIOR_EMPLOYEE_NAME: toNullableString(eventData.SENIOR_EMPLOYEE_NAME ?? eventData.SENIOR_NOME_FUNCIONARIO, 255),
          SENIOR_COST_CENTER_CODE: toNullableString(eventData.SENIOR_COST_CENTER_CODE, 50),
          SENIOR_COST_CENTER_DESCRIPTION: toNullableString(eventData.SENIOR_COST_CENTER_DESCRIPTION, 255),
          USERNAME: null, // Será resolvido pelo imediato-ad-sync
          AD_ATTRIBUTE_VALUE: toNullableString(eventData.AD_ATTRIBUTE_VALUE, 4000),
          CREATED_BY: eventData.CREATED_BY || 'senior-event-sync',
          AD_ORIGINAL_DATA: eventData.AD_ORIGINAL_DATA || null
        }),
      { maxRetries: 3, delayMs: 1000 }
    );

    const employeeIdLog = employeeId || 'N/A';
    const employeeName = toNullableString(eventData.SENIOR_EMPLOYEE_NAME ?? eventData.SENIOR_NOME_FUNCIONARIO, 255) || 'N/A';
    logger.info(`Evento criado: ID=${eventId}, TYPE=${eventData.EVENT_TYPE_CODE}, Employee ID=${employeeIdLog}, Nome=${employeeName}`);
    return eventId;
  } catch (error) {
    if (error.code === 'DUPLICATE_EVENT') {
      const employeeId = eventData.SENIOR_EMPLOYEE_ID || eventData.SENIOR_MATRICULA || 'N/A';
      logger.debug(`Evento duplicado ignorado: ${eventData.EVENT_TYPE_CODE} (Employee ID: ${employeeId})`);
      return null;
    }
    const employeeId = eventData.SENIOR_EMPLOYEE_ID || eventData.SENIOR_MATRICULA || 'N/A';
    logger.error(`Erro ao criar evento: ${eventData.EVENT_TYPE_CODE} (Employee ID: ${employeeId})`, error);
    throw error;
  }
}

module.exports = {
  createEvent
};

