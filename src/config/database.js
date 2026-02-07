require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    logging: false,
  }
)

sequelize.authenticate().then(() => {
    console.log("conexão ao banco de dados bem-sucedida")
}).catch(err => {
    console.log(`erro ao conectar ao banco de dados. Erro: ${err.message}`)
})

module.exports = { sequelize, Sequelize };
