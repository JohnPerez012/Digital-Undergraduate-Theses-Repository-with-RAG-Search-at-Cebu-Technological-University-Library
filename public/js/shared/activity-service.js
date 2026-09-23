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
        [CATEGORIES.SEARCH]: '🔍',
        [CATEGORIES.PROJECT]: '📄',
        [CATEGORIES.BOOKMARK]: '🔖',
        [CATEGORIES.CITATION]: '📜',
        [CATEGORIES.AUTH]: '🔐',
        [CATEGORIES.AI]: '🤖',
        [CATEGORIES.ADMIN]: '⚡',
        [CATEGORIES.SYSTEM]: '⚙️'
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
                const icon = options.icon || DEFAULT_ICONS[category] || '📌';
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

                // 2. Save to Firestore collection `userActivities`
                if (typeof db !== 'undefined' && db && db.collection) {
                    try {
                        await db.collection('userActivities').doc(id).set(activityRecord);
                    } catch (fsErr) {
                        console.warn('[ActivityService] Firestore write failed, using local cache:', fsErr);
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
         * Save activity to localStorage cache
         */
        saveToLocalCache(userId, activity) {
            try {
                const storageKey = `recaps_activities_${userId}`;
                let activities = [];
                try {
                    activities = JSON.parse(localStorage.getItem(storageKey) || '[]');
                } catch (e) {
                    activities = [];
                }

                // Prepend latest item
                activities.unshift({
                    ...activity,
                    createdAt: activity.timestamp // store string for json
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
         * Get local cache activities
         */
        getLocalCache(userId) {
            try {
                const storageKey = `recaps_activities_${userId}`;
                return JSON.parse(localStorage.getItem(storageKey) || '[]');
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
        async getUserActivities(userId, filters = {}) {
            let activities = [];

            // Try Firestore first
            if (typeof db !== 'undefined' && db && db.collection && userId) {
                try {
                    let query = db.collection('userActivities')
                        .where('userId', '==', userId);

                    // Note: Firestore requires composite indexes for multiple where + orderBy
                    // So we fetch by userId and sort in-memory to avoid index errors
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
                    console.warn('[ActivityService] Firestore fetch error, falling back to local cache:', err);
                }
            }

            // Fallback / Merge with Local Cache
            if (activities.length === 0 && userId) {
                activities = this.getLocalCache(userId);
            } else if (userId) {
                // Merge local cache items that may not have synced
                const local = this.getLocalCache(userId);
                const ids = new Set(activities.map(a => a.id));
                local.forEach(item => {
                    if (!ids.has(item.id)) {
                        activities.push(item);
                    }
                });
            }

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

            if (typeof db !== 'undefined' && db && db.collection) {
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
                    console.warn('[ActivityService] Firestore audit query failed:', err);
                }
            }

            // If empty, fall back to current user's local cache
            if (activities.length === 0) {
                const user = this.getCurrentUserContext();
                if (user.uid) {
                    activities = this.getLocalCache(user.uid);
                }
            }

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
