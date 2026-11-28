// Production Console Hygiene: suppress verbose debug logs on live non-localhost origins
(function suppressProductionDebugLogs() {
  if (typeof window === 'undefined') return;
  var host = window.location.hostname;
  var isLocal = (host === 'localhost' || host === '127.0.0.1' || host === '');
  if (!isLocal) {
    var noop = function() {};
    console.log = noop;
    console.debug = noop;
    console.info = noop;
  }
})();

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
var appCheck = null;

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

        // Firebase App Check Guard
        // Note: Google reCAPTCHA Enterprise requires a registered key with verified domains in Google Cloud Console.
        // If an unregistered/expired key is activated, Google returns HTTP 400, causing periodic token rejection loops.
        // To prevent console spam and auth latency, App Check is strictly opt-in via window.RECAPS_ENABLE_APPCHECK.
        try {
            if (typeof firebase.appCheck === 'function') {
                var hostname = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
                var isDevHost = (
                    hostname === 'localhost' || 
                    hostname === '127.0.0.1' || 
                    hostname === '' ||
                    hostname.startsWith('192.168.') ||
                    hostname.startsWith('10.') ||
                    hostname.endsWith('.local') ||
                    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
                );

                var shouldActivate = (typeof window !== 'undefined' && window.RECAPS_ENABLE_APPCHECK === true);

                if (shouldActivate && !isDevHost) {
                    var RECAPTCHA_SITE_KEY = "6LeWAS4uAAAAAC7KmKCsWuHmYg2KXzD2e8ZB1h";
                    appCheck = firebase.appCheck();

                    if (typeof firebase.appCheck.ReCaptchaEnterpriseProvider === 'function') {
                        appCheck.activate(
                            new firebase.appCheck.ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
                            true
                        );
                        console.log('🛡️ [AppCheck] Activated with reCAPTCHA Enterprise provider');
                    } else if (typeof firebase.appCheck.ReCaptchaV3Provider === 'function') {
                        appCheck.activate(
                            new firebase.appCheck.ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
                            true
                        );
                        console.log('🛡️ [AppCheck] Activated with reCAPTCHA v3 fallback provider');
                    }
                }
            }
        } catch (appCheckErr) {
            // Silently suppress App Check initialization exceptions
        }

        console.log('Firebase initialized successfully');
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
            setPersistence: function(mode) {
                return Promise.resolve();
            },
            onAuthStateChanged: function(callback) {
                // Fail closed when offline/Firebase unavailable: never trust client storage for auth state
                setTimeout(() => {
                    if (typeof callback === 'function') callback(null);
                }, 20);
                return function() {}; // Unsubscribe no-op
            },
            signInWithEmailAndPassword: function() {
                return Promise.reject(new Error('Internet connection required for online authentication.'));
            },
            signInWithPopup: function() {
                return Promise.reject(new Error('Internet connection required for Google Sign-In.'));
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
    if (typeof window.firebase === 'undefined') {
        window.firebase = {
            apps: [],
            initializeApp: function() { return this; },
            auth: function() { return auth; },
            firestore: function() { return db; },
            database: function() { return rtdb; }
        };
        window.firebase.auth.Auth = {
            Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' }
        };
        window.firebase.auth.GoogleAuthProvider = function() {
            return {
                addScope: function() { return this; }
            };
        };
        window.firebase.firestore.FieldValue = {
            serverTimestamp: function() { return new Date().toISOString(); },
            delete: function() { return null; },
            arrayUnion: function(...elements) { return elements; },
            arrayRemove: function(...elements) { return []; },
            increment: function(n) { return n || 0; }
        };
    } else {
        if (!window.firebase.firestore) {
            window.firebase.firestore = function() { return db; };
        }
        if (!window.firebase.firestore.FieldValue) {
            window.firebase.firestore.FieldValue = {
                serverTimestamp: function() { return new Date().toISOString(); },
                delete: function() { return null; },
                arrayUnion: function(...elements) { return elements; },
                arrayRemove: function(...elements) { return []; },
                increment: function(n) { return n || 0; }
            };
        }
        if (!window.firebase.auth) {
            window.firebase.auth = function() { return auth; };
        }
        if (!window.firebase.auth.Auth) {
            window.firebase.auth.Auth = {
                Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' }
            };
        }
    }
    window.auth = auth;
    window.db = db;
    window.rtdb = rtdb;
}