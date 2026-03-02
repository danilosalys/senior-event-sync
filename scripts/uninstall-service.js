const Service = require('node-windows').Service;
const path = require('path');

// Criar o serviço
const svc = new Service({
  name: 'Senior Event Sync',
  script: path.join(__dirname, '..', 'src', 'app.js')
});

// Eventos do serviço
svc.on('uninstall', function() {
  console.log('✅ Serviço desinstalado com sucesso!');
});

svc.on('error', function(err) {
  console.error('❌ Erro ao desinstalar serviço:', err);
});

// Desinstalar o serviço
console.log('📦 Desinstalando serviço Senior Event Sync...');
svc.uninstall();

