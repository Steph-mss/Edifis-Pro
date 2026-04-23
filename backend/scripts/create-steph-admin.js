const bcrypt = require('bcryptjs');
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(
  process.env.DB_NAME || 'edifis_pro',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false,
  }
);

async function createUser() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connexion DB OK');

    const hashed = await bcrypt.hash('Password123!', 10);

    const [result] = await sequelize.query(
      `INSERT INTO users (firstname, lastname, email, password, role_id, numberphone)
       VALUES ('Steph', 'Dragon', 'stephdragon77@gmail.com', :password, 1, '0600000000')`,
      {
        replacements: { password: hashed },
        type: Sequelize.QueryTypes.INSERT,
      }
    );

    const newId = result;

    // Vérifie
    const [rows] = await sequelize.query(
      `SELECT u.user_id, u.firstname, u.lastname, u.email, r.name AS role
       FROM users u JOIN roles r ON u.role_id = r.role_id
       WHERE u.user_id = :id`,
      { replacements: { id: newId }, type: Sequelize.QueryTypes.SELECT }
    );

    console.log('✅ Utilisateur créé avec succès :');
    console.log(`   ID       : ${rows.user_id}`);
    console.log(`   Nom      : ${rows.firstname} ${rows.lastname}`);
    console.log(`   Email    : ${rows.email}`);
    console.log(`   Rôle     : ${rows.role}`);
    console.log(`   Mot dep. : Password123!`);

  } catch (err) {
    console.error('❌ Erreur :', err.message);
  } finally {
    await sequelize.close();
  }
}

createUser();
