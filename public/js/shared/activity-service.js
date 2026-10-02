/**
 * ============================================================================
 * ActivityService - User's Activity Logging & Management System
 * ============================================================================
 * 
 * Provides unified activity logging, offline caching, real-time sync, 
 * administrative audit log retrieval, and data export across ALL roles.
 * 
 * @module ActivityService
 * @author RE-CAPS Team
 * @version 1.0.0
 */

(function(window) {
    'use strict';

    // Activity Categories & Icons
    const CATEGORIES = {
        SEARCH: 'search',
        PROJECT: 'project',
        BOOKMARK: 'bookmark',
        CITATION: 'citation',
        AUTH: 'auth',
        AI: 'ai',
        ADMIN: 'admin',
        SYSTEM: 'system'
    };

    const DEFAULT_ICONS = {
        [CATEGORIES.SEARCH]: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
        [CATEGORIES.PROJECT]: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
        [CATEGORIES.BOOKMARK]: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`,
        [CATEGORIES.CITATION]: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"></path></svg>`,
        [CATEGORIES.AUTH]: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
        [CATEGORIES.AI]: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"></path><rect x="4" y="8" width="16" height="12" rx="4"></rect><circle cx="9" cy="13" r="1.5" fill="currentColor"></circle><circle cx="15" cy="13" r="1.5" fill="currentColor"></circle><path d="M9 17h6"></path><path d="M2 14h2"></path><path d="M20 14h2"></path></svg>`,
        [CATEGORIES.ADMIN]: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
        [CATEGORIES.SYSTEM]: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`
    };

    const CATEGORY_COLORS = {
        [CATEGORIES.SEARCH]: '#3b82f6',
        [CATEGORIES.PROJECT]: '#8b5cf6',
        [CATEGORIES.BOOKMARK]: '#f59e0b',
        [CATEGORIES.CITATION]: '#10b981',
        [CATEGORIES.AUTH]: '#ef4444',
        [CATEGORIES.AI]: '#ec4899',
        [CATEGORIES.ADMIN]: '#6366f1',
        [CATEGORIES.SYSTEM]: '#6b7280'
    };

    const ActivityService = {
        CATEGORIES,
        DEFAULT_ICONS,
        CATEGORY_COLORS,

        /**
         * Get active user details from Auth or Session
         */
        getCurrentUserContext() {
            let uid = null;
            let email = null;
            let name = null;
            let role = null;

            if (typeof auth !== 'undefined' && auth.currentUser) {
                uid = auth.currentUser.uid;
                email = auth.currentUser.email;
                name = auth.currentUser.displayName || (email ? email.split('@')[0] : 'User');
            } else if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
                const user = firebase.auth().currentUser;
                uid = user.uid;
                email = user.email;
                name = user.displayName || (email ? email.split('@')[0] : 'User');
            }

            // Fallback to sessionStorage / localStorage
            if (!uid) {
                uid = sessionStorage.getItem('userId') || localStorage.getItem('userId');
            }
            if (!email) {
                email = sessionStorage.getItem('userEmail') || localStorage.getItem('userEmail');
            }
            if (!name) {
                name = sessionStorage.getItem('userName') || localStorage.getItem('userName') || (email ? email.split('@')[0] : 'User');
            }
            if (!role) {
                role = sessionStorage.getItem('userType') || localStorage.getItem('userType') || document.documentElement.getAttribute('data-required-role') || 'student';
            }

            return { uid, email, name, role };
        },

        /**
         * Generate a unique activity ID
         */
        generateId() {
            return 'act_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        },

        /**
         * Get user's device & browser summary
         */
        getDeviceContext() {
            const ua = navigator.userAgent;
            let browser = 'Browser';
            if (ua.includes('Firefox')) browser = 'Firefox';
            else if (ua.includes('Edg')) browser = 'Edge';
            else if (ua.includes('Chrome')) browser = 'Chrome';
            else if (ua.includes('Safari')) browser = 'Safari';

            let platform = 'Desktop';
            if (/Mobi|Android|iPhone|iPad/i.test(ua)) platform = 'Mobile';

            return `${browser} on ${platform}`;
        },

        /**
         * Main logging method
         * @param {Object} options - Activity configuration
         */
        async log(options) {
            try {
                const user = this.getCurrentUserContext();
                if (!user.uid && !options.userId) {
                    // Cache temporary guest activity or ignore
                    console.debug('[ActivityService] No user session found for activity log.');
                }

                const userId = options.userId || user.uid || 'guest';
                const userEmail = options.userEmail || user.email || 'guest@recaps.edu';
                const userName = options.userName || user.name || 'User';
                const userRole = options.userRole || user.role || 'student';
                const category = options.category || CATEGORIES.SYSTEM;
                const icon = options.icon || DEFAULT_ICONS[category] || DEFAULT_ICONS[CATEGORIES.SYSTEM];
                const timestamp = options.timestamp || new Date().toISOString();
                const id = options.id || this.generateId();

                const activityRecord = {
                    id,
                    userId,
                    userEmail,
                    userName,
                    userRole,
                    category,
                    action: options.action || 'activity',
                    title: options.title || 'User Action',
                    details: options.details || '',
                    icon,
                    metadata: options.metadata || {},
                    device: this.getDeviceContext(),
                    timestamp,
                    createdAt: (typeof firebase !== 'undefined' && firebase.firestore) 
                        ? firebase.firestore.FieldValue.serverTimestamp() 
                        : timestamp
                };

                // 1. Save to Local Storage Cache
                this.saveToLocalCache(userId, activityRecord);

                // 2. Save to Firestore collection `userActivities` (only if authenticated)
                const authUser = (typeof auth !== 'undefined' && auth && auth.currentUser) ||
                                 (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser);
                if (typeof db !== 'undefined' && db && db.collection && userId !== 'guest' && authUser) {
                    try {
                        await db.collection('userActivities').doc(id).set(activityRecord);
                    } catch (fsErr) {
                        console.debug('[ActivityService] Firestore write fallback to local cache:', fsErr);
                    }
                }

                // 3. Dispatch Custom Event for instant UI reactivity
                window.dispatchEvent(new CustomEvent('userActivityLogged', {
                    detail: activityRecord
                }));

                return activityRecord;
            } catch (error) {
                console.error('[ActivityService] Failed to log activity:', error);
                return null;
            }
        },

        /**
         * Save activity to localStorage cache with duplicate prevention
         */
        saveToLocalCache(userId, activity) {
            try {
                if (!userId || !activity) return;
                const storageKey = `recaps_activities_${userId}`;
                let activities = [];
                try {
                    activities = JSON.parse(localStorage.getItem(storageKey) || '[]');
                    if (!Array.isArray(activities)) activities = [];
                } catch (e) {
                    activities = [];
                }

                // Remove any existing entry with the same ID
                if (activity.id) {
                    activities = activities.filter(a => a.id !== activity.id);
                }

                // Prevent rapid duplicate logging of identical action within 3 seconds
                const now = new Date(activity.timestamp || Date.now()).getTime();
                const isRapidDuplicate = activities.slice(0, 5).some(a => {
                    const aTime = new Date(a.timestamp || 0).getTime();
                    return a.action === activity.action &&
                           a.details === activity.details &&
                           Math.abs(now - aTime) < 3000;
                });

                if (isRapidDuplicate) {
                    return;
                }

                // Prepend latest item
                activities.unshift({
                    ...activity,
                    createdAt: activity.timestamp // store string for json
                });

                // Deduplicate full list by ID
                const seen = new Set();
                activities = activities.filter(item => {
                    if (!item || !item.id) return false;
                    if (seen.has(item.id)) return false;
                    seen.add(item.id);
                    return true;
                });

                // Keep max 200 items in local buffer
                if (activities.length > 200) {
                    activities = activities.slice(0, 200);
                }

                localStorage.setItem(storageKey, JSON.stringify(activities));
            } catch (e) {
                console.warn('[ActivityService] localStorage cache save error:', e);
            }
        },

        /**
         * Get local cache activities (guaranteed deduplicated)
         */
        getLocalCache(userId) {
            try {
                if (!userId) return [];
                const storageKey = `recaps_activities_${userId}`;
                const raw = JSON.parse(localStorage.getItem(storageKey) || '[]');
                if (!Array.isArray(raw)) return [];

                // Deduplicate by ID
                const seen = new Set();
                return raw.filter(item => {
                    if (!item || !item.id) return false;
                    if (seen.has(item.id)) return false;
                    seen.add(item.id);
                    return true;
                });
            } catch (e) {
                return [];
            }
        },

        // ====================================================================
        // CONVENIENCE LOGGING HELPERS
        // ====================================================================

        /**
         * Log Search Query
         */
        logSearch(query, resultCount = 0, isAI = false) {
            if (!query || !query.trim()) return;
            const cleanQuery = query.trim();
            return this.log({
                category: CATEGORIES.SEARCH,
                action: 'search_performed',
                title: isAI ? `AI Semantic Search: "${cleanQuery}"` : `Searched: "${cleanQuery}"`,
                details: `Retrieved ${resultCount} matching capstone ${resultCount === 1 ? 'project' : 'projects'}.`,
                metadata: { query: cleanQuery, resultCount, isAI }
            });
        },

        /**
         * Log Project View
         */
        logViewProject(projectId, projectTitle, authors = '', program = '') {
            if (!projectTitle) return;
            return this.log({
                category: CATEGORIES.PROJECT,
                action: 'project_viewed',
                title: `Viewed Project: ${projectTitle}`,
                details: [program, authors].filter(Boolean).join(' • ') || 'Explored capstone thesis details.',
                metadata: { projectId, projectTitle, authors, program }
            });
        },

        /**
         * Log Project Bookmark / Save
         */
        logBookmark(projectId, projectTitle, action = 'saved') {
            if (!projectTitle) return;
            const isSave = action === 'saved' || action === 'add';
            return this.log({
                category: CATEGORIES.BOOKMARK,
                action: isSave ? 'project_saved' : 'project_unsaved',
                title: isSave ? `Saved Project: ${projectTitle}` : `Removed from Saved: ${projectTitle}`,
                details: isSave ? 'Added thesis to personal saved collection.' : 'Removed thesis from saved collection.',
                metadata: { projectId, projectTitle, action: isSave ? 'saved' : 'removed' }
            });
        },

        /**
         * Log Citation Generation / Copy
         */
        logCitation(format, projectTitle) {
            const formatUpper = (format || 'APA').toUpperCase();
            return this.log({
                category: CATEGORIES.CITATION,
                action: 'citation_generated',
                title: `Generated ${formatUpper} Citation`,
                details: projectTitle ? `Citation created for "${projectTitle}".` : `Generated academic citation.`,
                metadata: { format: formatUpper, projectTitle }
            });
        },

        /**
         * Log Auth events (Login, Logout, Password Change)
         */
        logAuth(actionType, details = '') {
            let title = 'Authentication Event';
            let act = 'auth_event';

            if (actionType === 'login') {
                title = 'Account Logged In';
                act = 'user_login';
                details = details || 'Successfully signed into RE-CAPS portal.';
            } else if (actionType === 'logout') {
                title = 'Account Logged Out';
                act = 'user_logout';
                details = details || 'User signed out from current session.';
            } else if (actionType === 'password_change') {
                title = 'Security: Password Changed';
                act = 'password_updated';
                details = details || 'User security credentials were updated.';
            }

            return this.log({
                category: CATEGORIES.AUTH,
                action: act,
                title,
                details,
                metadata: { actionType }
            });
        },

        /**
         * Log AI Assistant conversation
         */
        logAIChat(querySnippet) {
            if (!querySnippet) return;
            const preview = querySnippet.length > 60 ? querySnippet.substring(0, 60) + '...' : querySnippet;
            return this.log({
                category: CATEGORIES.AI,
                action: 'ai_query',
                title: `Consulted AI Research Assistant`,
                details: `Prompt: "${preview}"`,
                metadata: { querySnippet }
            });
        },

        /**
         * Log Admin action (Approval, User update, Role change, Project creation/deletion)
         */
        logAdmin(actionName, targetName, details = '', metadata = {}) {
            return this.log({
                category: CATEGORIES.ADMIN,
                action: 'admin_action',
                title: `${actionName}: ${targetName}`,
                details: details || `Administrative operation performed on ${targetName}.`,
                metadata: { actionName, targetName, ...metadata }
            });
        },

        /**
         * Log System / Preference adjustment
         */
        logSetting(settingName, value) {
            return this.log({
                category: CATEGORIES.SYSTEM,
                action: 'setting_changed',
                title: `Updated Setting: ${settingName}`,
                details: `Changed ${settingName} value to "${value}".`,
                metadata: { settingName, value }
            });
        },

        /**
         * Log Feedback
         */
        logFeedback(subject, rating = null) {
            return this.log({
                category: CATEGORIES.SYSTEM,
                action: 'feedback_submitted',
                title: `Submitted System Feedback: ${subject}`,
                details: rating ? `Rated ${rating}/5 stars.` : 'User feedback sent to library team.',
                metadata: { subject, rating }
            });
        },

        // ====================================================================
        // RETRIEVAL & QUERYING
        // ====================================================================

        /**
         * Fetch activities for a specific user
         * @param {string} userId - User UID
         * @param {Object} filters - { category, dateRange, search }
         * @returns {Promise<Array>} List of activities
         */
        /**
         * Fetch activities for a specific user
         * @param {string} userId - User UID
         * @param {Object} filters - { category, dateRange, search }
         * @returns {Promise<Array>} List of activities
         */
        async getUserActivities(userId, filters = {}) {
            let activities = [];

            // Check if user is currently authenticated with Firebase
            const authUser = (typeof auth !== 'undefined' && auth && auth.currentUser) ||
                             (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser);

            // Only attempt Firestore query if user is actively authenticated and not guest
            if (typeof db !== 'undefined' && db && db.collection && userId && userId !== 'guest' && authUser) {
                try {
                    const query = db.collection('userActivities')
                        .where('userId', '==', userId);

                    // Fetch by userId and sort in-memory to avoid index errors
                    const snapshot = await query.limit(150).get();
                    
                    if (!snapshot.empty) {
                        activities = snapshot.docs.map(doc => {
                            const data = doc.data();
                            return {
                                id: doc.id,
                                ...data,
                                timestamp: (data.createdAt && typeof data.createdAt.toDate === 'function')
                                    ? data.createdAt.toDate().toISOString()
                                    : (data.timestamp || new Date().toISOString())
                            };
                        });
                    }
                } catch (err) {
                    if (err && (err.code === 'permission-denied' || String(err).includes('permissions'))) {
                        console.debug('[ActivityService] Firestore permissions restricted, using local cache fallback.');
                    } else {
                        console.warn('[ActivityService] Firestore fetch error, falling back to local cache:', err);
                    }
                }
            }

            // Fallback / Merge with Local Cache with strict deduplication
            const seen = new Set();
            const merged = [];

            activities.forEach(item => {
                if (item && item.id && !seen.has(item.id)) {
                    seen.add(item.id);
                    merged.push(item);
                }
            });

            if (userId) {
                const local = this.getLocalCache(userId);
                local.forEach(item => {
                    if (item && item.id && !seen.has(item.id)) {
                        seen.add(item.id);
                        merged.push(item);
                    }
                });
            }

            activities = merged;

            // Sort descending by timestamp
            activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            // Apply in-memory filters
            return this.filterActivities(activities, filters);
        },

        /**
         * Admin Audit Query: Fetch all activities across all users
         */
        async getAllActivities(filters = {}) {
            let activities = [];

            const authUser = (typeof auth !== 'undefined' && auth && auth.currentUser) ||
                             (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser);

            if (typeof db !== 'undefined' && db && db.collection && authUser) {
                try {
                    const snapshot = await db.collection('userActivities')
                        .limit(300)
                        .get();

                    if (!snapshot.empty) {
                        activities = snapshot.docs.map(doc => {
                            const data = doc.data();
                            return {
                                id: doc.id,
                                ...data,
                                timestamp: (data.createdAt && typeof data.createdAt.toDate === 'function')
                                    ? data.createdAt.toDate().toISOString()
                                    : (data.timestamp || new Date().toISOString())
                            };
                        });
                    }
                } catch (err) {
                    if (err && (err.code === 'permission-denied' || String(err).includes('permissions'))) {
                        console.debug('[ActivityService] Firestore audit permissions restricted, using local cache.');
                    } else {
                        console.warn('[ActivityService] Firestore audit query failed:', err);
                    }
                }
            }

            // If empty, fall back to current user's local cache
            if (activities.length === 0) {
                const user = this.getCurrentUserContext();
                if (user.uid) {
                    activities = this.getLocalCache(user.uid);
                }
            }

            // Strict deduplication
            const seen = new Set();
            activities = activities.filter(item => {
                if (!item || !item.id) return false;
                if (seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
            });

            // Sort descending
            activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            return this.filterActivities(activities, filters);
        },

        /**
         * Filter activities array
         */
        filterActivities(activities, filters = {}) {
            let filtered = [...activities];

            // 1. Category Filter
            if (filters.category && filters.category !== 'all') {
                filtered = filtered.filter(item => item.category === filters.category);
            }

            // 2. Role Filter (for Admin Audit view)
            if (filters.role && filters.role !== 'all') {
                filtered = filtered.filter(item => item.userRole === filters.role);
            }

            // 3. User Filter (for Admin Audit view)
            if (filters.userId && filters.userId !== 'all') {
                filtered = filtered.filter(item => item.userId === filters.userId);
            }

            // 4. Date Range Filter
            if (filters.dateRange && filters.dateRange !== 'all') {
                const now = new Date();
                let thresholdDate = new Date();

                if (filters.dateRange === 'today') {
                    thresholdDate.setHours(0, 0, 0, 0);
                } else if (filters.dateRange === 'week') {
                    thresholdDate.setDate(now.getDate() - 7);
                } else if (filters.dateRange === 'month') {
                    thresholdDate.setDate(now.getDate() - 30);
                }

                filtered = filtered.filter(item => {
                    const itemDate = new Date(item.timestamp);
                    return itemDate >= thresholdDate;
                });
            }

            // 5. Search text filter
            if (filters.search && filters.search.trim()) {
                const q = filters.search.toLowerCase().trim();
                filtered = filtered.filter(item => 
                    (item.title && item.title.toLowerCase().includes(q)) ||
                    (item.details && item.details.toLowerCase().includes(q)) ||
                    (item.userName && item.userName.toLowerCase().includes(q)) ||
                    (item.userEmail && item.userEmail.toLowerCase().includes(q)) ||
                    (item.category && item.category.toLowerCase().includes(q))
                );
            }

            return filtered;
        },

        /**
         * Calculate local storage usage (Bytes, KB, MB) occupied by user's activity log
         * @param {string} userId - User UID
         * @returns {Object} { bytes, formatted, count }
         */
        getStorageUsage(userId) {
            if (!userId) return { bytes: 0, formatted: '0 B', count: 0 };
            const storageKey = `recaps_activities_${userId}`;
            const raw = localStorage.getItem(storageKey) || '';

            let bytes = 0;
            if (raw) {
                try {
                    // Exact UTF-8 byte size of the storage key and content
                    bytes = new Blob([storageKey + '=' + raw]).size;
                } catch (e) {
                    // Fallback calculation for environments without Blob
                    bytes = (storageKey.length + 1 + raw.length) * 2;
                }
            }

            let count = 0;
            try {
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) count = parsed.length;
                }
            } catch (e) {}

            return {
                bytes,
                formatted: this.formatBytes(bytes),
                count
            };
        },

        /**
         * Format byte sizes into readable units (B, KB, MB)
         * @param {number} bytes
         * @returns {string}
         */
        formatBytes(bytes) {
            if (!bytes || bytes <= 0) return '0 B';
            if (bytes < 1024) return `${bytes} B`;
            const kb = bytes / 1024;
            if (kb < 1024) return `${kb.toFixed(1)} KB`;
            const mb = kb / 1024;
            return `${mb.toFixed(2)} MB`;
        },

        /**
         * Delete a specific activity entry by its unique ID
         * @param {string} userId - User UID
         * @param {string} activityId - Activity record ID
         * @returns {Promise<boolean>}
         */
        async deleteActivity(userId, activityId) {
            if (!userId || !activityId) return false;

            // 1. Remove from LocalStorage
            try {
                const storageKey = `recaps_activities_${userId}`;
                const raw = localStorage.getItem(storageKey);
                if (raw) {
                    let activities = JSON.parse(raw);
                    if (Array.isArray(activities)) {
                        activities = activities.filter(a => a.id !== activityId);
                        localStorage.setItem(storageKey, JSON.stringify(activities));
                    }
                }
            } catch (e) {
                console.warn('[ActivityService] Error removing item from local storage:', e);
            }

            // 2. Remove from Firestore if authenticated
            const authUser = (typeof auth !== 'undefined' && auth && auth.currentUser) ||
                             (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser);
            if (typeof db !== 'undefined' && db && db.collection && userId !== 'guest' && authUser) {
                try {
                    await db.collection('userActivities').doc(activityId).delete();
                } catch (fsErr) {
                    console.debug('[ActivityService] Firestore single doc delete fallback:', fsErr);
                }
            }

            // 3. Dispatch event for UI reactivity
            window.dispatchEvent(new CustomEvent('userActivityDeleted', {
                detail: { userId, activityId }
            }));

            return true;
        },

        /**
         * Clear activities for current user
         */
        async clearUserActivities(userId) {
            if (!userId) return false;

            // 1. Clear LocalStorage
            localStorage.removeItem(`recaps_activities_${userId}`);

            // 2. Clear from Firestore
            if (typeof db !== 'undefined' && db && db.collection) {
                try {
                    const snapshot = await db.collection('userActivities')
                        .where('userId', '==', userId)
                        .get();

                    const batch = db.batch();
                    snapshot.docs.forEach(doc => {
                        batch.delete(doc.ref);
                    });
                    await batch.commit();
                } catch (e) {
                    console.warn('[ActivityService] Batch delete error:', e);
                }
            }

            // Dispatch event
            window.dispatchEvent(new CustomEvent('userActivityCleared', { detail: { userId } }));
            return true;
        },

        /**
         * Export activities to JSON or CSV
         */
        exportActivities(activities, format = 'json') {
            if (!activities || activities.length === 0) {
                return false;
            }

            const fileName = `recaps_activity_log_${new Date().toISOString().split('T')[0]}`;

            if (format === 'json') {
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activities, null, 2));
                const downloadAnchor = document.createElement('a');
                downloadAnchor.setAttribute("href", dataStr);
                downloadAnchor.setAttribute("download", `${fileName}.json`);
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();
                return true;
            } else if (format === 'csv') {
                const headers = ['Timestamp', 'Category', 'Action', 'Title', 'Details', 'User Email', 'Role', 'Device'];
                const rows = activities.map(a => [
                    `"${a.timestamp || ''}"`,
                    `"${a.category || ''}"`,
                    `"${a.action || ''}"`,
                    `"${(a.title || '').replace(/"/g, '""')}"`,
                    `"${(a.details || '').replace(/"/g, '""')}"`,
                    `"${a.userEmail || ''}"`,
                    `"${a.userRole || ''}"`,
                    `"${a.device || ''}"`
                ]);

                const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement('a');
                link.setAttribute('href', encodedUri);
                link.setAttribute('download', `${fileName}.csv`);
                document.body.appendChild(link);
                link.click();
                link.remove();
                return true;
            }

            return false;
        }
    };

    // Expose globally
    window.ActivityService = ActivityService;

})(window);
