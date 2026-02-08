const { sequelize, Sequelize } = require('../config/database');
const Admin = require('./Admin');
const Campaign = require('./Campaign');
const Shirt = require('./Shirt');
const User = require('./User');

// Relationships
Campaign.hasMany(Shirt, { as: 'shirts', foreignKey: 'campaignId', onDelete: 'CASCADE' });
Shirt.belongsTo(Campaign, { foreignKey: 'campaignId' });

const db = {
    sequelize,
    Sequelize,
    Admin,
    Campaign,
    Shirt,
    User
};

// Sync database (in development, be careful in production)
// sequelize.sync(); 

module.exports = db;
