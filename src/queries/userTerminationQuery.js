/**
 * Query para buscar demissões no Sênior
 * Esta query deve retornar:
 * - MATRICULA: Matrícula do colaborador no Sênior
 * - USERNAME: Nome de usuário (sAMAccountName) no AD
 * - NEW_VALUE: NULL (não aplicável para demissão)
 * 
 * NOTA: Esta query é um exemplo. Ajuste conforme a estrutura real das tabelas do Sênior.
 */
module.exports = {
  EVENT_TYPE_CODE: 'USER_DISABLE_TERMINATION',
  DESCRIPTION: 'Busca demissões no Sênior',
  SQL: `
    SELECT 
      c.MATRICULA AS SENIOR_EMPLOYEE_ID,
      c.NOME_COMPLETO AS SENIOR_EMPLOYEE_NAME,
      NULL AS NEW_VALUE
    FROM VW_COLABORADORES_DEMISSOES c
    WHERE c.DATA_DEMISSAO >= DATEADD(MINUTE, -10, GETDATE())
      AND c.STATUS = 'PENDENTE'
      AND c.MATRICULA IS NOT NULL
  `,
  ENABLED: true
};

