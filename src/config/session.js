const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const { sequelize } = require('./database');

const store = new SequelizeStore({ db: sequelize });

const sessionConfig = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production', // Secure cookies in production (HTTPS ativo)
    httpOnly: true
  },
};

const initializeStore = async () => {
  try {
    await store.sync();
  } catch (err) {
    console.error('Session store sync failed');
  }
};

module.exports = { sessionConfig, initializeStore };
