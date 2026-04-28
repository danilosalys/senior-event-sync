const path = require('path');
const fs = require('fs');

const configPath = path.join(process.cwd(), 'config', 'secure', 'service-config.json');

/**
 * Valida variáveis de ambiente antes de carregar o restante da aplicação.
 * Se existir config/secure/service-config.json, não exige DB_* no .env (config pode vir do arquivo).
 * Caso contrário, exige DB_* e SENIOR_DB_* no .env.
 * @throws {Error} Se alguma variável obrigatória não estiver definida
 */
function validateEnv() {
  const errors = [];

  const hasConfigFile = fs.existsSync(configPath);

  if (!hasConfigFile) {
    // Usando .env: exige variáveis de banco
    if (!process.env.DB_SERVER || !String(process.env.DB_SERVER).trim()) {
      errors.push('DB_SERVER não está definida ou está vazia');
    }
    if (!process.env.DB_USER || !String(process.env.DB_USER).trim()) {
      errors.push('DB_USER não está definida ou está vazia');
    }
    if (!process.env.DB_DATABASE || !String(process.env.DB_DATABASE).trim()) {
      errors.push('DB_DATABASE não está definida ou está vazia');
    }
    if (!process.env.SENIOR_DB_SERVER || !String(process.env.SENIOR_DB_SERVER).trim()) {
      errors.push('SENIOR_DB_SERVER não está definida ou está vazia');
    }
    if (!process.env.SENIOR_DB_USER || !String(process.env.SENIOR_DB_USER).trim()) {
      errors.push('SENIOR_DB_USER não está definida ou está vazia');
    }
    if (!process.env.SENIOR_DB_DATABASE || !String(process.env.SENIOR_DB_DATABASE).trim()) {
      errors.push('SENIOR_DB_DATABASE não está definida ou está vazia');
    }
  }

  if (errors.length > 0) {
    throw new Error(
      'Erro de configuração: variáveis de ambiente obrigatórias não definidas ou vazias:\n' +
      '  - ' + errors.join('\n  - ') + '\n\n' +
      'Configure o arquivo .env na raiz do projeto (veja .env.example).'
    );
  }
}

module.exports = { validateEnv };
