const path = require('path');
const express = require('express');
const flash = require('express-flash');
const session = require('express-session');
const { sessionConfig, initializeStore } = require('../config/session');

module.exports = async (app) => {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(session(sessionConfig));
  await initializeStore();
  app.use(flash());
};
