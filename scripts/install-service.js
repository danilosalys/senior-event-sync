const Service = require('node-windows').Service;
const path = require('path');

// Criar o serviço
const svc = new Service({
  name: 'Senior Event Sync',
  description: 'Serviço de sincronização de eventos do Sênior com Active Directory',
  script: path.join(__dirname, '..', 'src', 'app.js'),
  nodeOptions: [
    '--max_old_space_size=4096'
  ],
  env: [
    {
      name: 'NODE_ENV',
      value: 'production'
    }
  ]
});

// Eventos do serviço
svc.on('install', function() {
  console.log('✅ Serviço instalado com sucesso!');
  console.log('🚀 Iniciando serviço...');
  svc.start();
});

svc.on('start', function() {
  console.log('✅ Serviço iniciado com sucesso!');
  console.log('🌐 API disponível em: http://localhost:3001');
  console.log('📊 Status: http://localhost:3001/api/status');
  console.log('💚 Health: http://localhost:3001/api/health');
});

svc.on('error', function(err) {
  console.error('❌ Erro no serviço:', err);
});

// Instalar o serviço
console.log('📦 Instalando serviço Senior Event Sync...');
svc.install();

