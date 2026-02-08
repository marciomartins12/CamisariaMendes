const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Shirt = sequelize.define('Shirt', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  color: {
    type: DataTypes.STRING,
    allowNull: true
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  type: {
    type: DataTypes.STRING, // e.g., "Tradicional", "Oversized"
    allowNull: false
  },
  sizes: {
    type: DataTypes.STRING, // Stored as JSON or comma-separated string: "P,M,G,GG"
    allowNull: false
  },
  // Storing images as a JSON string of Base64 strings.
  // Using TEXT/LONGTEXT for Base64 simplicity.
  images: { 
    type: DataTypes.TEXT('long'), 
    allowNull: true,
    defaultValue: '[]',
    get() {
      const rawValue = this.getDataValue('images');
      if (!rawValue) return [];
      try {
        return JSON.parse(rawValue);
      } catch (e) {
        return [];
      }
    },
    set(value) {
      if (Array.isArray(value)) {
        this.setDataValue('images', JSON.stringify(value));
      } else {
        this.setDataValue('images', value);
      }
    }
  },
  campaignId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'campaigns',
      key: 'id'
    }
  }
}, {
  tableName: 'shirts',
  timestamps: true
});

module.exports = Shirt;
