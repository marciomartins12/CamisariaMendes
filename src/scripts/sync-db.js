const { sequelize } = require('../config/database');
const models = require('../models');

async function syncDatabase() {
  try {
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
    
    // Sync all models
    // force: false ensures we don't drop existing tables unless necessary
    // alter: true updates tables to match models
    await sequelize.sync({ alter: true });
    
    console.log('todos os modelos foram sincronizados com sucesso.');
    process.exit(0);
  } catch (error) {
    console.error('erro ao conectar ao banco de dados ou sincronizar modelos:', error);
    process.exit(1);
  }
}

syncDatabase();