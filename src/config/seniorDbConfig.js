// Pool do banco Sênior
const { createDbModule } = require('./poolFactory');
module.exports = createDbModule('seniorDatabase');
