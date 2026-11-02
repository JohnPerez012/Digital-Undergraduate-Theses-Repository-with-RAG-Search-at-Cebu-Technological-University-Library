/**
 * ============================================================================
 * ActivityUI - User's Activity UI Controller for All Roles
 * ============================================================================
 * 
 * Mounts the activity timeline, summary statistics, search/filters, 
 * modal inspection, and data export across Student, Teacher, Librarian, and Admin.
 * 
 * @module ActivityUI
 * @author RE-CAPS Team
 * @version 1.0.0
 */

(function(window) {
    'use strict';

    let currentRole = 'student';
    let currentUserId = null;
    let currentActivities = [];
    let activeModalActivity = null; // Currently inspected activity in modal
    let selectedActivityIds = new Set(); // Multi-selection for bulk actions
    let currentFilteredActivities = []; // Visible filtered items
    let currentFilters = {
        category: 'all',
        dateRange: 'all',
        role: 'all',
        userId: 'all',
        search: ''
    };

    /**
     * Format formal date & time object
     */
    function formatFormalDateTime(timestamp) {
        if (!timestamp) return { date: '—', time: '—' };
        try {
            const d = new Date(timestamp);
            if (isNaN(d.getTime())) return { date: '—', time: '—' };
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            return { date: dateStr, time: timeStr };
        } catch (e) {
            return { date: '—', time: '—' };
        }
    }

    /**
     * Get formal category label
     */
    function getFormalCategoryLabel(category) {
        const map = {
            'search': 'Search',
            'project': 'Project View',
            'bookmark': 'Bookmark',
            'citation': 'Citation',
            'auth': 'Auth & Security',
            'ai': 'AI Assistant',
            'admin': 'Administrative',
            'system': 'System'
        };
        return map[category] || (category ? String(category).toUpperCase() : 'GENERAL');
    }

    /**
     * Mapping of legacy emoji icons to clean vector SVG keys
     */
    const EMOJI_TO_SVG_MAP = {
        '🔍': 'search',
        '🔎': 'search',
        '📄': 'project',
        '📑': 'project',
        '📝': 'project',
        '🔖': 'bookmark',
        '⭐': 'bookmark',
        '📜': 'citation',
        '🖋️': 'citation',
        '🔐': 'auth',
        '🔒': 'auth',
        '🔑': 'auth',
        '🤖': 'ai',
        '⚡': 'admin',
        '👑': 'admin',
        '🛡️': 'admin',
        '⚙️': 'system',
        '⚙': 'system',
        '🛠️': 'system',
        '📌': 'default',
        '📍': 'default',
        '👤': 'user',
        '💻': 'device',
        '💾': 'storage',
        '🗄️': 'storage',
        '🗑️': 'trash',
        '🗑': 'trash',
        '⏳': 'loading',
        '⌛': 'loading',
        '📭': 'empty',
        '📂': 'empty'
    };

    /**
     * Get clean vector SVG markup for any activity item, category, or emoji
     */
    function getActivityIconSvg(input) {
        const registry = window.SVGRegistry;
        let key = '';

        if (input && typeof input === 'object') {
            if (typeof input.icon === 'string' && input.icon.trim().startsWith('<svg')) {
                return input.icon;
            }
            if (input.icon && EMOJI_TO_SVG_MAP[input.icon]) {
                key = EMOJI_TO_SVG_MAP[input.icon];
            } else if (input.category) {
                key = input.category.toLowerCase().trim();
            }
        } else if (typeof input === 'string') {
            const trimmed = input.trim();
            if (trimmed.startsWith('<svg')) {
                return trimmed;
            }
            if (EMOJI_TO_SVG_MAP[trimmed]) {
                key = EMOJI_TO_SVG_MAP[trimmed];
            } else {
                key = trimmed.toLowerCase();
            }
        }

        const registryKey = `activity-${key}`;
        if (registry && typeof registry.get === 'function' && registry.has(registryKey)) {
            return registry.get(registryKey);
        }

        const fallbackIcons = {
            'search': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
            'project': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
            'bookmark': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`,
            'citation': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"></path></svg>`,
            'auth': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
            'ai': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"></path><rect x="4" y="8" width="16" height="12" rx="4"></rect><circle cx="9" cy="13" r="1.5" fill="currentColor"></circle><circle cx="15" cy="13" r="1.5" fill="currentColor"></circle><path d="M9 17h6"></path><path d="M2 14h2"></path><path d="M20 14h2"></path></svg>`,
            'admin': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
            'system': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
            'all': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
            'loading': `<svg class="activity-spin" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
            'empty': `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>`,
            'user': `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
            'device': `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`,
            'storage': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`,
            'trash': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
            'default': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>`
        };

        return fallbackIcons[key] || fallbackIcons['default'];
    }

    /**
     * Format relative time (e.g., '2m ago', '3h ago', 'Yesterday', 'Jan 12')
     */
    function formatRelativeTime(dateString) {
        if (!dateString) return 'Just now';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);

        if (diffSec < 45) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHour < 24) return `${diffHour}h ago`;
        if (diffDay === 1) return 'Yesterday';
        if (diffDay < 7) return `${diffDay}d ago`;

        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    }

    /**
     * Group activities by date bucket
     */
    function groupActivitiesByDate(activities) {
        const groups = {};
        const now = new Date();
        const todayStr = now.toDateString();
        
        const yesterday = new Date();
        yesterday.setDate(now.getDate() - 1);
        const yesterdayStr = yesterday.toDateString();

        activities.forEach(item => {
            const itemDate = new Date(item.timestamp || Date.now());
            const itemDateStr = itemDate.toDateString();

            let groupName = '';
            if (itemDateStr === todayStr) {
                groupName = 'Today';
            } else if (itemDateStr === yesterdayStr) {
                groupName = 'Yesterday';
            } else {
                const diffDays = Math.floor((now - itemDate) / (1000 * 60 * 60 * 24));
                if (diffDays < 7) {
                    groupName = 'This Week';
                } else if (diffDays < 30) {
                    groupName = 'Earlier This Month';
                } else {
                    groupName = itemDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
                }
            }

            if (!groups[groupName]) {
                groups[groupName] = [];
            }
            groups[groupName].push(item);
        });

        return groups;
    }

    /**
     * Calculate summary metrics from activities list
     */
    function calculateMetrics(activities) {
        const total = activities.length;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        let todayCount = 0;
        const categoryCounts = {};
        let latestTime = null;

        activities.forEach(item => {
            const t = new Date(item.timestamp || 0).getTime();
            if (t >= todayStart) {
                todayCount++;
            }
            if (!latestTime || t > latestTime) {
                latestTime = t;
            }
            categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
        });

        let topCategory = 'None';
        let maxCount = 0;
        Object.entries(categoryCounts).forEach(([cat, count]) => {
            if (count > maxCount) {
                maxCount = count;
                topCategory = cat.charAt(0).toUpperCase() + cat.slice(1);
            }
        });

        // Compute exact local storage usage (Bytes, KB, MB) for user's consent & transparency
        let storageFormatted = '0 B';
        let storageBytes = 0;
        const uid = currentUserId || (window.ActivityService && window.ActivityService.getCurrentUserContext().uid) || 'guest';
        if (window.ActivityService && typeof window.ActivityService.getStorageUsage === 'function') {
            const usage = window.ActivityService.getStorageUsage(uid);
            storageFormatted = usage.formatted;
            storageBytes = usage.bytes;
        }

        return {
            total,
            todayCount,
            topCategory,
            lastActive: latestTime ? formatRelativeTime(new Date(latestTime).toISOString()) : 'Never',
            storageFormatted,
            storageBytes
        };
    }

    let isInitialized = false;

    /**
     * Initialize Activity UI on the current page
     */
    async function initActivityUI() {
        const section = document.getElementById('section-activity');
        if (!section) return;

        // Prevent duplicate initialization
        if (isInitialized) return;
        isInitialized = true;

        // Detect current user role
        currentRole = document.documentElement.getAttribute('data-required-role') || 'student';

        // Render main frame structure into section
        renderActivitySkeleton(section);

        // Bind events
        bindActivityEvents(section);

        // Fetch User ID and load initial activities
        if (typeof firebase !== 'undefined' && firebase.auth) {
            firebase.auth().onAuthStateChanged(async (user) => {
                if (user) {
                    currentUserId = user.uid;
                    await refreshActivities();
                } else {
                    currentUserId = sessionStorage.getItem('userId') || 'guest';
                    // Load from local cache without triggering unauthenticated Firestore queries
                    if (window.ActivityService) {
                        currentActivities = window.ActivityService.getLocalCache(currentUserId);
                        renderFilteredTimeline();
                    }
                }
            });
        } else {
            currentUserId = sessionStorage.getItem('userId') || 'guest';
            if (window.ActivityService) {
                currentActivities = window.ActivityService.getLocalCache(currentUserId);
                renderFilteredTimeline();
            }
        }

        // Listen for live activity events
        window.addEventListener('userActivityLogged', () => {
            refreshActivities();
        });

        window.addEventListener('userActivityCleared', () => {
            refreshActivities();
        });

        window.addEventListener('userActivityDeleted', () => {
            refreshActivities();
        });
    }

    /**
     * Render the base container skeleton
     */
    function renderActivitySkeleton(section) {
        const isAdmin = currentRole === 'admin';

        section.innerHTML = `
            <!-- Header -->
            <div class="activity-section-header">
                <div class="activity-header-left">
                    <h2>User's Activity</h2>
                    <p>Track your real-time research history, actions, bookmarks, and system events.</p>
                </div>
                <div class="activity-header-actions">
                    <button class="btn-activity-secondary" id="activity-refresh-btn" title="Refresh Feed">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                        Refresh
                    </button>
                    <div style="position: relative; display: inline-block;">
                        <button class="btn-activity-secondary" id="activity-export-btn">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Export Log
                        </button>
                    </div>
                    <button class="btn-activity-danger" id="activity-clear-btn" title="Clear History and Reclaim Storage">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        Clear History
                    </button>
                </div>
            </div>


            <!-- Summary Stats Cards (Includes Storage Transparent Usage Counter) -->
            <div class="activity-stats-grid" id="activity-stats-container">
                <div class="activity-stat-card">
                    <div class="activity-stat-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    </div>
                    <div class="activity-stat-content">
                        <div class="activity-stat-value" id="stat-total-activities">0</div>
                        <div class="activity-stat-label">Total Activities</div>
                    </div>
                </div>

                <div class="activity-stat-card">
                    <div class="activity-stat-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    </div>
                    <div class="activity-stat-content">
                        <div class="activity-stat-value" id="stat-today-activities">0</div>
                        <div class="activity-stat-label">Actions Today</div>
                    </div>
                </div>

                <div class="activity-stat-card" title="Full structured JSON record stored in browser localStorage (includes action ID, user context, device environment, timestamps, and audit metadata).">
                    <div class="activity-stat-icon">
                        ${getActivityIconSvg('storage')}
                    </div>
                    <div class="activity-stat-content">
                        <div class="activity-stat-value" id="stat-storage-usage">0 B</div>
                        <div class="activity-stat-label">Storage Used</div>
                        <div class="activity-stat-subtext" title="Full JSON record payload in browser local storage">Local Storage Cache</div>
                    </div>
                </div>

                <div class="activity-stat-card">
                    <div class="activity-stat-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    </div>
                    <div class="activity-stat-content">
                        <div class="activity-stat-value" id="stat-top-category">-</div>
                        <div class="activity-stat-label">Top Category</div>
                    </div>
                </div>

                <div class="activity-stat-card">
                    <div class="activity-stat-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <div class="activity-stat-content">
                        <div class="activity-stat-value" id="stat-last-active" style="font-size: 1.3rem;">-</div>
                        <div class="activity-stat-label">Last Active</div>
                    </div>
                </div>
            </div>

            <!-- Controls: Search, Filters & Category Pills -->
            <div class="activity-controls-card">
                <div class="activity-controls-top">
                    <div class="activity-search-box">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <input type="text" class="activity-search-input" id="activity-search-input" placeholder="Search activities, keywords, titles...">
                    </div>

                    <div class="activity-filters-group">
                        <select class="activity-select" id="activity-date-filter">
                            <option value="all">All Time</option>
                            <option value="today">Today</option>
                            <option value="week">Past 7 Days</option>
                            <option value="month">Past 30 Days</option>
                        </select>


                    </div>
                </div>

                <!-- Category Filter Pills -->
                <div class="activity-category-pills">
                    <button class="activity-pill active" data-category="all">${getActivityIconSvg('all')} <span>All Activities</span></button>
                    <button class="activity-pill" data-category="search">${getActivityIconSvg('search')} <span>Searches</span></button>
                    <button class="activity-pill" data-category="project">${getActivityIconSvg('project')} <span>Project Views</span></button>
                    <button class="activity-pill" data-category="bookmark">${getActivityIconSvg('bookmark')} <span>Bookmarks</span></button>
                    <button class="activity-pill" data-category="citation">${getActivityIconSvg('citation')} <span>Citations</span></button>
                    <button class="activity-pill" data-category="auth">${getActivityIconSvg('auth')} <span>Auth & Security</span></button>
                    <button class="activity-pill" data-category="ai">${getActivityIconSvg('ai')} <span>AI Assistant</span></button>
                    <button class="activity-pill" data-category="admin">${getActivityIconSvg('admin')} <span>Administrative</span></button>
                    <button class="activity-pill" data-category="system">${getActivityIconSvg('system')} <span>System</span></button>
                </div>
            </div>

            <!-- Main Timeline Card (Formal Institutional Audit Register) -->
            <div class="activity-timeline-card">
                <div class="activity-timeline-header">
                    <div class="activity-timeline-header-left">
                        <h3 id="activity-feed-title">Activity Register</h3>
                        <span id="activity-count-badge" class="activity-formal-count-badge">0 records</span>
                    </div>

                    <!-- Universal Action Toolbar (Active when 1 or more checkboxes are checked) -->
                    <div class="activity-universal-toolbar" id="activity-universal-toolbar" style="display: none;">
                        <span class="activity-selection-indicator" id="activity-selection-indicator">0 selected</span>
                        <div class="activity-universal-actions">
                            <button type="button" class="btn-formal-action btn-formal-danger" id="activity-bulk-remove-btn" title="Remove selected activities from storage">
                                ${getActivityIconSvg('trash')}
                                <span>Remove Selected</span>
                            </button>
                            <button type="button" class="btn-formal-action btn-formal-neutral" id="activity-bulk-export-btn" title="Export selected activities">
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                <span>Export Selected</span>
                            </button>
                            <button type="button" class="btn-formal-action-link" id="activity-deselect-all-btn">
                                Deselect
                            </button>
                        </div>
                    </div>
                </div>

                <div id="activity-timeline-content">
                    <div class="activity-empty-state">
                        <div class="activity-empty-icon">${getActivityIconSvg('loading')}</div>
                        <h4>Loading Activity Feed...</h4>
                        <p>Fetching your latest actions and history.</p>
                    </div>
                </div>
            </div>

            <!-- Details Modal (Formal Institutional Layout) -->
            <div class="activity-modal" id="activity-details-modal">
                <div class="activity-modal-box">
                    <div class="activity-modal-header">
                        <div class="activity-modal-header-main">
                            <div class="activity-modal-eyebrow" id="modal-activity-eyebrow">
                                <span class="activity-formal-badge" id="modal-category-badge">GENERAL</span>
                                <span class="activity-modal-action-tag" id="modal-action-tag">Activity Record</span>
                            </div>
                            <h3 id="modal-activity-title" class="activity-modal-title">Activity Details</h3>
                        </div>
                        <button class="activity-modal-close" id="modal-close-btn" aria-label="Close">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    <div class="activity-modal-body">
                        <div class="activity-modal-grid" id="modal-activity-details-grid">
                            <!-- Populated dynamically -->
                        </div>
                    </div>
                    <div class="activity-modal-footer">
                        <button type="button" class="btn-formal-action btn-formal-danger" id="modal-delete-btn" style="margin-right: auto;" title="Delete this specific activity record from storage">
                            ${getActivityIconSvg('trash')}
                            <span>Delete Record</span>
                        </button>
                        <button class="btn-formal-action btn-formal-neutral" id="modal-done-btn">Close</button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Bind UI event listeners
     */
    function bindActivityEvents(section) {
        // Refresh button
        const refreshBtn = section.querySelector('#activity-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.style.opacity = '0.5';
                await refreshActivities();
                refreshBtn.style.opacity = '1';
                if (typeof showToast === 'function') {
                    showToast('Activity log refreshed', 'success');
                }
            });
        }

        // Search Input
        const searchInput = section.querySelector('#activity-search-input');
        if (searchInput) {
            let debounceTimer;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    currentFilters.search = e.target.value;
                    renderFilteredTimeline();
                }, 200);
            });
        }

        // Date Range Select
        const dateSelect = section.querySelector('#activity-date-filter');
        if (dateSelect) {
            dateSelect.addEventListener('change', (e) => {
                currentFilters.dateRange = e.target.value;
                renderFilteredTimeline();
            });
        }


        // Category Pills
        const pills = section.querySelectorAll('.activity-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                pills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                currentFilters.category = pill.dataset.category;
                renderFilteredTimeline();
            });
        });


        // Export Log Button
        const exportBtn = section.querySelector('#activity-export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                showExportMenu(exportBtn);
            });
        }

        // Clear History Button
        const clearBtn = section.querySelector('#activity-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                handleClearHistory();
            });
        }

        // Universal Bulk Remove Button
        const bulkRemoveBtn = section.querySelector('#activity-bulk-remove-btn');
        if (bulkRemoveBtn) {
            bulkRemoveBtn.addEventListener('click', async () => {
                const count = selectedActivityIds.size;
                if (count === 0) return;

                let confirmed = false;
                if (window.ModalDialog && typeof window.ModalDialog.confirm === 'function') {
                    confirmed = await ModalDialog.confirm({
                        title: `Remove ${count} Activity ${count === 1 ? 'Record' : 'Records'}?`,
                        message: `Permanently delete ${count} selected activity ${count === 1 ? 'record' : 'records'} from your browser's local storage? This action cannot be undone.`,
                        confirmText: `Remove (${count})`,
                        cancelText: 'Cancel',
                        isDanger: true,
                        icon: 'trash'
                    });
                } else {
                    confirmed = window.confirm(`Permanently remove ${count} selected activity record(s) from storage?`);
                }

                if (!confirmed) return;

                const ids = Array.from(selectedActivityIds);
                if (window.ActivityService && typeof window.ActivityService.deleteActivities === 'function') {
                    await window.ActivityService.deleteActivities(currentUserId, ids);
                } else if (window.ActivityService) {
                    for (const id of ids) {
                        await window.ActivityService.deleteActivity(currentUserId, id);
                    }
                }

                currentActivities = currentActivities.filter(a => !selectedActivityIds.has(a.id));
                selectedActivityIds.clear();
                renderFilteredTimeline();

                if (typeof showToast === 'function') {
                    showToast(`Removed ${count} activity ${count === 1 ? 'record' : 'records'} from storage`, 'success');
                }
            });
        }

        // Universal Bulk Export Button
        const bulkExportBtn = section.querySelector('#activity-bulk-export-btn');
        if (bulkExportBtn) {
            bulkExportBtn.addEventListener('click', async () => {
                const count = selectedActivityIds.size;
                if (count === 0) return;

                const selectedItems = currentActivities.filter(a => selectedActivityIds.has(a.id));
                if (selectedItems.length === 0) return;

                let format = null;
                if (window.ModalDialog && typeof window.ModalDialog.choice === 'function') {
                    format = await ModalDialog.choice({
                        title: 'Export Selected Activities',
                        message: `Exporting ${count} selected records. Select your preferred file format:`,
                        options: [
                            { id: 'csv', label: 'CSV Spreadsheet (.csv)', icon: 'file', desc: 'Compatible with Microsoft Excel, Google Sheets & data analysis' },
                            { id: 'json', label: 'JSON Data Document (.json)', icon: 'code', desc: 'Structured raw data format for archiving or developer backup' }
                        ],
                        cancelText: 'Cancel'
                    });
                } else {
                    format = 'csv';
                }

                if (!format) return;

                const success = window.ActivityService.exportActivities(selectedItems, format);
                if (success && typeof showToast === 'function') {
                    showToast(`Exported ${count} selected activities as ${format.toUpperCase()}`, 'success');
                }
            });
        }

        // Universal Deselect All Button
        const deselectBtn = section.querySelector('#activity-deselect-all-btn');
        if (deselectBtn) {
            deselectBtn.addEventListener('click', () => {
                selectedActivityIds.clear();
                updateSelectionUI();
            });
        }

        // Modal handlers
        const modal = section.querySelector('#activity-details-modal');
        const modalCloseBtn = section.querySelector('#modal-close-btn');
        const modalDoneBtn = section.querySelector('#modal-done-btn');
        const modalDeleteBtn = section.querySelector('#modal-delete-btn');

        const closeModal = () => {
            if (modal) modal.classList.remove('active');
            activeModalActivity = null;
        };

        if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
        if (modalDoneBtn) modalDoneBtn.addEventListener('click', closeModal);
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
        }

        // Delete single activity directly from inside modal
        if (modalDeleteBtn) {
            modalDeleteBtn.addEventListener('click', async () => {
                if (!activeModalActivity) return;
                const actId = activeModalActivity.id;
                const titleSnippet = activeModalActivity.title || 'this activity record';

                const confirmed = await ModalDialog.confirm({
                        title: 'Delete Activity Record?',
                        message: `Are you sure you want to delete "${titleSnippet}" from your browser's local storage?`,
                        confirmText: 'Delete Record',
                        cancelText: 'Keep Record',
                        isDanger: true,
                        icon: 'trash'
                    });

                if (confirmed) {
                    closeModal();
                    await window.ActivityService.deleteActivity(currentUserId, actId);
                    currentActivities = currentActivities.filter(a => a.id !== actId);
                    renderFilteredTimeline();
                    if (typeof showToast === 'function') {
                        showToast('Activity record deleted from storage', 'success');
                    }
                }
            });
        }
    }

    /**
     * Show Export Format Selection Menu
     */
    async function showExportMenu(btn) {
        if (!currentActivities || currentActivities.length === 0) {
            if (typeof showToast === 'function') {
                showToast('No activities available to export', 'warning');
            }
            return;
        }

        let format = null;
        if (window.ModalDialog) {
            format = await ModalDialog.choice({
                title: 'Export Activity Log',
                message: `Exporting ${currentActivities.length} recorded events. Select your preferred file format:`,
                options: [
                    { id: 'csv', label: 'CSV Spreadsheet (.csv)', icon: 'file', desc: 'Compatible with Microsoft Excel, Google Sheets & data analysis' },
                    { id: 'json', label: 'JSON Data Document (.json)', icon: 'code', desc: 'Structured raw data format for archiving or developer backup' }
                ],
                cancelText: 'Cancel'
            });
        } else {
            format = 'csv'; // Safe default if ModalDialog not available
        }

        if (!format) return;
        
        const success = window.ActivityService.exportActivities(currentActivities, format);
        if (success && typeof showToast === 'function') {
            showToast(`Exported ${currentActivities.length} activities as ${format.toUpperCase()}`, 'success');
        }
    }

    /**
     * Handle Clear History with storage usage transparency
     */
    async function handleClearHistory() {
        if (!currentUserId) return;

        if (!currentActivities || currentActivities.length === 0) {
            if (typeof showToast === 'function') {
                showToast('No activity history to clear', 'info');
            }
            return;
        }

        const usage = window.ActivityService.getStorageUsage(currentUserId);
        const count = currentActivities.length;

        const title = 'Clear All Activity History?';
        const msg = `Are you sure you want to delete all your activity history?\n\n` +
          `• Events to remove: ${count}\n` +
          `• Storage to reclaim: ${usage.formatted}\n\n` +
          `This will purge your activity data from browser local storage. This action cannot be undone.`;

        const confirmed = await ModalDialog.confirm({
            title,
            message: msg,
            confirmText: 'Clear All Data',
            cancelText: 'Cancel',
            isDanger: true,
            icon: 'trash'
        });

        if (confirmed) {
            await window.ActivityService.clearUserActivities(currentUserId);
            currentActivities = [];
            renderFilteredTimeline();
            if (typeof showToast === 'function') {
                showToast(`Cleared all activity records (${usage.formatted} storage reclaimed)`, 'success');
            }
        }
    }

    let isRefreshing = false;

    /**
     * Refresh activities from Service
     */
    async function refreshActivities() {
        if (isRefreshing) return;
        isRefreshing = true;

        try {
            currentActivities = await window.ActivityService.getUserActivities(currentUserId);
            renderFilteredTimeline();
        } catch (error) {
            console.error('[ActivityUI] Error fetching activities:', error);
        } finally {
            isRefreshing = false;
        }
    }

    /**
     * Update Universal Action Toolbar and selection visual states
     */
    function updateSelectionUI() {
        const toolbar = document.getElementById('activity-universal-toolbar');
        const indicator = document.getElementById('activity-selection-indicator');
        const selectAllBox = document.getElementById('activity-select-all');

        const count = selectedActivityIds.size;
        const visibleCount = currentFilteredActivities.length;

        if (toolbar) {
            toolbar.style.display = count > 0 ? 'inline-flex' : 'none';
        }

        if (indicator) {
            indicator.textContent = `${count} selected`;
        }

        if (selectAllBox) {
            if (visibleCount > 0 && count === visibleCount) {
                selectAllBox.checked = true;
                selectAllBox.indeterminate = false;
            } else if (count > 0 && count < visibleCount) {
                selectAllBox.checked = false;
                selectAllBox.indeterminate = true;
            } else {
                selectAllBox.checked = false;
                selectAllBox.indeterminate = false;
            }
        }

        document.querySelectorAll('.activity-formal-row').forEach(row => {
            const id = row.getAttribute('data-activity-id');
            const isChecked = selectedActivityIds.has(id);
            row.classList.toggle('is-selected', isChecked);
            const cb = row.querySelector('.activity-row-checkbox');
            if (cb) cb.checked = isChecked;
        });
    }

    /**
     * Render the formal activity register table according to current filters
     */
    function renderFilteredTimeline() {
        const container = document.getElementById('activity-timeline-content');
        const countBadge = document.getElementById('activity-count-badge');
        if (!container) return;

        // Ensure currentActivities is strictly deduplicated by ID
        const seen = new Set();
        currentActivities = (currentActivities || []).filter(item => {
            if (!item || !item.id) return false;
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });

        // Apply filters
        const filtered = window.ActivityService.filterActivities(currentActivities, currentFilters);
        currentFilteredActivities = filtered;

        // Prune any selected IDs that no longer exist
        const validIds = new Set(currentActivities.map(a => a.id));
        selectedActivityIds = new Set(Array.from(selectedActivityIds).filter(id => validIds.has(id)));

        // Update stats
        const metrics = calculateMetrics(currentActivities);
        const totalEl = document.getElementById('stat-total-activities');
        const todayEl = document.getElementById('stat-today-activities');
        const storageEl = document.getElementById('stat-storage-usage');
        const topEl = document.getElementById('stat-top-category');
        const lastEl = document.getElementById('stat-last-active');

        if (totalEl) totalEl.textContent = metrics.total;
        if (todayEl) todayEl.textContent = metrics.todayCount;
        if (storageEl) storageEl.textContent = metrics.storageFormatted;
        if (topEl) topEl.textContent = metrics.topCategory;
        if (lastEl) lastEl.textContent = metrics.lastActive;
        if (countBadge) countBadge.textContent = `${filtered.length} ${filtered.length === 1 ? 'record' : 'records'}`;

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="activity-empty-state">
                    <div class="activity-empty-icon">${getActivityIconSvg('empty')}</div>
                    <h4>No Activities Found</h4>
                    <p>No activity records match your active filters. Try searching for something else or performing an action in the portal.</p>
                </div>
            `;
            updateSelectionUI();
            return;
        }

        // Group by Date for formal section divisions
        const grouped = groupActivitiesByDate(filtered);
        let html = `
            <div class="activity-formal-table">
                <div class="activity-formal-thead">
                    <div class="activity-formal-th col-select">
                        <label class="activity-checkbox-container" title="Select all filtered records">
                            <input type="checkbox" id="activity-select-all" class="activity-formal-checkbox" aria-label="Select all activities">
                        </label>
                    </div>
                    <div class="activity-formal-th col-portion">Activity Record</div>
                    <div class="activity-formal-th col-badge">Category</div>
                    <div class="activity-formal-th col-datetime">Date &amp; Time</div>
                </div>
                <div class="activity-formal-tbody">
        `;

        Object.entries(grouped).forEach(([dateGroup, items]) => {
            html += `
                <div class="activity-formal-date-divider">
                    <span>${escapeHtml(dateGroup)}</span>
                </div>
            `;

            items.forEach(item => {
                const isSelected = selectedActivityIds.has(item.id);
                const dateTimeInfo = formatFormalDateTime(item.timestamp);
                const categoryLabel = getFormalCategoryLabel(item.category);

                let actionLink = '';
                if (item.category === 'project' && item.metadata && item.metadata.projectId) {
                    actionLink = `<a href="../index.html" class="activity-item-action-link" data-project-id="${escapeHtml(item.metadata.projectId)}">View Manuscript →</a>`;
                }

                html += `
                    <div class="activity-formal-row ${isSelected ? 'is-selected' : ''}" data-activity-id="${escapeHtml(item.id)}">
                        <!-- Col 0: Checkbox for selection -->
                        <div class="activity-formal-col col-select">
                            <label class="activity-checkbox-container" title="Select record">
                                <input type="checkbox" class="activity-formal-checkbox activity-row-checkbox" data-id="${escapeHtml(item.id)}" ${isSelected ? 'checked' : ''} aria-label="Select ${escapeHtml(item.title)}">
                            </label>
                        </div>

                        <!-- Col 1: Activity item, JUST THE PORTION -->
                        <div class="activity-formal-col col-portion">
                            <div class="activity-portion-title">${escapeHtml(item.title)}</div>
                            ${item.details ? `<div class="activity-portion-desc">${escapeHtml(item.details)}</div>` : ''}
                            ${actionLink ? `<div class="activity-portion-link">${actionLink}</div>` : ''}
                        </div>

                        <!-- Col 2: Activity badge (Monochrome: NO COLOR, just normal light & dark) -->
                        <div class="activity-formal-col col-badge">
                            <span class="activity-formal-badge">${escapeHtml(categoryLabel)}</span>
                        </div>

                        <!-- Col 3: Date and time -->
                        <div class="activity-formal-col col-datetime">
                            <span class="activity-datetime-date">${escapeHtml(dateTimeInfo.date)}</span>
                            <span class="activity-datetime-time">${escapeHtml(dateTimeInfo.time)}</span>
                        </div>
                    </div>
                `;
            });
        });

        html += `
                </div>
            </div>
        `;

        container.innerHTML = html;

        // Select All Checkbox Listener
        const selectAllBox = container.querySelector('#activity-select-all');
        if (selectAllBox) {
            selectAllBox.addEventListener('change', (e) => {
                const checked = e.target.checked;
                filtered.forEach(item => {
                    if (item && item.id) {
                        if (checked) {
                            selectedActivityIds.add(item.id);
                        } else {
                            selectedActivityIds.delete(item.id);
                        }
                    }
                });
                updateSelectionUI();
            });
        }

        // Row Checkboxes
        container.querySelectorAll('.activity-row-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                const id = cb.getAttribute('data-id');
                if (!id) return;
                if (cb.checked) {
                    selectedActivityIds.add(id);
                } else {
                    selectedActivityIds.delete(id);
                }
                updateSelectionUI();
            });
            cb.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });

        // Row Click: Opens Formal Inspection Modal (except when clicking checkbox or link)
        container.querySelectorAll('.activity-formal-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.activity-formal-col.col-select') || e.target.closest('.activity-portion-link') || e.target.closest('input')) {
                    return;
                }

                const actId = row.getAttribute('data-activity-id');
                const activity = currentActivities.find(a => a.id === actId);
                if (activity) {
                    openActivityDetailsModal(activity);
                }
            });
        });

        // Synchronize selection toolbar state
        updateSelectionUI();
    }

    /**
     * Open Activity Details Modal
     */
    function openActivityDetailsModal(activity) {
        activeModalActivity = activity;
        const modal = document.getElementById('activity-details-modal');
        const titleEl = document.getElementById('modal-activity-title');
        const badgeEl = document.getElementById('modal-category-badge');
        const actionEl = document.getElementById('modal-action-tag');
        const grid = document.getElementById('modal-activity-details-grid');
        const modalBody = modal ? modal.querySelector('.activity-modal-body') : null;
        if (!modal || !grid) return;

        // Reset scroll position to top whenever modal opens to guarantee uniform gap
        if (modalBody) {
            modalBody.scrollTop = 0;
        }

        const categoryLabel = getFormalCategoryLabel(activity.category);
        if (badgeEl) badgeEl.textContent = categoryLabel;
        if (actionEl) actionEl.textContent = activity.action ? activity.action.replace(/_/g, ' ') : 'Record';

        if (titleEl) {
            titleEl.textContent = activity.title || 'Activity Record';
            titleEl.title = activity.title || '';
        }

        const exactTime = activity.timestamp ? new Date(activity.timestamp).toLocaleString(undefined, {
            dateStyle: 'full',
            timeStyle: 'medium'
        }) : 'Unknown';

        let itemStorageFormatted = '0 B';
        try {
            const raw = JSON.stringify(activity);
            const bytes = new Blob([raw]).size;
            itemStorageFormatted = window.ActivityService ? window.ActivityService.formatBytes(bytes) : `${bytes} B`;
        } catch (e) {}

        grid.innerHTML = `
            <div class="activity-modal-field activity-modal-title-field">
                <div class="activity-modal-field-label">Full Activity Title &amp; Record</div>
                <div class="activity-modal-field-val activity-modal-full-title">${escapeHtml(activity.title || 'Activity Record')}</div>
            </div>

            <div class="activity-modal-field">
                <div class="activity-modal-field-label">Action &amp; Event Type</div>
                <div class="activity-modal-field-val">${escapeHtml(activity.action || 'activity')} (${escapeHtml(activity.category || 'system')})</div>
            </div>

            <div class="activity-modal-field">
                <div class="activity-modal-field-label">Exact Timestamp</div>
                <div class="activity-modal-field-val">${exactTime}</div>
            </div>

            <div class="activity-modal-field">
                <div class="activity-modal-field-label">Local Storage Footprint</div>
                <div class="activity-modal-field-val" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                    <span>~${itemStorageFormatted} stored in browser cache</span>
                    <span style="font-size: 0.75rem; color: var(--text-secondary);">(Full JSON record: unique ID, timestamps, user context, device environment & metadata)</span>
                </div>
            </div>

            <div class="activity-modal-field">
                <div class="activity-modal-field-label">Description & Details</div>
                <div class="activity-modal-field-val">${escapeHtml(activity.details || 'No additional details recorded.')}</div>
            </div>

            ${activity.metadata && activity.metadata.isAdminAction ? `
                <div class="activity-modal-field" style="border-left: 3px solid #6366f1; padding-left: 0.75rem;">
                    <div class="activity-modal-field-label" style="color: #6366f1; font-weight: 600;">Administrative Authority</div>
                    <div class="activity-modal-field-val">
                        Action enforced by <strong>${escapeHtml(activity.metadata.adminActorName || 'Administrator')}</strong>
                        (${escapeHtml(activity.metadata.adminActorEmail || 'admin')}) [Role: ${escapeHtml(activity.metadata.adminActorRole || 'admin')}]
                    </div>
                </div>
            ` : ''}

            <div class="activity-modal-field">
                <div class="activity-modal-field-label">User Context</div>
                <div class="activity-modal-field-val">${escapeHtml(activity.userName || 'User')} &lt;${escapeHtml(activity.userEmail || 'N/A')}&gt; [${escapeHtml(activity.userRole || 'student')}]</div>
            </div>

            <div class="activity-modal-field">
                <div class="activity-modal-field-label">Device & Environment</div>
                <div class="activity-modal-field-val">${escapeHtml(activity.device || 'Web Browser')}</div>
            </div>

            ${activity.metadata && Object.keys(activity.metadata).length > 0 ? `
                <div class="activity-modal-field">
                    <div class="activity-modal-field-label">Metadata Parameters</div>
                    <div class="activity-modal-field-val" style="font-family: monospace; font-size: 0.85rem; white-space: pre-wrap; background: var(--surface); padding: 0.5rem; border-radius: 6px;">
                        ${escapeHtml(JSON.stringify(activity.metadata, null, 2))}
                    </div>
                </div>
            ` : ''}
        `;

        modal.classList.add('active');
    }

    function escapeHtml(text) {
        return String(text || '').replace(/[&<>"']/g, match => {
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
            return map[match] || match;
        });
    }

    // Auto initialize on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        initActivityUI();
    });

    window.ActivityUI = {
        init: initActivityUI,
        refresh: refreshActivities
    };

})(window);
