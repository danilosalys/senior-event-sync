const { decrypt, ensureKey } = require('../src/utils/crypto');
const logger = require('../src/utils/logger');

const encryptedPassword = process.argv[2];

if (!encryptedPassword) {
  logger.error('Uso: node scripts/decrypt-password.js <senha_criptografada>');
  process.exit(1);
}

try {
  ensureKey();
} catch (err) {
  logger.error('ENCRYPTION_KEY não configurada ou inválida:', err.message);
  process.exit(2);
}

const decrypted = decrypt(encryptedPassword);
console.log(decrypted);

