/**
 * ============================================================================
 * Authentication & Authorization Service (AuthService)
 * ============================================================================
 * 
 * Professional implementation following Single Responsibility Principle
 * Consolidates authentication, authorization, and routing logic
 * 
 * @module AuthService
 * @description Central service for:
 *   - Authentication state management
 *   - Role-based access control (RBAC)
 *   - Route resolution and navigation
 *   - User session management
 * 
 * @author RE-CAPS Team
 * @version 2.0.0
 */

(function(window) {
    'use strict';

    // ========================================================================
    // CONFIGURATION
    // ========================================================================

    const CONFIG = {
        // Role-to-page mapping
        ROLE_PAGES: {
            student: 'student_page.html',
            admin: 'admin_page.html',
            librarian: 'librarian_page.html',
            teacher: 'teacher_page.html'
        },

        // Common pages
        PAGES: {
            index: 'index.html',
            about: 'about_page.html',
            registration: 'account_registration.html'
        },

        // Session storage keys
        STORAGE_KEYS: {
            USER_ID: 'userId',
            USER_EMAIL: 'userEmail',
            USER_NAME: 'userName',
            USER_TYPE: 'userType',
            OPEN_LOGIN_MODAL: 'openLoginModal',
            JUST_REGISTERED: 'justRegistered',
            AUTO_LOGGED_IN: 'autoLoggedIn',
            CACHED_AUTH_STATE: 'cachedAuthState'
        }
    };

    // ========================================================================
    // AUTHENTICATION SERVICE
    // ========================================================================

    const AuthService = {

        // ====================================================================
        // AUTHENTICATION STATE
        // ====================================================================

        /**
         * Get current authenticated user
         * @returns {firebase.User|null}
         */
        getCurrentUser() {
            return typeof auth !== 'undefined' ? auth.currentUser : null;
        },

        /**
         * Wait for Firebase auth to initialize and return current user
         * @returns {Promise<firebase.User|null>}
         */
        getCurrentUserAsync() {
            if (typeof auth === 'undefined') return Promise.resolve(null);
            if (auth.currentUser) return Promise.resolve(auth.currentUser);
            return new Promise((resolve) => {
                const unsubscribe = auth.onAuthStateChanged((user) => {
                    if (typeof unsubscribe === 'function') unsubscribe();
                    resolve(user);
                });
            });
        },

        /**
         * Get user type from session storage or Firestore
         * @param {string} uid - User ID
         * @returns {Promise<string|null>}
         */
        async getUserType(uid = null) {
            // Try session storage first
            let userType = sessionStorage.getItem(CONFIG.STORAGE_KEYS.USER_TYPE);
            
            if (userType) {
                return userType;
            }

            // Fetch from Firestore if not in session
            if (!uid) {
                const user = await this.getCurrentUserAsync();
                if (!user) return null;
                uid = user.uid;
            }

            try {
                if (typeof db === 'undefined') return null;
                
                const doc = await db.collection('users').doc(uid).get();
                if (doc.exists) {
                    const data = doc.data() || {};
                    userType = data.userType || null;
                    if (userType) {
                        this.cacheUserData(uid, data);
                    }
                }
                return userType;
            } catch (error) {
                console.error('[AuthService] Failed to fetch user type:', error);
                return null;
            }
        },

        /**
         * Cache user data in session storage
         * @param {string} uid - User ID
         * @param {Object} userData - User data object
         */
        cacheUserData(uid, userData) {
            sessionStorage.setItem(CONFIG.STORAGE_KEYS.USER_ID, uid);
            sessionStorage.setItem(CONFIG.STORAGE_KEYS.USER_EMAIL, userData.email || '');
            sessionStorage.setItem(CONFIG.STORAGE_KEYS.USER_NAME, userData.displayName || userData.fullName || '');
            sessionStorage.setItem(CONFIG.STORAGE_KEYS.USER_TYPE, userData.userType || '');
        },

        /**
         * Clear user session data
         */
        clearSession() {
            sessionStorage.clear();
            localStorage.removeItem(CONFIG.STORAGE_KEYS.CACHED_AUTH_STATE);
        },

        /**
         * Check if user is authenticated
         * @returns {boolean}
         */
        isAuthenticated() {
            return this.getCurrentUser() !== null;
        },

        // ====================================================================
        // AUTHORIZATION (RBAC)
        // ====================================================================

        /**
         * Check if user has required role for current page
         * @param {string} requiredRole - Required role (student, admin, etc.)
         * @param {string} currentUserRole - Current user's role
         * @returns {boolean}
         */
        hasRequiredRole(requiredRole, currentUserRole) {
            return requiredRole === currentUserRole;
        },

        /**
         * Enforce role-based access control
         * Redirects user if they don't have the required role
         * @param {string} requiredRole - Required role for current page
         */
        async enforceRBAC(requiredRole) {
            if (!requiredRole) return;

            const user = this.getCurrentUser();
            
            // Not authenticated → redirect to login
            if (!user) {
                sessionStorage.setItem(CONFIG.STORAGE_KEYS.OPEN_LOGIN_MODAL, 'true');
                this.navigateToHome(true);
                return;
            }

            // Check user's role
            const userRole = await this.getUserType(user.uid);
            
            // Has correct role → allow access
            if (this.hasRequiredRole(requiredRole, userRole)) {
                return;
            }

            // Wrong role → redirect to their dashboard
            this.navigateToDashboard(userRole, true);
        },

        // ====================================================================
        // ROUTING & NAVIGATION
        // ====================================================================

        /**
         * Resolve correct path based on current location
         * @param {string} targetPage - Target page filename
         * @returns {string} - Resolved relative path
         */
        resolvePath(targetPage) {
            const currentPath = window.location.pathname;
            const isInPagesFolder = currentPath.includes('/pages/');
            
            // Handle index/home page
            if (targetPage === CONFIG.PAGES.index) {
                return isInPagesFolder ? '../index.html' : 'index.html';
            }
            
            // Check if target is a role page or common page
            const isRolePage = Object.values(CONFIG.ROLE_PAGES).includes(targetPage);
            const isCommonPage = Object.values(CONFIG.PAGES).includes(targetPage);
            
            if (isRolePage || isCommonPage) {
                // Already in pages folder → use filename directly
                if (isInPagesFolder) {
                    return targetPage;
                }
                // In root → prepend pages/
                return 'pages/' + targetPage;
            }
            
            return targetPage;
        },

        /**
         * Get dashboard page path for a role
         * @param {string} userType - User role
         * @returns {string} - Dashboard page path
         */
        getDashboardPath(userType) {
            const pageName = CONFIG.ROLE_PAGES[userType];
            
            if (!pageName) {
                console.warn(`[AuthService] Unknown user type: ${userType}`);
                return this.resolvePath(CONFIG.PAGES.index);
            }
            
            return this.resolvePath(pageName);
        },

        /**
         * Navigate to a specific page
         * @param {string} targetPage - Target page filename
         * @param {boolean} replace - Use replaceState (default: false)
         */
        navigate(targetPage, replace = false) {
            const path = this.resolvePath(targetPage);
            
            if (replace) {
                window.location.replace(path);
            } else {
                window.location.href = path;
            }
        },

        /**
         * Navigate to user's dashboard
         * @param {string} [userType] - User role (optional, will auto-detect if missing)
         * @param {boolean} [replace] - Use replaceState (default: false)
         */
        async navigateToDashboard(userType = null, replace = false) {
            if (!userType || !this.isValidRole(userType)) {
                userType = await this.getUserType();
            }

            if (!userType || !this.isValidRole(userType)) {
                console.warn('[AuthService] Could not determine user role for dashboard navigation, navigating home');
                this.navigateToHome(replace);
                return;
            }

            const path = this.getDashboardPath(userType);
            
            if (replace) {
                window.location.replace(path);
            } else {
                window.location.href = path;
            }
        },

        /**
         * Navigate to home page
         * @param {boolean} replace - Use replaceState (default: false)
         */
        navigateToHome(replace = false) {
            const path = this.resolvePath(CONFIG.PAGES.index);
            
            if (replace) {
                window.location.replace(path);
            } else {
                window.location.href = path;
            }
        },

        /**
         * Navigate to registration page
         * @param {boolean} replace - Use replaceState (default: false)
         */
        navigateToRegistration(replace = false) {
            this.navigate(CONFIG.PAGES.registration, replace);
        },

        /**
         * Check if user is on their correct dashboard
         * @param {string} userType - User role
         * @returns {boolean}
         */
        isOnCorrectDashboard(userType) {
            const currentPath = window.location.pathname;
            const dashboardPage = CONFIG.ROLE_PAGES[userType];
            
            if (!dashboardPage) return false;
            
            return currentPath.endsWith(dashboardPage) || 
                   currentPath.endsWith(dashboardPage.replace('.html', ''));
        },

        /**
         * Redirect after successful login
         * @param {string} userType - User role
         * @param {string} userName - User display name
         * @param {Function} welcomeCallback - Optional callback to show welcome modal
         */
        redirectAfterLogin(userType, userName, welcomeCallback = null) {
            if (welcomeCallback && typeof welcomeCallback === 'function') {
                welcomeCallback(userName, userType);
            } else {
                this.navigateToDashboard(userType);
            }
        },

        // ====================================================================
        // LOGOUT
        // ====================================================================

        /**
         * Logout user and redirect to home
         * @returns {Promise<void>}
         */
        async logout() {
            try {
                if (typeof auth !== 'undefined') {
                    await auth.signOut();
                }
                this.clearSession();
                this.navigateToHome(true);
            } catch (error) {
                console.error('[AuthService] Logout failed:', error);
                throw error;
            }
        },

        // ====================================================================
        // UTILITY
        // ====================================================================

        /**
         * Get page configuration
         * @returns {Object}
         */
        getConfig() {
            return { ...CONFIG };
        },

        /**
         * Get role pages mapping
         * @returns {Object}
         */
        getRolePages() {
            return { ...CONFIG.ROLE_PAGES };
        },

        /**
         * Check if a role exists
         * @param {string} role - Role name
         * @returns {boolean}
         */
        isValidRole(role) {
            return Object.keys(CONFIG.ROLE_PAGES).includes(role);
        }
    };

    // ========================================================================
    // RBAC GUARD (Auto-initializes on protected pages)
    // ========================================================================

    /**
     * RBAC Guard - Automatically enforces access control on page load
     * Add data-required-role="rolename" to <html> element
     */
    function initRBACGuard() {
        const requiredRole = document.documentElement.dataset.requiredRole;
        
        if (!requiredRole) return;

        // Hide page content until auth check completes
        const hideStyle = document.createElement('style');
        hideStyle.id = '__rbac_hide';
        hideStyle.textContent = 'body { visibility: hidden !important; }';
        document.head.appendChild(hideStyle);

        const revealPage = () => {
            const style = document.getElementById('__rbac_hide');
            const initialStyle = document.getElementById('__rbac_hide_initial');
            if (style) style.remove();
            if (initialStyle) initialStyle.remove();
            console.log('[AuthService] Page revealed');
        };

        // Check auth immediately (don't wait for DOMContentLoaded since script loads at end of body)
        const checkAuth = async function() {
            if (typeof auth === 'undefined') {
                console.warn('[AuthService] Firebase auth not available');
                revealPage();
                return;
            }

            console.log('[AuthService] RBAC check starting for role:', requiredRole);

            auth.onAuthStateChanged(async function(user) {
                if (!user) {
                    // Not authenticated
                    console.log('[AuthService] No user authenticated, redirecting to home');
                    sessionStorage.setItem(CONFIG.STORAGE_KEYS.OPEN_LOGIN_MODAL, 'true');
                    AuthService.navigateToHome(true);
                    return;
                }

                console.log('[AuthService] User authenticated:', user.email);

                // Check role
                const userRole = await AuthService.getUserType(user.uid);
                console.log('[AuthService] User role:', userRole, '| Required:', requiredRole);
                
                if (userRole === requiredRole) {
                    // Correct role - reveal page
                    console.log('[AuthService] ✓ Role match! Revealing page');
                    revealPage();
                } else {
                    // Wrong role - redirect
                    console.log('[AuthService] ✗ Role mismatch! Redirecting to correct dashboard');
                    AuthService.navigateToDashboard(userRole, true);
                }
            });
        };

        // Run immediately if DOM is ready, otherwise wait
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkAuth);
        } else {
            checkAuth();
        }
    }

    // Auto-initialize RBAC guard immediately
    initRBACGuard();

    // ========================================================================
    // EXPORTS
    // ========================================================================

    // Expose to global scope
    window.AuthService = AuthService;

    // Backward compatibility aliases
    window.RouteConfig = {
        ROLE_PAGES: CONFIG.ROLE_PAGES,
        PAGES: CONFIG.PAGES,
        getPath: AuthService.resolvePath.bind(AuthService),
        getDashboardPath: AuthService.getDashboardPath.bind(AuthService),
        navigate: AuthService.navigate.bind(AuthService),
        navigateToDashboard: AuthService.navigateToDashboard.bind(AuthService),
        navigateToHome: AuthService.navigateToHome.bind(AuthService),
        isOnCorrectDashboard: AuthService.isOnCorrectDashboard.bind(AuthService)
    };

    console.log('[AuthService] Initialized successfully');

})(window);
