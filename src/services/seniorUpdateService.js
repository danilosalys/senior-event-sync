const seniorDbConfig = require('../config/seniorDbConfig');
const logger = require('../utils/logger');

/**
 * Schema esperado no banco Sênior para atualização de email (AD → Sênior):
 * - Tabela: COLABORADORES (ajustar se o ambiente usar outro nome)
 * - Colunas: MATRICULA (VARCHAR, chave), EMAIL (VARCHAR), DATA_ATUALIZACAO (DATETIME, opcional)
 * A query abaixo deve ser ajustada conforme a estrutura real das tabelas do Sênior.
 * Opcional: tabela/colunas podem ser lidas de config (ex.: seniorDatabase.emailUpdateTable).
 *
 * Atualiza o email de um usuário no Sênior.
 * @param {string} matricula - Matrícula do colaborador no Sênior
 * @param {string} newEmail - Novo email a ser atualizado
 * @returns {Promise<boolean>} - true se atualizado com sucesso
 */
async function updateEmail(matricula, newEmail) {
  try {
    if (!matricula) {
      throw new Error('Matrícula é obrigatória');
    }
    if (!newEmail) {
      throw new Error('Novo email é obrigatório');
    }

    const request = new seniorDbConfig.sql.Request(seniorDbConfig.pool);
    const result = await request
      .input('MATRICULA', seniorDbConfig.sql.VarChar(50), matricula)
      .input('EMAIL', seniorDbConfig.sql.VarChar(255), newEmail)
      .query(`
        UPDATE COLABORADORES
        SET EMAIL = @EMAIL,
            DATA_ATUALIZACAO = GETDATE()
        WHERE MATRICULA = @MATRICULA
      `);

    if (result.rowsAffected[0] === 0) {
      logger.warn(`Nenhum registro atualizado para matrícula: ${matricula}`);
      return false;
    }

    logger.info(`Email atualizado no Sênior: Matrícula=${matricula}, Email=${newEmail}`);
    return true;
  } catch (error) {
    logger.error(`Erro ao atualizar email no Sênior para matrícula ${matricula}:`, error);
    throw error;
  }
}

/**
 * Testa a conexão com o banco de dados Sênior
 * @returns {Promise<boolean>} - true se conectado
 */
async function testConnection() {
  try {
    await seniorDbConfig.poolConnect;
    return true;
  } catch (error) {
    logger.error('Falha ao conectar com banco de dados Sênior:', error);
    return false;
  }
}

module.exports = {
  updateEmail,
  testConnection
};

