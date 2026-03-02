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
 * @param {string} eventData.AD_ATTRIBUTE_VALUE - Valor do atributo a ser atualizado
 * @param {string} eventData.CREATED_BY - Quem criou o evento
 * @returns {Promise<number>} - ID do evento criado
 */
async function createEvent(eventData) {
  try {
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

    const employeeId = eventData.SENIOR_EMPLOYEE_ID || eventData.SENIOR_MATRICULA || null;
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
          SENIOR_EMPLOYEE_ID: eventData.SENIOR_EMPLOYEE_ID || eventData.SENIOR_MATRICULA || null,
          SENIOR_EMPLOYEE_NAME: eventData.SENIOR_EMPLOYEE_NAME || eventData.SENIOR_NOME_FUNCIONARIO || null,
          USERNAME: null, // Será resolvido pelo imediato-ad-sync
          AD_ATTRIBUTE_VALUE: eventData.AD_ATTRIBUTE_VALUE || null,
          CREATED_BY: eventData.CREATED_BY || 'senior-event-sync',
          AD_ORIGINAL_DATA: eventData.AD_ORIGINAL_DATA || null
        }),
      { maxRetries: 3, delayMs: 1000 }
    );

    const employeeIdLog = eventData.SENIOR_EMPLOYEE_ID || eventData.SENIOR_MATRICULA || 'N/A';
    const employeeName = eventData.SENIOR_EMPLOYEE_NAME || eventData.SENIOR_NOME_FUNCIONARIO || 'N/A';
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

