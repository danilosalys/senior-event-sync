const { pool, sql } = require('../config/dbConfig');

async function getByCode(code) {
  const request = new sql.Request(pool);
  const result = await request
    .input('CODE', sql.VarChar(50), code)
    .query('SELECT * FROM AD_EVENT_TYPES WHERE EVENT_TYPE_CODE = @CODE AND STATUS = \'ACTIVE\'');
  return result.recordset[0] || null;
}

async function getActive() {
  const request = new sql.Request(pool);
  const result = await request.query(`
    SELECT * FROM AD_EVENT_TYPES 
    WHERE STATUS = 'ACTIVE'
    ORDER BY NAME
  `);
  return result.recordset;
}

module.exports = {
  getByCode,
  getActive
};

