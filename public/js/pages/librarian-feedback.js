/**
 * RE-CAPS Librarian Feedback Read-Only Controller
 * Optimized strictly for Read-Only visibility of community submissions & capstone inquiries
 * Enforces zero modification/deletion controls (Pillar 4 & RBAC)
 */

const LibrarianFeedback = (() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3001/api/feedback'
        : 'https://recap-backend-jy5b.onrender.com/api/feedback';

    let feedbackCache = [];
    let isFetching = false;
    let searchDebounce = null;

    /**
     * Retrieve Bearer authentication token for current authenticated user
     */
    async function getAuthHeaders() {
        try {
            if (typeof auth !== 'undefined' && auth.currentUser) {
                const token = await auth.currentUser.getIdToken();
                return {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                };
            }
        } catch (e) {
            console.warn('[LibrarianFeedback] Failed to acquire auth token:', e);
        }
        return { 'Content-Type': 'application/json' };
    }

    /**
     * Escape HTML strings to protect against XSS
     */
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Format timestamp to readable institutional date string
     */
    function formatDate(isoString) {
        if (!isoString) return '—';
        try {
            const date = new Date(isoString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return String(isoString);
        }
    }

    /**
     * Fetch all feedback records from the backend API (Read-only)
     */
    async function loadFeedbackData() {
        if (isFetching) return;
        const tbody = document.getElementById('lib-feedback-table-body');
        const emptyState = document.getElementById('lib-fb-empty-state');
        const refreshBtn = document.getElementById('lib-fb-refresh-btn');

        try {
            isFetching = true;
            if (refreshBtn) refreshBtn.classList.add('is-loading');

            const statusVal = document.getElementById('lib-fb-status-filter')?.value || 'all';
            const searchVal = document.getElementById('lib-fb-search')?.value || '';

            const params = new URLSearchParams();
            if (statusVal && statusVal !== 'all') params.append('status', statusVal);
            if (searchVal && searchVal.trim()) params.append('search', searchVal.trim());
            params.append('limit', '250');

            const headers = await getAuthHeaders();
            const res = await fetch(`${API_BASE}?${params.toString()}`, { headers });
            const json = await res.json();

            if (!res.ok || !json.success) {
                throw new Error(json.error || 'Failed to retrieve feedback records.');
            }

            feedbackCache = json.data || [];
            updateKpiCounts(feedbackCache);
            renderTable(feedbackCache);

        } catch (err) {
            console.error('[LibrarianFeedback] Load error:', err);
            if (typeof showToast === 'function') {
                showToast(err.message || 'Error loading feedback records.', 'error');
            }
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#ef4444;">Failed to load feedback records.</td></tr>`;
            }
        } finally {
            isFetching = false;
            if (refreshBtn) refreshBtn.classList.remove('is-loading');
        }
    }

    /**
     * Compute and display KPI metrics for Librarian
     */
    function updateKpiCounts(items) {
        const total = items.length;
        const pending = items.filter(f => ['pending', 'unread'].includes(f.status || 'pending')).length;
        const resolved = items.filter(f => f.status === 'resolved').length;

        const elTotal = document.getElementById('lib-fb-stat-total');
        const elPending = document.getElementById('lib-fb-stat-pending');
        const elResolved = document.getElementById('lib-fb-stat-resolved');

        if (elTotal) elTotal.textContent = total;
        if (elPending) elPending.textContent = pending;
        if (elResolved) elResolved.textContent = resolved;
    }

    /**
     * Render the feedback table (Read-only, strictly inspection only)
     */
    function renderTable(items) {
        const tbody = document.getElementById('lib-feedback-table-body');
        const emptyState = document.getElementById('lib-fb-empty-state');
        if (!tbody) return;

        if (items.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.style.display = 'flex';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        tbody.innerHTML = items.map(item => {
            const status = (item.status || 'pending').toLowerCase();
            const priority = (item.priority || 'normal').toLowerCase();
            const statusLabel = status.replace('_', ' ');

            return `
                <tr data-feedback-id="${escapeHtml(item.id)}">
                    <td>
                        <div class="fb-user-cell">
                            <span class="fb-user-name">${escapeHtml(item.name || 'Anonymous User')}</span>
                            <span class="fb-user-email">${escapeHtml(item.email || '—')}</span>
                        </div>
                    </td>
                    <td>
                        <div class="fb-subject-cell">
                            <span class="fb-subject-text">${escapeHtml(item.subject || 'General Inquiry')}</span>
                            <span class="fb-message-snippet">${escapeHtml(item.message || '')}</span>
                        </div>
                    </td>
                    <td>
                        <span class="fb-date-cell">${formatDate(item.createdAt)}</span>
                    </td>
                    <td>
                        <span class="fb-badge fb-badge-${status}">
                            ${escapeHtml(statusLabel)}
                        </span>
                    </td>
                    <td>
                        <span class="fb-priority-tag fb-priority-${priority}">
                            ${escapeHtml(priority)}
                        </span>
                    </td>
                    <td style="text-align: right;">
                        <div class="fb-actions-group" style="justify-content: flex-end;">
                            <button type="button" class="fb-action-btn fb-btn-view" data-action="view" data-id="${escapeHtml(item.id)}" title="Inspect Feedback Details">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Find feedback item by ID from cache
     */
    function findItem(id) {
        return feedbackCache.find(f => f.id === id) || null;
    }

    /**
     * Open Read-Only Details Inspection Modal
     */
    function openDetailModal(item) {
        if (!item) return;

        document.getElementById('lib-fbd-name').textContent = item.name || 'Anonymous User';
        document.getElementById('lib-fbd-email').textContent = item.email || '—';
        document.getElementById('lib-fbd-subject').textContent = item.subject || 'General Inquiry';
        document.getElementById('lib-fbd-date').textContent = formatDate(item.createdAt);

        const statusEl = document.getElementById('lib-fbd-status');
        if (statusEl) {
            const status = (item.status || 'pending').toLowerCase();
            statusEl.innerHTML = `<span class="fb-badge fb-badge-${status}">${status.replace('_', ' ')}</span>`;
        }

        const priorityEl = document.getElementById('lib-fbd-priority');
        if (priorityEl) {
            const priority = (item.priority || 'normal').toLowerCase();
            priorityEl.innerHTML = `<span class="fb-priority-tag fb-priority-${priority}">${priority}</span>`;
        }

        document.getElementById('lib-fbd-message').textContent = item.message || '—';

        // Attached Images
        const imagesSection = document.getElementById('lib-fbd-images-section');
        const imagesContainer = document.getElementById('lib-fbd-images');
        if (Array.isArray(item.images) && item.images.length > 0) {
            imagesContainer.innerHTML = item.images.map(imgUrl => `
                <a href="${escapeHtml(imgUrl)}" target="_blank" rel="noopener noreferrer" class="feedback-image-thumb">
                    <img src="${escapeHtml(imgUrl)}" alt="Feedback screenshot">
                </a>
            `).join('');
            imagesSection.style.display = 'block';
        } else {
            imagesSection.style.display = 'none';
        }

        // Admin notes
        const notesSection = document.getElementById('lib-fbd-notes-section');
        const notesText = document.getElementById('lib-fbd-notes');
        if (item.adminNotes && item.adminNotes.trim()) {
            notesText.textContent = item.adminNotes;
            notesSection.style.display = 'block';
        } else {
            notesSection.style.display = 'none';
        }

        // Admin reply
        const replySection = document.getElementById('lib-fbd-reply-section');
        const replyText = document.getElementById('lib-fbd-reply');
        if (item.adminReply && item.adminReply.trim()) {
            replyText.textContent = item.adminReply;
            replySection.style.display = 'block';
        } else {
            replySection.style.display = 'none';
        }

        openModal('lib-fb-detail-modal');
    }

    /**
     * Modal Helper: Open
     */
    function openModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.add('is-active');
    }

    /**
     * Modal Helper: Close
     */
    function closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.remove('is-active');
    }

    /**
     * Initialize Event Listeners
     */
    function init() {
        // Table Action Button Delegation (View Details only)
        const tbody = document.getElementById('lib-feedback-table-body');
        if (tbody) {
            tbody.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action="view"]');
                if (!btn) return;

                const id = btn.getAttribute('data-id');
                const item = findItem(id);
                if (item) openDetailModal(item);
            });
        }

        // Search Input (Debounced)
        const searchInput = document.getElementById('lib-fb-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(searchDebounce);
                searchDebounce = setTimeout(() => {
                    loadFeedbackData();
                }, 300);
            });
        }

        // Status Filter
        const statusFilter = document.getElementById('lib-fb-status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => loadFeedbackData());
        }

        // Refresh Button
        const refreshBtn = document.getElementById('lib-fb-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => loadFeedbackData());
        }

        // Generic Modal Close Delegations
        document.querySelectorAll('[data-close-modal="lib-fb-detail-modal"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                closeModal('lib-fb-detail-modal');
            });
        });

        const backdrop = document.getElementById('lib-fb-detail-modal');
        if (backdrop) {
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) {
                    backdrop.classList.remove('is-active');
                }
            });
        }

        // Auto-load if #feedback is currently active in URL hash
        if (window.location.hash === '#feedback') {
            loadFeedbackData();
        }

        // Listen for section change events
        window.addEventListener('rail:section-change', (e) => {
            if (e.detail?.sectionId === 'feedback') {
                loadFeedbackData();
            }
        });
    }

    // Auto-init on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        loadFeedbackData,
        openDetailModal
    };
})();

// Attach globally
window.LibrarianFeedback = LibrarianFeedback;
