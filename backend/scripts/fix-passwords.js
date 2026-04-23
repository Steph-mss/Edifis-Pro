require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const sequelize = require('../config/sequelize');
const User = require('../models/User');

(async () => {
  try {
    await sequelize.authenticate();

    const newHash = await bcrypt.hash('Password123!', 10);
    console.log('New hash generated:', newHash.substring(0, 20) + '...');

    // Verify the hash works before updating
    const verify = await bcrypt.compare('Password123!', newHash);
    console.log('Hash verification:', verify);

    if (!verify) {
      console.error('ERROR: Hash verification failed. Aborting.');
      process.exit(1);
    }

    // Update all non-admin accounts to use Password123!
    const emails = [
      'test.hr@edifis-pro.com',
      'live.hr@edifis-pro.com',
      'jack.simon@edifis-pro.com',
      'diane.simon@edifis-pro.com',
      'olivia.bernard@edifis-pro.com',
      'manager.grace.petit@edifis-pro.com',
      'pm.eve.dubois@edifis-pro.com',
      'pm.grace.petit@edifis-pro.com',
    ];

    const [count] = await User.update(
      { password: newHash },
      { where: { email: emails } }
    );

    console.log(`Updated ${count} users with new password hash.`);

    // Verify by fetching one and checking
    const testUser = await User.findOne({ where: { email: 'jack.simon@edifis-pro.com' } });
    const verified = await bcrypt.compare('Password123!', testUser.password);
    console.log('Post-update verification for jack.simon:', verified);

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
