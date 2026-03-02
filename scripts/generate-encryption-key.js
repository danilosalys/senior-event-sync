const crypto = require('crypto');

// Gerar chave de criptografia aleatória de 64 caracteres
const encryptionKey = crypto.randomBytes(32).toString('hex');

console.log('='.repeat(60));
console.log('CHAVE DE CRIPTOGRAFIA GERADA');
console.log('='.repeat(60));
console.log('\nAdicione esta chave ao arquivo .env:');
console.log(`ENCRYPTION_KEY=${encryptionKey}`);
console.log('\n⚠️  IMPORTANTE: Guarde esta chave em local seguro!');
console.log('   Sem ela, não será possível descriptografar senhas salvas.');
console.log('='.repeat(60));

