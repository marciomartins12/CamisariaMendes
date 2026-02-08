require('dotenv').config();
const { sequelize } = require('./src/config/database');
const models = require('./src/models'); // Load models to register them

async function syncDatabase() {
  try {
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
    
    // Sync all models
    await sequelize.sync({ alter: true }); // 'alter' updates tables without dropping data
    console.log('All models were synchronized successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  } finally {
    await sequelize.close();
  }
}

syncDatabase();
