require('dotenv').config();
const mongoose = require('mongoose');
const { randomInt } = require('crypto');
const User = require('../models/User'); // Assuming the User model is in this path

const genders = ['male', 'female', 'non-binary'];
const preferences = ['male', 'female', 'everyone'];
const interests = ['travel', 'music', 'sports', 'movies', 'reading', 'gaming', 'cooking', 'hiking'];

function getRandomElement(arr) {
  return arr[randomInt(0, arr.length)];
}

function getRandomInterests() {
  const numInterests = Math.floor(Math.random() * 4) + 2; // 2 to 5 interests
  const shuffled = [...interests].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, numInterests);
}

async function createTestUsers() {
  const numUsersArg = process.argv[2];
  if (!numUsersArg || isNaN(numUsersArg)) {
    console.error('Please provide the number of users to create as a command-line argument.');
    console.error('Example: node scripts/createTestUsers.js 10');
    process.exit(1);
  }
  const numUsers = parseInt(numUsersArg, 10);

  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI environment variable is not set.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected successfully.');

    const usersToCreate = [];
    for (let i = 0; i < numUsers; i++) {
      const userNum = Date.now() + i; // Ensure unique email
      usersToCreate.push({
        name: `Test User ${i + 1}`,
        email: `testuser${userNum}@example.com`,
        uid: `test-uid-${userNum}`, // Fake UID for discovery filtering
        age: randomInt(20, 40), // Age between 20 and 39
        gender: getRandomElement(genders),
        preference: getRandomElement(preferences),
        bio: `This is the bio for Test User ${i + 1}. Just looking for a connection.`,
        interests: getRandomInterests(),
        images: [`https://placehold.co/400x600?text=User+${i + 1}`],
        isProfileVisible: true,
        role: 'user',
      });
    }

    await User.insertMany(usersToCreate);
    console.log(`${numUsers} test users created successfully!`);
  } catch (err) {
    console.error('Error creating test users:', err);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
}

createTestUsers();
