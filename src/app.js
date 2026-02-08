require('dotenv').config();
const express = require('express');
const configureViewEngine = require('./config/viewEngine');
const applyMiddlewares = require('./middlewares');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT ;

configureViewEngine(app);

(async () => {
  await applyMiddlewares(app);
  app.use('/', routes);
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("")
  });
})();

module.exports = app;
