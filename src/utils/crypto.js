const CryptoJS = require('crypto-js');

// Prefixo para identificar senhas criptografadas
const ENCRYPTED_PREFIX = 'ENCRYPTED:';

function getRawKey() {
  return process.env.ENCRYPTION_KEY || null;
}

function ensureKey() {
  const key = getRawKey();
  if (!key) {
    throw new Error('ENCRYPTION_KEY não definida. Chame ensureKey() ou defina a variável de ambiente ENCRYPTION_KEY.');
  }
  if (String(key).length < 32) {
    throw new Error('ENCRYPTION_KEY deve ter pelo menos 32 caracteres para segurança adequada.');
  }
  return String(key);
}

/**
 * Criptografa uma string usando AES (CryptoJS)
 * Lança se ENCRYPTION_KEY não estiver definida.
 */
function encrypt(text) {
  if (!text || String(text).trim() === '') return '';
  if (String(text).startsWith(ENCRYPTED_PREFIX)) return text;

  const key = ensureKey();
  const encrypted = CryptoJS.AES.encrypt(String(text), key).toString();
  return ENCRYPTED_PREFIX + encrypted;
}

/**
 * Descriptografa uma string. Se o valor não estiver prefixado, retorna como está.
 * Se estiver prefixado e ENCRYPTION_KEY não estiver definida, lança erro.
 */
function decrypt(encryptedText) {
  if (!encryptedText || String(encryptedText).trim() === '') return '';
  if (!String(encryptedText).startsWith(ENCRYPTED_PREFIX)) return encryptedText;

  const key = ensureKey();
  const encrypted = String(encryptedText).substring(ENCRYPTED_PREFIX.length);
  const decrypted = CryptoJS.AES.decrypt(encrypted, key);
  return decrypted.toString(CryptoJS.enc.Utf8);
}

function isEncrypted(text) {
  return text && String(text).startsWith(ENCRYPTED_PREFIX);
}

function encryptConfigPasswords(config) {
  const encryptedConfig = JSON.parse(JSON.stringify(config));
  if (encryptedConfig.database && encryptedConfig.database.password) {
    encryptedConfig.database.password = encrypt(encryptedConfig.database.password);
  }
  if (encryptedConfig.seniorDatabase && encryptedConfig.seniorDatabase.password) {
    encryptedConfig.seniorDatabase.password = encrypt(encryptedConfig.seniorDatabase.password);
  }
  return encryptedConfig;
}

function decryptConfigPasswords(config) {
  const decryptedConfig = JSON.parse(JSON.stringify(config));
  if (decryptedConfig.database && decryptedConfig.database.password) {
    if (isEncrypted(decryptedConfig.database.password)) {
      decryptedConfig.database.password = decrypt(decryptedConfig.database.password);
    }
  }
  if (decryptedConfig.seniorDatabase && decryptedConfig.seniorDatabase.password) {
    if (isEncrypted(decryptedConfig.seniorDatabase.password)) {
      decryptedConfig.seniorDatabase.password = decrypt(decryptedConfig.seniorDatabase.password);
    }
  }
  return decryptedConfig;
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  encryptConfigPasswords,
  decryptConfigPasswords,
  ensureKey,
  ENCRYPTED_PREFIX
};

