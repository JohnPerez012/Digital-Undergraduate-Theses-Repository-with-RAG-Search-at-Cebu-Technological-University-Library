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
    let isAdminAuditMode = false; // For Admin role: 'my' vs 'audit'
    let currentActivities = [];
    let currentFilters = {
        category: 'all',
        dateRange: 'all',
        role: 'all',
        userId: 'all',
        search: ''
    };

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

        return {
            total,
            todayCount,
            topCategory,
            lastActive: latestTime ? formatRelativeTime(new Date(latestTime).toISOString()) : 'Never'
        };
    }

    /**
     * Initialize Activity UI on the current page
     */
    async function initActivityUI() {
        const section = document.getElementById('section-activity');
        if (!section) return;

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
                    await refreshActivities();
                }
            });
        } else {
            currentUserId = sessionStorage.getItem('userId') || 'guest';
            await refreshActivities();
        }

        // Listen for live activity events
        window.addEventListener('userActivityLogged', () => {
            refreshActivities();
        });

        window.addEventListener('userActivityCleared', () => {
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
                    <button class="btn-activity-danger" id="activity-clear-btn" title="Clear History">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        Clear History
                    </button>
                </div>
            </div>

            <!-- Admin Mode Switcher (Admin Only) -->
            ${isAdmin ? `
                <div class="activity-mode-tabs">
                    <button class="activity-mode-tab active" data-mode="my">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        My Personal Activity
                    </button>
                    <button class="activity-mode-tab" data-mode="audit">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                        System Audit Trail (All Users)
                    </button>
                </div>
            ` : ''}

            <!-- Summary Stats Cards -->
            <div class="activity-stats-grid" id="activity-stats-container">
                <div class="activity-stat-card">
                    <div class="activity-stat-icon" style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    </div>
                    <div class="activity-stat-content">
                        <div class="activity-stat-value" id="stat-total-activities">0</div>
                        <div class="activity-stat-label">Total Activities</div>
                    </div>
                </div>

                <div class="activity-stat-card">
                    <div class="activity-stat-icon" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    </div>
                    <div class="activity-stat-content">
                        <div class="activity-stat-value" id="stat-today-activities">0</div>
                        <div class="activity-stat-label">Actions Today</div>
                    </div>
                </div>

                <div class="activity-stat-card">
                    <div class="activity-stat-icon" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    </div>
                    <div class="activity-stat-content">
                        <div class="activity-stat-value" id="stat-top-category">-</div>
                        <div class="activity-stat-label">Top Category</div>
                    </div>
                </div>

                <div class="activity-stat-card">
                    <div class="activity-stat-icon" style="background: linear-gradient(135deg, #ec4899 0%, #db2777 100%);">
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

                        ${isAdmin ? `
                            <select class="activity-select" id="activity-role-filter" style="display: none;">
                                <option value="all">All Roles</option>
                                <option value="student">Students</option>
                                <option value="teacher">Teachers</option>
                                <option value="librarian">Librarians</option>
                                <option value="admin">Admins</option>
                            </select>
                        ` : ''}
                    </div>
                </div>

                <!-- Category Filter Pills -->
                <div class="activity-category-pills">
                    <button class="activity-pill active" data-category="all">All Activities</button>
                    <button class="activity-pill" data-category="search">🔍 Searches</button>
                    <button class="activity-pill" data-category="project">📄 Project Views</button>
                    <button class="activity-pill" data-category="bookmark">🔖 Bookmarks</button>
                    <button class="activity-pill" data-category="citation">📜 Citations</button>
                    <button class="activity-pill" data-category="auth">🔐 Auth & Security</button>
                    <button class="activity-pill" data-category="ai">🤖 AI Assistant</button>
                    <button class="activity-pill" data-category="admin">⚡ Administrative</button>
                    <button class="activity-pill" data-category="system">⚙️ System</button>
                </div>
            </div>

            <!-- Main Timeline Card -->
            <div class="activity-timeline-card">
                <div class="activity-timeline-header">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <h3 id="activity-feed-title">Activity Timeline</h3>
                        <div class="activity-live-badge">
                            <span class="activity-pulse-dot"></span>
                            <span>Live Sync</span>
                        </div>
                    </div>
                    <span id="activity-count-badge" style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 600;">0 events</span>
                </div>

                <div id="activity-timeline-content">
                    <div class="activity-empty-state">
                        <div class="activity-empty-icon">⏳</div>
                        <h4>Loading Activity Feed...</h4>
                        <p>Fetching your latest actions and history.</p>
                    </div>
                </div>
            </div>

            <!-- Details Modal -->
            <div class="activity-modal" id="activity-details-modal">
                <div class="activity-modal-box">
                    <div class="activity-modal-header">
                        <h3 id="modal-activity-title">Activity Details</h3>
                        <button class="activity-modal-close" id="modal-close-btn" aria-label="Close">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    <div class="activity-modal-body">
                        <div class="activity-modal-grid" id="modal-activity-details-grid">
                            <!-- Populated dynamically -->
                        </div>
                    </div>
                    <div class="activity-modal-footer">
                        <button class="btn-activity-secondary" id="modal-done-btn">Close</button>
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

        // Role Select (Admin Audit mode)
        const roleSelect = section.querySelector('#activity-role-filter');
        if (roleSelect) {
            roleSelect.addEventListener('change', (e) => {
                currentFilters.role = e.target.value;
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

        // Admin Audit Mode tabs
        const modeTabs = section.querySelectorAll('.activity-mode-tab');
        modeTabs.forEach(tab => {
            tab.addEventListener('click', async () => {
                modeTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                isAdminAuditMode = tab.dataset.mode === 'audit';
                
                if (roleSelect) {
                    roleSelect.style.display = isAdminAuditMode ? 'inline-block' : 'none';
                }

                const feedTitle = section.querySelector('#activity-feed-title');
                if (feedTitle) {
                    feedTitle.textContent = isAdminAuditMode ? 'System-Wide Activity Audit Log' : 'Personal Activity Timeline';
                }

                await refreshActivities();
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

        // Modal Close handlers
        const modal = section.querySelector('#activity-details-modal');
        const modalCloseBtn = section.querySelector('#modal-close-btn');
        const modalDoneBtn = section.querySelector('#modal-done-btn');

        const closeModal = () => {
            if (modal) modal.classList.remove('active');
        };

        if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
        if (modalDoneBtn) modalDoneBtn.addEventListener('click', closeModal);
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
        }
    }

    /**
     * Show Export Format Selection Menu
     */
    function showExportMenu(btn) {
        if (!currentActivities || currentActivities.length === 0) {
            if (typeof showToast === 'function') {
                showToast('No activities available to export', 'warning');
            }
            return;
        }

        // Simple prompt or modal
        const choice = confirm('Click OK to export as CSV, or Cancel to export as JSON.');
        const format = choice ? 'csv' : 'json';
        
        const success = window.ActivityService.exportActivities(currentActivities, format);
        if (success && typeof showToast === 'function') {
            showToast(`Exported ${currentActivities.length} activities as ${format.toUpperCase()}`, 'success');
        }
    }

    /**
     * Handle Clear History
     */
    async function handleClearHistory() {
        if (!currentUserId) return;

        const isAudit = isAdminAuditMode && currentRole === 'admin';
        const msg = isAudit 
            ? 'Are you sure you want to clear your personal activity cache?'
            : 'Are you sure you want to clear your activity history? This action cannot be undone.';

        if (confirm(msg)) {
            await window.ActivityService.clearUserActivities(currentUserId);
            await refreshActivities();
            if (typeof showToast === 'function') {
                showToast('Activity history cleared successfully', 'success');
            }
        }
    }

    /**
     * Refresh activities from Service
     */
    async function refreshActivities() {
        try {
            if (isAdminAuditMode && currentRole === 'admin') {
                currentActivities = await window.ActivityService.getAllActivities();
            } else {
                currentActivities = await window.ActivityService.getUserActivities(currentUserId);
            }
            renderFilteredTimeline();
        } catch (error) {
            console.error('[ActivityUI] Error fetching activities:', error);
        }
    }

    /**
     * Render the timeline according to current filters
     */
    function renderFilteredTimeline() {
        const container = document.getElementById('activity-timeline-content');
        const countBadge = document.getElementById('activity-count-badge');
        if (!container) return;

        // Apply filters
        const filtered = window.ActivityService.filterActivities(currentActivities, currentFilters);

        // Update stats
        const metrics = calculateMetrics(currentActivities);
        const totalEl = document.getElementById('stat-total-activities');
        const todayEl = document.getElementById('stat-today-activities');
        const topEl = document.getElementById('stat-top-category');
        const lastEl = document.getElementById('stat-last-active');

        if (totalEl) totalEl.textContent = metrics.total;
        if (todayEl) todayEl.textContent = metrics.todayCount;
        if (topEl) topEl.textContent = metrics.topCategory;
        if (lastEl) lastEl.textContent = metrics.lastActive;
        if (countBadge) countBadge.textContent = `${filtered.length} ${filtered.length === 1 ? 'event' : 'events'}`;

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="activity-empty-state">
                    <div class="activity-empty-icon">📭</div>
                    <h4>No Activities Found</h4>
                    <p>No activity records match your active filters. Try searching for something else or performing an action in the portal.</p>
                </div>
            `;
            return;
        }

        // Group by Date
        const grouped = groupActivitiesByDate(filtered);
        let html = '';

        Object.entries(grouped).forEach(([dateGroup, items]) => {
            html += `
                <div class="activity-date-group">
                    <div class="activity-date-label">${dateGroup}</div>
                    <div class="activity-items-list">
            `;

            items.forEach(item => {
                const categoryClass = `badge-${item.category || 'system'}`;
                const icon = item.icon || window.ActivityService.DEFAULT_ICONS[item.category] || '📌';
                const timeAgo = formatRelativeTime(item.timestamp);
                const categoryColor = window.ActivityService.CATEGORY_COLORS[item.category] || '#6366f1';

                // Check if project view link is possible
                let actionLink = '';
                if (item.category === 'project' && item.metadata && item.metadata.projectId) {
                    actionLink = `<a href="../index.html" class="activity-item-action-link" data-project-id="${escapeHtml(item.metadata.projectId)}">View Project Details →</a>`;
                }

                html += `
                    <div class="activity-item" data-activity-id="${escapeHtml(item.id)}">
                        <div class="activity-node-icon" style="background: ${categoryColor};">
                            ${icon}
                        </div>
                        <div class="activity-item-main">
                            <div class="activity-item-top">
                                <div class="activity-item-title-row">
                                    <span class="activity-item-title">${escapeHtml(item.title)}</span>
                                    <span class="activity-badge ${categoryClass}">${escapeHtml(item.category || 'general')}</span>
                                </div>
                                <span class="activity-item-time">${timeAgo}</span>
                            </div>
                            <div class="activity-item-desc">${escapeHtml(item.details)}</div>
                            
                            ${isAdminAuditMode && item.userName ? `
                                <div class="activity-item-user-info">
                                    <span>👤 ${escapeHtml(item.userName)}</span>
                                    <span>(${escapeHtml(item.userRole || 'student')})</span>
                                    ${item.device ? `<span>• 💻 ${escapeHtml(item.device)}</span>` : ''}
                                </div>
                            ` : ''}

                            ${actionLink}
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Bind item click for inspection modal
        container.querySelectorAll('.activity-item').forEach(itemEl => {
            itemEl.addEventListener('click', (e) => {
                // If clicked action link, let it handle
                if (e.target.closest('.activity-item-action-link')) return;

                const actId = itemEl.getAttribute('data-activity-id');
                const activity = currentActivities.find(a => a.id === actId);
                if (activity) {
                    openActivityDetailsModal(activity);
                }
            });
        });
    }

    /**
     * Open Activity Details Modal
     */
    function openActivityDetailsModal(activity) {
        const modal = document.getElementById('activity-details-modal');
        const titleEl = document.getElementById('modal-activity-title');
        const grid = document.getElementById('modal-activity-details-grid');
        if (!modal || !grid) return;

        titleEl.textContent = activity.title || 'Activity Record';

        const exactTime = activity.timestamp ? new Date(activity.timestamp).toLocaleString(undefined, {
            dateStyle: 'full',
            timeStyle: 'medium'
        }) : 'Unknown';

        grid.innerHTML = `
            <div class="activity-modal-field">
                <div class="activity-modal-field-label">Action & Event Type</div>
                <div class="activity-modal-field-val">${escapeHtml(activity.action || 'activity')} (${escapeHtml(activity.category || 'system')})</div>
            </div>

            <div class="activity-modal-field">
                <div class="activity-modal-field-label">Exact Timestamp</div>
                <div class="activity-modal-field-val">${exactTime}</div>
            </div>

            <div class="activity-modal-field">
                <div class="activity-modal-field-label">Description & Details</div>
                <div class="activity-modal-field-val">${escapeHtml(activity.details || 'No additional details recorded.')}</div>
            </div>

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
