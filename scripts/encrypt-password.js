const { encrypt, ensureKey } = require('../src/utils/crypto');
const logger = require('../src/utils/logger');

const password = process.argv[2];

if (!password) {
  logger.error('Uso: node scripts/encrypt-password.js <senha>');
  process.exit(1);
}

try {
  ensureKey();
} catch (err) {
  logger.error('ENCRYPTION_KEY não configurada ou inválida:', err.message);
  process.exit(2);
}

const encrypted = encrypt(password);
console.log(encrypted);

