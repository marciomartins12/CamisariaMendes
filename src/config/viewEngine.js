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
        },
        sizesList: (sizes) => {
          if (!sizes) return [];

          // Already normalized as array
          if (Array.isArray(sizes)) {
            return sizes.map(s => String(s).trim()).filter(Boolean);
          }

          if (typeof sizes !== 'string') {
            return [];
          }

          const raw = sizes.trim();
          if (!raw) return [];

          // Support JSON string format: '["P","M","G"]'
          if (raw.startsWith('[')) {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                return parsed.map(s => String(s).trim()).filter(Boolean);
              }
            } catch (e) {
              // Fall through to separator-based parsing
            }
          }

          // Support comma, semicolon or line break separated formats
          return raw
            .split(/[,;\n]+/)
            .map(s => s.trim())
            .filter(Boolean);
        }
      }
    })
  );
  app.set('view engine', 'handlebars');
  app.set('views', path.join(__dirname, '..', 'views'));
};
