/**
 * Query para buscar mudanças de cargo no Sênior
 * Esta query deve retornar:
 * - MATRICULA: Matrícula do colaborador no Sênior
 * - USERNAME: Nome de usuário (sAMAccountName) no AD
 * - NEW_VALUE: Novo cargo (será atualizado no campo 'title' do AD)
 * 
 * NOTA: Esta query é um exemplo. Ajuste conforme a estrutura real das tabelas do Sênior.
 */
module.exports = {
  EVENT_TYPE_CODE: 'USER_UPDATE_TITLE',
  DESCRIPTION: 'Busca mudanças de cargo no Sênior',
  SQL: `
    SELECT 
      c.MATRICULA AS SENIOR_EMPLOYEE_ID,
      c.NOME_COMPLETO AS SENIOR_EMPLOYEE_NAME,
      c.NOVO_CARGO AS NEW_VALUE
    FROM VW_COLABORADORES_ALTERACOES_CARGO c
    WHERE c.DATA_ALTERACAO >= DATEADD(MINUTE, -10, GETDATE())
      AND c.STATUS = 'PENDENTE'
      AND c.MATRICULA IS NOT NULL
  `,
  ENABLED: true
};

