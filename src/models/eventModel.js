const dbConfig = require('../config/dbConfig');

async function hasPendingEvent(username, eventTypeCode) {
  const request = new dbConfig.sql.Request(dbConfig.pool);
  const result = await request
    .input('USERNAME', dbConfig.sql.VarChar(255), username)
    .input('EVENT_TYPE_CODE', dbConfig.sql.VarChar(50), eventTypeCode)
    .query(`
      SELECT COUNT(*) as TOTAL
      FROM AD_EVENTS e
      INNER JOIN AD_EVENT_TYPES et ON e.EVENT_TYPE_ID = et.ID
      WHERE e.USERNAME = @USERNAME
        AND et.EVENT_TYPE_CODE = @EVENT_TYPE_CODE
        AND e.STATUS IN ('PENDING', 'PROCESSING')
    `);
  
  return result.recordset[0].TOTAL > 0;
}

/**
 * Verifica se já existe evento pendente para o mesmo SENIOR_EMPLOYEE_ID e tipo (evita duplicidade Sênior→AD).
 */
async function hasPendingEventByEmployeeId(seniorEmployeeId, eventTypeCode) {
  if (!seniorEmployeeId || !eventTypeCode) return false;
  const request = new dbConfig.sql.Request(dbConfig.pool);
  const result = await request
    .input('SENIOR_EMPLOYEE_ID', dbConfig.sql.VarChar(50), seniorEmployeeId)
    .input('EVENT_TYPE_CODE', dbConfig.sql.VarChar(50), eventTypeCode)
    .query(`
      SELECT COUNT(*) as TOTAL
      FROM AD_EVENTS e
      INNER JOIN AD_EVENT_TYPES et ON e.EVENT_TYPE_ID = et.ID
      WHERE e.SENIOR_EMPLOYEE_ID = @SENIOR_EMPLOYEE_ID
        AND et.EVENT_TYPE_CODE = @EVENT_TYPE_CODE
        AND e.STATUS IN ('PENDING', 'PROCESSING', 'AWAITING_USERNAME')
    `);
  return result.recordset[0].TOTAL > 0;
}

/**
 * Busca eventos de email completados ainda não sincronizados com o Sênior.
 * @param {number} [limit] - Limite de registros (ex.: maxEventsPerRun). Se omitido, retorna todos.
 */
async function getCompletedEmailEvents(limit) {
  const request = new dbConfig.sql.Request(dbConfig.pool);
  const hasLimit = typeof limit === 'number' && limit > 0;
  const query = hasLimit
    ? `
    SELECT TOP (@limit)
      e.ID,
      e.USERNAME,
      e.SENIOR_EMPLOYEE_ID,
      e.SENIOR_EMPLOYEE_NAME,
      e.AD_ATTRIBUTE_VALUE AS NEW_EMAIL,
      e.AD_ORIGINAL_DATA,
      et.EVENT_TYPE_CODE,
      e.PROCESSED_AT
    FROM AD_EVENTS e
    INNER JOIN AD_EVENT_TYPES et ON e.EVENT_TYPE_ID = et.ID
    WHERE e.STATUS = 'COMPLETED'
      AND et.EVENT_TYPE_CODE = 'USER_UPDATE_EMAIL'
      AND (e.SYNCED_TO_SENIOR = 0 OR e.SYNCED_TO_SENIOR IS NULL)
    ORDER BY e.PROCESSED_AT ASC
  `
    : `
    SELECT 
      e.ID,
      e.USERNAME,
      e.SENIOR_EMPLOYEE_ID,
      e.SENIOR_EMPLOYEE_NAME,
      e.AD_ATTRIBUTE_VALUE AS NEW_EMAIL,
      e.AD_ORIGINAL_DATA,
      et.EVENT_TYPE_CODE,
      e.PROCESSED_AT
    FROM AD_EVENTS e
    INNER JOIN AD_EVENT_TYPES et ON e.EVENT_TYPE_ID = et.ID
    WHERE e.STATUS = 'COMPLETED'
      AND et.EVENT_TYPE_CODE = 'USER_UPDATE_EMAIL'
      AND (e.SYNCED_TO_SENIOR = 0 OR e.SYNCED_TO_SENIOR IS NULL)
    ORDER BY e.PROCESSED_AT ASC
  `;
  if (hasLimit) {
    request.input('limit', dbConfig.sql.Int, limit);
  }
  const result = await request.query(query);
  return result.recordset;
}

async function markAsSyncedToSenior(eventId) {
  const request = new dbConfig.sql.Request(dbConfig.pool);
  await request
    .input('ID', dbConfig.sql.Int, eventId)
    .query(`
      UPDATE AD_EVENTS 
      SET SYNCED_TO_SENIOR = 1
      WHERE ID = @ID
    `);
}

async function create(eventData) {
  const request = new dbConfig.sql.Request(dbConfig.pool);
  try {
    // Se não tiver username, status será AWAITING_USERNAME
    const status = eventData.USERNAME ? (eventData.STATUS || 'PENDING') : 'AWAITING_USERNAME';
    
    const result = await request
      .input('EVENT_TYPE_ID', dbConfig.sql.Int, eventData.EVENT_TYPE_ID)
      .input('SENIOR_EMPLOYEE_ID', dbConfig.sql.VarChar(50), eventData.SENIOR_EMPLOYEE_ID || eventData.SENIOR_MATRICULA || null)
      .input('SENIOR_EMPLOYEE_NAME', dbConfig.sql.VarChar(255), eventData.SENIOR_EMPLOYEE_NAME || eventData.SENIOR_NOME_FUNCIONARIO || null)
      .input('SENIOR_COST_CENTER_CODE', dbConfig.sql.VarChar(50), eventData.SENIOR_COST_CENTER_CODE || null)
      .input('SENIOR_COST_CENTER_DESCRIPTION', dbConfig.sql.VarChar(255), eventData.SENIOR_COST_CENTER_DESCRIPTION || null)
      .input('USERNAME', dbConfig.sql.VarChar(255), eventData.USERNAME || null)
      .input('AD_ATTRIBUTE_VALUE', dbConfig.sql.VarChar(dbConfig.sql.MAX), eventData.AD_ATTRIBUTE_VALUE || eventData.NEW_VALUE || null)
      .input('CREATED_BY', dbConfig.sql.VarChar(100), eventData.CREATED_BY)
      .input('AD_ORIGINAL_DATA', dbConfig.sql.VarChar(dbConfig.sql.MAX), eventData.AD_ORIGINAL_DATA || null)
      .input('STATUS', dbConfig.sql.VarChar(20), status)
      .query(`
        INSERT INTO AD_EVENTS 
          (EVENT_TYPE_ID, SENIOR_EMPLOYEE_ID, SENIOR_EMPLOYEE_NAME, SENIOR_COST_CENTER_CODE, SENIOR_COST_CENTER_DESCRIPTION, USERNAME, AD_ATTRIBUTE_VALUE, CREATED_BY, AD_ORIGINAL_DATA, STATUS)
        OUTPUT INSERTED.ID
        VALUES (@EVENT_TYPE_ID, @SENIOR_EMPLOYEE_ID, @SENIOR_EMPLOYEE_NAME, @SENIOR_COST_CENTER_CODE, @SENIOR_COST_CENTER_DESCRIPTION, @USERNAME, @AD_ATTRIBUTE_VALUE, @CREATED_BY, @AD_ORIGINAL_DATA, @STATUS)
      `);
    return result.recordset[0].ID;
  } catch (error) {
    // Verificar se é erro de violação de constraint de unicidade
    if (error.number === 2601 || error.number === 2627) {
      const duplicateError = new Error('Já existe um evento pendente ou em processamento deste tipo para este usuário');
      duplicateError.code = 'DUPLICATE_EVENT';
      duplicateError.statusCode = 409;
      throw duplicateError;
    }
    throw error;
  }
}

async function getById(id) {
  const request = new dbConfig.sql.Request(dbConfig.pool);
  const result = await request
    .input('ID', dbConfig.sql.Int, id)
    .query(`
      SELECT 
        e.*,
        et.NAME as EVENT_TYPE_NAME,
        et.EVENT_TYPE_CODE,
        et.AD_ATTRIBUTE
      FROM AD_EVENTS e
      INNER JOIN AD_EVENT_TYPES et ON e.EVENT_TYPE_ID = et.ID
      WHERE e.ID = @ID
    `);
  return result.recordset[0] || null;
}

module.exports = {
  hasPendingEvent,
  hasPendingEventByEmployeeId,
  getCompletedEmailEvents,
  markAsSyncedToSenior,
  create,
  getById
};

