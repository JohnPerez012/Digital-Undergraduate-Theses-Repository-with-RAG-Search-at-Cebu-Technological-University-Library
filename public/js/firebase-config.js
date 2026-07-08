// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyD-cx4ujJ2RUq6TZ8fUaNetft05OuTW4vk",
  authDomain: "re-caps.firebaseapp.com",
  projectId: "re-caps",
  storageBucket: "re-caps.firebasestorage.app",
  messagingSenderId: "801454732856",
  appId: "1:801454732856:web:b43d5e06c04a209d1918cd"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();

console.log('Firebase initialized successfully');
