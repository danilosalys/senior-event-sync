// Pool do banco AD_Sync (compartilhado com imediato-ad-sync)
const { createDbModule } = require('./poolFactory');
module.exports = createDbModule('database');
