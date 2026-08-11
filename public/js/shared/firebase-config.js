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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();

// Set Firestore cache size limit to prevent IndexedDB bloat
// 1 MB = 1048576 bytes (enough for metadata, small queries)
// We use localStorage for project caching, so Firestore cache can be minimal
// db.settings({
//   cacheSizeBytes: 1048576,  // 1 MB limit
//   merge: true
// });

// console.log('✓ Firestore cache limited to 1 MB');

// Initialize Realtime Database conditionally if SDK is loaded
let rtdb;
if (typeof firebase.database === 'function') {
  rtdb = firebase.app().database("https://re-caps-default-rtdb.asia-southeast1.firebasedatabase.app");
}

console.log('Firebase initialized successfully');