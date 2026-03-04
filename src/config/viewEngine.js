const path = require('path');
const exphbs = require('express-handlebars');

module.exports = (app) => {
  app.engine(
    'handlebars',
    exphbs.engine({
      defaultLayout: 'main',
      layoutsDir: path.join(__dirname, '..', 'views', 'layouts'),
      partialsDir: path.join(__dirname, '..', 'views', 'partials'),
      helpers: {
        eq: (a, b) => a === b,
        formatDate: (date) => {
          if (!date) return '';
          return new Date(date).toLocaleDateString('pt-BR');
        },
        formatDateTime: (date) => {
          if (!date) return '';
          return new Date(date).toLocaleString('pt-BR');
        },
        json: (context) => {
          return JSON.stringify(context).replace(/'/g, "&#39;");
        },
        split: (str, separator) => {
          if (typeof str !== 'string') return [];
          return str.split(separator);
        }
      }
    })
  );
  app.set('view engine', 'handlebars');
  app.set('views', path.join(__dirname, '..', 'views'));
};
