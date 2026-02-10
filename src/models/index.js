const { sequelize, Sequelize } = require('../config/database');
const Admin = require('./Admin');
const Campaign = require('./Campaign');
const Shirt = require('./Shirt');
const User = require('./User');
const Coupon = require('./Coupon');
const Order = require('./Order');

// Relationships
Campaign.hasMany(Shirt, { as: 'shirts', foreignKey: 'campaignId', onDelete: 'CASCADE' });
Shirt.belongsTo(Campaign, { foreignKey: 'campaignId' });

// Order Relationships
User.hasMany(Order, { foreignKey: 'userId' });
Order.belongsTo(User, { foreignKey: 'userId' });

const db = {
    sequelize,
    Sequelize,
    Admin,
    Campaign,
    Shirt,
    User,
    Coupon,
    Order
};

// Sync database (in development, be careful in production)
// sequelize.sync(); 

module.exports = db;
