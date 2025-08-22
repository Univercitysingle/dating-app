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

async function createSuperAdmin() {
  await mongoose.connect(process.env.MONGO_URI);

  const email = 'enadoctemp@gmail.com';
  const password = 'Abc@1234';
  const hashedPassword = await bcrypt.hash(password, 10);

  const exists = await User.findOne({ email, role: 'superadmin' });
  if (exists) {
    console.log('Superadmin already exists.');
    await mongoose.disconnect();
    return;
  }

  const superadmin = new User({
    name: 'Super Admin',
    email,
    password: hashedPassword,
    role: 'superadmin',
    isProfileVisible: true
  });

  await superadmin.save();
  console.log('Superadmin created successfully!');
  await mongoose.disconnect();
}

createSuperAdmin().catch(err => {
  console.error(err);
  mongoose.disconnect();
});
