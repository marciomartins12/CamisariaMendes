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
        typeof: (val) => typeof val,
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
        join: (array, separator) => {
          if (!Array.isArray(array)) return array;
          return array.join(separator);
        },
        split: (str, ch) => {
          if (typeof str !== 'string') return [];
          return str.split(ch);
        }
      }
    })
  );
  app.set('view engine', 'handlebars');
  app.set('views', path.join(__dirname, '..', 'views'));
};
