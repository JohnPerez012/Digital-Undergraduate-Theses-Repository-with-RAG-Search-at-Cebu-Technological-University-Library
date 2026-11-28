/**
 * ============================================================================
 * RE-CAPS Admin Settings Management Controller
 * ============================================================================
 * 
 * Manages institutional repository governance, AI vector thresholds,
 * administrator profile credentials, and data integrity tools.
 * 
 * @module AdminSettings
 * @version 2.0.0
 */

(function(window) {
    'use strict';

    const STORAGE_KEY = 'admin_system_settings';

    const DEFAULT_SETTINGS = {
        maintenanceMode: false,
        allowRegistration: true,
        requireApproval: true,
        allowGuestBrowsing: true,
        defaultIntakeYear: '2026',
        ragSimilarityThreshold: 0.80,
        maintenanceTargetDate: '',
        maintenanceTargetTime: ''
    };

    let currentSettings = { ...DEFAULT_SETTINGS };

    /**
     * Initialize Settings Controller
     */
    async function init() {
        loadLocalSettings();
        bindEvents();
        updateUI();
        updateAdminProfileCard();
        refreshDiagnostics();
        initLinkedGmailControls();

        // 1. Reactive Auth State listener: immediately rehydrate admin profile & email when Auth resolves
        if (typeof auth !== 'undefined' && auth && typeof auth.onAuthStateChanged === 'function') {
            auth.onAuthStateChanged((user) => {
                if (user) {
                    updateAdminProfileCard(user);
                    updateAdminStats();
                    refreshLinkedEmailState(user);
                } else {
                    refreshLinkedEmailState(null);
                }
            });
        }

        // 2. Section Change listener: re-calculate stats and profile whenever admin opens #settings
        window.addEventListener('rail:section-change', (e) => {
            if (e.detail?.sectionId === 'settings') {
                updateAdminProfileCard();
                updateAdminStats();
                refreshLinkedEmailState();
            }
        });

        // 3. Live custom events from main.js when projects/users/approvals finish loading
        window.addEventListener('admin:stats-updated', updateAdminStats);
        window.addEventListener('admin:profile-updated', (e) => {
            updateAdminProfileCard(e.detail?.user, e.detail?.userData);
            refreshLinkedEmailState(e.detail?.user, e.detail?.userData);
        });
        window.addEventListener('admin:linked-email-updated', (e) => {
            refreshLinkedEmailState(null, e.detail);
        });

        // Attempt cloud sync if Firestore is available
        if (typeof db !== 'undefined' && db) {
            try {
                const doc = await db.collection('system_settings').doc('config').get();
                if (doc.exists) {
                    currentSettings = { ...DEFAULT_SETTINGS, ...doc.data() };
                    saveLocalSettings();
                    updateUI();
                }
            } catch (err) {
                console.warn('[AdminSettings] Cloud settings fetch unavailable, using local state:', err.message);
            }
        }
    }

    /**
     * Load settings from localStorage
     */
    function loadLocalSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                currentSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
            }
        } catch (e) {
            console.warn('[AdminSettings] Failed to parse local settings, using defaults');
        }
    }

    /**
     * Save settings to localStorage
     */
    function saveLocalSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
        } catch (e) {
            console.error('[AdminSettings] Failed to save to localStorage:', e);
        }
    }

    /**
     * Sync settings to Firestore and localStorage
     */
    async function saveSettings(silent = false) {
        // Collect current inputs
        const maintenanceInput = document.getElementById('maintenance-mode');
        const allowRegInput = document.getElementById('allow-registration');
        const requireApprInput = document.getElementById('require-approval');
        const allowGuestInput = document.getElementById('allow-guest-browsing');
        const intakeYearSelect = document.getElementById('default-intake-year');
        const ragSlider = document.getElementById('rag-similarity-threshold');
        const targetDateInput = document.getElementById('maintenance-target-date');
        const targetTimeInput = document.getElementById('maintenance-target-time');

        currentSettings.maintenanceMode = maintenanceInput ? maintenanceInput.checked : currentSettings.maintenanceMode;
        currentSettings.allowRegistration = allowRegInput ? allowRegInput.checked : currentSettings.allowRegistration;
        currentSettings.requireApproval = requireApprInput ? requireApprInput.checked : currentSettings.requireApproval;
        currentSettings.allowGuestBrowsing = allowGuestInput ? allowGuestInput.checked : currentSettings.allowGuestBrowsing;
        currentSettings.defaultIntakeYear = intakeYearSelect ? intakeYearSelect.value : currentSettings.defaultIntakeYear;
        currentSettings.ragSimilarityThreshold = ragSlider ? parseFloat(ragSlider.value) : currentSettings.ragSimilarityThreshold;
        currentSettings.maintenanceTargetDate = targetDateInput ? targetDateInput.value : currentSettings.maintenanceTargetDate;
        currentSettings.maintenanceTargetTime = targetTimeInput ? targetTimeInput.value : currentSettings.maintenanceTargetTime;

        saveLocalSettings();
        updateUI();

        // Push to Firestore if available
        if (typeof db !== 'undefined' && db) {
            try {
                await db.collection('system_settings').doc('config').set({
                    ...currentSettings,
                    updatedAt: new Date().toISOString(),
                    updatedBy: (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser.email : 'admin'
                }, { merge: true });
            } catch (err) {
                console.warn('[AdminSettings] Could not sync settings to Firestore (offline or permissions):', err.message);
            }
        }

        // Log administrative audit activity
        if (typeof ActivityService !== 'undefined' && typeof ActivityService.logAdmin === 'function') {
            try {
                ActivityService.logAdmin(
                    'settings_updated',
                    'System Configuration',
                    `Updated repository configuration (Maintenance: ${currentSettings.maintenanceMode ? 'Active' : 'Disabled'}, RAG: ${currentSettings.ragSimilarityThreshold || '0.70'}, Allow Reg: ${currentSettings.allowRegistration ? 'Yes' : 'No'}).`,
                    { maintenanceMode: currentSettings.maintenanceMode, ragThreshold: currentSettings.ragSimilarityThreshold }
                );
            } catch (e) {}
        }

        if (!silent && typeof showToast === 'function') {
            showToast('System settings updated successfully', 'success');
        }
    }

    /**
     * Restore default settings
     */
    async function resetDefaults() {
        const confirmed = await ModalDialog.confirm({
            title: 'Restore Factory Defaults',
            message: 'All system settings will be reset to their original factory configuration. Active governance rules and maintenance flags will be cleared. This action cannot be undone.',
            confirmText: 'Restore Defaults',
            cancelText: 'Keep Current',
            type: 'warning'
        });
        if (!confirmed) return;
        currentSettings = { ...DEFAULT_SETTINGS };
        saveLocalSettings();
        updateUI();

        if (typeof db !== 'undefined' && db) {
            try {
                await db.collection('system_settings').doc('config').set({
                    ...DEFAULT_SETTINGS,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            } catch (e) {}
        }

        if (typeof ActivityService !== 'undefined' && typeof ActivityService.logAdmin === 'function') {
            ActivityService.logAdmin(
                'settings_reset',
                'System Configuration',
                'Restored repository settings and governance configuration to factory defaults.'
            );
        }

        if (typeof showToast === 'function') {
            showToast('System settings restored to defaults', 'info');
        }
    }

    /**
     * Update DOM elements from current settings state
     */
    function updateUI() {
        const maintenanceInput = document.getElementById('maintenance-mode');
        const allowRegInput = document.getElementById('allow-registration');
        const requireApprInput = document.getElementById('require-approval');
        const allowGuestInput = document.getElementById('allow-guest-browsing');
        const intakeYearSelect = document.getElementById('default-intake-year');
        const ragSlider = document.getElementById('rag-similarity-threshold');
        const targetDateInput = document.getElementById('maintenance-target-date');
        const targetTimeInput = document.getElementById('maintenance-target-time');

        if (maintenanceInput) maintenanceInput.checked = !!currentSettings.maintenanceMode;
        if (allowRegInput) allowRegInput.checked = !!currentSettings.allowRegistration;
        if (requireApprInput) requireApprInput.checked = !!currentSettings.requireApproval;
        if (allowGuestInput) allowGuestInput.checked = !!currentSettings.allowGuestBrowsing;
        if (intakeYearSelect) intakeYearSelect.value = currentSettings.defaultIntakeYear || '2026';
        if (ragSlider) ragSlider.value = currentSettings.ragSimilarityThreshold || 0.80;
        if (targetDateInput) targetDateInput.value = currentSettings.maintenanceTargetDate || '';
        if (targetTimeInput) targetTimeInput.value = currentSettings.maintenanceTargetTime || '';

        // Update Threshold Badge
        const ragBadge = document.getElementById('rag-threshold-badge');
        if (ragBadge && ragSlider) {
            ragBadge.textContent = parseFloat(ragSlider.value).toFixed(2);
        }

        // Maintenance Expanded View & Badges
        const maintenanceExpanded = document.getElementById('maintenance-expanded-fields');
        const maintenanceBadge = document.getElementById('maintenance-badge');
        const globalStatusPill = document.getElementById('settings-global-status-pill');
        const stripRepoState = document.getElementById('strip-repo-state');

        if (currentSettings.maintenanceMode) {
            if (maintenanceExpanded) maintenanceExpanded.style.display = 'flex';
            if (maintenanceBadge) {
                maintenanceBadge.textContent = 'Active';
                maintenanceBadge.classList.add('active');
            }
            if (globalStatusPill) {
                globalStatusPill.className = 'settings-system-pill maintenance';
                globalStatusPill.innerHTML = '<span class="status-pulse-dot"></span><span>Maintenance Mode Active</span>';
            }
            if (stripRepoState) {
                stripRepoState.textContent = 'Maintenance Mode';
                stripRepoState.className = 'overview-val';
            }
        } else {
            if (maintenanceExpanded) maintenanceExpanded.style.display = 'none';
            if (maintenanceBadge) {
                maintenanceBadge.textContent = 'Inactive';
                maintenanceBadge.classList.remove('active');
            }
            if (globalStatusPill) {
                globalStatusPill.className = 'settings-system-pill online';
                globalStatusPill.innerHTML = '<span class="status-pulse-dot"></span><span>All Systems Operational</span>';
            }
            if (stripRepoState) {
                stripRepoState.textContent = 'Online & Open';
                stripRepoState.className = 'overview-val green';
            }
        }

        // Registration Strip State
        const stripRegState = document.getElementById('strip-reg-state');
        if (stripRegState) {
            if (currentSettings.allowRegistration) {
                stripRegState.textContent = 'Open (@ctu.edu.ph)';
                stripRegState.className = 'overview-val green';
            } else {
                stripRegState.textContent = 'Closed by Admin';
                stripRegState.className = 'overview-val';
            }
        }
    }

    /**
     * Hydrate Admin Repository Intelligence KPI Stats
     */
    function updateAdminStats() {
        const holdingsEl = document.getElementById('aset-stat-holdings');
        const pendingEl = document.getElementById('aset-stat-pending');
        const usersEl = document.getElementById('aset-stat-users');

        // 1. Holdings count (all approved/archived projects)
        if (holdingsEl) {
            let holdingsCount = null;
            const domStat = document.getElementById('total-projects-stat')?.textContent?.trim();
            if (domStat && domStat !== '...' && domStat !== '–' && domStat !== '0') {
                holdingsCount = domStat;
            } else if (Array.isArray(window.allProjectsData) && window.allProjectsData.length > 0) {
                holdingsCount = window.allProjectsData.length;
            } else {
                try {
                    const cached = JSON.parse(localStorage.getItem('projectsData') || localStorage.getItem('cachedProjects') || '[]');
                    if (Array.isArray(cached) && cached.length > 0) holdingsCount = cached.length;
                } catch (_) {}
            }
            if (holdingsCount !== null && holdingsCount !== undefined) {
                holdingsEl.textContent = holdingsCount;
            } else if (domStat && domStat !== '...') {
                holdingsEl.textContent = domStat;
            }
        }

        // 2. Pending Approvals count
        if (pendingEl) {
            let pendingCount = null;
            const badge = document.getElementById('pending-approvals-badge')?.textContent?.trim();
            const stat = document.getElementById('pending-approvals-stat')?.textContent?.trim();
            if (badge && badge !== '0' && badge !== '') {
                pendingCount = badge;
            } else if (stat && stat !== '...' && stat !== '–') {
                pendingCount = stat;
            } else {
                try {
                    const cachedPending = JSON.parse(localStorage.getItem('pendingApprovalsData') || '[]');
                    if (Array.isArray(cachedPending)) pendingCount = cachedPending.length;
                } catch (_) {}
            }
            if (pendingCount !== null && pendingCount !== undefined) {
                pendingEl.textContent = pendingCount;
            } else {
                pendingEl.textContent = '0';
            }
        }

        // 3. Total Users count
        if (usersEl) {
            let usersCount = null;
            const domUserStat = document.getElementById('total-users-stat')?.textContent?.trim();
            if (domUserStat && domUserStat !== '...' && domUserStat !== '–' && domUserStat !== '0') {
                usersCount = domUserStat;
            } else if (Array.isArray(window.allUsersData) && window.allUsersData.length > 0) {
                usersCount = window.allUsersData.length;
            } else {
                try {
                    const cachedUsers = JSON.parse(localStorage.getItem('usersData') || localStorage.getItem('cachedUsers') || '[]');
                    if (Array.isArray(cachedUsers) && cachedUsers.length > 0) usersCount = cachedUsers.length;
                } catch (_) {}
            }
            if (usersCount !== null && usersCount !== undefined) {
                usersEl.textContent = usersCount;
            } else if (domUserStat && domUserStat !== '...') {
                usersEl.textContent = domUserStat;
            }
        }
    }

    /**
     * Update Admin Profile Box with authenticated user info (Prioritizing Firestore Database Record)
     */
    async function updateAdminProfileCard(passedUser = null, passedUserData = null) {
        const adminNameEl = document.getElementById('settings-admin-name');
        const adminEmailEl = document.getElementById('settings-admin-email');
        const adminAvatar = document.getElementById('settings-profile-avatar');
        const avatarInitials = document.getElementById('aset-avatar-initials');

        const currentUser = passedUser || ((typeof auth !== 'undefined' && auth) ? auth.currentUser : null);
        const sessionEmail = sessionStorage.getItem('userEmail');
        const sessionName = sessionStorage.getItem('userName');

        let name = passedUserData?.fullName || passedUserData?.name || currentUser?.displayName || sessionName || 'Administrator of the Library';
        let email = passedUserData?.email || sessionEmail || currentUser?.email || '';

        // Prioritize actual database record in Firestore if available
        if ((!passedUserData || !passedUserData.email) && currentUser?.uid && typeof db !== 'undefined' && db) {
            try {
                const userDoc = await db.collection('users').doc(currentUser.uid).get();
                if (userDoc.exists) {
                    const data = userDoc.data() || {};
                    if (data.email) {
                        email = data.email;
                        sessionStorage.setItem('userEmail', data.email);
                    }
                    if (data.fullName || data.name) {
                        name = data.fullName || data.name;
                        sessionStorage.setItem('userName', name);
                    }
                }
            } catch (err) {
                console.debug('[AdminSettings] Firestore profile read deferred:', err);
            }
        }

        if (adminNameEl && name) adminNameEl.textContent = name;
        if (adminEmailEl && email) adminEmailEl.textContent = email;

        if (currentUser?.photoURL && adminAvatar) {
            adminAvatar.src = currentUser.photoURL;
            adminAvatar.style.display = 'block';
            if (avatarInitials) avatarInitials.style.display = 'none';
        } else if (avatarInitials && name) {
            const initial = (name.trim().charAt(0) || 'A').toUpperCase();
            avatarInitials.textContent = initial;
            avatarInitials.style.display = 'inline-flex';
            if (adminAvatar) adminAvatar.style.display = 'none';
        }

        updateAdminStats();
    }

    /**
     * Refresh System Diagnostics metrics
     */
    function refreshDiagnostics() {
        const firestoreVal = document.getElementById('diag-firestore-val');
        const cacheVal = document.getElementById('diag-cache-val');
        const platformVal = document.getElementById('diag-platform-val');
        const themeVal = document.getElementById('diag-theme-val');

        if (firestoreVal) {
            const isOnline = navigator.onLine && (typeof db !== 'undefined' && db);
            firestoreVal.textContent = isOnline ? 'Connected' : 'Offline / Cached';
        }

        if (cacheVal) {
            let totalBytes = 0;
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                totalBytes += (localStorage.getItem(k) || '').length * 2;
            }
            const kb = (totalBytes / 1024).toFixed(1);
            cacheVal.textContent = `${kb} KB (~${localStorage.length} items)`;
        }

        if (platformVal) {
            platformVal.textContent = navigator.userAgent.includes('Windows') ? 'Windows / Desktop' : 'Web Browser';
        }

        if (themeVal) {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'system';
            themeVal.textContent = currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1);
        }
    }

    /**
     * Test AI Backend API Health
     */
    async function testAIHealth() {
        const btn = document.getElementById('btn-test-ai-health');
        const btnText = document.getElementById('ai-health-btn-text');
        const resultBox = document.getElementById('ai-health-result');

        if (btnText) btnText.textContent = 'Pinging...';
        if (btn) btn.disabled = true;

        const startTime = performance.now();
        const apiBase = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? 'http://localhost:3001'
            : 'https://recap-backend-jy5b.onrender.com';
        try {
            const res = await fetch(`${apiBase}/api/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(8000)
            });

            const latency = Math.round(performance.now() - startTime);

            if (res.ok) {
                const data = await res.json();
                if (resultBox) {
                    resultBox.style.display = 'block';
                    resultBox.innerHTML = `<strong>Backend Healthy (${latency}ms)</strong> &bull; Firebase: ${data.firebase} &bull; Pinecone: ${data.pinecone} &bull; Primary: Mistral AI`;
                }
                if (typeof showToast === 'function') {
                    showToast(`AI Vector Engine is online (${latency}ms latency)`, 'success');
                }
            } else {
                throw new Error(`HTTP ${res.status}`);
            }
        } catch (err) {
            const latency = Math.round(performance.now() - startTime);
            if (resultBox) {
                resultBox.style.display = 'block';
                resultBox.innerHTML = `<strong>AI Endpoint Latency: ${latency}ms</strong> (Local client fallback operational)`;
            }
            if (typeof showToast === 'function') {
                showToast(`AI pipeline online via local fallback (${latency}ms)`, 'info');
            }
        } finally {
            if (btnText) btnText.textContent = 'Check API Health';
            if (btn) btn.disabled = false;
        }
    }

    /**
     * Purge Client Data Cache
     */
    async function purgeClientCache() {
        const confirmed = await ModalDialog.confirm({
            title: 'Purge Client Data Cache',
            message: 'This will clear all locally cached manuscript records and force an immediate re-fetch from Firestore. The page will reload fresh repository data automatically.',
            confirmText: 'Purge Cache',
            cancelText: 'Cancel',
            type: 'warning'
        });
        if (!confirmed) return;

        const keysToPurge = [
            'projectsData',
            'usersData',
            'pendingProjectsCache',
            'pendingCountCache',
            'admin_projects_cache',
            'searchHistory'
        ];

        keysToPurge.forEach(k => localStorage.removeItem(k));

        refreshDiagnostics();

        if (typeof ActivityService !== 'undefined' && typeof ActivityService.logAdmin === 'function') {
            ActivityService.logAdmin(
                'cache_purged',
                'Client Repository Cache',
                `Purged client-side manuscript storage cache (${keysToPurge.length} keys cleared).`
            );
        }

        if (typeof showToast === 'function') {
            showToast('Client cache purged. Fetching fresh repository data…', 'success');
        }

        // Trigger reload if available
        if (typeof window.loadProjectsData === 'function') {
            window.loadProjectsData(true);
        }
    }

    /**
     * Export Catalog as CSV
     */
    async function exportCatalogCSV() {
        try {
            if (typeof showToast === 'function') showToast('Preparing catalog CSV export...', 'info');

            let projects = [];
            if (typeof db !== 'undefined' && db) {
                const snap = await db.collection('projects').get();
                snap.forEach(doc => projects.push({ id: doc.id, ...doc.data() }));
            }

            if (projects.length === 0 && window.allProjects && window.allProjects.length > 0) {
                projects = window.allProjects;
            }

            if (projects.length === 0) {
                if (typeof showToast === 'function') showToast('No projects found to export', 'warning');
                return;
            }

            let csv = '\uFEFF'; // UTF-8 BOM
            csv += 'Title,Authors,Program,Year,Adviser,Shelf Location,Call Number,Keywords,Date Created\n';

            projects.forEach(p => {
                const title = `"${(p.title || '').replace(/"/g, '""')}"`;
                const authors = `"${(Array.isArray(p.authors) ? p.authors.join('; ') : (p.authors || '')).replace(/"/g, '""')}"`;
                const program = `"${(p.program || '').replace(/"/g, '""')}"`;
                const year = `"${(p.year || '').toString().replace(/"/g, '""')}"`;
                const adviser = `"${(p.adviser || '').replace(/"/g, '""')}"`;
                const shelf = `"${(p.shelfLocation || p.location || '').replace(/"/g, '""')}"`;
                const callNum = `"${(p.callNumber || '').replace(/"/g, '""')}"`;
                const keywords = `"${(Array.isArray(p.keywords) ? p.keywords.join(', ') : (p.keywords || '')).replace(/"/g, '""')}"`;
                const createdAt = `"${(p.createdAt || '').replace(/"/g, '""')}"`;

                csv += `${title},${authors},${program},${year},${adviser},${shelf},${callNum},${keywords},${createdAt}\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `CTU_RECAPS_Catalog_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (typeof ActivityService !== 'undefined' && typeof ActivityService.logAdmin === 'function') {
                ActivityService.logAdmin(
                    'catalog_exported',
                    'Catalog CSV Export',
                    `Exported ${projects.length} capstone manuscripts as CSV spreadsheet.`
                );
            }

            if (typeof showToast === 'function') {
                showToast(`Exported ${projects.length} manuscripts to CSV`, 'success');
            }
        } catch (err) {
            console.error('[AdminSettings] CSV export failed:', err);
            if (typeof showToast === 'function') showToast('Failed to export CSV', 'error');
        }
    }

    /**
     * Export Catalog as JSON
     */
    async function exportCatalogJSON() {
        try {
            if (typeof showToast === 'function') showToast('Preparing catalog JSON export...', 'info');

            let projects = [];
            if (typeof db !== 'undefined' && db) {
                const snap = await db.collection('projects').get();
                snap.forEach(doc => projects.push({ id: doc.id, ...doc.data() }));
            }

            if (projects.length === 0 && window.allProjects && window.allProjects.length > 0) {
                projects = window.allProjects;
            }

            if (projects.length === 0) {
                if (typeof showToast === 'function') showToast('No projects found to export', 'warning');
                return;
            }

            const exportData = {
                institution: 'Cebu Technological University - Daanbantayan Campus',
                repository: 'RE-CAPS (Research Capstone Undergraduate Theses Repository)',
                exportedAt: new Date().toISOString(),
                recordCount: projects.length,
                records: projects
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `CTU_RECAPS_Catalog_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (typeof ActivityService !== 'undefined' && typeof ActivityService.logAdmin === 'function') {
                ActivityService.logAdmin(
                    'catalog_exported',
                    'Catalog JSON Archive',
                    `Exported complete repository archive of ${projects.length} manuscripts as JSON.`
                );
            }

            if (typeof showToast === 'function') {
                showToast(`Exported ${projects.length} manuscripts to JSON`, 'success');
            }
        } catch (err) {
            console.error('[AdminSettings] JSON export failed:', err);
            if (typeof showToast === 'function') showToast('Failed to export JSON', 'error');
        }
    }

    /**
     * Open Admin Profile Modal
     */
    async function openProfileModal() {
        const modal = document.getElementById('admin-profile-modal');
        if (!modal) return;

        const firstNameInput = document.getElementById('admin-profile-firstname-input');
        const lastNameInput = document.getElementById('admin-profile-lastname-input');
        const emailInput = document.getElementById('admin-profile-email-input');
        const personalEmailInput = document.getElementById('admin-profile-personal-email-input');
        const deptInput = document.getElementById('admin-profile-dept-input');

        const currentUser = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
        if (currentUser) {
            if (emailInput) emailInput.value = currentUser.email || sessionStorage.getItem('userEmail') || '';
            if (deptInput) deptInput.value = 'University Library';

            // Fetch stored profile from Firestore users collection
            if (typeof db !== 'undefined' && db) {
                try {
                    const doc = await db.collection('users').doc(currentUser.uid).get();
                    if (doc.exists) {
                        const data = doc.data() || {};
                        if (emailInput && data.email) emailInput.value = data.email;
                        if (firstNameInput && data.firstName) firstNameInput.value = data.firstName;
                        if (lastNameInput && data.lastName) lastNameInput.value = data.lastName;
                        if (personalEmailInput && data.personalEmail) personalEmailInput.value = data.personalEmail || '';

                        // If firstName or lastName is missing in Firestore doc, parse from fullName or displayName
                        if (firstNameInput && !firstNameInput.value) {
                            const nameSource = data.fullName || currentUser.displayName || '';
                            const parts = nameSource.trim().split(/\s+/);
                            if (parts.length > 1) {
                                if (lastNameInput && !lastNameInput.value) lastNameInput.value = parts.pop() || '';
                                firstNameInput.value = parts.join(' ');
                            } else if (parts.length === 1 && parts[0]) {
                                firstNameInput.value = parts[0];
                            }
                        }
                    }
                } catch (err) {
                    console.debug('[AdminSettings] Firestore profile read deferred:', err);
                }
            }

            // Fallback parsing from currentUser.displayName if still empty
            if (firstNameInput && !firstNameInput.value && currentUser.displayName) {
                const parts = currentUser.displayName.trim().split(/\s+/);
                if (parts.length > 1) {
                    if (lastNameInput && !lastNameInput.value) lastNameInput.value = parts.pop() || '';
                    firstNameInput.value = parts.join(' ');
                } else if (parts.length === 1 && parts[0]) {
                    firstNameInput.value = parts[0];
                }
            }
        }

        // Live input validation visual cues
        const validateInputs = () => {
            if (firstNameInput) {
                firstNameInput.style.borderColor = firstNameInput.value.trim() ? 'rgba(8, 212, 136, 0.4)' : '';
            }
            if (lastNameInput) {
                lastNameInput.style.borderColor = lastNameInput.value.trim() ? 'rgba(8, 212, 136, 0.4)' : '';
            }
            if (personalEmailInput) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                const val = personalEmailInput.value.trim();
                if (val && emailRegex.test(val)) {
                    personalEmailInput.style.borderColor = 'rgba(8, 212, 136, 0.6)';
                } else if (val) {
                    personalEmailInput.style.borderColor = 'rgba(252, 204, 86, 0.6)';
                } else {
                    personalEmailInput.style.borderColor = '';
                }
            }
        };

        [firstNameInput, lastNameInput, personalEmailInput].forEach(inp => {
            if (inp && !inp.dataset.boundValidation) {
                inp.dataset.boundValidation = 'true';
                inp.addEventListener('input', validateInputs);
            }
        });
        validateInputs();

        modal.classList.add('active');
        document.body.classList.add('modal-open');

        // Focus first field smoothly
        setTimeout(() => {
            if (firstNameInput) firstNameInput.focus();
        }, 120);
    }

    /**
     * Close Admin Profile Modal
     */
    function closeProfileModal() {
        const modal = document.getElementById('admin-profile-modal');
        if (modal) {
            modal.classList.remove('active');
            document.body.classList.remove('modal-open');
        }
    }

    /**
     * Save Admin Profile Changes
     */
    async function saveAdminProfile() {
        const firstNameInput = document.getElementById('admin-profile-firstname-input');
        const lastNameInput = document.getElementById('admin-profile-lastname-input');
        const personalEmailInput = document.getElementById('admin-profile-personal-email-input');
        const deptInput = document.getElementById('admin-profile-dept-input');
        const saveBtn = document.getElementById('admin-profile-save-btn');

        const firstName = firstNameInput ? firstNameInput.value.trim() : '';
        const lastName = lastNameInput ? lastNameInput.value.trim() : '';
        const personalEmail = personalEmailInput ? personalEmailInput.value.trim() : '';
        const dept = 'University Library'; // Always University Library per institutional specification

        if (!firstName) {
            if (typeof showToast === 'function') showToast('First name is required', 'error');
            if (firstNameInput) {
                firstNameInput.style.borderColor = '#ef4444';
                firstNameInput.focus();
            }
            return;
        }

        if (!lastName) {
            if (typeof showToast === 'function') showToast('Last name is required', 'error');
            if (lastNameInput) {
                lastNameInput.style.borderColor = '#ef4444';
                lastNameInput.focus();
            }
            return;
        }

        if (!personalEmail) {
            if (typeof showToast === 'function') showToast('Personal email is required', 'error');
            if (personalEmailInput) {
                personalEmailInput.style.borderColor = '#ef4444';
                personalEmailInput.focus();
            }
            return;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(personalEmail)) {
            if (typeof showToast === 'function') showToast('Please enter a valid personal email address', 'error');
            if (personalEmailInput) {
                personalEmailInput.style.borderColor = '#ef4444';
                personalEmailInput.focus();
            }
            return;
        }

        const fullName = `${firstName} ${lastName}`.trim();

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
        }

        try {
            const currentUser = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
            if (currentUser) {
                // Update Firebase Auth Display Name
                await currentUser.updateProfile({ displayName: fullName });

                // Update Firestore user document
                if (typeof db !== 'undefined' && db) {
                    await db.collection('users').doc(currentUser.uid).set({
                        firstName: firstName,
                        lastName: lastName,
                        fullName: fullName,
                        displayName: fullName,
                        personalEmail: personalEmail,
                        department: dept,
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                }

                // Synchronize in-memory caches and session storage
                sessionStorage.setItem('userName', fullName);
                if (window.currentUserData) {
                    window.currentUserData = {
                        ...window.currentUserData,
                        firstName,
                        lastName,
                        fullName,
                        displayName: fullName,
                        personalEmail,
                        department: dept
                    };
                }

                // Update UI elements across dashboard
                const railAdminName = document.getElementById('admin-name');
                const settingsAdminName = document.getElementById('settings-admin-name');
                const avatarInitials = document.getElementById('aset-avatar-initials');
                if (railAdminName) railAdminName.textContent = fullName;
                if (settingsAdminName) settingsAdminName.textContent = fullName;
                if (avatarInitials && firstName) {
                    avatarInitials.textContent = firstName.charAt(0).toUpperCase();
                }

                closeProfileModal();

                // Reactive broadcast across views
                window.dispatchEvent(new CustomEvent('admin:profile-updated', {
                    detail: {
                        user: currentUser,
                        userData: { firstName, lastName, fullName, personalEmail, department: dept }
                    }
                }));

                updateAdminProfileCard(currentUser, { firstName, lastName, fullName, personalEmail });

                if (typeof ActivityService !== 'undefined' && typeof ActivityService.logAdmin === 'function') {
                    ActivityService.logAdmin(
                        'profile_updated',
                        fullName,
                        `Updated administrator profile: ${fullName} (${dept}) with personal contact ${personalEmail}.`
                    );
                }

                if (typeof showToast === 'function') {
                    showToast('Admin profile updated successfully', 'success');
                }
            }
        } catch (err) {
            console.error('[AdminSettings] Failed to update admin profile:', err);
            if (typeof showToast === 'function') {
                showToast('Failed to update profile: ' + err.message, 'error');
            }
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Changes';
            }
        }
    }

    /**
     * Bind all DOM Event Listeners
     */
    function bindEvents() {
        // Save Settings Button
        const saveBtn = document.getElementById('save-settings-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => saveSettings(false));
        }

        // Reset Settings Button
        const resetBtn = document.getElementById('reset-settings-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', resetDefaults);
        }

        // Auto-save on toggle changes with immediate UI feedback
        const toggles = [
            'maintenance-mode',
            'allow-registration',
            'require-approval',
            'allow-guest-browsing'
        ];

        toggles.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => {
                    saveSettings(true);
                    if (typeof showToast === 'function') {
                        showToast('Setting saved', 'info');
                    }
                });
            }
        });

        // Similarity Slider
        const slider = document.getElementById('rag-similarity-threshold');
        const ragBadge = document.getElementById('rag-threshold-badge');
        if (slider) {
            slider.addEventListener('input', (e) => {
                if (ragBadge) ragBadge.textContent = parseFloat(e.target.value).toFixed(2);
            });
            slider.addEventListener('change', () => {
                saveSettings(true);
            });
        }

        // Intake Year
        const intakeYear = document.getElementById('default-intake-year');
        if (intakeYear) {
            intakeYear.addEventListener('change', () => saveSettings(true));
        }

        // AI Health Button
        const aiHealthBtn = document.getElementById('btn-test-ai-health');
        if (aiHealthBtn) {
            aiHealthBtn.addEventListener('click', testAIHealth);
        }

        // Sync Pinecone from Settings
        const syncPineconeBtn = document.getElementById('btn-settings-sync-pinecone');
        if (syncPineconeBtn) {
            syncPineconeBtn.addEventListener('click', () => {
                const modalTrigger = document.getElementById('sync-pinecone-btn');
                if (modalTrigger) modalTrigger.click();
            });
        }

        // Purge Cache Button
        const purgeBtn = document.getElementById('btn-purge-cache');
        if (purgeBtn) {
            purgeBtn.addEventListener('click', purgeClientCache);
        }

        // Export Buttons
        const exportCsvBtn = document.getElementById('btn-export-catalog-csv');
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', exportCatalogCSV);
        }

        const exportJsonBtn = document.getElementById('btn-export-catalog-json');
        if (exportJsonBtn) {
            exportJsonBtn.addEventListener('click', exportCatalogJSON);
        }

        // Edit Profile Button & Modal
        const updateProfileBtn = document.getElementById('update-profile-btn');
        if (updateProfileBtn) {
            updateProfileBtn.addEventListener('click', openProfileModal);
        }

        const profileCloseBtn = document.getElementById('admin-profile-modal-close-btn');
        const profileCancelBtn = document.getElementById('admin-profile-cancel-btn');
        const profileOverlay = document.getElementById('admin-profile-modal-overlay');
        const profileSaveBtn = document.getElementById('admin-profile-save-btn');

        if (profileCloseBtn) profileCloseBtn.addEventListener('click', closeProfileModal);
        if (profileCancelBtn) profileCancelBtn.addEventListener('click', closeProfileModal);
        if (profileOverlay) profileOverlay.addEventListener('click', closeProfileModal);
        if (profileSaveBtn) profileSaveBtn.addEventListener('click', saveAdminProfile);

        // Enter key to submit profile form & Escape key to close
        const profileForm = document.getElementById('admin-profile-form');
        if (profileForm) {
            profileForm.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveAdminProfile();
                }
            });
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('admin-profile-modal');
                if (modal && modal.classList.contains('active')) {
                    closeProfileModal();
                }
            }
        });

        // Password Change Button (Delegate to PasswordChange module)
        const changePasswordBtn = document.getElementById('change-password-btn');
        if (changePasswordBtn) {
            changePasswordBtn.addEventListener('click', () => {
                if (window.PasswordChange && typeof window.PasswordChange.openPasswordChangeModal === 'function') {
                    window.PasswordChange.openPasswordChangeModal();
                } else {
                    const securityModal = document.getElementById('security-question-modal');
                    if (securityModal) {
                        securityModal.classList.add('active');
                    } else if (typeof showToast === 'function') {
                        showToast('Password change verification loading...', 'info');
                    }
                }
            });
        }



        // Listen for section visibility / hash change to update stats
        window.addEventListener('hashchange', () => {
            if (window.location.hash === '#settings') {
                updateAdminProfileCard();
                updateAdminStats();
            }
        });

        // Copy Admin Email with SVG Checkmark Morph (2.5s duration)
        document.getElementById('aset-card-copy-email-btn')?.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const email = document.getElementById('settings-admin-email')?.textContent?.trim() || '';
            if (!email) return;

            const copySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
            const checkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

            const triggerCheck = () => {
                btn.classList.add('is-copied');
                btn.innerHTML = checkSvg;
                btn.setAttribute('title', 'Copied to clipboard!');
                if (typeof showToast === 'function') {
                    showToast('Admin email address copied to clipboard', 'success');
                }
                if (btn._copyTimeout) clearTimeout(btn._copyTimeout);
                btn._copyTimeout = setTimeout(() => {
                    btn.classList.remove('is-copied');
                    btn.innerHTML = copySvg;
                    btn.setAttribute('title', 'Copy admin email address');
                    btn._copyTimeout = null;
                }, 2500);
            };

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(email).then(triggerCheck).catch(() => {
                    try {
                        const ta = document.createElement('textarea');
                        ta.value = email;
                        ta.style.position = 'fixed';
                        ta.style.left = '-9999px';
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                        triggerCheck();
                    } catch (e) {
                        console.error('[AdminSettings] Copy failed:', e);
                    }
                });
            }
        });

        // Admin KPI Action Buttons
        // Helper to reliably switch sections across rail and content viewports
        function navigateToSection(sectionId) {
            const nav = document.querySelector(`.rail-nav-item[data-section="${sectionId}"]`);
            if (nav) {
                nav.click();
            } else {
                const dock = document.querySelector(`.dock-nav-item[data-section="${sectionId}"]`);
                if (dock) {
                    dock.click();
                } else {
                    document.querySelectorAll('.rail-nav-item[data-section]').forEach(n => n.classList.remove('active'));
                    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
                    const target = document.getElementById(`section-${sectionId}`);
                    if (target) target.classList.add('active');
                    window.dispatchEvent(new CustomEvent('rail:section-change', { detail: { sectionId } }));
                }
            }
        }

        // Admin KPI Action Buttons: Dynamic Navigation to specific repository sections
        document.getElementById('aset-btn-holdings')?.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToSection('projects');
        });

        document.getElementById('aset-btn-pending')?.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToSection('approvals');
        });

        document.getElementById('aset-btn-users')?.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToSection('users');
        });

        // Global Keyboard Shortcuts & Reset All handler
        document.addEventListener('keydown', handleKeyboardShortcuts);
        renderShortcutsUI();

        const resetAllShortcutsBtn = document.getElementById('btn-reset-all-shortcuts');
        if (resetAllShortcutsBtn) {
            resetAllShortcutsBtn.addEventListener('click', resetAllShortcuts);
        }
    }

    /**
     * ========================================================================
     * PRODUCTIVITY & SHORTCUTS CUSTOMIZATION ENGINE
     * Defaults are immutable in code; custom bindings persist in machine localStorage.
     * ========================================================================
     */
    const SHORTCUTS_STORAGE_KEY = 'recaps_admin_custom_shortcuts';
    let activeRecordingId = null;
    let recordingListener = null;

    const DEFAULT_SHORTCUTS = [
        {
            id: 'search',
            title: 'Global Search Focus',
            desc: 'Focus active search bar across manuscripts, approvals, or users',
            ctrl: true,
            shift: false,
            alt: false,
            key: 'K',
            display: 'Ctrl + K',
            action: () => {
                const activeSearch = document.getElementById('projects-search') ||
                                     document.getElementById('approvals-search') ||
                                     document.getElementById('users-search') ||
                                     document.querySelector('.content-section.active input[type="text"]') ||
                                     document.querySelector('.content-section.active input[type="search"]');
                if (activeSearch) {
                    activeSearch.focus();
                    activeSearch.select();
                }
            }
        },
        {
            id: 'add_project',
            title: 'Add New Project',
            desc: 'Open Add New Project cataloging modal',
            ctrl: true,
            shift: true,
            alt: false,
            key: 'P',
            display: 'Ctrl + Shift + P',
            action: () => {
                const addBtn = document.getElementById('add-project-btn');
                if (addBtn) addBtn.click();
            }
        },
        {
            id: 'approvals',
            title: 'Submissions & Approvals',
            desc: 'Jump straight to Submissions & Approvals queue',
            ctrl: true,
            shift: true,
            alt: false,
            key: 'A',
            display: 'Ctrl + Shift + A',
            action: () => {
                const nav = document.getElementById('rail-nav-approvals') || document.querySelector('.rail-nav-item[data-section="approvals"]');
                if (nav) nav.click();
            }
        },
        {
            id: 'copilot',
            title: 'Librarian AI Copilot',
            desc: 'Toggle Librarian AI Copilot assistant workspace or widget',
            ctrl: true,
            shift: true,
            alt: false,
            key: 'C',
            display: 'Ctrl + Shift + C',
            action: () => {
                const copilotNav = document.getElementById('rail-nav-copilot') || document.querySelector('.rail-nav-item[data-section="copilot"]');
                if (copilotNav) {
                    copilotNav.click();
                } else {
                    const floatingCopilot = document.getElementById('admin-floating-copilot-btn');
                    if (floatingCopilot) floatingCopilot.click();
                }
            }
        },
        {
            id: 'dashboard',
            title: 'Dashboard Overview',
            desc: 'Jump directly to the Executive Dashboard overview and live metrics',
            ctrl: true,
            shift: true,
            alt: false,
            key: 'D',
            display: 'Ctrl + Shift + D',
            action: () => {
                const nav = document.getElementById('rail-nav-dashboard') || document.querySelector('.rail-nav-item[data-section="dashboard"]');
                if (nav) nav.click();
            }
        },
        {
            id: 'users',
            title: 'User Management',
            desc: 'Jump straight to Users section and staff governance table',
            ctrl: true,
            shift: true,
            alt: false,
            key: 'U',
            display: 'Ctrl + Shift + U',
            action: () => {
                const nav = document.getElementById('rail-nav-users') || document.querySelector('.rail-nav-item[data-section="users"]');
                if (nav) nav.click();
            }
        },
        {
            id: 'analytics',
            title: 'Research & Accreditation Analytics',
            desc: 'Jump to Analytics charts and accreditation statistics',
            ctrl: true,
            shift: true,
            alt: false,
            key: 'Y',
            display: 'Ctrl + Shift + Y',
            action: () => {
                const nav = document.getElementById('rail-nav-analytics') || document.querySelector('.rail-nav-item[data-section="analytics"]');
                if (nav) nav.click();
            }
        },
        {
            id: 'activity',
            title: 'Local Activity Logs',
            desc: 'Jump to Local Activity History and audit inspection',
            ctrl: true,
            shift: true,
            alt: false,
            key: 'L',
            display: 'Ctrl + Shift + L',
            action: () => {
                const nav = document.getElementById('rail-nav-activity') || document.querySelector('.rail-nav-item[data-section="activity"]');
                if (nav) nav.click();
            }
        },
        {
            id: 'sync_pinecone',
            title: 'Pinecone AI Vector Sync',
            desc: 'Open Pinecone Vector Synchronization Studio modal',
            ctrl: true,
            shift: true,
            alt: false,
            key: 'S',
            display: 'Ctrl + Shift + S',
            action: () => {
                const syncBtn = document.getElementById('sync-pinecone-btn');
                if (syncBtn) syncBtn.click();
            }
        },
        {
            id: 'dismiss',
            title: 'Dismiss Active Surface',
            desc: 'Dismiss active modal dialog or close mobile sidebar rail',
            ctrl: false,
            shift: false,
            alt: false,
            key: 'Escape',
            display: 'Esc',
            action: () => {
                const activeModal = document.querySelector('.modal.active');
                if (activeModal) {
                    const closeBtn = activeModal.querySelector('.modal-close-btn') || activeModal.querySelector('.btn-secondary');
                    if (closeBtn) closeBtn.click();
                    else activeModal.classList.remove('active');
                }
                const sidebar = document.getElementById('sidebar-rail') || document.querySelector('.sidebar-rail');
                if (sidebar && sidebar.classList.contains('mobile-open')) {
                    sidebar.classList.remove('mobile-open');
                }
            }
        }
    ];

    function getStoredCustomShortcuts() {
        try {
            const raw = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (_) {
            return {};
        }
    }

    function saveCustomShortcut(id, shortcutConfig) {
        try {
            const current = getStoredCustomShortcuts();
            current[id] = shortcutConfig;
            localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(current));
            renderShortcutsUI();
        } catch (e) {
            console.error('[AdminShortcuts] Failed saving to localStorage:', e);
        }
    }

    function resetSingleShortcut(id) {
        try {
            const current = getStoredCustomShortcuts();
            delete current[id];
            localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(current));
            renderShortcutsUI();
            if (typeof showToast === 'function') {
                showToast('Shortcut reset to default', 'info');
            }
        } catch (e) {
            console.error('[AdminShortcuts] Failed resetting shortcut:', e);
        }
    }

    function resetAllShortcuts() {
        try {
            localStorage.removeItem(SHORTCUTS_STORAGE_KEY);
            cancelRebinding();
            renderShortcutsUI();
            if (typeof showToast === 'function') {
                showToast('All shortcuts restored to factory defaults', 'success');
            }
        } catch (e) {
            console.error('[AdminShortcuts] Failed resetting shortcuts:', e);
        }
    }

    function getActiveShortcuts() {
        const custom = getStoredCustomShortcuts();
        return DEFAULT_SHORTCUTS.map(def => {
            if (custom[def.id]) {
                return {
                    ...def,
                    ctrl: custom[def.id].ctrl,
                    shift: custom[def.id].shift,
                    alt: custom[def.id].alt,
                    key: custom[def.id].key,
                    display: custom[def.id].display,
                    isCustom: true
                };
            }
            return { ...def, isCustom: false };
        });
    }

    function formatKbdHTML(displayStr) {
        return (displayStr || '').split(' + ').map(k => `<kbd>${k}</kbd>`).join(' + ');
    }

    function renderShortcutsUI() {
        const container = document.getElementById('admin-shortcuts-container');
        if (!container) return;

        const shortcuts = getActiveShortcuts();
        let html = '';

        shortcuts.forEach(sc => {
            const isRecording = activeRecordingId === sc.id;
            const customBadge = sc.isCustom ? `<span class="shortcut-badge-custom">Custom</span>` : '';
            const resetButton = sc.isCustom 
                ? `<button type="button" class="btn-reset-shortcut" data-reset-id="${sc.id}" title="Reset this key to factory default">Reset</button>`
                : '';

            html += `
                <div class="shortcut-item ${isRecording ? 'recording' : ''}" data-shortcut-id="${sc.id}">
                    <span class="shortcut-key">
                        ${isRecording 
                            ? '<span style="color:#08D488;font-weight:700;font-size:0.8rem;letter-spacing:0.3px;">Press new keys... (Esc to cancel)</span>' 
                            : formatKbdHTML(sc.display)}
                    </span>
                    <div class="shortcut-item-info">
                        <span class="shortcut-title">${sc.title} ${customBadge}</span>
                        <span class="shortcut-desc">${sc.desc}</span>
                    </div>
                    <div class="shortcut-actions">
                        ${resetButton}
                        <button type="button" class="btn-rebind-shortcut" data-rebind-id="${sc.id}" title="Rebind shortcut key">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                            <span>${isRecording ? 'Listening...' : 'Rebind'}</span>
                        </button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Bind rebind clicks
        container.querySelectorAll('[data-rebind-id]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-rebind-id');
                startRebinding(id);
            });
        });

        // Bind reset single clicks
        container.querySelectorAll('[data-reset-id]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-reset-id');
                resetSingleShortcut(id);
            });
        });
    }

    function startRebinding(id) {
        if (activeRecordingId === id) {
            cancelRebinding();
            return;
        }

        activeRecordingId = id;
        renderShortcutsUI();

        if (recordingListener) {
            window.removeEventListener('keydown', recordingListener, true);
        }

        recordingListener = function(e) {
            // Ignore bare modifier presses
            if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            if (e.key === 'Escape' || e.key === 'Esc') {
                cancelRebinding();
                if (typeof showToast === 'function') {
                    showToast('Rebinding cancelled', 'info');
                }
                return;
            }

            const ctrl = Boolean(e.ctrlKey || e.metaKey);
            const shift = Boolean(e.shiftKey);
            const alt = Boolean(e.altKey);

            // Require Ctrl or Alt modifier unless it's a function key (F1-F12)
            const isFnKey = /^F[1-9]|F1[0-2]$/i.test(e.key);
            if (!ctrl && !alt && !isFnKey) {
                if (typeof showToast === 'function') {
                    showToast('Custom shortcuts must include Ctrl or Alt modifier', 'warning');
                }
                return;
            }

            const rawKey = e.key.length === 1 ? e.key.toUpperCase() : e.key;

            // Build display string
            const parts = [];
            if (ctrl) parts.push('Ctrl');
            if (alt) parts.push('Alt');
            if (shift) parts.push('Shift');
            parts.push(rawKey);

            const display = parts.join(' + ');

            saveCustomShortcut(activeRecordingId, {
                ctrl,
                shift,
                alt,
                key: rawKey,
                display
            });

            cancelRebinding();

            if (typeof showToast === 'function') {
                showToast(`Shortcut updated: ${display}`, 'success');
            }
        };

        // Attach with capture = true to intercept before anything else
        window.addEventListener('keydown', recordingListener, true);
    }

    function cancelRebinding() {
        activeRecordingId = null;
        if (recordingListener) {
            window.removeEventListener('keydown', recordingListener, true);
            recordingListener = null;
        }
        renderShortcutsUI();
    }

    /**
     * Dynamic Keyboard Shortcuts Dispatcher
     */
    function handleKeyboardShortcuts(e) {
        // If recording a shortcut, do not dispatch regular actions
        if (activeRecordingId) return;

        // Ignore when user is actively typing in inputs unless it's a Ctrl/Alt combination or Escape
        const target = e.target;
        const isEditing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        const hasModifier = Boolean(e.ctrlKey || e.altKey || e.metaKey);

        if (isEditing && !hasModifier && e.key !== 'Escape') {
            return;
        }

        const pressedCtrl = Boolean(e.ctrlKey || e.metaKey);
        const pressedShift = Boolean(e.shiftKey);
        const pressedAlt = Boolean(e.altKey);
        const pressedKey = (e.key || '').length === 1 ? e.key.toUpperCase() : e.key;
        const isEscape = e.key === 'Escape' || e.key === 'Esc';

        const shortcuts = getActiveShortcuts();

        for (const sc of shortcuts) {
            const matchesCtrl = Boolean(sc.ctrl) === pressedCtrl;
            const matchesShift = Boolean(sc.shift) === pressedShift;
            const matchesAlt = Boolean(sc.alt) === pressedAlt;
            const matchesKey = isEscape 
                ? (sc.key === 'Escape' || sc.key === 'Esc')
                : (sc.key.toUpperCase() === pressedKey.toUpperCase());

            if (matchesCtrl && matchesShift && matchesAlt && matchesKey) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof sc.action === 'function') {
                    sc.action();
                }
                return;
            }
        }
    }

    /**
     * ========================================================================
     * LINKED PERSONAL GMAIL (2FA & RECOVERY CHANNEL) CONTROLLER
     * ========================================================================
     */
    function getBackendUrl() {
        if (typeof window.BACKEND_API_BASE === 'string' && window.BACKEND_API_BASE.trim()) {
            return window.BACKEND_API_BASE.replace(/\/+$/, '');
        }
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3001';
        }
        return 'https://recap-backend-jy5b.onrender.com';
    }

    async function fetchWithAuth(apiPath, options = {}) {
        const currentUser = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
        if (!currentUser) throw new Error('User is not authenticated');
        const token = await currentUser.getIdToken(true);
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const candidateBases = (apiPath.startsWith('http://') || apiPath.startsWith('https://'))
            ? ['']
            : (isLocal ? ['http://localhost:3001', 'https://recap-backend-jy5b.onrender.com'] : ['https://recap-backend-jy5b.onrender.com', 'http://localhost:3001']);

        let lastErr = null;
        for (const base of candidateBases) {
            const fullUrl = base ? `${base}${apiPath}` : apiPath;
            try {
                const resp = await fetch(fullUrl, { ...options, headers });
                const data = await resp.json().catch(() => ({}));
                if (!resp.ok) {
                    throw new Error(data.error || `Server responded with ${resp.status}`);
                }
                return data;
            } catch (err) {
                lastErr = err;
                console.warn(`[AdminSettings] Failed fetch on ${fullUrl}:`, err.message);
            }
        }
        throw lastErr || new Error('Backend service unreachable.');
    }

    /**
     * Refresh the Linked Personal Gmail (2FA Channel) UI state
     */
    async function refreshLinkedEmailState(passedUser = null, passedUserData = null) {
        const badgeEl = document.getElementById('linked-email-status-badge');
        const bindContainer = document.getElementById('linked-email-bind-container');
        const activeContainer = document.getElementById('linked-email-active-container');
        const activeDisplay = document.getElementById('active-linked-gmail-display');
        const inputGmail = document.getElementById('input-link-gmail');
        const verifyRow = document.getElementById('linked-email-code-verify-row');
        const unlinkRow = document.getElementById('linked-email-unlink-pin-row');

        if (!badgeEl || !bindContainer || !activeContainer) return;

        const currentUser = passedUser || ((typeof auth !== 'undefined' && auth) ? auth.currentUser : null);

        // If auth hasn't resolved yet, show Checking... rather than Sign-in Required if session exists
        if (!currentUser) {
            const hasSavedSession = sessionStorage.getItem('userEmail') || localStorage.getItem('cachedAuthState');
            if (hasSavedSession) {
                badgeEl.textContent = 'Checking...';
                badgeEl.style.background = 'rgba(100, 116, 139, 0.15)';
                badgeEl.style.color = 'var(--text-secondary)';
            } else {
                badgeEl.textContent = 'Sign-in Required';
                badgeEl.style.background = 'rgba(100, 116, 139, 0.15)';
                badgeEl.style.color = 'var(--text-secondary)';
            }
            return;
        }

        try {
            let data = passedUserData || null;

            // Check cached in-memory user data first
            if (!data && window.currentUserData && (window.currentUserData.linkedEmail || window.currentUserData.personalEmail)) {
                data = window.currentUserData;
            }

            // Always fetch fresh from Firestore if db is available
            if (typeof db !== 'undefined' && db && currentUser?.uid) {
                try {
                    const doc = await db.collection('users').doc(currentUser.uid).get();
                    if (doc.exists) {
                        data = { ...(data || {}), ...(doc.data() || {}) };
                    }
                } catch (fetchErr) {
                    console.warn('[AdminSettings] Firestore read warning for linked email:', fetchErr.message);
                }
            }

            const linkedEmail = data?.linkedEmail || data?.personalEmail;
            const isVerified = Boolean(data?.linkedEmailVerified === true || data?.personalEmailVerified === true);

            if (linkedEmail && isVerified) {
                badgeEl.textContent = 'Active & Linked';
                badgeEl.style.background = 'rgba(8, 212, 136, 0.15)';
                badgeEl.style.color = '#08D488';

                bindContainer.style.display = 'none';
                activeContainer.style.display = 'block';
                if (activeDisplay) activeDisplay.textContent = linkedEmail;
                if (unlinkRow) unlinkRow.style.display = 'none';
                return;
            }

            if (linkedEmail && !isVerified) {
                badgeEl.textContent = 'Pending Verification';
                badgeEl.style.background = 'rgba(252, 204, 86, 0.15)';
                badgeEl.style.color = '#FCCC56';

                activeContainer.style.display = 'none';
                bindContainer.style.display = 'block';
                if (inputGmail) {
                    inputGmail.value = linkedEmail;
                    inputGmail.disabled = false;
                }
                if (verifyRow) verifyRow.style.display = 'block';
                return;
            }

            // Not linked / unverified state
            badgeEl.textContent = 'Not Bound';
            badgeEl.style.background = 'rgba(252, 204, 86, 0.15)';
            badgeEl.style.color = '#FCCC56';

            activeContainer.style.display = 'none';
            bindContainer.style.display = 'block';
            if (verifyRow) verifyRow.style.display = 'none';
            if (inputGmail) inputGmail.disabled = false;
        } catch (err) {
            console.warn('[AdminSettings] Failed to refresh linked email state:', err.message);
        }
    }

    async function initLinkedGmailControls() {
        const badgeEl = document.getElementById('linked-email-status-badge');
        const bindContainer = document.getElementById('linked-email-bind-container');
        const activeContainer = document.getElementById('linked-email-active-container');
        const activeDisplay = document.getElementById('active-linked-gmail-display');
        const inputGmail = document.getElementById('input-link-gmail');
        const btnRequestCode = document.getElementById('btn-request-link-code');
        const verifyRow = document.getElementById('linked-email-code-verify-row');
        const inputCode = document.getElementById('input-link-code');
        const btnConfirmCode = document.getElementById('btn-confirm-link-code');
        const btnCancelCode = document.getElementById('btn-cancel-link-code');
        const bindStatusMsg = document.getElementById('link-gmail-status-msg');

        const btnStartUnlink = document.getElementById('btn-start-unlink-gmail');
        const unlinkRow = document.getElementById('linked-email-unlink-pin-row');
        const inputPin = document.getElementById('input-unlink-pin');
        const btnConfirmPin = document.getElementById('btn-confirm-unlink-pin');
        const btnCancelPin = document.getElementById('btn-cancel-unlink-pin');
        const unlinkStatusMsg = document.getElementById('unlink-pin-status-msg');

        if (!badgeEl || !bindContainer || !activeContainer) return;

        // Request Link Code
        if (btnRequestCode && !btnRequestCode.dataset.bound) {
            btnRequestCode.dataset.bound = 'true';
            btnRequestCode.addEventListener('click', async () => {
                const email = (inputGmail ? inputGmail.value : '').trim();
                if (!email || !email.includes('@')) {
                    if (typeof showToast === 'function') showToast('Please enter a valid Gmail address', 'error');
                    if (inputGmail) inputGmail.focus();
                    return;
                }

                btnRequestCode.disabled = true;
                btnRequestCode.textContent = 'Sending Code...';
                if (bindStatusMsg) {
                    bindStatusMsg.textContent = '';
                    bindStatusMsg.style.color = '';
                }

                try {
                    const data = await fetchWithAuth(`${getBackendUrl()}/api/auth/email/request-link-code`, {
                        method: 'POST',
                        body: JSON.stringify({ email })
                    });

                    if (typeof showToast === 'function') showToast(data.message || 'Verification code sent!', 'success');
                    if (verifyRow) verifyRow.style.display = 'block';
                    if (inputGmail) inputGmail.disabled = true;
                    if (inputCode) {
                        inputCode.value = '';
                        inputCode.focus();
                    }
                    if (bindStatusMsg) {
                        bindStatusMsg.textContent = `A 6-digit code was sent to ${data.maskedEmail || email}.`;
                        bindStatusMsg.style.color = '#08D488';
                    }
                } catch (err) {
                    if (typeof showToast === 'function') showToast(err.message, 'error');
                    if (bindStatusMsg) {
                        bindStatusMsg.textContent = err.message;
                        bindStatusMsg.style.color = '#ef4444';
                    }
                } finally {
                    btnRequestCode.disabled = false;
                    btnRequestCode.textContent = 'Send Verification Code';
                }
            });
        }

        // Confirm Link Code
        if (btnConfirmCode && !btnConfirmCode.dataset.bound) {
            btnConfirmCode.dataset.bound = 'true';
            btnConfirmCode.addEventListener('click', async () => {
                const code = (inputCode ? inputCode.value : '').trim();
                if (!code || code.length !== 6) {
                    if (typeof showToast === 'function') showToast('Please enter the 6-digit code from your email', 'error');
                    if (inputCode) inputCode.focus();
                    return;
                }

                btnConfirmCode.disabled = true;
                btnConfirmCode.textContent = 'Verifying...';

                try {
                    const data = await fetchWithAuth(`${getBackendUrl()}/api/auth/email/confirm-link`, {
                        method: 'POST',
                        body: JSON.stringify({ code })
                    });

                    if (typeof showToast === 'function') showToast(data.message || 'Gmail successfully bound!', 'success');
                    await refreshLinkedEmailState();
                } catch (err) {
                    if (typeof showToast === 'function') showToast(err.message, 'error');
                    if (bindStatusMsg) {
                        bindStatusMsg.textContent = err.message;
                        bindStatusMsg.style.color = '#ef4444';
                    }
                } finally {
                    btnConfirmCode.disabled = false;
                    btnConfirmCode.textContent = 'Verify & Bind Gmail';
                }
            });
        }

        // Cancel Link Code
        if (btnCancelCode && !btnCancelCode.dataset.bound) {
            btnCancelCode.dataset.bound = 'true';
            btnCancelCode.addEventListener('click', () => {
                if (verifyRow) verifyRow.style.display = 'none';
                if (inputGmail) inputGmail.disabled = false;
                if (bindStatusMsg) bindStatusMsg.textContent = '';
            });
        }

        // Start Unlink PIN Request
        if (btnStartUnlink && !btnStartUnlink.dataset.bound) {
            btnStartUnlink.dataset.bound = 'true';
            btnStartUnlink.addEventListener('click', async () => {
                btnStartUnlink.disabled = true;
                btnStartUnlink.textContent = 'Requesting PIN...';

                try {
                    const data = await fetchWithAuth(`${getBackendUrl()}/api/auth/email/request-unlink-pin`, {
                        method: 'POST'
                    });

                    if (typeof showToast === 'function') showToast(data.message || 'Authorization PIN sent!', 'info');
                    if (unlinkRow) unlinkRow.style.display = 'block';
                    if (inputPin) {
                        inputPin.value = '';
                        inputPin.focus();
                    }
                } catch (err) {
                    if (typeof showToast === 'function') showToast(err.message, 'error');
                } finally {
                    btnStartUnlink.disabled = false;
                    btnStartUnlink.textContent = 'Change / Unbind';
                }
            });
        }

        // Confirm Unlink PIN
        if (btnConfirmPin && !btnConfirmPin.dataset.bound) {
            btnConfirmPin.dataset.bound = 'true';
            btnConfirmPin.addEventListener('click', async () => {
                const pin = (inputPin ? inputPin.value : '').trim();
                if (!pin || pin.length !== 6) {
                    if (typeof showToast === 'function') showToast('Please enter the 6-digit PIN from your email', 'error');
                    if (inputPin) inputPin.focus();
                    return;
                }

                btnConfirmPin.disabled = true;
                btnConfirmPin.textContent = 'Unbinding...';

                try {
                    const data = await fetchWithAuth(`${getBackendUrl()}/api/auth/email/unlink`, {
                        method: 'POST',
                        body: JSON.stringify({ pin })
                    });

                    if (typeof showToast === 'function') showToast(data.message || 'Gmail unbound successfully', 'success');
                    await refreshLinkedEmailState();
                } catch (err) {
                    if (typeof showToast === 'function') showToast(err.message, 'error');
                    if (unlinkStatusMsg) {
                        unlinkStatusMsg.textContent = err.message;
                        unlinkStatusMsg.style.color = '#ef4444';
                    }
                } finally {
                    btnConfirmPin.disabled = false;
                    btnConfirmPin.textContent = 'Authorize Unbind';
                }
            });
        }

        // Cancel Unlink PIN
        if (btnCancelPin && !btnCancelPin.dataset.bound) {
            btnCancelPin.dataset.bound = 'true';
            btnCancelPin.addEventListener('click', () => {
                if (unlinkRow) unlinkRow.style.display = 'none';
            });
        }

        // Initial check
        refreshLinkedEmailState();
    }

    // Export module to global scope
    window.AdminSettings = {
        init,
        load: init,
        saveSettings,
        resetDefaults,
        updateAdminStats,
        updateAdminProfileCard,
        refreshLinkedEmailState,
        openProfileModal,
        shortcuts: {
            getActiveShortcuts,
            resetAllShortcuts,
            resetSingleShortcut,
            saveCustomShortcut,
            renderShortcutsUI
        },
        getSettings: () => ({ ...currentSettings })
    };

    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(window);
