require('dotenv').config();
const bcrypt = require('bcrypt');
const { sequelize } = require('./src/config/database');
const Admin = require('./src/models/Admin');

async function seedAdmin() {
  try {
    await sequelize.sync({ force: false }); // Don't drop tables if they exist, but creating Admin table if not

    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    const adminEmail = process.env.CONTACT_EMAIL || 'admin@camisariamendes.com';

    const adminExists = await Admin.findOne({ where: { username: adminUser } });

    if (adminExists) {
      console.log('Admin user already exists.');
      return;
    }

    const hashedPassword = await bcrypt.hash(adminPass, 10);

    await Admin.create({
      username: adminUser,
      email: adminEmail,
      password: hashedPassword,
      role: 'superadmin'
    });

    console.log('Admin user created successfully!');
    console.log(`Username: ${adminUser}`);
    console.log('Password: [HIDDEN_FROM_LOGS]'); // Security best practice
  } catch (error) {
    console.error('Error seeding admin:', error);
  } finally {
    await sequelize.close();
  }
}

seedAdmin();
