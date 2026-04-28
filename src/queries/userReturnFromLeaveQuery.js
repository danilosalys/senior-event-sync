/**
 * Query para buscar colaboradores que retornaram de férias/afastamento no Sênior.
 * Gera evento USER_ENABLE para o imediato-ad-sync reativar a conta no AD.
 *
 * No Sênior, retorno é indicado por r034fun.SITAFA = 1. Ajuste para sua base:
 * - Use view (ex.: VW_COLABORADORES_RETORNO_FERIAS) ou r034fun diretamente.
 * - Filtro "retorno recente" (ex.: DATA_RETORNO >= DATEADD(DAY, -7, GETDATE())) evita reprocessar todos.
 * - Exclua demitidos para não reativar por engano (NOT EXISTS em desligamentos).
 */
module.exports = {
  EVENT_TYPE_CODE: 'USER_ENABLE',
  DESCRIPTION: 'Busca colaboradores que retornaram de férias/afastamento (reativar no AD)',
  SQL: `
    SELECT 
      f.MATRICULA AS SENIOR_EMPLOYEE_ID,
      f.NOME_COMPLETO AS SENIOR_EMPLOYEE_NAME,
      NULL AS NEW_VALUE
    FROM VW_COLABORADORES_RETORNO_FERIAS f
    WHERE f.SITAFA = 1
      AND f.MATRICULA IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM VW_COLABORADORES_DEMISSOES d
        WHERE d.MATRICULA = f.MATRICULA AND d.STATUS = 'PENDENTE'
      )
  `
};
