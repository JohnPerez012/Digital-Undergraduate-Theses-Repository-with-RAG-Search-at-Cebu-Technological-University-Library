/**
 * librarian_main.js
 * Renovated Librarian Dashboard — Full Logic
 *
 * Features:
 *  1. Upload Metadata → Firestore "pendingProjects" collection (admin must approve)
 *  2. Projects → view all; EDIT only within admin-granted time window
 *     - Admin Task Modal: re-appears every 3 min if ignored; stops once editing starts
 *  3. Cataloging → edit physical location note for PUBLISHED projects (free, no admin gate)
 *
 * Firestore collections used:
 *  - projects          (read all; write only during admin permission window)
 *  - pendingProjects   (write: librarian submits; read: own submissions)
 *  - librarianEditPermissions/{uid}  (read: own; written by admin)
 *  - catalogNotes/{projectId}        (read/write: librarian)
 */

(function () {
    'use strict';

    // ─────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────
    let currentUser = null;
    let currentUserData = null;
    let editPermission = null;         // Active admin-granted edit permission doc
    let editPermissionTimer = null;    // setInterval for countdown
    let snoozeTimer = null;            // setTimeout for 3-min re-show
    let allProjects = [];              // Cache for all projects + pending submissions
    let completedCatalogProjects = []; // Cache for completed catalog projects
    let catalogNotes = {};             // { projectId: noteDoc }

    // ─────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────
    function escapeHtml(t) {
        return String(t || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
    }
    function formatDate(ts) {
        if (!ts) return 'N/A';
        try {
            const d = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
            if (isNaN(d)) return 'N/A';
            return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        } catch { return 'N/A'; }
    }
    function formatCountdown(ms) {
        if (ms <= 0) return '00:00';
        const totalSec = Math.floor(ms / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
    function switchSection(sectionId) {
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.rail-nav-item[data-section]').forEach(n => n.classList.remove('active'));
        const sec = document.getElementById('section-' + sectionId);
        if (sec) sec.classList.add('active');
        const nav = document.getElementById('nav-' + sectionId);
        if (nav) nav.classList.add('active');
    }
    function getTimestamp(ts) {
        if (!ts) return 0;
        try { return ts.toDate ? ts.toDate().getTime() : (ts instanceof Date ? ts.getTime() : new Date(ts).getTime()); } catch { return 0; }
    }

    // ─────────────────────────────────────────────
    // INIT
    // ─────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', async () => {
        // Auth guard
        await new Promise(resolve => {
            auth.onAuthStateChanged(async user => {
                if (!user) { window.location.href = '../index.html'; return; }
                try {
                    const doc = await db.collection('users').doc(user.uid).get();
                    if (!doc.exists || doc.data().userType !== 'librarian') {
                        window.location.href = '../index.html'; return;
                    }
                    currentUser = user;
                    currentUserData = doc.data();
                    sessionStorage.setItem('userId', user.uid);
                    sessionStorage.setItem('userEmail', user.email);
                    sessionStorage.setItem('userName', user.displayName || 'Librarian');
                    sessionStorage.setItem('userType', 'librarian');

                    // Update profile display
                    const nameEl = document.getElementById('librarian-name');
                    if (nameEl) nameEl.textContent = currentUserData.fullName || user.displayName || 'Librarian';
                    const imgEl = document.getElementById('librarian-profile-img');
                    if (imgEl && user.photoURL) imgEl.src = user.photoURL;
                    const settingsEmail = document.getElementById('settings-user-email');
                    if (settingsEmail) settingsEmail.textContent = user.email || 'N/A';
                    const settingsName = document.getElementById('settings-user-name');
                    if (settingsName) settingsName.textContent = currentUserData.fullName || user.displayName || 'N/A';

                    resolve(true);
                } catch (e) {
                    console.error(e);
                    window.location.href = '../index.html';
                }
            });
        });

        initNavigation();
        initLogout();
        initUploadMetadataModal();
        initBulkImportModal();
        initProjectEditModal();
        initPendingProjectEditModal();
        initCatalogNoteModal();
        initDangerZone();

        // Load default section
        await loadDashboardData();
        await watchEditPermission();
    });

    // ─────────────────────────────────────────────
    // NAVIGATION
    // ─────────────────────────────────────────────
    function initNavigation() {
        document.querySelectorAll('.rail-nav-item[data-section]').forEach(item => {
            item.addEventListener('click', async e => {
                e.preventDefault();
                const sec = item.getAttribute('data-section');
                switchSection(sec);
                if (sec === 'dashboard') await loadDashboardData();
                else if (sec === 'projects') await loadProjectsData();
                else if (sec === 'catalog') await loadCatalogData();
            });
        });

        // Quick action tiles
        document.getElementById('qa-upload-btn')?.addEventListener('click', () => openUploadModal());
        document.getElementById('qa-projects-btn')?.addEventListener('click', () => { switchSection('projects'); loadProjectsData(); });
        document.getElementById('qa-catalog-btn')?.addEventListener('click', () => { switchSection('catalog'); loadCatalogData(); });
        document.getElementById('dash-go-edit-btn')?.addEventListener('click', () => { switchSection('projects'); loadProjectsData(); });
        document.getElementById('refresh-dashboard-btn')?.addEventListener('click', () => loadDashboardData());

        // NEW section-header action buttons (Admin-style)
        document.getElementById('lib-add-project-btn')?.addEventListener('click', () => openUploadModal());
        document.getElementById('lib-bulk-import-btn')?.addEventListener('click', () => openBulkModal());
        document.getElementById('lib-refresh-projects-btn')?.addEventListener('click', () => loadProjectsData(true));
        document.getElementById('lib-refresh-catalog-btn')?.addEventListener('click', () => loadCatalogData(true));

        // Program filter pills
        document.querySelectorAll('#lib-project-filters .filter-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                document.querySelectorAll('#lib-project-filters .filter-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                filterProjectsTable();
            });
        });

        // Project search + status filter
        document.getElementById('projects-search')?.addEventListener('input', filterProjectsTable);
        document.getElementById('projects-status-filter')?.addEventListener('change', filterProjectsTable);
    }

    // ─────────────────────────────────────────────
    // LOGOUT
    // ─────────────────────────────────────────────
    function initLogout() {
        document.getElementById('librarian-logout-btn')?.addEventListener('click', e => {
            e.preventDefault();
            if (typeof getLogoutModal === 'function') {
                getLogoutModal().show({
                    onConfirm: async () => {
                        await auth.signOut();
                        sessionStorage.clear();
                        localStorage.removeItem('cachedAuthState');
                        window.location.href = '../index.html';
                    }
                });
            } else {
                if (confirm('Are you sure you want to logout?')) {
                    auth.signOut().then(() => { sessionStorage.clear(); window.location.href = '../index.html'; });
                }
            }
        });
    }

    // ─────────────────────────────────────────────
    // DASHBOARD DATA
    // ─────────────────────────────────────────────
    async function loadDashboardData() {
        try {
            const snap = await db.collection('projects').get();
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (!allProjects || allProjects.length === 0) {
                allProjects = all;
            }

            const total = all.length;
            const pending = all.filter(p => (p.status || '').toLowerCase() === 'pending').length;
            const now = new Date();
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const thisMonth = all.filter(p => { const t = getTimestamp(p.createdAt); return t >= firstDay.getTime(); }).length;

            // Count catalog notes
            let cataloged = 0;
            try {
                const cnSnap = await db.collection('catalogNotes').get();
                cataloged = cnSnap.size;
            } catch {}

            setEl('dash-total-projects', total);
            setEl('dash-cataloged', cataloged);
            setEl('dash-pending', pending);
            setEl('dash-this-month', thisMonth);

            // Recent list
            const recentList = document.getElementById('dash-recent-list');
            if (recentList) {
                const sorted = [...all].sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt)).slice(0, 5);
                if (sorted.length === 0) {
                    recentList.innerHTML = '<div class="lib-loading-text">No projects yet.</div>';
                } else {
                    recentList.innerHTML = sorted.map(p => `
                        <div class="lib-recent-item" data-id="${escapeHtml(p.id)}">
                            <div class="lib-recent-item-title">${escapeHtml(p.title || 'Untitled')}</div>
                            <div class="lib-recent-item-meta">${escapeHtml(p.program || 'N/A')} · ${escapeHtml(String(p.year || 'N/A'))} · ${formatDate(p.createdAt)}</div>
                        </div>
                    `).join('');
                }
            }

            // Show edit permission alert if active
            updatePermissionUI();
        } catch (err) {
            console.error('loadDashboardData:', err);
            showToast && showToast('Error loading dashboard data', '❌');
        }
    }

    function setEl(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // ─────────────────────────────────────────────
    // EDIT PERMISSION WATCHER
    // ─────────────────────────────────────────────
    async function watchEditPermission() {
        if (!currentUser) return;
        // Real-time listener on librarianEditPermissions/{uid}
        db.collection('librarianEditPermissions').doc(currentUser.uid)
            .onSnapshot(docSnap => {
                if (!docSnap.exists) {
                    editPermission = null;
                    updatePermissionUI();
                    stopEditPermissionTimer();
                    return;
                }
                const data = docSnap.data();
                const now = Date.now();
                const endMs = getTimestamp(data.allowedUntil);

                if (!endMs || endMs <= now) {
                    // Expired
                    editPermission = null;
                    updatePermissionUI();
                    stopEditPermissionTimer();
                    return;
                }

                editPermission = { ...data, id: docSnap.id, _endMs: endMs };
                updatePermissionUI();

                // Show the urgent modal if not acknowledged / editing started
                if (!data.editingStarted) {
                    showAdminTaskModal();
                }
                startEditPermissionTimer();
            }, err => console.error('Permission watch error:', err));
    }

    function updatePermissionUI() {
        const badge = document.getElementById('edit-permission-badge');
        const alert = document.getElementById('dash-edit-permission-alert');
        const banner = document.getElementById('projects-edit-banner');

        if (editPermission && editPermission._endMs > Date.now()) {
            // Show badge on Projects nav
            if (badge) badge.style.display = '';
            // Show alert on dashboard
            if (alert) {
                alert.style.display = 'flex';
                const msg = document.getElementById('dash-alert-msg');
                if (msg) msg.textContent = editPermission.message || `Admin allowed editing for: ${escapeHtml(editPermission.projectTitle || 'a project')}`;
            }
            // Show banner on projects section
            if (banner) {
                banner.style.display = 'flex';
                const msg = document.getElementById('projects-banner-msg');
                if (msg) msg.textContent = editPermission.message || `Editing: ${escapeHtml(editPermission.projectTitle || 'a project')}`;
            }
        } else {
            if (badge) badge.style.display = 'none';
            if (alert) alert.style.display = 'none';
            if (banner) banner.style.display = 'none';
        }
    }

    function startEditPermissionTimer() {
        stopEditPermissionTimer();
        editPermissionTimer = setInterval(() => {
            if (!editPermission) { stopEditPermissionTimer(); return; }
            const rem = editPermission._endMs - Date.now();
            if (rem <= 0) {
                stopEditPermissionTimer();
                editPermission = null;
                updatePermissionUI();
                closeAdminTaskModal();
                showToast && showToast('Edit permission window has expired.', '⚠️');
                return;
            }
            // Update countdown displays
            const fmt = formatCountdown(rem);
            const atmCountdown = document.getElementById('atm-countdown');
            if (atmCountdown) atmCountdown.textContent = fmt;
            const peTimer = document.getElementById('pe-timer-display');
            if (peTimer) peTimer.textContent = fmt;
            const bannerTimer = document.getElementById('projects-banner-timer');
            if (bannerTimer) bannerTimer.textContent = fmt;

            // Update ATM progress bar
            if (editPermission._totalMs) {
                const pct = Math.max(0, Math.min(100, (rem / editPermission._totalMs) * 100));
                const fill = document.getElementById('atm-progress-fill');
                if (fill) fill.style.width = pct + '%';
            }

            // Auto-close project edit modal if expired
            if (rem <= 0) {
                const modal = document.getElementById('project-edit-modal');
                if (modal && modal.style.display !== 'none') {
                    modal.style.display = 'none';
                    showToast && showToast('Edit session ended — time limit reached.', '⚠️');
                }
            }
        }, 1000);
    }

    function stopEditPermissionTimer() {
        if (editPermissionTimer) { clearInterval(editPermissionTimer); editPermissionTimer = null; }
        if (snoozeTimer) { clearTimeout(snoozeTimer); snoozeTimer = null; }
    }

    // ─────────────────────────────────────────────
    // ADMIN TASK MODAL
    // ─────────────────────────────────────────────
    function showAdminTaskModal() {
        if (!editPermission) return;
        const modal = document.getElementById('admin-task-modal');
        if (!modal) return;

        // Populate content
        const title = document.getElementById('atm-project-title');
        if (title) title.textContent = editPermission.projectTitle || 'Untitled';
        const msg = document.getElementById('atm-message');
        if (msg) msg.textContent = editPermission.message || 'The admin has granted you permission to edit a project within a time window.';

        // Calculate total duration for progress bar
        if (editPermission.grantedAt) {
            editPermission._totalMs = editPermission._endMs - getTimestamp(editPermission.grantedAt);
        } else {
            editPermission._totalMs = editPermission._endMs - Date.now();
        }

        modal.style.display = 'flex';

        // Shake to attract attention on re-show
        const card = modal.querySelector('.atm-card');
        if (card) {
            card.classList.remove('atm-shake');
            void card.offsetWidth;
            card.classList.add('atm-shake');
        }
    }

    function closeAdminTaskModal() {
        const modal = document.getElementById('admin-task-modal');
        if (modal) modal.style.display = 'none';
    }

    function scheduleModalResnooze() {
        if (snoozeTimer) clearTimeout(snoozeTimer);
        snoozeTimer = setTimeout(() => {
            if (editPermission && editPermission._endMs > Date.now() && !editPermission.editingStarted) {
                showAdminTaskModal();
            }
        }, 3 * 60 * 1000); // 3 minutes
    }

    function initAdminTaskModal() {
        document.getElementById('atm-start-btn')?.addEventListener('click', async () => {
            if (!editPermission) return;
            closeAdminTaskModal();
            if (snoozeTimer) { clearTimeout(snoozeTimer); snoozeTimer = null; }
            // Mark as editing started (prevents re-show)
            try {
                await db.collection('librarianEditPermissions').doc(currentUser.uid)
                    .update({ editingStarted: true });
            } catch {}
            // Go to projects, open edit modal for the specific project
            switchSection('projects');
            await loadProjectsData();
            if (editPermission.projectId) {
                setTimeout(() => openProjectEditModal(editPermission.projectId), 300);
            }
        });

        document.getElementById('atm-snooze-btn')?.addEventListener('click', () => {
            closeAdminTaskModal();
            scheduleModalResnooze();
        });
    }

    // ─────────────────────────────────────────────
    // PROJECTS DATA & PAGINATION (Admin-Consistent)
    // ─────────────────────────────────────────────
    let currentLibProjectsPage = 1;
    const LIB_PROJECTS_PER_PAGE = 10;

    async function loadProjectsData(forceRefresh = false) {
        const tbody = document.getElementById('projects-table-body');
        if (!tbody) return;

        // Instant render from cache first
        if (!forceRefresh && allProjects && allProjects.length > 0) {
            filterProjectsTable(false);
        } else {
            const cached = loadLibProjectsFromCache();
            if (cached && cached.length > 0) {
                allProjects = cached;
                filterProjectsTable(false);
            } else {
                tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Loading projects...</td></tr>';
            }
        }

        try {
            // Load published/completed projects
            const snap = await db.collection('projects').orderBy('createdAt', 'desc').get()
                .catch(async () => db.collection('projects').get());
            const liveDocs = snap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    ...data,
                    isLockedByAdmin: Boolean(data.isLockedByAdmin),
                    isBeingCataloged: Boolean(data.isBeingCataloged),
                    catalogingBy: data.catalogingBy || null,
                    catalogingByName: data.catalogingByName || null,
                    isBeingEdited: Boolean(data.isBeingEdited),
                    editingBy: data.editingBy || null,
                    editingByName: data.editingByName || null
                };
            });

            // Load pending submissions submitted for admin approval
            let pendingDocs = [];
            try {
                const pSnap = await db.collection('pendingProjects').orderBy('createdAt', 'desc').get()
                    .catch(async () => db.collection('pendingProjects').get());
                pendingDocs = pSnap.docs.map(d => {
                    const data = d.data();
                    return {
                        id: d.id,
                        ...data,
                        status: 'pending',
                        isPendingApproval: true,
                        isBeingEdited: Boolean(data.isBeingEdited),
                        editingBy: data.editingBy || null,
                        editingByName: data.editingByName || null,
                        isLockedByAdmin: Boolean(data.isLockedByAdmin)
                    };
                });
            } catch (pErr) {
                console.warn('Pending projects fetch:', pErr);
            }

            // Pending submissions displayed first so librarian sees their awaiting work
            allProjects = [...pendingDocs, ...liveDocs];
            saveLibProjectsToCache(allProjects);
            filterProjectsTable(false);

            // Start real-time Firestore listeners so admin lock/edits reflect immediately
            startPendingProjectsListener();
            startProjectsRealtimeListener();

            if (forceRefresh) {
                showToast && showToast('Projects list refreshed', '✓');
            }
        } catch (err) {
            console.error('loadProjectsData:', err);
            if (!allProjects || allProjects.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="table-error">⚠️ Error loading projects.</td></tr>';
            }
        }
    }

    function saveLibProjectsToCache(projects) {
        try {
            localStorage.setItem('libProjectsData', JSON.stringify(projects.slice(0, 150)));
        } catch (e) {}
    }

    function loadLibProjectsFromCache() {
        try {
            const raw = localStorage.getItem('libProjectsData');
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function getFilteredLibProjects() {
        const term = (document.getElementById('projects-search')?.value || '').toLowerCase().trim();
        const statusFilter = (document.getElementById('projects-status-filter')?.value || '').trim().toLowerCase();
        const activePill = document.querySelector('#lib-project-filters .filter-pill.active');
        const programFilter = activePill ? activePill.getAttribute('data-filter') : 'all';

        return allProjects.filter(p => {
            const matchText = !term ||
                (p.title || '').toLowerCase().includes(term) ||
                (p.authors || []).join(' ').toLowerCase().includes(term) ||
                (p.program || '').toLowerCase().includes(term);
            const pStatus = (p.status || '').trim().toLowerCase();
            const matchStatus = !statusFilter || pStatus === statusFilter || (statusFilter === 'completed' && pStatus === 'complete');
            const matchProgram = programFilter === 'all'
                ? true
                : programFilter === 'pending'
                    ? pStatus === 'pending'
                    : (p.program || '').toLowerCase() === programFilter.toLowerCase();
            return matchText && matchStatus && matchProgram;
        });
    }

    function renderProjectsTable() {
        const tbody = document.getElementById('projects-table-body');
        if (!tbody) return;

        const filtered = getFilteredLibProjects();

        if (filtered.length === 0) {
            const searchVal = document.getElementById('projects-search')?.value.trim();
            tbody.innerHTML = `<tr><td colspan="6" class="table-empty">${searchVal ? `No projects found matching "${escapeHtml(searchVal)}"` : 'No projects found.'}</td></tr>`;
            renderLibProjectsPagination(0);
            return;
        }

        // Calculate pagination
        const totalCount = filtered.length;
        const totalPages = Math.ceil(totalCount / LIB_PROJECTS_PER_PAGE);
        if (currentLibProjectsPage > totalPages) currentLibProjectsPage = Math.max(1, totalPages);

        const startIndex = (currentLibProjectsPage - 1) * LIB_PROJECTS_PER_PAGE;
        const endIndex = startIndex + LIB_PROJECTS_PER_PAGE;
        const projectsToShow = filtered.slice(startIndex, endIndex);

        tbody.innerHTML = projectsToShow.map(p => {
            const rawStatus = (p.status || 'Draft').trim();
            const sLower = rawStatus.toLowerCase();
            const isPending = p.isPendingApproval || sLower === 'pending';

            // Minimalist illuminated status indicator squircle badge
            let statusBadge = '';
            if (isPending) {
                statusBadge = `<span class="status-badge status-indicator-badge status-indicator-pending" title="Status: Pending Approval (Awaiting Admin Review)" aria-label="Status: Pending Approval">
                    <span class="status-indicator-dot"></span>
                </span>`;
            } else if (sLower === 'completed' || sLower === 'complete') {
                statusBadge = `<span class="status-badge status-indicator-badge status-indicator-completed" title="Status: Completed" aria-label="Status: Completed">
                    <span class="status-indicator-dot"></span>
                </span>`;
            } else if (sLower === 'published') {
                statusBadge = `<span class="status-badge status-indicator-badge status-indicator-published" title="Status: Published" aria-label="Status: Published">
                    <span class="status-indicator-dot"></span>
                </span>`;
            } else {
                statusBadge = `<span class="status-badge status-indicator-badge status-indicator-draft" title="Status: ${escapeHtml(rawStatus)}" aria-label="Status: ${escapeHtml(rawStatus)}">
                    <span class="status-indicator-dot"></span>
                </span>`;
            }

            // Pending submissions actions:
            // 1. If locked by Admin -> Locked by Admin badge (View only)
            // 2. If being edited by someone else -> In use by [Name]
            // 3. Otherwise -> View + Edit button
            let pendingActionBtns = '';
            if (isPending) {
                const isLocked = Boolean(p.isLockedByAdmin);
                const isBeingEdited = Boolean(p.isBeingEdited) && p.editingBy && p.editingBy !== (currentUser?.uid || '');

                if (isLocked) {
                    pendingActionBtns = `
                        <span class="admin-locked-pill" title="Locked by Administrator — Librarian has View Only access" aria-label="Locked by Admin">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            <span>Locked by Admin</span>
                        </span>
                    `;
                } else if (isBeingEdited) {
                    const editor = escapeHtml(p.editingByName || 'Another Librarian');
                    pendingActionBtns = `
                        <span class="being-edited-pill" title="Currently being edited by ${editor}" aria-label="In use">
                            <span class="live-editing-dot"></span>
                            <span>In use by ${editor}</span>
                        </span>
                    `;
                } else {
                    pendingActionBtns = `
                        <button type="button" class="action-btn action-edit" onclick="window.__libEditPendingSubmission('${escapeHtml(p.id)}')" title="Edit this pending submission" aria-label="Edit pending submission">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            <span class="action-btn-text">Edit</span>
                        </button>
                    `;
                }
            }

            // Completed projects actions (Cataloging / Locked by Admin / In Use Concurrency)
            const isCompleted = !isPending && (sLower === 'completed' || sLower === 'complete');
            let completedActionBtns = '';
            if (isCompleted) {
                const isLocked = Boolean(p.isLockedByAdmin);
                const currentUid = currentUser?.uid || '';
                const isBeingCatalogedByOther = Boolean(p.isBeingCataloged) && p.catalogingBy && p.catalogingBy !== currentUid;
                const isBeingEditedByOther = Boolean(p.isBeingEdited) && p.editingBy && p.editingBy !== currentUid;

                if (isLocked) {
                    completedActionBtns = `
                        <span class="admin-locked-pill" title="Locked by Administrator — Cataloging and editing are disabled" aria-label="Locked by Admin">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            <span>Locked by Admin</span>
                        </span>
                    `;
                } else if (isBeingCatalogedByOther) {
                    const cataloger = escapeHtml(p.catalogingByName || 'Another Librarian');
                    completedActionBtns = `
                        <span class="being-edited-pill" title="Currently being cataloged by ${cataloger}" aria-label="In use">
                            <span class="live-editing-dot"></span>
                            <span>In catalog by ${cataloger}</span>
                        </span>
                    `;
                } else if (isBeingEditedByOther) {
                    const editor = escapeHtml(p.editingByName || 'Another Librarian');
                    completedActionBtns = `
                        <span class="being-edited-pill" title="Currently being edited by ${editor}" aria-label="In use">
                            <span class="live-editing-dot"></span>
                            <span>In use by ${editor}</span>
                        </span>
                    `;
                } else {
                    completedActionBtns = `
                        <button class="action-btn action-catalog" onclick="window.__libGoToCatalog('${escapeHtml(p.id)}')" title="Add / Edit Catalog Note">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                            <span class="action-btn-text">Add Catalog</span>
                        </button>
                    `;
                }
            } else if (!isPending) {
                completedActionBtns = `
                    <span class="catalog-na-badge" title="Cataloging available for Completed projects only">
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        Catalog
                    </span>
                `;
            }

            return `<tr>
                <td><strong>${escapeHtml(p.title || 'Untitled')}</strong></td>
                <td>${escapeHtml((p.authors || []).join(', ') || 'N/A')}</td>
                <td><span class="badge badge-info">${escapeHtml(p.program || 'N/A')}</span></td>
                <td>${escapeHtml(String(p.year || 'N/A'))}</td>
                <td>${statusBadge}</td>
                <td>
                    <div class="table-actions">
                        <button class="action-btn action-view" onclick="window.__libViewProject('${escapeHtml(p.id)}')" title="View details">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            <span class="action-btn-text">View</span>
                        </button>
                        ${isPending ? pendingActionBtns : completedActionBtns}
                    </div>
                </td>
            </tr>`;
        }).join('');

        renderLibProjectsPagination(totalCount);
    }

    function renderLibProjectsPagination(totalCount) {
        const paginationContainer = document.getElementById('lib-projects-pagination');
        if (!paginationContainer) return;

        paginationContainer.innerHTML = '';

        const totalPages = Math.ceil(totalCount / LIB_PROJECTS_PER_PAGE);

        if (totalPages <= 1) {
            if (totalCount > 0 && totalCount < allProjects.length) {
                const infoText = document.createElement('span');
                infoText.className = 'pagination-info';
                infoText.textContent = `Showing ${totalCount} of ${allProjects.length} projects`;
                paginationContainer.appendChild(infoText);
            }
            return;
        }

        const startItem = (currentLibProjectsPage - 1) * LIB_PROJECTS_PER_PAGE + 1;
        const endItem = Math.min(currentLibProjectsPage * LIB_PROJECTS_PER_PAGE, totalCount);

        const prevBtn = document.createElement('button');
        prevBtn.className = 'pagination-btn';
        prevBtn.innerHTML = '&laquo;';
        prevBtn.title = 'Previous page';
        prevBtn.disabled = currentLibProjectsPage === 1;
        prevBtn.addEventListener('click', () => {
            if (currentLibProjectsPage > 1) {
                goToLibProjectsPage(currentLibProjectsPage - 1);
            }
        });
        paginationContainer.appendChild(prevBtn);

        const maxVisiblePages = 7;
        let startPage = Math.max(1, currentLibProjectsPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        if (startPage > 1) {
            const firstBtn = createLibPageButton(1);
            paginationContainer.appendChild(firstBtn);

            if (startPage > 2) {
                const ellipsis = document.createElement('span');
                ellipsis.className = 'pagination-info';
                ellipsis.textContent = '...';
                paginationContainer.appendChild(ellipsis);
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = createLibPageButton(i);
            paginationContainer.appendChild(pageBtn);
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                const ellipsis = document.createElement('span');
                ellipsis.className = 'pagination-info';
                ellipsis.textContent = '...';
                paginationContainer.appendChild(ellipsis);
            }

            const lastBtn = createLibPageButton(totalPages);
            paginationContainer.appendChild(lastBtn);
        }

        const nextBtn = document.createElement('button');
        nextBtn.className = 'pagination-btn';
        nextBtn.innerHTML = '&raquo;';
        nextBtn.title = 'Next page';
        nextBtn.disabled = currentLibProjectsPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (currentLibProjectsPage < totalPages) {
                goToLibProjectsPage(currentLibProjectsPage + 1);
            }
        });
        paginationContainer.appendChild(nextBtn);

        const infoText = document.createElement('span');
        infoText.className = 'pagination-info';
        infoText.textContent = `${startItem}-${endItem} of ${totalCount}`;
        paginationContainer.appendChild(infoText);
    }

    function createLibPageButton(pageNumber) {
        const btn = document.createElement('button');
        btn.className = 'pagination-btn' + (pageNumber === currentLibProjectsPage ? ' active' : '');
        btn.textContent = pageNumber;
        btn.title = `Page ${pageNumber}`;
        btn.addEventListener('click', () => {
            goToLibProjectsPage(pageNumber);
        });
        return btn;
    }

    function goToLibProjectsPage(pageNumber) {
        currentLibProjectsPage = pageNumber;
        renderProjectsTable();

        const section = document.getElementById('section-projects');
        if (section) {
            section.scrollIntoView({ behavior: 'instant', block: 'start' });
        }
    }

    function filterProjectsTable(resetPage = true) {
        if (resetPage) currentLibProjectsPage = 1;
        renderProjectsTable();
    }

    // Global handlers
    window.__libViewProject = (id) => {
        const p = allProjects.find(x => x.id === id);
        if (!p) return;
        sessionStorage.setItem('selectedProjectForViewDetails', JSON.stringify({ id: p.id, ...p }));
        sessionStorage.setItem('showProjectDetails', 'true');
        window.location.href = '../index.html';
    };
    window.__libEditProject = (id) => { openProjectEditModal(id); };
    window.__libGoToCatalog = async (id) => {
        // Fast-hand check: check fresh status directly from Firestore
        try {
            const doc = await db.collection('projects').doc(id).get();
            if (doc.exists) {
                const data = doc.data() || {};
                if (data.isLockedByAdmin) {
                    showToast && showToast('This project is locked by the Administrator and cannot be cataloged.', '🔒');
                    return;
                }
                const currentUid = currentUser?.uid || '';
                if (data.isBeingCataloged && data.catalogingBy && data.catalogingBy !== currentUid) {
                    showToast && showToast(`This project is currently being cataloged by ${data.catalogingByName || 'another librarian'}.`, '⚠️');
                    return;
                }
                if (data.isBeingEdited && data.editingBy && data.editingBy !== currentUid) {
                    showToast && showToast(`This project is currently being edited by ${data.editingByName || 'another user'}.`, '⚠️');
                    return;
                }
            }
        } catch (e) {
            console.warn('__libGoToCatalog pre-check warning:', e);
        }

        switchSection('catalog');
        setTimeout(() => openCatalogNoteModal(id), 250);
    };

    // ─────────────────────────────────────────────
    // PENDING PROJECT EDIT & CATALOG REAL-TIME LOCK MANAGEMENT
    // ─────────────────────────────────────────────
    let currentEditingPendingId = null;
    let currentCatalogingProjectId = null;
    let unsubscribePendingProjects = null;
    let unsubscribeProjects = null;

    function startPendingProjectsListener() {
        if (unsubscribePendingProjects) return;
        try {
            unsubscribePendingProjects = db.collection('pendingProjects').onSnapshot(snap => {
                const updatedPending = snap.docs.map(d => {
                    const data = d.data();
                    return {
                        id: d.id,
                        ...data,
                        status: 'pending',
                        isPendingApproval: true,
                        isBeingEdited: Boolean(data.isBeingEdited),
                        editingBy: data.editingBy || null,
                        editingByName: data.editingByName || null,
                        isLockedByAdmin: Boolean(data.isLockedByAdmin)
                    };
                });

                // Keep existing non-pending projects
                const nonPending = allProjects.filter(p => !p.isPendingApproval && (p.status || '').toLowerCase() !== 'pending');
                allProjects = [...updatedPending, ...nonPending];
                saveLibProjectsToCache(allProjects);

                // If currently viewing projects table, re-render
                const projectsSection = document.getElementById('section-projects');
                if (projectsSection && projectsSection.classList.contains('active')) {
                    renderProjectsTable();
                }

                // If admin locked the project currently open in modal:
                if (currentEditingPendingId) {
                    const currentDoc = updatedPending.find(p => p.id === currentEditingPendingId);
                    if (currentDoc && currentDoc.isLockedByAdmin) {
                        showToast && showToast('This project was locked by the Administrator.', '🔒');
                        closePendingProjectEditModal(false);
                    }
                }
            }, err => {
                console.warn('pendingProjects snapshot listener warning:', err);
            });
        } catch (e) {
            console.warn('Could not start pendingProjects snapshot listener:', e);
        }
    }

    function startProjectsRealtimeListener() {
        if (unsubscribeProjects) return;
        try {
            unsubscribeProjects = db.collection('projects').onSnapshot(snap => {
                const updatedProjects = snap.docs.map(d => {
                    const data = d.data();
                    return {
                        id: d.id,
                        ...data,
                        isLockedByAdmin: Boolean(data.isLockedByAdmin),
                        isBeingCataloged: Boolean(data.isBeingCataloged),
                        catalogingBy: data.catalogingBy || null,
                        catalogingByName: data.catalogingByName || null,
                        isBeingEdited: Boolean(data.isBeingEdited),
                        editingBy: data.editingBy || null,
                        editingByName: data.editingByName || null
                    };
                });

                // Keep pending submissions in allProjects
                const pendingList = allProjects.filter(p => p.isPendingApproval || (p.status || '').toLowerCase() === 'pending');
                allProjects = [...pendingList, ...updatedProjects];
                saveLibProjectsToCache(allProjects);

                // Update completedCatalogProjects
                completedCatalogProjects = updatedProjects.filter(p => {
                    const s = (p.status || '').trim().toLowerCase();
                    return s === 'completed' || s === 'complete';
                });
                completedCatalogProjects.sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));
                saveCatalogToCache(completedCatalogProjects, catalogNotes);

                // If currently viewing projects table, re-render
                const projectsSection = document.getElementById('section-projects');
                if (projectsSection && projectsSection.classList.contains('active')) {
                    renderProjectsTable();
                }

                // If currently viewing catalog, re-render
                const catalogSection = document.getElementById('section-catalog');
                if (catalogSection && catalogSection.classList.contains('active')) {
                    filterCatalogCards();
                }

                // If admin locked the completed project currently open in catalog modal:
                if (currentCatalogingProjectId) {
                    const curDoc = updatedProjects.find(p => p.id === currentCatalogingProjectId);
                    if (curDoc && curDoc.isLockedByAdmin) {
                        showToast && showToast('This project was locked by the Administrator.', '🔒');
                        closeCatalogNoteModal(false);
                    }
                }
            }, err => {
                console.warn('projects snapshot listener warning:', err);
            });
        } catch (e) {
            console.warn('Could not start projects snapshot listener:', e);
        }
    }

    async function freePendingProjectEdit(projectId, silent = false) {
        const pid = projectId || currentEditingPendingId;
        if (!pid) return;

        try {
            await db.collection('pendingProjects').doc(pid).update({
                isBeingEdited: false,
                editingBy: null,
                editingByName: null,
                editingStartedAt: null
            });
        } catch (err) {
            if (!silent) console.warn('Error releasing editing lock:', err);
        }

        if (currentEditingPendingId === pid) {
            currentEditingPendingId = null;
        }
    }

    async function freeCatalogingSession(projectId, silent = false) {
        const pid = projectId || currentCatalogingProjectId;
        if (!pid) return;

        try {
            await db.collection('projects').doc(pid).update({
                isBeingCataloged: false,
                catalogingBy: null,
                catalogingByName: null,
                catalogingStartedAt: null
            });
        } catch (err) {
            if (!silent) console.warn('Error releasing cataloging lock:', err);
        }

        if (currentCatalogingProjectId === pid) {
            currentCatalogingProjectId = null;
        }
    }

    // Auto-free editing & cataloging locks if the browser window/tab is closed
    window.addEventListener('beforeunload', () => {
        if (currentEditingPendingId) {
            try {
                db.collection('pendingProjects').doc(currentEditingPendingId).update({
                    isBeingEdited: false,
                    editingBy: null,
                    editingByName: null,
                    editingStartedAt: null
                });
            } catch (e) {}
        }
        if (currentCatalogingProjectId) {
            try {
                db.collection('projects').doc(currentCatalogingProjectId).update({
                    isBeingCataloged: false,
                    catalogingBy: null,
                    catalogingByName: null,
                    catalogingStartedAt: null
                });
            } catch (e) {}
        }
    });

    window.addEventListener('pagehide', () => {
        if (currentEditingPendingId) {
            try {
                db.collection('pendingProjects').doc(currentEditingPendingId).update({
                    isBeingEdited: false,
                    editingBy: null,
                    editingByName: null,
                    editingStartedAt: null
                });
            } catch (e) {}
        }
        if (currentCatalogingProjectId) {
            try {
                db.collection('projects').doc(currentCatalogingProjectId).update({
                    isBeingCataloged: false,
                    catalogingBy: null,
                    catalogingByName: null,
                    catalogingStartedAt: null
                });
            } catch (e) {}
        }
    });

    window.__libEditPendingSubmission = (projectId) => {
        openPendingProjectEditModal(projectId);
    };

    function initPendingProjectEditModal() {
        document.getElementById('ppe-close-btn')?.addEventListener('click', () => closePendingProjectEditModal(true));
        document.getElementById('ppe-cancel-btn')?.addEventListener('click', () => closePendingProjectEditModal(true));
        document.getElementById('pending-project-edit-modal')?.addEventListener('click', e => {
            if (e.target.id === 'pending-project-edit-modal') closePendingProjectEditModal(true);
        });

        document.getElementById('pending-project-edit-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            await savePendingProjectEdit();
        });

        document.getElementById('ppe-save-btn')?.addEventListener('click', async () => {
            await savePendingProjectEdit();
        });
    }

    async function closePendingProjectEditModal(releaseLock = true) {
        const modal = document.getElementById('pending-project-edit-modal');
        if (modal) modal.style.display = 'none';

        const pid = currentEditingPendingId;
        if (releaseLock && pid) {
            await freePendingProjectEdit(pid);
        } else {
            currentEditingPendingId = null;
        }
    }

    async function openPendingProjectEditModal(projectId) {
        if (!projectId) return;

        // Fast-hand race condition prevention: Always fetch fresh document directly from Firestore
        let project = null;
        try {
            const doc = await db.collection('pendingProjects').doc(projectId).get();
            if (!doc.exists) {
                showToast && showToast('Pending project record not found.', '❌');
                return;
            }
            project = { id: doc.id, ...doc.data(), isPendingApproval: true };
        } catch (err) {
            console.error('Fast-hand lock check failed:', err);
            showToast && showToast('Error verifying project lock status.', '❌');
            return;
        }

        // 1. Check if locked by Admin
        if (project.isLockedByAdmin) {
            showToast && showToast('This project has been locked by the Administrator and cannot be edited.', '🔒');
            return;
        }

        // 2. Check if already being edited in real-time by another user
        const currentUid = currentUser?.uid || '';
        if (project.isBeingEdited && project.editingBy && project.editingBy !== currentUid) {
            const editor = project.editingByName || 'another librarian';
            showToast && showToast(`This project is currently being edited by ${editor}. Please wait until it is freed.`, '⚠️');
            return;
        }

        // 3. Mark in real-time as being edited in Firestore so Admin and others see it immediately
        const editorName = currentUserData?.fullName || currentUser?.displayName || 'Librarian';
        try {
            await db.collection('pendingProjects').doc(projectId).update({
                isBeingEdited: true,
                editingBy: currentUser?.uid || '',
                editingByName: editorName,
                editingStartedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {
            console.error('Error acquiring edit lock:', err);
            showToast && showToast('Could not acquire editing session. Please try again.', '❌');
            return;
        }

        currentEditingPendingId = projectId;

        document.getElementById('ppe-project-id').value = project.id;
        document.getElementById('ppe-title-field').value = project.title || '';
        document.getElementById('ppe-abstract').value = project.abstract || '';
        document.getElementById('ppe-authors').value = Array.isArray(project.authors) ? project.authors.join(', ') : (project.authors || '');
        document.getElementById('ppe-adviser').value = project.adviser || '';
        document.getElementById('ppe-program').value = project.program || '';
        document.getElementById('ppe-year').value = project.year || '';
        document.getElementById('ppe-keywords').value = Array.isArray(project.keywords) ? project.keywords.join(', ') : (project.keywords || '');
        document.getElementById('ppe-topics').value = Array.isArray(project.topics) ? project.topics.join(', ') : (project.topics || '');

        const modal = document.getElementById('pending-project-edit-modal');
        if (modal) modal.style.display = 'flex';
    }

    async function savePendingProjectEdit() {
        const projectId = document.getElementById('ppe-project-id')?.value;
        if (!projectId) return;

        // Fast-hand check: verify fresh lock status before saving
        try {
            const freshDoc = await db.collection('pendingProjects').doc(projectId).get();
            if (freshDoc.exists && freshDoc.data().isLockedByAdmin) {
                showToast && showToast('Operation aborted: This project has been locked by the Administrator.', '🔒');
                await closePendingProjectEditModal(false);
                return;
            }
        } catch (e) {}

        const title = document.getElementById('ppe-title-field').value.trim();
        const abstract = document.getElementById('ppe-abstract').value.trim();
        const authorsRaw = document.getElementById('ppe-authors').value.trim();
        const program = document.getElementById('ppe-program').value;
        const year = document.getElementById('ppe-year').value.trim();

        if (!title || !abstract || !authorsRaw || !program || !year) {
            showToast && showToast('Please fill all required fields.', '❌');
            return;
        }

        const saveBtn = document.getElementById('ppe-save-btn');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

        try {
            const authors = authorsRaw.split(',').map(a => a.trim()).filter(Boolean);
            const keywords = document.getElementById('ppe-keywords').value.split(',').map(k => k.trim()).filter(Boolean);
            const topics = document.getElementById('ppe-topics').value.split(',').map(t => t.trim()).filter(Boolean);

            const editorName = currentUserData?.fullName || currentUser?.displayName || 'Librarian';

            await db.collection('pendingProjects').doc(projectId).update({
                title,
                abstract,
                authors,
                adviser: document.getElementById('ppe-adviser').value.trim(),
                program,
                year: parseInt(year, 10) || year,
                keywords,
                topics,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastEditedBy: currentUser.uid,
                lastEditedByName: editorName,
                isBeingEdited: false,
                editingBy: null,
                editingByName: null,
                editingStartedAt: null
            });

            // Update in local cache optimistically
            const pIdx = allProjects.findIndex(p => p.id === projectId);
            if (pIdx !== -1) {
                allProjects[pIdx] = {
                    ...allProjects[pIdx],
                    title,
                    abstract,
                    authors,
                    adviser: document.getElementById('ppe-adviser').value.trim(),
                    program,
                    year: parseInt(year, 10) || year,
                    keywords,
                    topics,
                    isBeingEdited: false,
                    editingBy: null,
                    editingByName: null
                };
                saveLibProjectsToCache(allProjects);
                renderProjectsTable();
            }

            await closePendingProjectEditModal(false);
            showToast && showToast('Pending project updated successfully!', '✅');

            if (typeof ActivityService !== 'undefined') {
                ActivityService.logAdmin('pending_project_edit', `Edited pending project: ${title}`);
            }
        } catch (err) {
            console.error('savePendingProjectEdit:', err);
            showToast && showToast('Error saving project edits. Try again.', '❌');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Save Changes
                `;
            }
        }
    }

    // ─────────────────────────────────────────────
    // PROJECT EDIT MODAL (Admin-gated)
    // ─────────────────────────────────────────────
    function initProjectEditModal() {
        initAdminTaskModal(); // attach ATM buttons here too

        document.getElementById('pe-close-btn')?.addEventListener('click', () => {
            document.getElementById('project-edit-modal').style.display = 'none';
        });
        document.getElementById('pe-cancel-btn')?.addEventListener('click', () => {
            document.getElementById('project-edit-modal').style.display = 'none';
        });
        document.getElementById('project-edit-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            await saveProjectEdit();
        });
    }

    async function openProjectEditModal(projectId) {
        // Re-check permission
        if (!editPermission || editPermission._endMs <= Date.now()) {
            showToast && showToast('No active edit permission. Please wait for admin approval.', '❌');
            return;
        }
        if (editPermission.projectId && editPermission.projectId !== projectId) {
            showToast && showToast('Admin permission is for a different project.', '❌');
            return;
        }

        // Fast-hand live Firestore check: Always fetch fresh document directly from Firestore
        let project = null;
        try {
            const doc = await db.collection('projects').doc(projectId).get();
            if (!doc.exists) { showToast && showToast('Project not found.', '❌'); return; }
            project = { id: doc.id, ...doc.data() };
        } catch (err) { showToast && showToast('Error loading project.', '❌'); return; }

        // Mutual exclusion checks
        if (project.isLockedByAdmin) {
            showToast && showToast('This project is locked by the Administrator and cannot be edited.', '🔒');
            return;
        }
        const currentUid = currentUser?.uid || '';
        if (project.isBeingCataloged && project.catalogingBy && project.catalogingBy !== currentUid) {
            const cataloger = project.catalogingByName || 'another librarian';
            showToast && showToast(`This project is currently being cataloged by ${cataloger}. Simultaneous editing is locked out.`, '⚠️');
            return;
        }
        if (project.isBeingEdited && project.editingBy && project.editingBy !== currentUid) {
            const editor = project.editingByName || 'another user';
            showToast && showToast(`This project is currently being edited by ${editor}. Please wait until it is freed.`, '⚠️');
            return;
        }

        // Populate form
        document.getElementById('pe-project-id').value = project.id;
        document.getElementById('pe-title-field').value = project.title || '';
        document.getElementById('pe-abstract').value = project.abstract || '';
        document.getElementById('pe-authors').value = (project.authors || []).join(', ');
        document.getElementById('pe-adviser').value = project.adviser || '';
        document.getElementById('pe-program').value = project.program || '';
        document.getElementById('pe-year').value = project.year || '';
        document.getElementById('pe-keywords').value = (project.keywords || []).join(', ');


        document.getElementById('project-edit-modal').style.display = 'flex';
    }

    async function saveProjectEdit() {
        // Re-check permission
        if (!editPermission || editPermission._endMs <= Date.now()) {
            showToast && showToast('Edit time window expired.', '❌');
            document.getElementById('project-edit-modal').style.display = 'none';
            return;
        }

        const projectId = document.getElementById('pe-project-id').value;
        const title = document.getElementById('pe-title-field').value.trim();
        if (!title) { showToast && showToast('Title is required.', '❌'); return; }

        // Fast-hand race condition guard: fresh check from Firestore
        try {
            const checkDoc = await db.collection('projects').doc(projectId).get();
            if (checkDoc.exists && checkDoc.data().isLockedByAdmin) {
                showToast && showToast('Operation blocked: Project was locked by the Administrator.', '🔒');
                document.getElementById('project-edit-modal').style.display = 'none';
                return;
            }
        } catch (e) {}

        const saveBtn = document.getElementById('pe-save-btn');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

        try {
            const authors = document.getElementById('pe-authors').value.split(',').map(a => a.trim()).filter(Boolean);
            const keywords = document.getElementById('pe-keywords').value.split(',').map(k => k.trim()).filter(Boolean);
            await db.collection('projects').doc(projectId).update({
                title,
                abstract: document.getElementById('pe-abstract').value.trim(),
                authors,
                adviser: document.getElementById('pe-adviser').value.trim(),
                program: document.getElementById('pe-program').value,
                year: document.getElementById('pe-year').value.trim(),
                keywords,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastEditedBy: currentUser.uid,
                lastEditedByName: currentUserData?.fullName || 'Librarian'
            });

            // Mark permission as used (optional — admin may revoke or keep)
            try {
                await db.collection('librarianEditPermissions').doc(currentUser.uid)
                    .update({ editingStarted: true, editCompleted: true });
            } catch {}

            showToast && showToast('Project updated successfully!', '✅');
            document.getElementById('project-edit-modal').style.display = 'none';

            // Refresh list
            await loadProjectsData();
            if (typeof ActivityService !== 'undefined') {
                ActivityService.logAdmin('project_edit', `Edited project: ${title}`);
            }
        } catch (err) {
            console.error('saveProjectEdit:', err);
            showToast && showToast('Error saving project. Try again.', '❌');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Save Changes`;
            }
        }
    }

// ─────────────────────────────────────────────
    // DYNAMIC FIELD HELPERS (Single Project Modal)
    // ─────────────────────────────────────────────
    function createDynamicRow(containerId, placeholder, value = '') {
        const container = document.getElementById(containerId);
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'dynamic-input-row';
        row.innerHTML = `
            <input type="text" class="pform-input" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value)}">
            <button type="button" class="remove-row-btn" title="Remove" aria-label="Remove entry">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>`;

        const input = row.querySelector('input');
        const removeBtn = row.querySelector('.remove-row-btn');

        removeBtn.addEventListener('click', () => {
            const allRows = container.querySelectorAll('.dynamic-input-row');
            if (allRows.length <= 1) {
                input.value = '';
                input.focus();
            } else {
                row.remove();
            }
        });

        // Enter key quickly adds next field
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                createDynamicRow(containerId, placeholder, '');
                const rows = container.querySelectorAll('.dynamic-input-row input');
                if (rows.length > 0) rows[rows.length - 1].focus();
            }
        });

        // Paste multiple items -> auto-split into separate rows
        input.addEventListener('paste', (e) => {
            const text = (e.clipboardData || window.clipboardData)?.getData('text');
            if (text && (text.includes(';') || text.includes('\\n') || (text.match(/,/g) || []).length > 1)) {
                e.preventDefault();
                let parts = [];
                if (text.includes(';')) parts = text.split(';');
                else if (text.includes('\\n')) parts = text.split('\\n');
                else parts = text.split(',');
                parts = parts.map(s => s.trim()).filter(Boolean);
                if (parts.length > 0) {
                    input.value = parts[0];
                    for (let i = 1; i < parts.length; i++) {
                        createDynamicRow(containerId, placeholder, parts[i]);
                    }
                }
            }
        });

        container.appendChild(row);
    }

    function getDynamicValues(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return [];
        return Array.from(container.querySelectorAll('input')).map(i => i.value.trim()).filter(v => v.length > 0);
    }

    function clearDynamicContainer(containerId) {
        const c = document.getElementById(containerId);
        if (c) c.innerHTML = '';
    }

    function initDynamicContainers(data = {}) {
        clearDynamicContainer('um-authors-container');
        clearDynamicContainer('um-topics-container');
        clearDynamicContainer('um-keywords-container');
        const authors = data.authors || [];
        const topics = data.topics || [];
        const keywords = data.keywords || [];
        const authorPlaceholder = 'Author name (e.g., Juan Dela Cruz or Reyes, A.)';
        if (authors.length === 0) createDynamicRow('um-authors-container', authorPlaceholder);
        else authors.forEach(a => createDynamicRow('um-authors-container', authorPlaceholder, a));
        if (topics.length > 0) topics.forEach(t => createDynamicRow('um-topics-container', 'e.g., Machine Learning', t));
        if (keywords.length > 0) keywords.forEach(k => createDynamicRow('um-keywords-container', 'e.g., Python', k));
    }

    // Ripple effect helper
    function createRipple(event, button) {
        const ripple = document.createElement('span');
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        ripple.classList.add('ripple-effect');
        button.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }

    // ─────────────────────────────────────────────
    // SINGLE PROJECT IMAGES (Section 04)
    // ─────────────────────────────────────────────
    let umProjectImageFiles = [];

    function initProjectImageHandlers() {
        const dropzone = document.getElementById('um-image-dropzone');
        const fileInput = document.getElementById('um-images-input');
        const browseBtn = document.getElementById('um-images-browse-btn');

        if (!dropzone || !fileInput) return;

        if (browseBtn) {
            browseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                fileInput.click();
            });
        }

        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            if (e.dataTransfer && e.dataTransfer.files) {
                handleSelectedImageFiles(Array.from(e.dataTransfer.files));
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files) {
                handleSelectedImageFiles(Array.from(e.target.files));
                fileInput.value = '';
            }
        });
    }

    function handleSelectedImageFiles(files) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
        const maxSizeBytes = 10 * 1024 * 1024; // 10MB

        for (const file of files) {
            if (!allowedTypes.includes(file.type)) {
                showToast && showToast(`Skipped ${file.name}: Only JPG, PNG, WEBP allowed`, '⚠️');
                continue;
            }
            if (file.size > maxSizeBytes) {
                showToast && showToast(`Skipped ${file.name}: Exceeds 10MB limit`, '⚠️');
                continue;
            }
            umProjectImageFiles.push(file);
        }

        renderProjectImagesPreview();
    }

    function renderProjectImagesPreview() {
        const grid = document.getElementById('um-images-preview-grid');
        if (!grid) return;
        grid.innerHTML = '';

        umProjectImageFiles.forEach((file, index) => {
            const isCover = index === 0;
            const previewUrl = URL.createObjectURL(file);

            const card = document.createElement('div');
            card.className = `image-preview-card ${isCover ? 'is-cover' : ''}`;
            card.innerHTML = `
                <img src="${previewUrl}" alt="${escapeHtml(file.name)}">
                ${isCover ? '<span class="cover-badge">Cover</span>' : ''}
                <div class="image-preview-actions">
                    <button type="button" class="remove-img-btn" title="Remove image" data-file-index="${index}">✕</button>
                </div>
            `;

            card.querySelector('.remove-img-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                URL.revokeObjectURL(previewUrl);
                umProjectImageFiles.splice(index, 1);
                renderProjectImagesPreview();
            });

            grid.appendChild(card);
        });
    }

    function setUploadProcessing(active, label) {
        const modal = document.getElementById('upload-metadata-modal');
        const overlay = document.getElementById('um-save-processing-overlay');
        const labelEl = document.getElementById('um-save-processing-label');
        const closeBtn = document.getElementById('um-close-btn');
        const cancelBtn = document.getElementById('um-cancel-btn');
        const submitBtn = document.getElementById('um-submit-btn');
        const clearBtn = document.getElementById('um-clear-btn');

        if (active) {
            if (labelEl && label) labelEl.textContent = label;
            overlay && overlay.classList.add('active');
            overlay && overlay.setAttribute('aria-hidden', 'false');
            modal && modal.classList.add('is-saving');
            if (closeBtn) closeBtn.disabled = true;
            if (cancelBtn) cancelBtn.disabled = true;
            if (submitBtn) submitBtn.disabled = true;
            if (clearBtn) clearBtn.disabled = true;
        } else {
            overlay && overlay.classList.remove('active');
            overlay && overlay.setAttribute('aria-hidden', 'true');
            modal && modal.classList.remove('is-saving');
            if (closeBtn) closeBtn.disabled = false;
            if (cancelBtn) cancelBtn.disabled = false;
            if (submitBtn) submitBtn.disabled = false;
            if (clearBtn) clearBtn.disabled = false;
        }
    }

    // ─────────────────────────────────────────────
    // ADD NEW PROJECT MODAL (Single Submission)
    // ─────────────────────────────────────────────
    function initUploadMetadataModal() {
        // Dynamic row buttons
        document.getElementById('um-add-author-btn')?.addEventListener('click', () => {
            createDynamicRow('um-authors-container', 'Author name (e.g., Juan Dela Cruz or Reyes, A.)');
        });
        document.getElementById('um-add-topic-btn')?.addEventListener('click', () => {
            createDynamicRow('um-topics-container', 'e.g., Machine Learning');
        });
        document.getElementById('um-add-keyword-btn')?.addEventListener('click', () => {
            createDynamicRow('um-keywords-container', 'e.g., Python');
        });

        // Year selector controls
        const yearInput = document.getElementById('um-year');
        const yearBtnUp = document.getElementById('um-year-up');
        const yearBtnDown = document.getElementById('um-year-down');
        const MIN_YEAR = 2000;
        const MAX_YEAR = 2100;

        if (yearInput && !yearInput.value) {
            yearInput.value = new Date().getFullYear();
        }

        if (yearBtnUp) {
            yearBtnUp.addEventListener('click', (e) => {
                e.preventDefault();
                let currentYear = parseInt(yearInput.value) || new Date().getFullYear();
                if (currentYear < MAX_YEAR) {
                    yearInput.value = currentYear + 1;
                    createRipple(e, yearBtnUp);
                }
            });
        }
        if (yearBtnDown) {
            yearBtnDown.addEventListener('click', (e) => {
                e.preventDefault();
                let currentYear = parseInt(yearInput.value) || new Date().getFullYear();
                if (currentYear > MIN_YEAR) {
                    yearInput.value = currentYear - 1;
                    createRipple(e, yearBtnDown);
                }
            });
        }
        if (yearInput) {
            yearInput.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    let cy = parseInt(yearInput.value) || new Date().getFullYear();
                    if (cy < MAX_YEAR) yearInput.value = cy + 1;
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    let cy = parseInt(yearInput.value) || new Date().getFullYear();
                    if (cy > MIN_YEAR) yearInput.value = cy - 1;
                }
            });
        }

        // Initialize images handlers
        initProjectImageHandlers();

        // Modal buttons
        document.getElementById('um-close-btn')?.addEventListener('click', closeUploadModal);
        document.getElementById('um-cancel-btn')?.addEventListener('click', closeUploadModal);
        document.getElementById('um-clear-btn')?.addEventListener('click', resetUploadModalForm);
        document.getElementById('upload-metadata-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitMetadata();
        });
        document.getElementById('um-modal-overlay')?.addEventListener('click', (e) => {
            if (e.target.id === 'um-modal-overlay') closeUploadModal();
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeUploadModal();
                closeBulkModal();
            }
        });
    }

    function openUploadModal() {
        resetUploadModalForm();
        const modal = document.getElementById('upload-metadata-modal');
        if (modal) {
            modal.style.display = 'flex';
            void modal.offsetHeight;
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeUploadModal() {
        const modal = document.getElementById('upload-metadata-modal');
        if (modal && modal.classList.contains('is-saving')) return;
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    function resetUploadModalForm() {
        const form = document.getElementById('upload-metadata-form');
        if (form) form.reset();
        const yearInput = document.getElementById('um-year');
        if (yearInput) yearInput.value = new Date().getFullYear();
        initDynamicContainers();
        umProjectImageFiles = [];
        renderProjectImagesPreview();
    }

    async function submitMetadata() {
        const title = (document.getElementById('um-title-field')?.value || '').trim();
        const authors = getDynamicValues('um-authors-container');
        const program = document.getElementById('um-program')?.value || '';
        const year = document.getElementById('um-year')?.value || '';
        const adviser = (document.getElementById('um-adviser')?.value || '').trim();
        const abstract = (document.getElementById('um-abstract')?.value || '').trim();
        const topics = getDynamicValues('um-topics-container');
        const keywords = getDynamicValues('um-keywords-container');

        if (!title) {
            showToast && showToast('Project title is required.', '⚠️');
            return;
        }
        if (authors.length === 0) {
            showToast && showToast('Please add at least one author.', '⚠️');
            return;
        }
        if (!program) {
            showToast && showToast('Please select an academic program.', '⚠️');
            return;
        }
        if (!year) {
            showToast && showToast('Year is required.', '⚠️');
            return;
        }
        if (!abstract) {
            showToast && showToast('Abstract is required.', '⚠️');
            return;
        }

        setUploadProcessing(true, 'Submitting project for admin approval...');

        try {
            // Upload images to Cloudinary if files selected & Cloudinary is configured
            let uploadedImages = [];
            if (umProjectImageFiles.length > 0) {
                if (typeof CloudinaryService !== 'undefined' && CloudinaryService.isConfigured && CloudinaryService.isConfigured()) {
                    setUploadProcessing(true, `Uploading ${umProjectImageFiles.length} image(s) to Cloudinary...`);
                    for (let i = 0; i < umProjectImageFiles.length; i++) {
                        const file = umProjectImageFiles[i];
                        try {
                            const res = await CloudinaryService.uploadImage(file, 'recaps/projects');
                            uploadedImages.push({
                                url: res.secure_url || res.url,
                                secure_url: res.secure_url || res.url,
                                public_id: res.public_id || '',
                                name: file.name
                            });
                        } catch (imgErr) {
                            console.warn('Image upload failed, continuing:', imgErr);
                        }
                    }
                } else {
                    // Fallback to storing metadata / data preview
                    for (let i = 0; i < umProjectImageFiles.length; i++) {
                        const file = umProjectImageFiles[i];
                        try {
                            const dataUrl = await new Promise((res, rej) => {
                                const r = new FileReader();
                                r.onload = e => res(e.target.result);
                                r.onerror = rej;
                                r.readAsDataURL(file);
                            });
                            uploadedImages.push({
                                url: dataUrl,
                                secure_url: dataUrl,
                                name: file.name
                            });
                        } catch {}
                    }
                }
            }

            const coverImage = uploadedImages.length > 0
                ? (uploadedImages[0].secure_url || uploadedImages[0].url || '')
                : '';

            // Submit strictly to pendingProjects (Librarian limitation: never direct to projects)
            await db.collection('pendingProjects').add({
                title,
                abstract,
                authors,
                adviser,
                program,
                year: parseInt(year, 10) || year,
                topics,
                keywords,
                images: uploadedImages,
                coverImage,
                status: 'pending',
                isPublic: false,
                submittedBy: currentUser.uid,
                submittedByName: currentUserData?.fullName || currentUser.displayName || 'Librarian',
                submittedByEmail: currentUser.email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            closeUploadModal();
            showToast && showToast('Project submitted! Awaiting admin approval.', '✅');

            if (typeof ActivityService !== 'undefined') {
                ActivityService.logAdmin('metadata_upload', `Submitted: ${title}`);
            }

            await loadDashboardData();
            await loadProjectsData();
        } catch (err) {
            console.error('submitMetadata:', err);
            showToast && showToast('Error submitting project. Try again.', '❌');
        } finally {
            setUploadProcessing(false);
        }
    }

    // ─────────────────────────────────────────────
    // BULK IMPORT PROJECTS (Admin-Identical UI/UX)
    // ─────────────────────────────────────────────
    let bulkImportBatches = [];
    let _bulkPickerOpen = false;

    const sampleProjects = [
        {
            title: "AI-Powered Agricultural Monitoring System for Precision Farming",
            authors: ["Juan Dela Cruz", "Juan Dela Vina"],
            program: "BSIT",
            year: 2024,
            adviser: "Prof. Elena Villanueva",
            abstract: "This study explores the development and implementation of an AI-powered agricultural monitoring system designed to enhance precision farming practices.",
            keywords: ["Artificial Intelligence", "Agriculture", "Machine Learning"],
            topics: ["Smart Farming", "Technology"],
            status: "Pending"
        },
        {
            title: "Sustainable Fishing Practices in Coastal Communities",
            authors: ["Pedro Garcia"],
            program: "BSFi",
            year: 2024,
            adviser: "Dr. Ramon Cruz",
            abstract: "An investigation into sustainable fishing practices and their socioeconomic impact on coastal communities in the Philippines.",
            keywords: ["Sustainability", "Fisheries"],
            topics: ["Marine Science"],
            status: "Pending"
        },
        {
            title: "Blockchain-Based Supply Chain Management",
            authors: ["Anna Reyes", "Carlos Mendoza"],
            program: "BSIE",
            year: 2023,
            adviser: "Engr. Roberto Santos",
            abstract: "This research presents a blockchain-based supply chain management solution tailored for Philippine SMEs.",
            keywords: ["Blockchain", "Supply Chain"],
            topics: ["Industrial Engineering"],
            status: "Pending"
        }
    ];

    function formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function getAllBulkProjects() {
        return bulkImportBatches.flatMap(b => b.projects);
    }

    function generateExcelTemplate(projects) {
        if (typeof XLSX === 'undefined') {
            showToast && showToast('SheetJS library not loaded', '❌');
            return;
        }
        const wb = XLSX.utils.book_new();
        const wsData = [
            ['title', 'authors', 'program', 'year', 'adviser', 'abstract', 'keywords', 'topics', 'status']
        ];
        projects.forEach(project => {
            wsData.push([
                project.title,
                Array.isArray(project.authors) ? project.authors.join(', ') : project.authors,
                project.program,
                project.year,
                project.adviser || '',
                project.abstract || '',
                Array.isArray(project.keywords) ? project.keywords.join(', ') : project.keywords || '',
                Array.isArray(project.topics) ? project.topics.join(', ') : project.topics || '',
                'Pending'
            ]);
        });
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [
            { wch: 50 }, { wch: 30 }, { wch: 15 }, { wch: 8 },
            { wch: 25 }, { wch: 60 }, { wch: 30 }, { wch: 30 }, { wch: 12 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Projects');
        XLSX.writeFile(wb, 'RECAP_Bulk_Import_Template.xlsx');
    }

    function generateJsonTemplate(projects) {
        const jsonString = JSON.stringify(projects, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'RECAP_Bulk_Import_Template.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function initBulkImportModal() {
        document.getElementById('bulk-download-excel-template')?.addEventListener('click', () => {
            generateExcelTemplate(sampleProjects);
            showToast && showToast('Excel template downloaded', '✅');
        });

        document.getElementById('bulk-download-json-template')?.addEventListener('click', () => {
            generateJsonTemplate(sampleProjects);
            showToast && showToast('JSON template downloaded', '✅');
        });

        document.getElementById('bulk-close-btn')?.addEventListener('click', closeBulkModal);
        document.getElementById('bulk-import-cancel-btn')?.addEventListener('click', closeBulkModal);
        document.getElementById('bulk-modal-overlay')?.addEventListener('click', (e) => {
            if (e.target.id === 'bulk-modal-overlay') closeBulkModal();
        });

        const fileInput = document.getElementById('bulk-import-file-input');
        const dropzone = document.getElementById('bulk-import-dropzone');
        const chooseBtn = document.getElementById('bulk-import-choose-btn');

        function openBulkFilePicker() {
            if (_bulkPickerOpen || !fileInput) return;
            _bulkPickerOpen = true;
            fileInput.click();
            const onFocus = () => {
                _bulkPickerOpen = false;
                window.removeEventListener('focus', onFocus);
            };
            window.addEventListener('focus', onFocus, { once: true });
        }

        chooseBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            openBulkFilePicker();
        });

        if (dropzone) {
            dropzone.addEventListener('click', (e) => {
                if (e.target.closest('#bulk-import-choose-btn')) return;
                openBulkFilePicker();
            });

            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('drag-active');
            });

            dropzone.addEventListener('dragleave', (e) => {
                if (!dropzone.contains(e.relatedTarget)) {
                    dropzone.classList.remove('drag-active');
                }
            });

            dropzone.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('drag-active');
                const files = Array.from(e.dataTransfer.files || []);
                for (const file of files) {
                    await processBulkFile(file);
                }
            });
        }

        fileInput?.addEventListener('change', async (e) => {
            _bulkPickerOpen = false;
            const files = Array.from(e.target.files || []);
            for (const file of files) {
                await processBulkFile(file);
            }
            fileInput.value = '';
        });

        document.getElementById('bulk-clear-all-batches-btn')?.addEventListener('click', () => {
            bulkImportBatches = [];
            if (fileInput) fileInput.value = '';
            updateBulkBatchesUI();
            showToast && showToast('All staged batches removed', '🗑️');
        });

        document.getElementById('bulk-import-submit-btn')?.addEventListener('click', submitBulkProjects);
    }

    function openBulkModal() {
        const modal = document.getElementById('bulk-add-modal');
        if (modal) {
            modal.style.display = 'flex';
            void modal.offsetHeight;
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
        resetBulkImportState();
    }

    function closeBulkModal() {
        const modal = document.getElementById('bulk-add-modal');
        if (modal && modal.classList.contains('is-importing')) return;
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
        resetBulkImportState();
    }

    function resetBulkImportState() {
        bulkImportBatches = [];
        const fileInput = document.getElementById('bulk-import-file-input');
        if (fileInput) fileInput.value = '';
        const progress = document.getElementById('bulk-import-progress');
        if (progress) progress.style.display = 'none';
        const results = document.getElementById('bulk-import-results');
        if (results) results.style.display = 'none';
        updateBulkBatchesUI();
    }

    async function processBulkFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const isExcel = ext === 'xlsx' || ext === 'xls';
        const isJson = ext === 'json';

        if (!isExcel && !isJson) {
            showToast && showToast(`"${file.name}": Unsupported format. Use .xlsx, .xls, or .json`, '⚠️');
            return;
        }

        try {
            let projects = [];
            if (isExcel) {
                projects = await parseExcelFile(file);
            } else {
                projects = await parseJsonFile(file);
            }

            if (!projects || projects.length === 0) {
                showToast && showToast(`"${file.name}" has no valid project rows`, '⚠️');
                return;
            }

            // Validate and sanitize rows
            const validProjects = [];
            for (const p of projects) {
                if (!p.title || !p.program) continue;
                validProjects.push({
                    title: String(p.title).trim(),
                    authors: Array.isArray(p.authors) ? p.authors : String(p.authors || '').split(',').map(a => a.trim()).filter(Boolean),
                    program: String(p.program).trim(),
                    year: parseInt(p.year, 10) || new Date().getFullYear(),
                    adviser: String(p.adviser || '').trim(),
                    abstract: String(p.abstract || '').trim(),
                    keywords: Array.isArray(p.keywords) ? p.keywords : String(p.keywords || '').split(',').map(k => k.trim()).filter(Boolean),
                    topics: Array.isArray(p.topics) ? p.topics : String(p.topics || '').split(',').map(t => t.trim()).filter(Boolean),
                    status: 'pending' // Librarian limitation: always pending approval
                });
            }

            if (validProjects.length === 0) {
                showToast && showToast(`No valid projects found in "${file.name}" (title & program required)`, '⚠️');
                return;
            }

            const newBatch = {
                id: 'batch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                batchNumber: bulkImportBatches.length + 1,
                fileName: file.name,
                fileSize: formatFileSize(file.size),
                fileType: isExcel ? 'Excel' : 'JSON',
                projects: validProjects
            };

            bulkImportBatches.push(newBatch);
            updateBulkBatchesUI();
            showToast && showToast(`Added Batch ${newBatch.batchNumber}: "${file.name}" (${validProjects.length} projects)`, '✅');
        } catch (err) {
            console.error('Error parsing bulk file:', err);
            showToast && showToast(isExcel ? 'Invalid Excel format' : 'Invalid JSON format', '❌');
        }
    }

    async function parseExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
                    resolve(jsonData);
                } catch (err) { reject(err); }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    }

    async function parseJsonFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const parsed = JSON.parse(e.target.result);
                    resolve(Array.isArray(parsed) ? parsed : [parsed]);
                } catch (err) { reject(err); }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    function removeBatch(batchId) {
        const idx = bulkImportBatches.findIndex(b => b.id === batchId);
        if (idx !== -1) {
            const removed = bulkImportBatches.splice(idx, 1)[0];
            showToast && showToast(`Removed Batch: "${removed.fileName}"`, '🗑️');
            updateBulkBatchesUI();
        }
    }

    function updateBulkBatchesUI() {
        bulkImportBatches.forEach((batch, index) => {
            batch.batchNumber = index + 1;
        });

        const totalBatches = bulkImportBatches.length;
        const totalProjects = getAllBulkProjects().length;

        const batchesContainer = document.getElementById('bulk-batches-container');
        const batchesPill = document.getElementById('bulk-batches-pill');
        const batchesList = document.getElementById('bulk-batches-list');
        const dropzone = document.getElementById('bulk-import-dropzone');
        const dropzoneTitle = document.getElementById('bulk-dropzone-title');
        const dropzoneSubtext = document.getElementById('bulk-dropzone-subtext');
        const chooseBtn = document.getElementById('bulk-import-choose-btn');
        const preview = document.getElementById('bulk-import-preview');
        const previewCount = document.getElementById('bulk-import-count');
        const previewBatchCount = document.getElementById('bulk-import-batch-count');
        const submitBtn = document.getElementById('bulk-import-submit-btn');
        const submitText = document.getElementById('bulk-import-submit-text');

        if (totalBatches === 0) {
            if (batchesContainer) batchesContainer.style.display = 'none';
            if (preview) preview.style.display = 'none';
            if (submitBtn) submitBtn.disabled = true;
            if (submitText) submitText.textContent = 'Submit All for Admin Approval';
            if (dropzone) {
                dropzone.classList.remove('has-batches', 'drag-active');
                if (dropzoneTitle) dropzoneTitle.innerHTML = '<strong>Drag &amp; drop files here to add a batch</strong>';
                if (dropzoneSubtext) dropzoneSubtext.style.display = 'block';
                if (chooseBtn) chooseBtn.textContent = 'Browse Files';
            }
            return;
        }

        if (batchesContainer) batchesContainer.style.display = 'block';
        if (batchesPill) {
            batchesPill.textContent = `${totalBatches} batch${totalBatches !== 1 ? 'es' : ''} • ${totalProjects} project${totalProjects !== 1 ? 's' : ''}`;
        }

        if (batchesList) {
            batchesList.innerHTML = '';
            bulkImportBatches.forEach(batch => {
                const item = document.createElement('div');
                item.className = 'bulk-batch-item';
                const typeClass = batch.fileType === 'Excel' ? 'excel' : 'json';
                item.innerHTML = `
                    <div class="bulk-batch-left">
                        <span class="batch-badge">Batch ${batch.batchNumber}</span>
                        <span class="batch-type-pill ${typeClass}">${batch.fileType}</span>
                        <span class="batch-filename" title="${escapeHtml(batch.fileName)}">${escapeHtml(batch.fileName)}</span>
                        <span class="batch-meta-info">(${batch.projects.length} project${batch.projects.length !== 1 ? 's' : ''} • ${batch.fileSize})</span>
                    </div>
                    <button type="button" class="bulk-batch-remove-btn" title="Remove Batch ${batch.batchNumber}">✕</button>
                `;
                item.querySelector('.bulk-batch-remove-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeBatch(batch.id);
                });
                batchesList.appendChild(item);
            });
        }

        if (dropzone) {
            dropzone.classList.add('has-batches');
            if (dropzoneTitle) dropzoneTitle.innerHTML = `<strong>+ Drag &amp; drop more files or Browse to add Batch ${totalBatches + 1}</strong>`;
            if (dropzoneSubtext) dropzoneSubtext.style.display = 'none';
            if (chooseBtn) chooseBtn.textContent = `+ Add Batch ${totalBatches + 1}`;
        }

        renderBulkPreviewList();
        if (previewCount) previewCount.textContent = totalProjects;
        if (previewBatchCount) previewBatchCount.textContent = totalBatches;
        if (preview) preview.style.display = totalProjects > 0 ? 'block' : 'none';

        if (submitBtn) submitBtn.disabled = totalProjects === 0;
        if (submitText) {
            submitText.textContent = `Submit All for Admin Approval (${totalProjects} Project${totalProjects !== 1 ? 's' : ''})`;
        }
    }

    function renderBulkPreviewList() {
        const previewList = document.getElementById('bulk-import-preview-list');
        if (!previewList) return;
        previewList.innerHTML = '';

        bulkImportBatches.forEach(batch => {
            const groupEl = document.createElement('div');
            groupEl.className = 'bulk-batch-group';
            const typeClass = batch.fileType === 'Excel' ? 'excel' : 'json';
            groupEl.innerHTML = `
                <div class="bulk-batch-group-header">
                    <div class="bulk-batch-group-left">
                        <span class="batch-badge">Batch ${batch.batchNumber}</span>
                        <span class="batch-type-pill ${typeClass}">${batch.fileType}</span>
                        <span class="bulk-batch-group-title" title="${escapeHtml(batch.fileName)}">${escapeHtml(batch.fileName)}</span>
                        <span class="batch-meta-info">(${batch.projects.length} project${batch.projects.length !== 1 ? 's' : ''})</span>
                    </div>
                    <button type="button" class="bulk-batch-remove-btn" title="Remove Batch ${batch.batchNumber}">✕</button>
                </div>
                <div class="bulk-batch-group-items"></div>
            `;

            groupEl.querySelector('.bulk-batch-remove-btn').addEventListener('click', () => {
                removeBatch(batch.id);
            });

            const itemsContainer = groupEl.querySelector('.bulk-batch-group-items');
            batch.projects.forEach((project, pIndex) => {
                const item = document.createElement('div');
                item.className = 'bulk-preview-item';
                const authors = Array.isArray(project.authors) ? project.authors.join(', ') : project.authors;
                item.innerHTML = `
                    <div class="bulk-preview-item-header">
                        <div>
                            <div class="bulk-preview-item-title">${pIndex + 1}. ${escapeHtml(project.title)}</div>
                            <div class="bulk-preview-item-meta">
                                <span>${escapeHtml(authors)}</span>
                                <span>${escapeHtml(project.program)}</span>
                                <span>${escapeHtml(String(project.year))}</span>
                                <span class="badge badge-info" style="font-size:0.75rem;">Pending Approval</span>
                            </div>
                        </div>
                    </div>
                `;
                itemsContainer.appendChild(item);
            });

            previewList.appendChild(groupEl);
        });
    }

    function setBulkProcessing(active, label, sublabel) {
        const modal = document.getElementById('bulk-add-modal');
        const overlay = document.getElementById('bulk-processing-overlay');
        const labelEl = document.getElementById('bulk-processing-label');
        const sublabelEl = document.getElementById('bulk-processing-sublabel');
        const closeBtn = document.getElementById('bulk-close-btn');
        const cancelBtn = document.getElementById('bulk-import-cancel-btn');
        const submitBtn = document.getElementById('bulk-import-submit-btn');

        if (active) {
            const bodyEl = modal ? modal.querySelector('.modal-body') : null;
            if (bodyEl) bodyEl.scrollTop = 0;
            if (labelEl && label) labelEl.textContent = label;
            if (sublabelEl && sublabel) sublabelEl.textContent = sublabel;
            overlay && overlay.classList.add('active');
            overlay && overlay.setAttribute('aria-hidden', 'false');
            modal && modal.classList.add('is-importing');
            if (closeBtn) closeBtn.disabled = true;
            if (cancelBtn) cancelBtn.disabled = true;
            if (submitBtn) submitBtn.disabled = true;
        } else {
            overlay && overlay.classList.remove('active');
            overlay && overlay.setAttribute('aria-hidden', 'true');
            modal && modal.classList.remove('is-importing');
            if (closeBtn) closeBtn.disabled = false;
            if (cancelBtn) cancelBtn.disabled = false;
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    async function submitBulkProjects() {
        const allProjects = getAllBulkProjects();
        if (bulkImportBatches.length === 0 || allProjects.length === 0) {
            showToast && showToast('No projects to submit.', '⚠️');
            return;
        }

        const total = allProjects.length;
        const preview = document.getElementById('bulk-import-preview');
        const batchesContainer = document.getElementById('bulk-batches-container');
        const submitBtn = document.getElementById('bulk-import-submit-btn');
        const progressContainer = document.getElementById('bulk-import-progress');
        const progressBar = document.getElementById('bulk-import-progress-bar');
        const progressText = document.getElementById('bulk-import-progress-text');
        const overlayBar = document.getElementById('bulk-overlay-progress-bar');
        const overlayText = document.getElementById('bulk-overlay-progress-text');
        const resultsContainer = document.getElementById('bulk-import-results');
        const successCountEl = document.getElementById('bulk-success-count');
        const errorCountEl = document.getElementById('bulk-error-count');
        const errorsContainer = document.getElementById('bulk-import-errors');
        const errorsList = document.getElementById('bulk-import-error-list');

        if (preview) preview.style.display = 'none';
        if (batchesContainer) batchesContainer.style.display = 'none';
        if (submitBtn) submitBtn.style.display = 'none';
        if (progressContainer) progressContainer.style.display = 'block';

        setBulkProcessing(true, 'Submitting projects for admin approval…', `Processing 0 of ${total} projects…`);
        if (overlayBar) overlayBar.style.width = '0%';
        if (overlayText) overlayText.textContent = '0%';

        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        let overallProcessed = 0;

        try {
            for (let b = 0; b < bulkImportBatches.length; b++) {
                const batch = bulkImportBatches[b];
                for (let p = 0; p < batch.projects.length; p++) {
                    const project = batch.projects[p];
                    const pct = Math.round((overallProcessed / total) * 100);

                    if (progressBar) progressBar.style.width = `${pct}%`;
                    if (progressText) progressText.textContent = `${overallProcessed} / ${total} submitted`;
                    if (overlayBar) overlayBar.style.width = `${pct}%`;
                    if (overlayText) overlayText.textContent = `${pct}%`;

                    try {
                        await db.collection('pendingProjects').add({
                            title: project.title || 'Untitled',
                            abstract: project.abstract || '',
                            authors: Array.isArray(project.authors) ? project.authors : String(project.authors || '').split(',').map(a => a.trim()).filter(Boolean),
                            adviser: project.adviser || '',
                            program: project.program || '',
                            year: parseInt(project.year, 10) || project.year || new Date().getFullYear(),
                            keywords: Array.isArray(project.keywords) ? project.keywords : String(project.keywords || '').split(',').map(k => k.trim()).filter(Boolean),
                            topics: Array.isArray(project.topics) ? project.topics : String(project.topics || '').split(',').map(t => t.trim()).filter(Boolean),
                            images: [],
                            status: 'pending',
                            isPublic: false,
                            submittedBy: currentUser.uid,
                            submittedByName: currentUserData?.fullName || currentUser.displayName || 'Librarian',
                            submittedByEmail: currentUser.email,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        successCount++;
                    } catch (itemErr) {
                        console.error('Error submitting item:', itemErr);
                        errorCount++;
                        errors.push(`${project.title || 'Untitled'}: ${itemErr.message}`);
                    }

                    overallProcessed++;
                }
            }

            // 100% complete
            if (progressBar) progressBar.style.width = '100%';
            if (progressText) progressText.textContent = `${total} / ${total} submitted`;
            if (overlayBar) overlayBar.style.width = '100%';
            if (overlayText) overlayText.textContent = '100%';

            setBulkProcessing(false);

            if (progressContainer) progressContainer.style.display = 'none';
            if (resultsContainer) resultsContainer.style.display = 'block';
            if (successCountEl) successCountEl.textContent = successCount;
            if (errorCountEl) errorCountEl.textContent = errorCount;

            if (errorCount > 0 && errorsContainer && errorsList) {
                errorsContainer.style.display = 'block';
                errorsList.innerHTML = errors.map(e => `<li>${escapeHtml(e)}</li>`).join('');
            }

            showToast && showToast(`${successCount} of ${total} projects submitted for admin approval!`, '✅');

            if (typeof ActivityService !== 'undefined') {
                ActivityService.logAdmin('bulk_upload', `Submitted ${successCount} projects for approval`);
            }

            await loadDashboardData();
            await loadProjectsData();

            // Auto-close after brief delay if all succeeded
            if (errorCount === 0) {
                setTimeout(() => {
                    closeBulkModal();
                }, 1500);
            }
        } catch (fatalErr) {
            console.error('Fatal bulk submit error:', fatalErr);
            setBulkProcessing(false);
            showToast && showToast('Error during bulk submission.', '❌');
        }
    }

    // ===== Catalog Cache Helpers (Instant Render Strategy) =====
    function loadCatalogFromCache() {
        try {
            const cachedProj = localStorage.getItem('libCatalogProjectsData');
            const cachedNotes = localStorage.getItem('libCatalogNotesData');
            if (cachedProj && cachedNotes) {
                return {
                    projects: JSON.parse(cachedProj),
                    notes: JSON.parse(cachedNotes)
                };
            }
            return null;
        } catch (e) {
            console.warn('Error reading catalog cache:', e);
            return null;
        }
    }

    function saveCatalogToCache(projects, notes) {
        try {
            localStorage.setItem('libCatalogProjectsData', JSON.stringify(projects));
            localStorage.setItem('libCatalogNotesData', JSON.stringify(notes));
            localStorage.setItem('libCatalogMetadata', JSON.stringify({
                projectCount: projects.length,
                notesCount: Object.keys(notes).length,
                lastCached: new Date().toISOString()
            }));
            console.log(`✓ Cached ${projects.length} catalog projects & notes`);
        } catch (e) {
            console.warn('Error saving catalog cache:', e);
        }
    }

    function invalidateCatalogCache() {
        try {
            localStorage.removeItem('libCatalogProjectsData');
            localStorage.removeItem('libCatalogNotesData');
            localStorage.removeItem('libCatalogMetadata');
            console.log('🗑️ Catalog cache invalidated');
        } catch (e) {}
    }

    // ─────────────────────────────────────────────
    // CATALOG DATA (Instant Cache Render + Lazy Background Sync)
    // ─────────────────────────────────────────────
    async function loadCatalogData(forceRefresh = false) {
        const grid = document.getElementById('catalog-grid');
        if (!grid) return;

        let renderedFromCache = false;

        // 1. Instant Cache Render Trick (Zero wait time)
        if (!forceRefresh) {
            let cached = (completedCatalogProjects && completedCatalogProjects.length > 0 && Object.keys(catalogNotes).length > 0)
                ? { projects: completedCatalogProjects, notes: catalogNotes }
                : loadCatalogFromCache();

            if (cached && Array.isArray(cached.projects) && cached.projects.length > 0) {
                completedCatalogProjects = cached.projects;
                catalogNotes = cached.notes || {};
                renderCatalogGrid(completedCatalogProjects);
                filterCatalogCards();
                renderedFromCache = true;
                console.log('🚀 Using cached catalog for instant render - revalidating in background...');
            }
        }

        // Show loading placeholder only if nothing rendered from cache
        if (!renderedFromCache) {
            grid.innerHTML = '<div class="lib-loading-text" style="grid-column:1/-1;text-align:center;padding:3rem;">Loading completed projects...</div>';
        }

        // 2. Asynchronous Background Revalidation (Stale-While-Revalidate)
        try {
            // Load projects: strictly only Completed projects
            const snap = await db.collection('projects').get();
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Filter for Completed status
            const completed = all.filter(p => {
                const s = (p.status || '').trim().toLowerCase();
                return s === 'completed' || s === 'complete';
            });

            // Sort newest first
            completed.sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));

            // Load all catalog notes
            let freshNotes = {};
            try {
                const cnSnap = await db.collection('catalogNotes').get();
                cnSnap.forEach(d => { freshNotes[d.id] = d.data(); });
            } catch (cnErr) {
                console.warn('catalogNotes fetch:', cnErr);
                freshNotes = catalogNotes; // retain existing in-memory notes on fetch error
            }

            completedCatalogProjects = completed;
            catalogNotes = freshNotes;
            saveCatalogToCache(completedCatalogProjects, catalogNotes);
            renderCatalogGrid(completedCatalogProjects);
            filterCatalogCards();

            if (forceRefresh) {
                showToast && showToast('Catalog refreshed', '✓');
            }
        } catch (err) {
            console.error('loadCatalogData:', err);
            if (!renderedFromCache) {
                grid.innerHTML = '<div class="lib-loading-text" style="grid-column:1/-1;text-align:center;color:#ef4444;">⚠️ Error loading catalog.</div>';
            } else {
                console.warn('Background sync failed for catalog, using cached data.');
            }
        }
    }

    // ─────────────────────────────────────────────
    // CATALOG STUDIO STATE & FILTERS
    // ─────────────────────────────────────────────
    let currentCatalogTab = 'all'; // 'all' | 'needs-shelf' | 'shelved'
    let currentCatalogProgram = 'all';
    let currentCatalogSort = 'newest';
    let previewingCatalogProjectId = null;

    function updateCatalogKPIs(total, shelved, needs) {
        const totalEl = document.getElementById('catalog-kpi-val-total');
        const shelvedEl = document.getElementById('catalog-kpi-val-shelved');
        const needsEl = document.getElementById('catalog-kpi-val-needs');
        const pctEl = document.getElementById('catalog-kpi-val-pct');
        const barEl = document.getElementById('catalog-progress-bar');
        const subProgEl = document.getElementById('catalog-kpi-sub-progress');

        const countAll = document.getElementById('catalog-count-all');
        const countNeeds = document.getElementById('catalog-count-needs');
        const countShelved = document.getElementById('catalog-count-shelved');

        if (totalEl) totalEl.textContent = total;
        if (shelvedEl) shelvedEl.textContent = shelved;
        if (needsEl) needsEl.textContent = needs;

        if (countAll) countAll.textContent = total;
        if (countNeeds) countNeeds.textContent = needs;
        if (countShelved) countShelved.textContent = shelved;

        const pct = total > 0 ? Math.round((shelved / total) * 100) : 0;
        if (pctEl) pctEl.textContent = `${pct}%`;
        if (barEl) barEl.style.width = `${pct}%`;
        if (subProgEl) subProgEl.textContent = `${shelved} of ${total} cataloged`;

        // Update active class on KPI cards based on currentCatalogTab
        document.querySelectorAll('.catalog-kpi-card[data-filter]').forEach(card => {
            const f = card.getAttribute('data-filter');
            card.classList.toggle('active', f === currentCatalogTab);
        });

        // Update active class on tabs
        document.querySelectorAll('.catalog-filter-tab[data-tab]').forEach(tab => {
            const t = tab.getAttribute('data-tab');
            tab.classList.toggle('active', t === currentCatalogTab);
        });
    }

    function updateCatalogProgramOptions(programs) {
        const select = document.getElementById('catalog-program-filter');
        if (!select) return;

        const selectedVal = currentCatalogProgram || 'all';
        const existingCount = select.options.length;
        if (existingCount <= 1 && programs.length > 0) {
            select.innerHTML = '<option value="all">All Programs</option>' +
                programs.map(prg => `<option value="${escapeHtml(prg)}">${escapeHtml(prg)}</option>`).join('');
            select.value = selectedVal;
        }
    }

    function getFilteredCatalogProjects(projects) {
        const term = (document.getElementById('catalog-search')?.value || '').trim().toLowerCase();

        let filtered = projects.filter(p => {
            const note = catalogNotes[p.id];
            const hasShelf = !!(note?.note && note.note.trim());
            const hasAnyClass = !!(note && (note.note || note.callNumber || note.accessionNumber || note.subjectHeading));
            const isShelved = hasShelf || hasAnyClass;

            // 1. Tab filter
            if (currentCatalogTab === 'needs-shelf' && isShelved) return false;
            if (currentCatalogTab === 'shelved' && !isShelved) return false;

            // 2. Program filter
            if (currentCatalogProgram !== 'all') {
                const prg = (p.program || '').trim().toLowerCase();
                if (prg !== currentCatalogProgram.toLowerCase()) return false;
            }

            // 3. Search query
            if (term) {
                const title = (p.title || '').toLowerCase();
                const authors = (p.authors || []).join(' ').toLowerCase();
                const prog = (p.program || '').toLowerCase();
                const shelf = (note?.note || '').toLowerCase();
                const call = (note?.callNumber || '').toLowerCase();
                const acc = (note?.accessionNumber || '').toLowerCase();
                const subj = (note?.subjectHeading || '').toLowerCase();

                const combined = `${title} ${authors} ${prog} ${shelf} ${call} ${acc} ${subj}`;
                if (!combined.includes(term)) return false;
            }

            return true;
        });

        // 4. Sort
        if (currentCatalogSort === 'newest') {
            filtered.sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));
        } else if (currentCatalogSort === 'oldest') {
            filtered.sort((a, b) => getTimestamp(a.createdAt) - getTimestamp(b.createdAt));
        } else if (currentCatalogSort === 'title-asc') {
            filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        } else if (currentCatalogSort === 'shelf-asc') {
            filtered.sort((a, b) => {
                const noteA = catalogNotes[a.id]?.note || 'zzz';
                const noteB = catalogNotes[b.id]?.note || 'zzz';
                return noteA.localeCompare(noteB);
            });
        }

        return filtered;
    }

    function renderCatalogGrid(projects) {
        const grid = document.getElementById('catalog-grid');
        if (!grid) return;

        if (!Array.isArray(projects) || projects.length === 0) {
            grid.innerHTML = '<div class="lib-loading-text" style="grid-column:1/-1;text-align:center;padding:3rem;">No completed projects found. Only projects with status "Completed" appear in cataloging.</div>';
            updateCatalogKPIs(0, 0, 0);
            return;
        }

        // 1. Compute overall repository stats
        let shelvedCount = 0;
        let needsCount = 0;
        const progSet = new Set();

        projects.forEach(p => {
            if (p.program) progSet.add(p.program);
            const note = catalogNotes[p.id];
            const isShelved = !!(note && (note.note?.trim() || note.callNumber?.trim() || note.accessionNumber?.trim() || note.subjectHeading?.trim()));
            if (isShelved) shelvedCount++;
            else needsCount++;
        });

        updateCatalogKPIs(projects.length, shelvedCount, needsCount);
        updateCatalogProgramOptions(Array.from(progSet).sort());

        // 2. Filter & Sort
        const displayedProjects = getFilteredCatalogProjects(projects);

        if (displayedProjects.length === 0) {
            grid.innerHTML = `
                <div class="lib-loading-text" style="grid-column:1/-1;text-align:center;padding:3.5rem 1.5rem;">
                    <div style="font-size:2.2rem;margin-bottom:0.6rem;">📦</div>
                    <strong style="color:var(--text-primary);font-size:1.05rem;display:block;margin-bottom:0.35rem;">No matching archival records</strong>
                    <span style="color:var(--text-secondary);font-size:0.85rem;">No theses match the current filter or search criteria. Try changing status tabs or clearing search.</span>
                </div>`;
            return;
        }

        grid.innerHTML = displayedProjects.map(p => {
            const note = catalogNotes[p.id];
            const hasShelf = !!(note?.note && note.note.trim());
            const hasAnyClass = !!(note && (note.note || note.callNumber || note.accessionNumber || note.subjectHeading));
            const isShelved = hasShelf || hasAnyClass;

            const chips = [];
            if (note?.callNumber) chips.push(`<span class="catalog-chip"><span class="chip-k">Call:</span> <strong>${escapeHtml(note.callNumber)}</strong></span>`);
            if (note?.accessionNumber) chips.push(`<span class="catalog-chip"><span class="chip-k">Acc:</span> <strong>${escapeHtml(note.accessionNumber)}</strong></span>`);
            if (note?.subjectHeading) chips.push(`<span class="catalog-chip"><span class="chip-k">Subj:</span> <strong>${escapeHtml(note.subjectHeading)}</strong></span>`);
            const chipsHtml = chips.length > 0 ? `<div class="catalog-chips-row">${chips.join('')}</div>` : '';

            const updatedByName = note?.lastUpdatedByName || note?.createdByName || p.catalogAudit?.lastUpdatedByName || p.lastCatalogedByName;
            const auditStamp = isShelved
                ? `<div class="catalog-card-accountability">
                       <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                       <span>Shelved by <strong>${escapeHtml(updatedByName || 'Librarian')}</strong> · ${formatDate(note?.updatedAt || note?.createdAt || p.lastCatalogedAt)}</span>
                   </div>`
                : `<div class="catalog-card-accountability unassigned">
                       <span>⚪ Awaiting physical shelving</span>
                   </div>`;

            const isLocked = Boolean(p.isLockedByAdmin);
            const currentUid = currentUser?.uid || '';
            const isBeingCatalogedByOther = Boolean(p.isBeingCataloged) && p.catalogingBy && p.catalogingBy !== currentUid;
            const isBeingEditedByOther = Boolean(p.isBeingEdited) && p.editingBy && p.editingBy !== currentUid;

            let shelfBoxClick = `onclick="window.__libOpenCatalogNote('${escapeHtml(p.id)}')"` ;
            if (isLocked) {
                shelfBoxClick = `onclick="showToast('This project is locked by the Administrator and cannot be modified.', '🔒')"` ;
            } else if (isBeingCatalogedByOther) {
                const cataloger = escapeHtml(p.catalogingByName || 'another librarian');
                shelfBoxClick = `onclick="showToast('This project is currently being cataloged by ${cataloger}. Simultaneous editing is locked out.', '⚠️')"` ;
            } else if (isBeingEditedByOther) {
                const editor = escapeHtml(p.editingByName || 'another user');
                shelfBoxClick = `onclick="showToast('This project is currently being edited by ${editor}. Please wait until it is freed.', '⚠️')"` ;
            }

            const shelfBox = isShelved
                ? `<div class="catalog-shelf-box has-shelf" ${shelfBoxClick} title="${isLocked ? 'Locked by Admin' : isBeingCatalogedByOther ? 'In use by ' + escapeHtml(p.catalogingByName || 'librarian') : 'Click to edit physical shelf placement'}">
                       <div class="catalog-shelf-box-top">
                           <span class="catalog-shelf-label">
                               <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                               Physical Location
                           </span>
                           <span class="catalog-shelf-quick-edit">${isLocked ? '🔒 Locked' : isBeingCatalogedByOther ? 'In Use' : 'Click to edit ✏️'}</span>
                       </div>
                       <div class="catalog-shelf-location-text">${escapeHtml(note?.note || 'Location recorded (see call number)')}</div>
                   </div>`
                : `<div class="catalog-shelf-box needs-shelf" ${shelfBoxClick} title="${isLocked ? 'Locked by Admin' : isBeingCatalogedByOther ? 'In use by ' + escapeHtml(p.catalogingByName || 'librarian') : 'Click to assign shelf location'}">
                       <div class="catalog-shelf-empty-wrap">
                           <div class="catalog-shelf-empty-icon">
                               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                           </div>
                           <div class="catalog-shelf-empty-text">
                               <strong>${isLocked ? '🔒 Locked by Admin' : isBeingCatalogedByOther ? '✏️ In Use by ' + escapeHtml(p.catalogingByName || 'Librarian') : 'No Physical Shelf Assigned'}</strong>
                               <span>${isLocked ? 'Cataloging disabled while locked' : isBeingCatalogedByOther ? 'Being cataloged in another session' : 'Click to record cabinet, shelf, or call #'}</span>
                           </div>
                       </div>
                   </div>`;

            let primaryBtn = '';
            if (isLocked) {
                primaryBtn = `
                    <button type="button" class="catalog-btn-primary btn-locked" disabled title="Locked by Administrator — Cannot edit or catalog">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        Locked by Admin
                    </button>
                `;
            } else if (isBeingCatalogedByOther) {
                const cataloger = escapeHtml(p.catalogingByName || 'Another Librarian');
                primaryBtn = `
                    <button type="button" class="catalog-btn-primary btn-in-use" disabled title="In use by ${cataloger}">
                        <span class="live-editing-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#fbbf24;margin-right:4px;"></span>
                        In use by ${cataloger}
                    </button>
                `;
            } else if (isBeingEditedByOther) {
                const editor = escapeHtml(p.editingByName || 'Another Librarian');
                primaryBtn = `
                    <button type="button" class="catalog-btn-primary btn-in-use" disabled title="In use by ${editor}">
                        <span class="live-editing-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#fbbf24;margin-right:4px;"></span>
                        In use by ${editor}
                    </button>
                `;
            } else {
                primaryBtn = `
                    <button class="catalog-btn-primary ${isShelved ? 'btn-edit-shelf' : 'btn-add-shelf'}" onclick="window.__libOpenCatalogNote('${escapeHtml(p.id)}')">
                        ${isShelved
                            ? '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 16.5-3.5z"/></svg> Edit Shelf &amp; Classification'
                            : '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Assign Shelf Location'}
                    </button>
                `;
            }

            const headerTag = isLocked
                ? `<span class="catalog-shelf-tag tag-locked"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Locked by Admin</span>`
                : (isShelved
                    ? '<span class="catalog-shelf-tag tag-shelved"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Shelved in Archive</span>'
                    : '<span class="catalog-shelf-tag tag-needs"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Needs Shelving</span>');

            return `<div class="catalog-card ${isShelved ? 'shelved' : 'needs-shelf'}" data-id="${escapeHtml(p.id)}">
                <div class="catalog-card-header">
                    ${headerTag}
                    <span class="catalog-program-badge">${escapeHtml(p.program || 'N/A')}</span>
                </div>
                <h3 class="catalog-card-title" title="${escapeHtml(p.title || 'Untitled')}">${escapeHtml(p.title || 'Untitled')}</h3>
                <div class="catalog-card-meta">
                    <div class="catalog-card-meta-row" title="${escapeHtml((p.authors || []).join(', '))}"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${escapeHtml((p.authors || []).join(', ') || 'Unknown Authors')}</div>
                    <div class="catalog-card-meta-row"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Academic Year: <strong>${escapeHtml(String(p.year || 'N/A'))}</strong></div>
                </div>
                ${shelfBox}
                ${chipsHtml}
                ${auditStamp}
                <div class="catalog-card-actions">
                    ${primaryBtn}
                    <button class="catalog-btn-secondary" onclick="window.__libPreviewCatalogThesis('${escapeHtml(p.id)}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/></svg>
                        Preview
                    </button>
                </div>
            </div>`;
        }).join('');
    }

    function filterCatalogCards() {
        renderCatalogGrid(completedCatalogProjects);
    }

    // ─────────────────────────────────────────────
    // THESIS QUICK PREVIEW MODAL
    // ─────────────────────────────────────────────
    function openCatalogThesisPreview(projectId) {
        previewingCatalogProjectId = projectId;
        const project = completedCatalogProjects.find(p => p.id === projectId) || allProjects.find(p => p.id === projectId);
        if (!project) return;

        const note = catalogNotes[projectId];
        const isShelved = !!(note && (note.note?.trim() || note.callNumber?.trim() || note.accessionNumber?.trim() || note.subjectHeading?.trim()));

        // Populate fields
        const titleEl = document.getElementById('ctm-project-title');
        const progEl = document.getElementById('ctm-program');
        const yearEl = document.getElementById('ctm-year');
        const shelfPillEl = document.getElementById('ctm-shelf-pill');
        const authorsEl = document.getElementById('ctm-authors');
        const adviserEl = document.getElementById('ctm-adviser');
        const shelfNoteEl = document.getElementById('ctm-shelf-note');
        const callEl = document.getElementById('ctm-call-number');
        const accEl = document.getElementById('ctm-accession');
        const subjEl = document.getElementById('ctm-subject');
        const abstractEl = document.getElementById('ctm-abstract');

        if (titleEl) titleEl.textContent = project.title || 'Untitled';
        if (progEl) progEl.textContent = project.program || 'N/A';
        if (yearEl) yearEl.textContent = `AY ${project.year || 'N/A'}`;
        if (authorsEl) authorsEl.textContent = (project.authors || []).join(', ') || 'N/A';
        if (adviserEl) adviserEl.textContent = project.adviser || project.advisor || 'N/A';

        if (shelfPillEl) {
            shelfPillEl.className = `ctm-shelf-pill ${isShelved ? '' : 'unassigned'}`;
            shelfPillEl.textContent = isShelved ? '📍 Shelved in Archive' : '⚠️ Awaiting Shelf Assignment';
        }

        if (shelfNoteEl) shelfNoteEl.textContent = note?.note || 'Not yet recorded';
        if (callEl) callEl.textContent = note?.callNumber || '—';
        if (accEl) accEl.textContent = note?.accessionNumber || '—';
        if (subjEl) subjEl.textContent = note?.subjectHeading || '—';

        if (abstractEl) {
            const abstractText = project.abstract || project.description || 'No abstract summary provided for this project.';
            abstractEl.textContent = abstractText;

            const abstractWrap = document.getElementById('ctm-abstract-wrap');
            const abstractToggle = document.getElementById('ctm-abstract-toggle');
            if (abstractWrap) abstractWrap.classList.remove('expanded');
            if (abstractToggle) {
                abstractToggle.setAttribute('aria-expanded', 'false');
                abstractToggle.innerHTML = `<span>Read More</span> <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;
                // Only show Read More button if text is long enough to need truncation
                abstractToggle.style.display = abstractText.length > 150 ? 'inline-flex' : 'none';
            }
        }

        const modal = document.getElementById('catalog-thesis-modal');
        if (modal) modal.style.display = 'flex';
    }

    function closeCatalogThesisPreview() {
        previewingCatalogProjectId = null;
        const modal = document.getElementById('catalog-thesis-modal');
        if (modal) modal.style.display = 'none';
    }

    window.__libOpenCatalogNote = (projectId) => { openCatalogNoteModal(projectId); };
    window.__libPreviewCatalogThesis = (projectId) => { openCatalogThesisPreview(projectId); };

    // ─────────────────────────────────────────────
    // CATALOG NOTE MODAL & STUDIO FILTERS
    // ─────────────────────────────────────────────
    const CATALOG_SECTIONS_STORAGE_KEY = 're_caps_catalog_studio_collapse_prefs';

    function getCatalogSectionPrefs() {
        try {
            const raw = localStorage.getItem(CATALOG_SECTIONS_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    return {
                        hero: !!parsed.hero,
                        location: !!parsed.location,
                        classification: !!parsed.classification,
                        accountability: !!parsed.accountability
                    };
                }
            }
        } catch (e) {
            console.warn('Failed reading catalog section preferences from localStorage:', e);
        }
        // Default when no preferences saved: all collapsed (zero psychological clutter)
        return {
            hero: false,
            location: false,
            classification: false,
            accountability: false
        };
    }

    function saveCatalogSectionPrefs(prefs) {
        try {
            localStorage.setItem(CATALOG_SECTIONS_STORAGE_KEY, JSON.stringify(prefs));
            flashPrefMemoryIndicator();
        } catch (e) {
            console.warn('Failed saving catalog section preferences to localStorage:', e);
        }
    }

    let prefSaveTimer = null;
    function flashPrefMemoryIndicator() {
        const chip = document.getElementById('cn-pref-indicator');
        const text = document.getElementById('cn-pref-status-text');
        if (!chip || !text) return;

        chip.classList.add('is-saving');
        text.textContent = 'Preference Remembered';

        clearTimeout(prefSaveTimer);
        prefSaveTimer = setTimeout(() => {
            chip.classList.remove('is-saving');
            text.textContent = 'Device Memory Active';
        }, 1500);
    }

    function applyCatalogSectionPrefs(prefs) {
        const keys = ['hero', 'location', 'classification', 'accountability'];
        keys.forEach(key => {
            const sec = document.getElementById(`cn-sec-${key}`);
            if (!sec) return;
            const isExpanded = !!prefs[key];
            const headerBtn = sec.querySelector('.cn-collapse-header');

            if (isExpanded) {
                sec.classList.remove('is-collapsed');
                if (headerBtn) headerBtn.setAttribute('aria-expanded', 'true');
            } else {
                sec.classList.add('is-collapsed');
                if (headerBtn) headerBtn.setAttribute('aria-expanded', 'false');
            }
        });
        updateCatalogSectionPreviews();
    }

    function toggleCatalogSection(sectionKey) {
        const prefs = getCatalogSectionPrefs();
        prefs[sectionKey] = !prefs[sectionKey];
        saveCatalogSectionPrefs(prefs);
        applyCatalogSectionPrefs(prefs);
    }

    function setAllCatalogSections(state) {
        const prefs = {
            hero: !!state,
            location: !!state,
            classification: !!state,
            accountability: !!state
        };
        saveCatalogSectionPrefs(prefs);
        applyCatalogSectionPrefs(prefs);
    }

    function updateCatalogSectionPreviews() {
        // 1. Hero Summary Preview
        const heroPreview = document.getElementById('cn-hero-summary-preview');
        if (heroPreview) {
            const title = document.getElementById('cn-project-title')?.textContent?.trim() || '';
            const prog = document.getElementById('cn-project-program')?.textContent?.trim() || '';
            if (title && title !== 'Loading project title...') {
                const shortTitle = title.length > 32 ? title.slice(0, 32) + '…' : title;
                heroPreview.textContent = prog ? `${prog} · "${shortTitle}"` : shortTitle;
                heroPreview.classList.add('has-value');
            } else {
                heroPreview.textContent = 'Undergraduate Thesis';
                heroPreview.classList.remove('has-value');
            }
        }

        // 2. Location Summary Preview
        const locPreview = document.getElementById('cn-location-summary-preview');
        if (locPreview) {
            const note = document.getElementById('cn-note')?.value?.trim() || '';
            if (note) {
                const firstLine = note.split('\n')[0].trim();
                locPreview.textContent = firstLine.length > 28 ? firstLine.slice(0, 28) + '…' : firstLine;
                locPreview.classList.add('has-value');
            } else {
                locPreview.textContent = 'Not set';
                locPreview.classList.remove('has-value');
            }
        }

        // 3. Classification Summary Preview
        const classPreview = document.getElementById('cn-class-summary-preview');
        if (classPreview) {
            const call = document.getElementById('cn-call-number')?.value?.trim() || '';
            const acc = document.getElementById('cn-accession')?.value?.trim() || '';
            if (call && acc) {
                classPreview.textContent = `${call} · ${acc}`;
                classPreview.classList.add('has-value');
            } else if (call) {
                classPreview.textContent = `Call: ${call}`;
                classPreview.classList.add('has-value');
            } else if (acc) {
                classPreview.textContent = `Acc: ${acc}`;
                classPreview.classList.add('has-value');
            } else {
                classPreview.textContent = 'Not indexed';
                classPreview.classList.remove('has-value');
            }
        }

        // 4. Accountability Summary Preview
        const accPreview = document.getElementById('cn-acc-summary-preview');
        if (accPreview) {
            const updatedVal = document.getElementById('cn-updated-by-val')?.textContent?.trim() || '';
            if (updatedVal && updatedVal !== '—') {
                accPreview.textContent = updatedVal.length > 30 ? updatedVal.slice(0, 30) + '…' : updatedVal;
                accPreview.classList.add('has-value');
            } else {
                accPreview.textContent = 'Audit Log';
                accPreview.classList.remove('has-value');
            }
        }
    }

    function initCatalogNoteModal() {
        document.getElementById('cn-close-btn')?.addEventListener('click', () => closeCatalogNoteModal(true));
        document.getElementById('cn-cancel-btn')?.addEventListener('click', () => closeCatalogNoteModal(true));
        document.getElementById('catalog-note-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            await saveCatalogNote();
        });
        document.getElementById('catalog-note-modal')?.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeCatalogNoteModal();
        });

        // Dynamic Collapsible Section Headers with Local Storage Memory
        document.querySelectorAll('.cn-collapsible-section[data-section-key] .cn-collapse-header').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const sec = btn.closest('.cn-collapsible-section');
                const key = sec?.getAttribute('data-section-key');
                if (key) toggleCatalogSection(key);
            });
        });

        // Expand All / Collapse All Toolbar Buttons
        document.getElementById('cn-expand-all-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            setAllCatalogSections(true);
        });
        document.getElementById('cn-collapse-all-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            setAllCatalogSections(false);
        });

        // Real-time preview updates when librarian types
        document.getElementById('cn-note')?.addEventListener('input', updateCatalogSectionPreviews);
        document.getElementById('cn-call-number')?.addEventListener('input', updateCatalogSectionPreviews);
        document.getElementById('cn-accession')?.addEventListener('input', updateCatalogSectionPreviews);
        document.getElementById('cn-subject')?.addEventListener('input', updateCatalogSectionPreviews);

        // Toggle history dropdown
        document.getElementById('cn-history-toggle-btn')?.addEventListener('click', () => {
            const dropdown = document.getElementById('cn-history-dropdown');
            if (dropdown) {
                dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
            }
        });

        // Clear / Delete Note
        document.getElementById('cn-delete-btn')?.addEventListener('click', async () => {
            await deleteCatalogNote();
        });

        // --- Studio Tab Filters ---
        document.querySelectorAll('.catalog-filter-tab[data-tab]').forEach(tab => {
            tab.addEventListener('click', () => {
                currentCatalogTab = tab.getAttribute('data-tab') || 'all';
                filterCatalogCards();
            });
        });

        // --- KPI Card Clicks ---
        document.getElementById('catalog-kpi-total')?.addEventListener('click', () => {
            currentCatalogTab = 'all';
            filterCatalogCards();
        });
        document.getElementById('catalog-kpi-shelved')?.addEventListener('click', () => {
            currentCatalogTab = 'shelved';
            filterCatalogCards();
        });
        document.getElementById('catalog-kpi-needs')?.addEventListener('click', () => {
            currentCatalogTab = 'needs-shelf';
            filterCatalogCards();
        });

        // --- Program Filter Select ---
        document.getElementById('catalog-program-filter')?.addEventListener('change', e => {
            currentCatalogProgram = e.target.value;
            filterCatalogCards();
        });

        // --- Sort Filter Select ---
        document.getElementById('catalog-sort-filter')?.addEventListener('change', e => {
            currentCatalogSort = e.target.value;
            filterCatalogCards();
        });

        // --- Catalog Search ---
        document.getElementById('catalog-search')?.addEventListener('input', () => {
            filterCatalogCards();
        });

        // --- Thesis Preview Modal Listeners ---
        document.getElementById('ctm-close-btn')?.addEventListener('click', closeCatalogThesisPreview);
        document.getElementById('ctm-cancel-btn')?.addEventListener('click', closeCatalogThesisPreview);
        document.getElementById('catalog-thesis-modal')?.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeCatalogThesisPreview();
        });
        document.getElementById('ctm-abstract-toggle')?.addEventListener('click', () => {
            const wrap = document.getElementById('ctm-abstract-wrap');
            const toggle = document.getElementById('ctm-abstract-toggle');
            if (!wrap || !toggle) return;
            const isExp = wrap.classList.toggle('expanded');
            toggle.setAttribute('aria-expanded', String(isExp));
            toggle.innerHTML = isExp 
                ? `<span>Show Less</span> <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>`
                : `<span>Read More</span> <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;
        });
        document.getElementById('ctm-edit-note-btn')?.addEventListener('click', () => {
            if (previewingCatalogProjectId) {
                const pid = previewingCatalogProjectId;
                closeCatalogThesisPreview();
                openCatalogNoteModal(pid);
            }
        });
        document.getElementById('ctm-full-view-btn')?.addEventListener('click', () => {
            if (previewingCatalogProjectId) {
                window.__libViewProject(previewingCatalogProjectId);
            }
        });
    }

    // Quick insert helper for catalog location note
    window.__cnInsertHelper = function(prefix) {
        // Automatically expand location section if user clicks a quick cue so they see what they typed
        const prefs = getCatalogSectionPrefs();
        if (!prefs.location) {
            prefs.location = true;
            saveCatalogSectionPrefs(prefs);
            applyCatalogSectionPrefs(prefs);
        }
        const textarea = document.getElementById('cn-note');
        if (!textarea) return;
        const currentVal = textarea.value;
        if (currentVal && !currentVal.endsWith('\n') && !currentVal.endsWith(' ')) {
            textarea.value = currentVal + '\n' + prefix;
        } else {
            textarea.value = (currentVal || '') + prefix;
        }
        textarea.focus();
        updateCatalogSectionPreviews();
    };

    async function openCatalogNoteModal(projectId) {
        if (!projectId) return;

        // FAST-HAND SERVER-SIDE CHECK: Always fetch fresh document directly from Firestore
        let project = null;
        try {
            const freshDoc = await db.collection('projects').doc(projectId).get();
            if (!freshDoc.exists) {
                showToast && showToast('Project record not found.', '❌');
                return;
            }
            project = { id: freshDoc.id, ...freshDoc.data() };
        } catch (err) {
            console.error('Error fetching project:', err);
            showToast && showToast('Error checking project status.', '❌');
            return;
        }

        // 1. MUTUAL EXCLUSION: If locked by Admin, NO ONE can touch it (neither librarian nor admin)
        if (project.isLockedByAdmin) {
            showToast && showToast('This project is locked by the Administrator. Cataloging and editing are disabled.', '🔒');
            return;
        }

        // 2. CONCURRENCY: If currently being cataloged by another user, check TTL
        const currentUid = currentUser?.uid || '';
        if (project.isBeingCataloged && project.catalogingBy && project.catalogingBy !== currentUid) {
            let isStale = false;
            if (project.catalogingStartedAt) {
                try {
                    const started = project.catalogingStartedAt.toDate ? project.catalogingStartedAt.toDate() : new Date(project.catalogingStartedAt);
                    if (Date.now() - started.getTime() > 15 * 60 * 1000) isStale = true;
                } catch (e) {}
            }
            if (!isStale) {
                const cataloger = project.catalogingByName || 'another librarian';
                showToast && showToast(`This project is currently being cataloged by ${cataloger}. Simultaneous editing is locked out.`, '⚠️');
                return;
            }
        }

        // 3. CONCURRENCY: If currently being edited by another user, check TTL
        if (project.isBeingEdited && project.editingBy && project.editingBy !== currentUid) {
            let isEditStale = false;
            if (project.editingStartedAt) {
                try {
                    const started = project.editingStartedAt.toDate ? project.editingStartedAt.toDate() : new Date(project.editingStartedAt);
                    if (Date.now() - started.getTime() > 15 * 60 * 1000) isEditStale = true;
                } catch (e) {}
            }
            if (!isEditStale) {
                const editor = project.editingByName || 'another user';
                showToast && showToast(`This project is currently being edited by ${editor}. Please wait until it is freed.`, '⚠️');
                return;
            }
        }

        // 4. Acquire exclusive real-time cataloging lock in Firestore
        const librarianName = currentUserData?.fullName || currentUser?.displayName || 'Librarian';
        try {
            await db.collection('projects').doc(projectId).update({
                isBeingCataloged: true,
                catalogingBy: currentUid,
                catalogingByName: librarianName,
                catalogingStartedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {
            console.error('Error acquiring cataloging lock:', err);
            showToast && showToast('Could not acquire cataloging session lock.', '❌');
            return;
        }

        currentCatalogingProjectId = projectId;

        document.getElementById('cn-project-id').value = projectId;
        document.getElementById('cn-project-title').textContent = project?.title || 'Untitled Project';

        // Update dynamic admin locked pill
        const adminLockedPill = document.getElementById('cn-admin-locked-pill');
        if (adminLockedPill) adminLockedPill.style.display = project.isLockedByAdmin ? 'inline-flex' : 'none';

        // Populate metadata chips
        const progEl = document.getElementById('cn-project-program');
        if (progEl) progEl.textContent = project?.program || project?.department || 'Undergraduate Thesis';

        const yearEl = document.getElementById('cn-project-year');
        if (yearEl) yearEl.textContent = project?.year ? `AY ${project.year}` : 'Archive Record';

        const authorsEl = document.getElementById('cn-project-authors');
        if (authorsEl) {
            let authorsText = '—';
            if (Array.isArray(project?.authors) && project.authors.length > 0) {
                authorsText = project.authors.join(', ');
            } else if (project?.authors) {
                authorsText = String(project.authors);
            } else if (project?.author) {
                authorsText = String(project.author);
            }
            authorsEl.textContent = authorsText;
        }

        // Load existing note
        const note = catalogNotes[projectId];
        document.getElementById('cn-note').value = note?.note || '';
        document.getElementById('cn-call-number').value = note?.callNumber || '';
        document.getElementById('cn-accession').value = note?.accessionNumber || '';
        document.getElementById('cn-subject').value = note?.subjectHeading || '';

        // Reset history dropdown
        const historyDropdown = document.getElementById('cn-history-dropdown');
        if (historyDropdown) historyDropdown.style.display = 'none';

        // Populate Accountability Card
        const accCard = document.getElementById('cn-accountability-card');
        const createdRow = document.getElementById('cn-acc-created');
        const updatedRow = document.getElementById('cn-acc-updated');
        const createdVal = document.getElementById('cn-created-by-val');
        const updatedVal = document.getElementById('cn-updated-by-val');
        const historyList = document.getElementById('cn-history-list');
        const deleteBtn = document.getElementById('cn-delete-btn');

        const hasRecord = !!(note && (note.note || note.callNumber || note.accessionNumber || note.subjectHeading));

            const accSec = document.getElementById('cn-sec-accountability');
            if (hasRecord) {
                if (deleteBtn) deleteBtn.style.display = 'inline-flex';
                if (accSec) accSec.style.display = 'block';
                if (accCard) accCard.style.display = 'block';

                const creator = note.createdByName || project?.catalogAudit?.createdByName || 'Librarian';
                const creatorEmail = note.createdByEmail || '';
                const updater = note.lastUpdatedByName || project?.catalogAudit?.lastUpdatedByName || creator;
                const updaterEmail = note.lastUpdatedByEmail || project?.catalogAudit?.lastUpdatedByEmail || creatorEmail;

                if (createdVal) {
                    createdVal.textContent = `${creator}${creatorEmail ? ' (' + creatorEmail + ')' : ''} · ${formatDate(note.createdAt || project?.lastCatalogedAt)}`;
                    if (createdRow) createdRow.style.display = 'flex';
                }
                if (updatedVal) {
                    updatedVal.textContent = `${updater}${updaterEmail ? ' (' + updaterEmail + ')' : ''} · ${formatDate(note.updatedAt || project?.lastCatalogedAt)}`;
                    if (updatedRow) updatedRow.style.display = 'flex';
                }

                const history = Array.isArray(note.auditHistory) ? note.auditHistory : [];
                if (historyList) {
                    if (history.length === 0) {
                        historyList.innerHTML = '<div style="color:var(--text-secondary);font-size:0.75rem;padding:0.4rem;">Initial record created.</div>';
                    } else {
                        historyList.innerHTML = history.map(item => `
                            <div class="cn-history-item">
                                <div class="cn-history-item-top">
                                    <span>${escapeHtml(item.action || 'Updated')}</span>
                                    <span style="font-size:0.7rem;color:var(--text-secondary);">${formatDate(item.timestamp)}</span>
                                </div>
                                <div class="cn-history-item-desc">
                                    Librarian: <strong>${escapeHtml(item.userName || 'Librarian')}</strong> (${escapeHtml(item.userEmail || '')})
                                </div>
                                ${item.details ? `<div style="font-size:0.68rem;color:var(--text-secondary);margin-top:2px;">${escapeHtml(item.details)}</div>` : ''}
                            </div>
                        `).join('');
                    }
                }
            } else {
                if (deleteBtn) deleteBtn.style.display = 'none';
                if (accSec) accSec.style.display = 'none';
                if (accCard) accCard.style.display = 'none';
            }

            // Restore the librarian's dynamic collapsible preferences from device memory
            const savedPrefs = getCatalogSectionPrefs();
            applyCatalogSectionPrefs(savedPrefs);
            updateCatalogSectionPreviews();

            document.getElementById('catalog-note-modal').style.display = 'flex';
        }

    async function closeCatalogNoteModal(releaseLock = true) {
        document.getElementById('catalog-note-modal').style.display = 'none';
        const pid = currentCatalogingProjectId;
        if (releaseLock && pid) {
            await freeCatalogingSession(pid);
        } else {
            currentCatalogingProjectId = null;
        }
    }

    async function saveCatalogNote() {
        const projectId = document.getElementById('cn-project-id').value;
        if (!projectId) return;

        // Fast-hand race condition guard: fresh check from Firestore
        try {
            const checkDoc = await db.collection('projects').doc(projectId).get();
            if (checkDoc.exists && checkDoc.data().isLockedByAdmin) {
                showToast && showToast('Operation blocked: Project was locked by the Administrator.', '🔒');
                await closeCatalogNoteModal(false);
                return;
            }
        } catch (e) {}

        const noteText = document.getElementById('cn-note').value.trim();
        const callNumber = document.getElementById('cn-call-number').value.trim();
        const accession = document.getElementById('cn-accession').value.trim();
        const subject = document.getElementById('cn-subject').value.trim();

        const saveBtn = document.getElementById('cn-save-btn');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

        try {
            const currentUserName = currentUserData?.fullName || currentUser.displayName || 'Librarian';
            const currentUserEmail = currentUser.email || 'N/A';
            const nowISO = new Date().toISOString();
            const existingNote = catalogNotes[projectId];
            const isNew = !existingNote || (!existingNote.note && !existingNote.callNumber && !existingNote.accessionNumber);
            const actionName = isNew ? 'Created catalog record' : 'Updated catalog details';

            const newAuditEntry = {
                action: actionName,
                userId: currentUser.uid,
                userName: currentUserName,
                userEmail: currentUserEmail,
                timestamp: nowISO,
                details: `Location: "${noteText.slice(0, 45)}" | Call: "${callNumber}"`
            };

            const existingHistory = Array.isArray(existingNote?.auditHistory) ? existingNote.auditHistory : [];
            const updatedHistory = [newAuditEntry, ...existingHistory].slice(0, 30);

            const noteData = {
                note: noteText,
                callNumber,
                accessionNumber: accession,
                subjectHeading: subject,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: currentUser.uid,
                updatedByName: currentUserName,
                updatedByEmail: currentUserEmail,
                auditHistory: updatedHistory,
                projectId
            };

            if (isNew) {
                noteData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                noteData.createdBy = currentUser.uid;
                noteData.createdByName = currentUserName;
                noteData.createdByEmail = currentUserEmail;
            }

            // 1. Save to catalogNotes
            await db.collection('catalogNotes').doc(projectId).set(noteData, { merge: true });

            // 2. Update projects collection with catalog info + audit AND release catalog lock
            await db.collection('projects').doc(projectId).update({
                cataloged: true,
                catalogLocation: noteText,
                callNumber,
                accessionNumber: accession,
                subjectHeading: subject,
                lastCatalogedAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastCatalogedBy: currentUser.uid,
                lastCatalogedByName: currentUserName,
                lastCatalogedByEmail: currentUserEmail,
                isBeingCataloged: false,
                catalogingBy: null,
                catalogingByName: null,
                catalogingStartedAt: null,
                catalogAudit: {
                    lastAction: actionName,
                    lastUpdatedByName: currentUserName,
                    lastUpdatedByEmail: currentUserEmail,
                    lastUpdatedAt: nowISO,
                    createdByName: isNew ? currentUserName : (existingNote?.createdByName || currentUserName),
                    historyCount: updatedHistory.length
                }
            });

            // Update local cache & persistent storage optimistically
            catalogNotes[projectId] = { ...catalogNotes[projectId], ...noteData };
            const pIdx = allProjects.findIndex(p => p.id === projectId);
            if (pIdx !== -1) {
                allProjects[pIdx].cataloged = true;
                allProjects[pIdx].catalogLocation = noteText;
                allProjects[pIdx].lastCatalogedByName = currentUserName;
                allProjects[pIdx].isBeingCataloged = false;
                allProjects[pIdx].catalogingBy = null;
                allProjects[pIdx].catalogingByName = null;
            }
            saveCatalogToCache(completedCatalogProjects, catalogNotes);
            saveLibProjectsToCache(allProjects);

            await closeCatalogNoteModal(false);
            showToast && showToast(`Catalog saved by ${currentUserName}!`, '✅');

            if (typeof ActivityService !== 'undefined') {
                ActivityService.logAdmin('catalog_note', `Cataloged: ${projectId} by ${currentUserName}`);
            }

            // Refresh grid and dashboard in background
            await loadCatalogData(true);
            await loadDashboardData();
        } catch (err) {
            console.error('saveCatalogNote:', err);
            showToast && showToast('Error saving catalog note. Try again.', '❌');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v14a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Catalog Note`;
            }
        }
    }

    async function deleteCatalogNote() {
        const projectId = document.getElementById('cn-project-id').value;
        if (!projectId) return;

        // Fast-hand race condition guard: fresh check from Firestore
        try {
            const checkDoc = await db.collection('projects').doc(projectId).get();
            if (checkDoc.exists && checkDoc.data().isLockedByAdmin) {
                showToast && showToast('Operation blocked: Project was locked by the Administrator.', '🔒');
                await closeCatalogNoteModal(false);
                return;
            }
        } catch (e) {}

        const project = allProjects.find(p => p.id === projectId);
        if (!confirm(`Are you sure you want to clear the catalog record for "${project?.title || 'this project'}"? This action will be logged in the accountability audit trail.`)) return;

        const currentUserName = currentUserData?.fullName || currentUser.displayName || 'Librarian';
        const currentUserEmail = currentUser.email || 'N/A';
        const nowISO = new Date().toISOString();
        const existingNote = catalogNotes[projectId];

        const deleteAuditEntry = {
            action: 'Cleared catalog record',
            userId: currentUser.uid,
            userName: currentUserName,
            userEmail: currentUserEmail,
            timestamp: nowISO,
            details: 'Location note and classification details cleared'
        };
        const history = Array.isArray(existingNote?.auditHistory) ? [deleteAuditEntry, ...existingNote.auditHistory] : [deleteAuditEntry];

        try {
            await db.collection('catalogNotes').doc(projectId).set({
                note: '',
                callNumber: '',
                accessionNumber: '',
                subjectHeading: '',
                clearedAt: firebase.firestore.FieldValue.serverTimestamp(),
                clearedBy: currentUser.uid,
                clearedByName: currentUserName,
                clearedByEmail: currentUserEmail,
                lastUpdatedByName: currentUserName,
                lastUpdatedByEmail: currentUserEmail,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                auditHistory: history.slice(0, 30),
                projectId
            }, { merge: true });

            await db.collection('projects').doc(projectId).update({
                cataloged: false,
                catalogLocation: '',
                callNumber: '',
                accessionNumber: '',
                subjectHeading: '',
                isBeingCataloged: false,
                catalogingBy: null,
                catalogingByName: null,
                catalogingStartedAt: null,
                catalogAudit: {
                    lastAction: 'Cleared catalog record',
                    lastUpdatedByName: currentUserName,
                    lastUpdatedByEmail: currentUserEmail,
                    lastUpdatedAt: nowISO
                }
            });

            // Update local cache & persistent storage optimistically
            catalogNotes[projectId] = { ...catalogNotes[projectId], note: '', callNumber: '', accessionNumber: '', subjectHeading: '', auditHistory: history };
            const pIdx = allProjects.findIndex(p => p.id === projectId);
            if (pIdx !== -1) {
                allProjects[pIdx].cataloged = false;
                allProjects[pIdx].catalogLocation = '';
                allProjects[pIdx].isBeingCataloged = false;
                allProjects[pIdx].catalogingBy = null;
                allProjects[pIdx].catalogingByName = null;
            }
            saveCatalogToCache(completedCatalogProjects, catalogNotes);
            saveLibProjectsToCache(allProjects);

            await closeCatalogNoteModal(false);
            showToast && showToast(`Catalog record cleared by ${currentUserName}`, 'ℹ️');

            if (typeof ActivityService !== 'undefined') {
                ActivityService.logAdmin('catalog_delete', `Cleared catalog: ${project?.title || projectId} by ${currentUserName}`);
            }

            await loadCatalogData(true);
            await loadDashboardData();
        } catch (err) {
            console.error('deleteCatalogNote:', err);
            showToast && showToast('Error clearing catalog note.', '❌');
        }
    }

    function initDangerZone() {
        const toggle = document.getElementById('danger-zone-toggle');
        const content = document.getElementById('danger-zone-content');
        if (toggle && content) {
            toggle.addEventListener('click', () => {
                const expanded = toggle.getAttribute('aria-expanded') === 'true';
                toggle.setAttribute('aria-expanded', String(!expanded));
                content.style.display = expanded ? 'none' : 'block';
            });
        }

        document.getElementById('clear-account-data-btn')?.addEventListener('click', async () => {
            if (!confirm('Clear all your saved projects, activity logs, and chat history? Your login stays active.')) return;
            try {
                const uid = currentUser.uid;
                const batch = db.batch();
                const activities = await db.collection('userActivities').where('userId', '==', uid).limit(100).get();
                activities.forEach(d => batch.delete(d.ref));
                batch.delete(db.collection('usersSavedProjects').doc(uid));
                const convs = await db.collection('conversations').where('userId', '==', uid).limit(50).get();
                convs.forEach(d => batch.delete(d.ref));
                await batch.commit();
                showToast && showToast('Account data cleared.', '✅');
            } catch (err) { showToast && showToast('Error clearing data.', '❌'); }
        });

        document.getElementById('delete-account-btn')?.addEventListener('click', async () => {
            if (!confirm('Delete your account permanently? This CANNOT be undone.')) return;
            if (!confirm('Are you absolutely sure?')) return;
            try {
                await db.collection('users').doc(currentUser.uid).delete();
                await currentUser.delete();
                sessionStorage.clear();
                window.location.href = '../index.html';
            } catch (err) {
                showToast && showToast('Error deleting account. You may need to re-login first.', '❌');
            }
        });
    }

})();
