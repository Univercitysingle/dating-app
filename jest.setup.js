require('whatwg-fetch');
require('@testing-library/jest-dom');
const { initializeApp } = require('firebase/app');
const firebaseConfig = {
  apiKey: "test",
  authDomain: "test",
  projectId: "test",
  storageBucket: "test",
  messagingSenderId: "test",
  appId: "test"
};

initializeApp(firebaseConfig);
