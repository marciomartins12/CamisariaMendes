require('dotenv').config();
const express = require('express');
const configureViewEngine = require('./config/viewEngine');
const applyMiddlewares = require('./middlewares');
const routes = require('./routes');
const helmet = require('helmet');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & Performance
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for simplicity with inline scripts/styles (Handlebars)
}));
app.use(compression());

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
