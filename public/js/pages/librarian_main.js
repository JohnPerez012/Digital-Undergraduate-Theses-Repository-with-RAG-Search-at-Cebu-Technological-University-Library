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
    let editPermission = null;      // Active admin-granted edit permission doc
    let editPermissionTimer = null; // setInterval for countdown
    let snoozeTimer = null;         // setTimeout for 3-min re-show
    let allProjects = [];           // Cache
    let catalogNotes = {};          // { projectId: noteDoc }

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
        document.getElementById('lib-refresh-projects-btn')?.addEventListener('click', () => loadProjectsData());

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

        // Catalog search
        document.getElementById('catalog-search')?.addEventListener('input', filterCatalogCards);
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
            allProjects = all;

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
    // PROJECTS DATA
    // ─────────────────────────────────────────────
    async function loadProjectsData() {
        const tbody = document.getElementById('projects-table-body');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Loading projects...</td></tr>';

        try {
            const snap = await db.collection('projects').orderBy('createdAt', 'desc').get()
                .catch(async () => db.collection('projects').get());
            const docs = snap.docs;
            allProjects = docs.map(d => ({ id: d.id, ...d.data() }));

            renderProjectsTable(allProjects);
        } catch (err) {
            console.error('loadProjectsData:', err);
            tbody.innerHTML = '<tr><td colspan="6" class="table-error">⚠️ Error loading projects.</td></tr>';
        }
    }

    function renderProjectsTable(projects) {
        const tbody = document.getElementById('projects-table-body');
        if (!tbody) return;

        if (projects.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No projects found.</td></tr>';
            return;
        }

        tbody.innerHTML = projects.map(p => {
            const rawStatus = (p.status || 'Draft').trim();
            const sLower = rawStatus.toLowerCase();
            let statusBadge = '';
            if (sLower === 'completed' || sLower === 'complete') {
                statusBadge = '<span class="status-badge status-badge-completed">✓ Completed</span>';
            } else if (sLower === 'published') {
                statusBadge = '<span class="status-badge status-badge-published">🌐 Published</span>';
            } else if (sLower === 'pending') {
                statusBadge = '<span class="status-badge status-badge-pending">⏳ Pending</span>';
            } else {
                statusBadge = `<span class="status-badge status-badge-draft">${escapeHtml(rawStatus)}</span>`;
            }

            // Add Catalog btn — available for Completed projects only
            const isCompleted = sLower === 'completed' || sLower === 'complete';
            const catalogBtn = isCompleted
                ? `<button class="action-btn action-catalog" onclick="window.__libGoToCatalog('${escapeHtml(p.id)}')" title="Add / Edit Catalog Note">
                       <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                       <span class="action-btn-text">Add Catalog</span>
                   </button>`
                : `<span class="catalog-na-badge" title="Cataloging available for Completed projects only">
                       <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                       Catalog
                   </span>`;

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
                        ${catalogBtn}
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    function filterProjectsTable() {
        const term = (document.getElementById('projects-search')?.value || '').toLowerCase();
        const statusFilter = (document.getElementById('projects-status-filter')?.value || '').trim().toLowerCase();
        const activePill = document.querySelector('#lib-project-filters .filter-pill.active');
        const programFilter = activePill ? activePill.getAttribute('data-filter') : 'all';

        const filtered = allProjects.filter(p => {
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
        renderProjectsTable(filtered);
    }

    // Global handler
    window.__libViewProject = (id) => {
        const p = allProjects.find(x => x.id === id);
        if (!p) return;
        sessionStorage.setItem('selectedProjectForViewDetails', JSON.stringify({ id: p.id, ...p }));
        sessionStorage.setItem('showProjectDetails', 'true');
        window.location.href = '../index.html';
    };
    window.__libEditProject = (id) => { openProjectEditModal(id); };
    window.__libGoToCatalog = (id) => {
        switchSection('catalog');
        setTimeout(() => openCatalogNoteModal(id), 250);
    };

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

        // Load project data
        let project = allProjects.find(p => p.id === projectId);
        if (!project) {
            try {
                const doc = await db.collection('projects').doc(projectId).get();
                if (!doc.exists) { showToast && showToast('Project not found.', '❌'); return; }
                project = { id: doc.id, ...doc.data() };
            } catch (err) { showToast && showToast('Error loading project.', '❌'); return; }
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
    // ─────────────────────────────────────────────
    // UPLOAD METADATA MODAL (now "Add New Project")
    // ─────────────────────────────────────────────
    function initUploadMetadataModal() {
        document.getElementById('um-close-btn')?.addEventListener('click', closeUploadModal);
        document.getElementById('um-cancel-btn')?.addEventListener('click', closeUploadModal);
        document.getElementById('upload-metadata-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            await submitMetadata();
        });
        // Close on overlay click
        document.getElementById('um-modal-overlay')?.addEventListener('click', closeUploadModal);

        // Close on Escape key
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                closeUploadModal();
                closeBulkModal();
            }
        });
    }

    function openUploadModal() {
        document.getElementById('upload-metadata-form')?.reset();
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
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    // ─────────────────────────────────────────────
    // BULK IMPORT MODAL
    // ─────────────────────────────────────────────
    let bulkProjectsData = [];

    function initBulkImportModal() {
        document.getElementById('bulk-close-btn')?.addEventListener('click', closeBulkModal);
        document.getElementById('bulk-cancel-btn')?.addEventListener('click', closeBulkModal);
        document.getElementById('bulk-modal-overlay')?.addEventListener('click', closeBulkModal);

        document.getElementById('bulk-browse-btn')?.addEventListener('click', () => {
            document.getElementById('bulk-json-input')?.click();
        });

        // Drag and drop on dropzone
        const dropzone = document.getElementById('bulk-dropzone');
        if (dropzone) {
            dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dropzone-active'); });
            dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dropzone-active'));
            dropzone.addEventListener('drop', e => {
                e.preventDefault();
                dropzone.classList.remove('dropzone-active');
                const file = e.dataTransfer.files[0];
                if (file) processBulkFile(file);
            });
        }

        document.getElementById('bulk-json-input')?.addEventListener('change', e => {
            const file = e.target.files[0];
            if (file) processBulkFile(file);
        });

        document.getElementById('bulk-submit-btn')?.addEventListener('click', submitBulkProjects);
    }

    function openBulkModal() {
        const modal = document.getElementById('bulk-add-modal');
        if (modal) {
            modal.style.display = 'flex';
            void modal.offsetHeight;
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
        bulkProjectsData = [];
        const previewArea = document.getElementById('bulk-preview-area');
        if (previewArea) previewArea.style.display = 'none';
        const progressArea = document.getElementById('bulk-progress-area');
        if (progressArea) progressArea.style.display = 'none';
        const submitBtn = document.getElementById('bulk-submit-btn');
        if (submitBtn) submitBtn.disabled = true;
        const input = document.getElementById('bulk-json-input');
        if (input) input.value = '';
    }

    function closeBulkModal() {
        const modal = document.getElementById('bulk-add-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
        bulkProjectsData = [];
        const previewArea = document.getElementById('bulk-preview-area');
        if (previewArea) previewArea.style.display = 'none';
        const progressArea = document.getElementById('bulk-progress-area');
        if (progressArea) progressArea.style.display = 'none';
        const submitBtn = document.getElementById('bulk-submit-btn');
        if (submitBtn) submitBtn.disabled = true;
        const input = document.getElementById('bulk-json-input');
        if (input) input.value = '';
    }

    function processBulkFile(file) {
        if (!file.name.endsWith('.json')) {
            showToast && showToast('Please upload a .json file.', '❌');
            return;
        }
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const raw = JSON.parse(e.target.result);
                const data = Array.isArray(raw) ? raw : [raw];
                if (data.length === 0) { showToast && showToast('JSON file is empty.', '❌'); return; }
                if (data.length > 100) { showToast && showToast('Maximum 100 projects per batch.', '❌'); return; }
                bulkProjectsData = data;
                renderBulkPreview(data);
                const submitBtn = document.getElementById('bulk-submit-btn');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    const label = document.getElementById('bulk-submit-label');
                    if (label) label.textContent = `Submit ${data.length} Project${data.length > 1 ? 's' : ''} for Approval`;
                }
            } catch {
                showToast && showToast('Invalid JSON file. Please check the format.', '❌');
            }
        };
        reader.readAsText(file);
    }

    function renderBulkPreview(data) {
        const previewArea = document.getElementById('bulk-preview-area');
        const tbody = document.getElementById('bulk-preview-tbody');
        const countEl = document.getElementById('bulk-preview-count');
        if (!previewArea || !tbody || !countEl) return;

        countEl.textContent = `${data.length} project${data.length !== 1 ? 's' : ''} detected`;
        tbody.innerHTML = data.map((p, i) => `<tr>
            <td>${i + 1}</td>
            <td><strong>${escapeHtml(p.title || 'N/A')}</strong></td>
            <td>${escapeHtml(Array.isArray(p.authors) ? p.authors.join(', ') : (p.authors || 'N/A'))}</td>
            <td><span class="badge badge-info">${escapeHtml(p.program || 'N/A')}</span></td>
            <td>${escapeHtml(String(p.year || 'N/A'))}</td>
        </tr>`).join('');
        previewArea.style.display = 'block';
    }

    async function submitBulkProjects() {
        if (!bulkProjectsData.length) return;
        const submitBtn = document.getElementById('bulk-submit-btn');
        const progressArea = document.getElementById('bulk-progress-area');
        const progressFill = document.getElementById('bulk-progress-fill');
        const progressLabel = document.getElementById('bulk-progress-label');

        if (submitBtn) submitBtn.disabled = true;
        if (progressArea) progressArea.style.display = 'block';

        let successCount = 0;
        const total = bulkProjectsData.length;

        for (let i = 0; i < total; i++) {
            const p = bulkProjectsData[i];
            try {
                await db.collection('pendingProjects').add({
                    title: p.title || 'Untitled',
                    abstract: p.abstract || '',
                    authors: Array.isArray(p.authors) ? p.authors : String(p.authors || '').split(',').map(a => a.trim()).filter(Boolean),
                    adviser: p.adviser || '',
                    program: p.program || '',
                    year: parseInt(p.year, 10) || p.year || '',
                    keywords: Array.isArray(p.keywords) ? p.keywords : String(p.keywords || '').split(',').map(k => k.trim()).filter(Boolean),
                    status: 'pending',
                    submittedBy: currentUser.uid,
                    submittedByName: currentUserData?.fullName || 'Librarian',
                    submittedByEmail: currentUser.email,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    isPublic: false
                });
                successCount++;
            } catch (err) {
                console.error(`Bulk submit error item ${i}:`, err);
            }
            // Update progress
            const pct = Math.round(((i + 1) / total) * 100);
            if (progressFill) progressFill.style.width = pct + '%';
            if (progressLabel) progressLabel.textContent = `${i + 1} / ${total}`;
        }

        showToast && showToast(`${successCount} of ${total} projects submitted for admin approval!`, '✅');
        setTimeout(() => {
            closeBulkModal();
            loadDashboardData();
        }, 1200);
    }

    async function submitMetadata() {
        const title = document.getElementById('um-title-field').value.trim();
        const abstract = document.getElementById('um-abstract').value.trim();
        const authorsRaw = document.getElementById('um-authors').value.trim();
        const program = document.getElementById('um-program').value;
        const year = document.getElementById('um-year').value.trim();

        if (!title || !abstract || !authorsRaw || !program || !year) {
            showToast && showToast('Please fill all required fields.', '❌');
            return;
        }

        const submitBtn = document.getElementById('um-submit-btn');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting...'; }

        try {
            const authors = authorsRaw.split(',').map(a => a.trim()).filter(Boolean);
            const keywords = document.getElementById('um-keywords').value.split(',').map(k => k.trim()).filter(Boolean);

            await db.collection('pendingProjects').add({
                title,
                abstract,
                authors,
                adviser: document.getElementById('um-adviser').value.trim(),
                program,
                year: parseInt(year, 10) || year,
                keywords,
                status: 'pending',
                submittedBy: currentUser.uid,
                submittedByName: currentUserData?.fullName || 'Librarian',
                submittedByEmail: currentUser.email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                isPublic: false
            });

            closeUploadModal();
            showToast && showToast('Metadata submitted! Awaiting admin approval.', '✅');
            if (typeof ActivityService !== 'undefined') {
                ActivityService.logAdmin('metadata_upload', `Submitted: ${title}`);
            }
            // Refresh dashboard stats
            await loadDashboardData();
        } catch (err) {
            console.error('submitMetadata:', err);
            showToast && showToast('Error submitting metadata. Try again.', '❌');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Submit for Approval`;
            }
        }
    }

    // ─────────────────────────────────────────────
    // CATALOG DATA (status === Completed only)
    // ─────────────────────────────────────────────
    async function loadCatalogData() {
        const grid = document.getElementById('catalog-grid');
        if (!grid) return;
        grid.innerHTML = '<div class="lib-loading-text" style="grid-column:1/-1;text-align:center;padding:3rem;">Loading completed projects...</div>';

        try {
            // Load projects: strictly only Completed projects (not published, not draft)
            const snap = await db.collection('projects').get();
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Filter for Completed status
            const completedProjects = all.filter(p => {
                const s = (p.status || '').trim().toLowerCase();
                return s === 'completed' || s === 'complete';
            });

            // Sort newest first
            completedProjects.sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));

            // Load all catalog notes for batch
            try {
                const cnSnap = await db.collection('catalogNotes').get();
                catalogNotes = {};
                cnSnap.forEach(d => { catalogNotes[d.id] = d.data(); });
            } catch (cnErr) {
                console.warn('catalogNotes fetch:', cnErr);
            }

            renderCatalogGrid(completedProjects);
        } catch (err) {
            console.error('loadCatalogData:', err);
            grid.innerHTML = '<div class="lib-loading-text" style="grid-column:1/-1;text-align:center;color:#ef4444;">⚠️ Error loading catalog.</div>';
        }
    }

    function renderCatalogGrid(projects) {
        const grid = document.getElementById('catalog-grid');
        if (!grid) return;

        if (projects.length === 0) {
            grid.innerHTML = '<div class="lib-loading-text" style="grid-column:1/-1;text-align:center;padding:3rem;">No completed projects found. Only projects with status "Completed" appear in cataloging.</div>';
            return;
        }

        grid.innerHTML = projects.map(p => {
            const note = catalogNotes[p.id];
            const hasNote = note && (note.note || note.callNumber || note.accessionNumber);
            const notePreview = note?.note ? escapeHtml(note.note.slice(0, 90)) + (note.note.length > 90 ? '…' : '') : '';
            const rawStatus = p.status || 'Completed';

            const chips = [];
            if (note?.callNumber) chips.push(`<span class="catalog-card-chip"><span>Call:</span> <strong>${escapeHtml(note.callNumber)}</strong></span>`);
            if (note?.accessionNumber) chips.push(`<span class="catalog-card-chip"><span>Acc:</span> <strong>${escapeHtml(note.accessionNumber)}</strong></span>`);
            if (note?.subjectHeading) chips.push(`<span class="catalog-card-chip"><span>Subj:</span> <strong>${escapeHtml(note.subjectHeading)}</strong></span>`);
            const chipsHtml = chips.length > 0 ? `<div class="catalog-card-chips">${chips.join('')}</div>` : '';

            const updatedByName = note?.lastUpdatedByName || note?.createdByName || p.catalogAudit?.lastUpdatedByName || p.lastCatalogedByName;
            const auditStamp = hasNote
                ? `<div class="catalog-card-accountability">
                       <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                       <span>By: <strong>${escapeHtml(updatedByName || 'Librarian')}</strong> · ${formatDate(note?.updatedAt || note?.createdAt || p.lastCatalogedAt)}</span>
                   </div>`
                : `<div class="catalog-card-accountability unassigned">
                       <span>⚪ Not cataloged yet</span>
                   </div>`;

            return `<div class="catalog-card" data-id="${escapeHtml(p.id)}" data-search="${escapeHtml((p.title || '') + ' ' + (p.authors || []).join(' ') + ' ' + (p.program || ''))}">
                <div class="catalog-card-header">
                    <span class="status-badge status-badge-completed">✓ ${escapeHtml(rawStatus)}</span>
                    <span class="badge badge-info">${escapeHtml(p.program || 'N/A')}</span>
                </div>
                <div class="catalog-card-title">${escapeHtml(p.title || 'Untitled')}</div>
                <div class="catalog-card-meta">
                    ${escapeHtml((p.authors || []).join(', ') || 'Unknown Author')}<br>
                    Academic Year: ${escapeHtml(String(p.year || 'N/A'))}
                </div>
                <div class="catalog-card-note ${hasNote ? 'has-note' : ''}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span>${hasNote ? notePreview || 'Location noted' : '<span class="catalog-card-note-empty">No location note yet — click to add</span>'}</span>
                </div>
                ${chipsHtml}
                ${auditStamp}
                <div class="catalog-card-actions">
                    <button class="lib-btn-catalog-note ${hasNote ? 'has-note' : ''}" onclick="window.__libOpenCatalogNote('${escapeHtml(p.id)}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 16.5-3.5z"/></svg>
                        ${hasNote ? 'Edit Catalog Note' : 'Add Catalog Note'}
                    </button>
                </div>
            </div>`;
        }).join('');
    }

    function filterCatalogCards() {
        const term = (document.getElementById('catalog-search')?.value || '').toLowerCase();
        document.querySelectorAll('.catalog-card').forEach(card => {
            const searchText = (card.getAttribute('data-search') || '').toLowerCase();
            card.style.display = (!term || searchText.includes(term)) ? '' : 'none';
        });
    }

    window.__libOpenCatalogNote = (projectId) => { openCatalogNoteModal(projectId); };

    // ─────────────────────────────────────────────
    // CATALOG NOTE MODAL
    // ─────────────────────────────────────────────
    function initCatalogNoteModal() {
        document.getElementById('cn-close-btn')?.addEventListener('click', closeCatalogNoteModal);
        document.getElementById('cn-cancel-btn')?.addEventListener('click', closeCatalogNoteModal);
        document.getElementById('catalog-note-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            await saveCatalogNote();
        });
        document.getElementById('catalog-note-modal')?.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeCatalogNoteModal();
        });

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
    }

    async function openCatalogNoteModal(projectId) {
        // Find project in cache or load
        let project = allProjects.find(p => p.id === projectId);
        if (!project) {
            try {
                const doc = await db.collection('projects').doc(projectId).get();
                project = { id: doc.id, ...doc.data() };
            } catch {}
        }

        document.getElementById('cn-project-id').value = projectId;
        document.getElementById('cn-project-title').textContent = project?.title || 'Untitled';

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

        if (hasRecord) {
            if (deleteBtn) deleteBtn.style.display = 'inline-flex';
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
            if (accCard) accCard.style.display = 'none';
        }

        document.getElementById('catalog-note-modal').style.display = 'flex';
    }

    function closeCatalogNoteModal() {
        document.getElementById('catalog-note-modal').style.display = 'none';
    }

    async function saveCatalogNote() {
        const projectId = document.getElementById('cn-project-id').value;
        if (!projectId) return;

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

            // 2. Update projects collection with catalog info + audit (WITHOUT CHANGING STATUS!)
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
                catalogAudit: {
                    lastAction: actionName,
                    lastUpdatedByName: currentUserName,
                    lastUpdatedByEmail: currentUserEmail,
                    lastUpdatedAt: nowISO,
                    createdByName: isNew ? currentUserName : (existingNote?.createdByName || currentUserName),
                    historyCount: updatedHistory.length
                }
            });

            // Update local cache
            catalogNotes[projectId] = { ...catalogNotes[projectId], ...noteData };
            const pIdx = allProjects.findIndex(p => p.id === projectId);
            if (pIdx !== -1) {
                allProjects[pIdx].cataloged = true;
                allProjects[pIdx].catalogLocation = noteText;
                allProjects[pIdx].lastCatalogedByName = currentUserName;
            }

            closeCatalogNoteModal();
            showToast && showToast(`Catalog saved by ${currentUserName}!`, '✅');

            if (typeof ActivityService !== 'undefined') {
                ActivityService.logAdmin('catalog_note', `Cataloged: ${projectId} by ${currentUserName}`);
            }

            // Refresh grid and dashboard
            await loadCatalogData();
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
                catalogAudit: {
                    lastAction: 'Cleared catalog record',
                    lastUpdatedByName: currentUserName,
                    lastUpdatedByEmail: currentUserEmail,
                    lastUpdatedAt: nowISO
                }
            });

            // Update local cache
            catalogNotes[projectId] = { ...catalogNotes[projectId], note: '', callNumber: '', accessionNumber: '', subjectHeading: '', auditHistory: history };
            const pIdx = allProjects.findIndex(p => p.id === projectId);
            if (pIdx !== -1) {
                allProjects[pIdx].cataloged = false;
                allProjects[pIdx].catalogLocation = '';
            }

            closeCatalogNoteModal();
            showToast && showToast(`Catalog record cleared by ${currentUserName}`, 'ℹ️');

            if (typeof ActivityService !== 'undefined') {
                ActivityService.logAdmin('catalog_delete', `Cleared catalog: ${project?.title || projectId} by ${currentUserName}`);
            }

            await loadCatalogData();
            await loadDashboardData();
        } catch (err) {
            console.error('deleteCatalogNote error:', err);
            showToast && showToast('Error clearing catalog note', '❌');
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
