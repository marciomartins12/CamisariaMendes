const path = require('path');
const exphbs = require('express-handlebars');

module.exports = (app) => {
  app.engine(
    'handlebars',
    exphbs.engine({
      defaultLayout: 'main',
      layoutsDir: path.join(__dirname, '..', 'views', 'layouts'),
    })
  );
  app.set('view engine', 'handlebars');
  app.set('views', path.join(__dirname, '..', 'views'));
};
