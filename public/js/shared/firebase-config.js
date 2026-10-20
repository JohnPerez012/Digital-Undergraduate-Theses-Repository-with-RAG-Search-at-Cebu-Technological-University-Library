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

// Global handles
var auth = null;
var db = null;
var rtdb = null;

if (typeof firebase !== 'undefined') {
    try {
        if (!firebase.apps || !firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        auth = firebase.auth();
        db = firebase.firestore();

        try {
            db.settings({
                experimentalAutoDetectLongPolling: true,
                merge: true
            });
        } catch (e) {}

        if (typeof firebase.database === 'function') {
            rtdb = firebase.database();
        }
        console.log('✓ Firebase initialized successfully');
    } catch (initErr) {
        console.warn('⚠️ Firebase initialization error:', initErr.message);
    }
}

// Fallback: If Firebase failed to load from CDN (offline mode / DNS resolution failure)
if (!auth || !db) {
    console.warn('⚠️ Firebase SDK unavailable (offline or CDN blocked). Initializing resilient offline mock stubs.');

    // Mock Auth
    if (!auth) {
        auth = {
            currentUser: null,
            onAuthStateChanged: function(callback) {
                let cachedUser = null;
                try {
                    const u = sessionStorage.getItem('currentUser') || localStorage.getItem('currentUser');
                    if (u) cachedUser = JSON.parse(u);
                } catch (e) {}
                setTimeout(() => {
                    if (typeof callback === 'function') callback(cachedUser);
                }, 20);
                return function() {}; // Unsubscribe no-op
            },
            signInWithEmailAndPassword: function() {
                return Promise.reject(new Error('Internet connection required for online authentication.'));
            },
            signOut: function() {
                try {
                    sessionStorage.removeItem('currentUser');
                    localStorage.removeItem('currentUser');
                } catch (e) {}
                return Promise.resolve();
            },
            sendPasswordResetEmail: function() {
                return Promise.reject(new Error('Internet connection required for password reset.'));
            }
        };
    }

    // Mock Firestore
    if (!db) {
        const createQueryStub = () => ({
            where: function() { return createQueryStub(); },
            orderBy: function() { return createQueryStub(); },
            limit: function() { return createQueryStub(); },
            get: function() {
                return Promise.resolve({
                    empty: true,
                    size: 0,
                    docs: [],
                    forEach: function() {}
                });
            },
            onSnapshot: function(cb) {
                if (typeof cb === 'function') {
                    cb({ empty: true, size: 0, docs: [], forEach: function() {} });
                }
                return function() {}; // Unsubscribe no-op
            },
            doc: function() {
                return {
                    get: function() { return Promise.resolve({ exists: false, data: function() { return null; } }); },
                    set: function() { return Promise.reject(new Error('Offline: cannot write to database.')); },
                    update: function() { return Promise.reject(new Error('Offline: cannot write to database.')); },
                    delete: function() { return Promise.reject(new Error('Offline: cannot delete from database.')); }
                };
            },
            add: function() {
                return Promise.reject(new Error('Offline: cannot write to database.'));
            }
        });

        db = {
            collection: function(name) {
                return createQueryStub();
            },
            doc: function(path) {
                return {
                    get: function() { return Promise.resolve({ exists: false, data: function() { return null; } }); },
                    set: function() { return Promise.reject(new Error('Offline')); },
                    update: function() { return Promise.reject(new Error('Offline')); },
                    delete: function() { return Promise.reject(new Error('Offline')); }
                };
            },
            settings: function() {}
        };
    }
}

// Expose globally on window
if (typeof window !== 'undefined') {
    window.auth = auth;
    window.db = db;
    window.rtdb = rtdb;
}