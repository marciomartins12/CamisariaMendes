require('dotenv').config();
const express = require('express');
const configureViewEngine = require('./config/viewEngine');
const applyMiddlewares = require('./middlewares');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

configureViewEngine(app);

(async () => {
  await applyMiddlewares(app);
  app.use('/', routes);
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV }`);
  });
})();

module.exports = app;
