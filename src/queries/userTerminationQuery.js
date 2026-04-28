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
    WITH LatestEmployee AS (
    SELECT 
        T1.NUMCAD,
        T1.NOMFUN,
        T1.CODCAR,
        T1.ESTCAR,
        T1.SITAFA,
        T1.DATAFA,
        T1.CODCCU,
        T1.NUMEMP,
        ROW_NUMBER() OVER (PARTITION BY T1.NOMFUN, T1.NUMCPF, T1.NUMEMP, T1.TIPCOL ORDER BY T1.NUMCAD DESC) AS rn
    FROM vetorh.dbo.R034FUN T1        
    WHERE T1.NUMEMP = 1 
      AND T1.TIPCOL = 1
      AND T1.DATAFA > CAST(GETDATE() - 180 AS DATE)
      AND T1.SITAFA = 7
)
SELECT 
    LE.NUMCAD AS SENIOR_EMPLOYEE_ID,
    LE.NOMFUN AS SENIOR_EMPLOYEE_NAME,
    T4.CODCCU AS SENIOR_COST_CENTER_CODE,
    T4.NOMCCU AS SENIOR_COST_CENTER_DESCRIPTION,
    LE.DATAFA,
    T2.TITCAR
FROM LatestEmployee LE
INNER JOIN vetorh.dbo.R024CAR T2
    ON LE.CODCAR = T2.CODCAR 
    AND LE.ESTCAR = T2.ESTCAR
INNER JOIN vetorh.dbo.R010SIT T3
    ON LE.SITAFA = T3.CODSIT
INNER JOIN vetorh.dbo.R018CCU T4
    ON LE.CODCCU = T4.CODCCU
    AND LE.NUMEMP = T4.NUMEMP
WHERE LE.rn = 1
  AND NOT EXISTS (
    SELECT 1 FROM ImediatoAdSync.dbo.AD_EVENTS ADE
    WHERE TRY_CONVERT(INT, ADE.SENIOR_EMPLOYEE_ID) = LE.NUMCAD
      AND ADE.EVENT_TYPE_ID = 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM ImediatoAdSync.dbo.AD_JOB_TITLE_RULES ADJTR
    WHERE TRY_CONVERT(INT, ADJTR.SENIOR_JOB_ID) = LE.CODCAR
  );
  `
};

