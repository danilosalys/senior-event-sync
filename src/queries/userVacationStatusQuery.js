/**
 * Query para buscar colaboradores em férias no Sênior
 * Esta query deve retornar:
 * - SENIOR_EMPLOYEE_ID: Matrícula do colaborador no Sênior
 * - SENIOR_EMPLOYEE_NAME: Nome completo do colaborador no Sênior
 * - NEW_VALUE: (opcional) indicador de status de férias, caso o imediato-ad-sync precise
 * 
 * NOTA: Esta query é um exemplo. Ajuste conforme a estrutura real das tabelas/views de férias do Sênior.
 */
module.exports = {
  EVENT_TYPE_CODE: 'USER_DISABLE_LEAVE',
  DESCRIPTION: 'Busca colaboradores em férias no Sênior (para desabilitar durante o período)',
  SQL: `
    SELECT 
      f.MATRICULA AS SENIOR_EMPLOYEE_ID,
      f.NOME_COMPLETO AS SENIOR_EMPLOYEE_NAME,
      NULL AS NEW_VALUE
    FROM VW_COLABORADORES_FERIAS f
    WHERE f.DATA_INICIO <= GETDATE()
      AND f.DATA_FIM >= GETDATE()
      AND f.STATUS = 'PENDENTE'
      AND f.MATRICULA IS NOT NULL
  `,
  ENABLED: true
};

