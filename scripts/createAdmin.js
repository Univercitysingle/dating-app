// WARNING: This script uses hardcoded credentials.
// For a production environment, it is strongly recommended to use a more secure method,
// such as command-line arguments or environment variables, to provide the credentials.

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: String,
  isProfileVisible: Boolean
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);

async function createAdmin() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI environment variable is not set.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);

  const email = 'enadoctemp@gmail.com';
  const password = 'pass@123';
  const hashedPassword = await bcrypt.hash(password, 10);

  const exists = await User.findOne({ email, role: 'superadmin' });
  if (exists) {
    console.log('Admin user with this email already exists.');
    await mongoose.disconnect();
    return;
  }

  const admin = new User({
    name: 'Admin',
    email,
    password: hashedPassword,
    role: 'superadmin',
    isProfileVisible: true
  });

  await admin.save();
  console.log('Admin user created successfully!');
  await mongoose.disconnect();
}

createAdmin().catch(err => {
  console.error(err);
  mongoose.disconnect();
});
