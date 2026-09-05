// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyD-cx4ujJ2RUq6TZ8fUaNetft05OuTW4vk",
  authDomain: "re-caps.firebaseapp.com",
  projectId: "re-caps",
  storageBucket: "re-caps.firebasestorage.app",
  messagingSenderId: "801454732856",
  appId: "1:801454732856:web:b43d5e06c04a209d1918cd",
  databaseURL: "https://re-caps-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Initialize Firebase (only once)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();

// Initialize Realtime Database (get existing instance instead of creating new one)
let rtdb;
if (typeof firebase.database === 'function') {
    rtdb = firebase.database();
}

console.log('Firebase initialized successfully');