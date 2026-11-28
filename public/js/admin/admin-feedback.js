/**
 * RE-CAPS Administrator Feedback Management Controller
 * Handles Full CRUD Operations: Read, Filter, Status Update, Email Reply, and Record Deletion
 * Follows AGENTS.md UI Pillars: Zero Emojis, Institutional Palette, Flat 4px Tags
 */

const AdminFeedback = (() => {
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
            console.warn('[AdminFeedback] Failed to acquire auth token:', e);
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
     * Fetch all feedback records from the backend API
     */
    async function loadFeedbackData() {
        if (isFetching) return;
        const tbody = document.getElementById('admin-feedback-table-body');
        const emptyState = document.getElementById('admin-fb-empty-state');
        const refreshBtn = document.getElementById('admin-fb-refresh-btn');

        try {
            isFetching = true;
            if (refreshBtn) refreshBtn.classList.add('is-loading');

            const statusVal = document.getElementById('admin-fb-status-filter')?.value || 'all';
            const searchVal = document.getElementById('admin-fb-search')?.value || '';

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
            console.error('[AdminFeedback] Load error:', err);
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
     * Compute and display KPI metrics
     */
    function updateKpiCounts(items) {
        const total = items.length;
        const pending = items.filter(f => (f.status || 'pending') === 'pending').length;
        const reviewed = items.filter(f => ['reviewed', 'in_progress'].includes(f.status)).length;
        const resolved = items.filter(f => f.status === 'resolved').length;

        const elTotal = document.getElementById('admin-fb-stat-total');
        const elPending = document.getElementById('admin-fb-stat-pending');
        const elReviewed = document.getElementById('admin-fb-stat-reviewed');
        const elResolved = document.getElementById('admin-fb-stat-resolved');

        if (elTotal) elTotal.textContent = total;
        if (elPending) elPending.textContent = pending;
        if (elReviewed) elReviewed.textContent = reviewed;
        if (elResolved) elResolved.textContent = resolved;
    }

    /**
     * Render the feedback table
     */
    function renderTable(items) {
        const tbody = document.getElementById('admin-feedback-table-body');
        const emptyState = document.getElementById('admin-fb-empty-state');
        if (!tbody) return;

        // Apply client-side priority filter if specified
        const priorityVal = document.getElementById('admin-fb-priority-filter')?.value || 'all';
        let filtered = items;
        if (priorityVal && priorityVal !== 'all') {
            filtered = items.filter(f => (f.priority || 'normal') === priorityVal);
        }

        if (filtered.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.style.display = 'flex';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        tbody.innerHTML = filtered.map(item => {
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
                            <button type="button" class="fb-action-btn fb-btn-view" data-action="view" data-id="${escapeHtml(item.id)}" title="View Details">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                            </button>
                            <button type="button" class="fb-action-btn fb-btn-edit" data-action="edit" data-id="${escapeHtml(item.id)}" title="Update Status & Notes">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button type="button" class="fb-action-btn fb-action-btn-reply fb-btn-reply" data-action="reply" data-id="${escapeHtml(item.id)}" title="Send Email Reply">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="9 17 4 12 9 7"></polyline>
                                    <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
                                </svg>
                            </button>
                            <button type="button" class="fb-action-btn fb-action-btn-danger fb-btn-delete" data-action="delete" data-id="${escapeHtml(item.id)}" title="Delete Feedback">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
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
     * Open View Details Modal
     */
    function openDetailModal(item) {
        if (!item) return;

        document.getElementById('admin-fbd-name').textContent = item.name || 'Anonymous User';
        document.getElementById('admin-fbd-email').textContent = item.email || '—';
        document.getElementById('admin-fbd-subject').textContent = item.subject || 'General Inquiry';
        document.getElementById('admin-fbd-date').textContent = formatDate(item.createdAt);

        const statusEl = document.getElementById('admin-fbd-status');
        if (statusEl) {
            const status = (item.status || 'pending').toLowerCase();
            statusEl.innerHTML = `<span class="fb-badge fb-badge-${status}">${status.replace('_', ' ')}</span>`;
        }

        const priorityEl = document.getElementById('admin-fbd-priority');
        if (priorityEl) {
            const priority = (item.priority || 'normal').toLowerCase();
            priorityEl.innerHTML = `<span class="fb-priority-tag fb-priority-${priority}">${priority}</span>`;
        }

        document.getElementById('admin-fbd-message').textContent = item.message || '—';

        // Images gallery
        const imagesSection = document.getElementById('admin-fbd-images-section');
        const imagesContainer = document.getElementById('admin-fbd-images');
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
        const notesSection = document.getElementById('admin-fbd-notes-section');
        const notesText = document.getElementById('admin-fbd-notes');
        if (item.adminNotes && item.adminNotes.trim()) {
            notesText.textContent = item.adminNotes;
            notesSection.style.display = 'block';
        } else {
            notesSection.style.display = 'none';
        }

        // Admin reply
        const replySection = document.getElementById('admin-fbd-reply-section');
        const replyText = document.getElementById('admin-fbd-reply');
        if (item.adminReply && item.adminReply.trim()) {
            replyText.textContent = item.adminReply;
            replySection.style.display = 'block';
        } else {
            replySection.style.display = 'none';
        }

        // Bind update button inside detail modal to transition directly to status modal
        const editBtn = document.getElementById('admin-fbd-btn-edit');
        if (editBtn) {
            editBtn.onclick = () => {
                closeModal('admin-fb-detail-modal');
                openStatusModal(item);
            };
        }

        openModal('admin-fb-detail-modal');
    }

    /**
     * Open Status & Notes Modal (Update CRUD)
     */
    function openStatusModal(item) {
        if (!item) return;

        document.getElementById('admin-fbe-id').value = item.id;
        document.getElementById('admin-fbe-status').value = item.status || 'pending';
        document.getElementById('admin-fbe-priority').value = item.priority || 'normal';
        document.getElementById('admin-fbe-notes').value = item.adminNotes || '';

        openModal('admin-fb-status-modal');
    }

    /**
     * Open Reply Email Modal (Create Reply CRUD)
     */
    function openReplyModal(item) {
        if (!item) return;

        document.getElementById('admin-fbr-id').value = item.id;
        document.getElementById('admin-fbr-email').value = item.email || '';
        document.getElementById('admin-fbr-subject').value = `Re: ${item.subject || 'Feedback Inquiry'}`;
        document.getElementById('admin-fbr-message').value = '';

        openModal('admin-fb-reply-modal');
    }

    /**
     * Open Delete Confirmation Modal (Delete CRUD)
     */
    function openDeleteModal(item) {
        if (!item) return;

        document.getElementById('admin-fbd-delete-id').value = item.id;
        document.getElementById('admin-fbd-delete-snippet').textContent = `"${(item.message || '').slice(0, 140)}..."`;

        openModal('admin-fb-delete-modal');
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
     * Submit Status & Notes Update
     */
    async function handleStatusSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('admin-fbe-id').value;
        const status = document.getElementById('admin-fbe-status').value;
        const priority = document.getElementById('admin-fbe-priority').value;
        const adminNotes = document.getElementById('admin-fbe-notes').value.trim();
        const saveBtn = document.getElementById('admin-fbe-save-btn');

        if (!id) return;

        try {
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';
            }

            const headers = await getAuthHeaders();
            const res = await fetch(`${API_BASE}/${id}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ status, priority, adminNotes })
            });

            const json = await res.json();
            if (!res.ok || !json.success) {
                throw new Error(json.error || 'Failed to update feedback record.');
            }

            if (typeof showToast === 'function') {
                showToast('Feedback record updated successfully.', 'success');
            }

            closeModal('admin-fb-status-modal');
            await loadFeedbackData();

        } catch (err) {
            console.error('[AdminFeedback] Status update error:', err);
            if (typeof showToast === 'function') {
                showToast(err.message || 'Error updating feedback.', 'error');
            }
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Changes';
            }
        }
    }

    /**
     * Submit Email Reply
     */
    async function handleReplySubmit(e) {
        e.preventDefault();
        const id = document.getElementById('admin-fbr-id').value;
        const subject = document.getElementById('admin-fbr-subject').value.trim();
        const replyMessage = document.getElementById('admin-fbr-message').value.trim();
        const sendBtn = document.getElementById('admin-fbr-send-btn');

        if (!id || !replyMessage) {
            if (typeof showToast === 'function') {
                showToast('Please provide a reply message.', 'warning');
            }
            return;
        }

        try {
            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.textContent = 'Sending Reply...';
            }

            const headers = await getAuthHeaders();
            const res = await fetch(`${API_BASE}/${id}/reply`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ replyMessage, subject })
            });

            const json = await res.json();
            if (!res.ok || !json.success) {
                throw new Error(json.error || 'Failed to dispatch email reply.');
            }

            if (typeof showToast === 'function') {
                showToast('Response dispatched to user Gmail & marked resolved.', 'success');
            }

            closeModal('admin-fb-reply-modal');
            await loadFeedbackData();

        } catch (err) {
            console.error('[AdminFeedback] Reply error:', err);
            if (typeof showToast === 'function') {
                showToast(err.message || 'Error dispatching reply.', 'error');
            }
        } finally {
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.textContent = 'Send & Mark Resolved';
            }
        }
    }

    /**
     * Confirm Delete Feedback
     */
    async function handleConfirmDelete() {
        const id = document.getElementById('admin-fbd-delete-id').value;
        const delBtn = document.getElementById('admin-fb-confirm-delete-btn');

        if (!id) return;

        try {
            if (delBtn) {
                delBtn.disabled = true;
                delBtn.textContent = 'Deleting...';
            }

            const headers = await getAuthHeaders();
            const res = await fetch(`${API_BASE}/${id}`, {
                method: 'DELETE',
                headers
            });

            const json = await res.json();
            if (!res.ok || !json.success) {
                throw new Error(json.error || 'Failed to delete feedback record.');
            }

            if (typeof showToast === 'function') {
                showToast('Feedback record permanently deleted.', 'info');
            }

            closeModal('admin-fb-delete-modal');
            await loadFeedbackData();

        } catch (err) {
            console.error('[AdminFeedback] Delete error:', err);
            if (typeof showToast === 'function') {
                showToast(err.message || 'Error deleting feedback.', 'error');
            }
        } finally {
            if (delBtn) {
                delBtn.disabled = false;
                delBtn.textContent = 'Delete Record';
            }
        }
    }

    /**
     * Initialize Event Listeners
     */
    function init() {
        // Table Action Button Delegation
        const tbody = document.getElementById('admin-feedback-table-body');
        if (tbody) {
            tbody.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action]');
                if (!btn) return;

                const action = btn.getAttribute('data-action');
                const id = btn.getAttribute('data-id');
                const item = findItem(id);
                if (!item) return;

                if (action === 'view') openDetailModal(item);
                else if (action === 'edit') openStatusModal(item);
                else if (action === 'reply') openReplyModal(item);
                else if (action === 'delete') openDeleteModal(item);
            });
        }

        // Search Input (Debounced)
        const searchInput = document.getElementById('admin-fb-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(searchDebounce);
                searchDebounce = setTimeout(() => {
                    loadFeedbackData();
                }, 300);
            });
        }

        // Status & Priority Filters
        const statusFilter = document.getElementById('admin-fb-status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => loadFeedbackData());
        }

        const priorityFilter = document.getElementById('admin-fb-priority-filter');
        if (priorityFilter) {
            priorityFilter.addEventListener('change', () => renderTable(feedbackCache));
        }

        // Refresh Button
        const refreshBtn = document.getElementById('admin-fb-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => loadFeedbackData());
        }

        // Status & Notes Form Submit
        const statusForm = document.getElementById('admin-fb-status-form');
        if (statusForm) {
            statusForm.addEventListener('submit', handleStatusSubmit);
        }

        // Reply Form Submit
        const replyForm = document.getElementById('admin-fb-reply-form');
        if (replyForm) {
            replyForm.addEventListener('submit', handleReplySubmit);
        }

        // Delete Confirm Button
        const deleteConfirmBtn = document.getElementById('admin-fb-confirm-delete-btn');
        if (deleteConfirmBtn) {
            deleteConfirmBtn.addEventListener('click', handleConfirmDelete);
        }

        // Generic Modal Close Delegations
        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const targetModalId = btn.getAttribute('data-close-modal');
                if (targetModalId) closeModal(targetModalId);
            });
        });

        // Close on backdrop click
        document.querySelectorAll('.feedback-modal-backdrop').forEach(backdrop => {
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) {
                    backdrop.classList.remove('is-active');
                }
            });
        });

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
        openDetailModal,
        openStatusModal,
        openReplyModal,
        openDeleteModal
    };
})();

// Attach globally
window.AdminFeedback = AdminFeedback;
