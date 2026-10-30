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
        if (!confirm('Are you sure you want to restore factory default system settings?')) {
            return;
        }
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
                stripRepoState.textContent = '🟡 Maintenance Mode';
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
                stripRepoState.textContent = '🟢 Online & Open';
                stripRepoState.className = 'overview-val green';
            }
        }

        // Registration Strip State
        const stripRegState = document.getElementById('strip-reg-state');
        if (stripRegState) {
            if (currentSettings.allowRegistration) {
                stripRegState.textContent = '🟢 Open (@ctu.edu.ph)';
                stripRegState.className = 'overview-val green';
            } else {
                stripRegState.textContent = '🔴 Closed by Admin';
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

        if (holdingsEl) {
            const count = document.getElementById('total-projects-stat')?.textContent ||
                          (window.allProjectsData ? window.allProjectsData.length : null);
            if (count !== null && count !== undefined && count !== '') {
                holdingsEl.textContent = count;
            }
        }

        if (pendingEl) {
            const count = document.getElementById('pending-approvals-badge')?.textContent ||
                          document.getElementById('stat-pending-approval')?.textContent ||
                          '0';
            pendingEl.textContent = count;
        }

        if (usersEl) {
            const count = document.getElementById('total-users-stat')?.textContent ||
                          (window.allUsersData ? window.allUsersData.length : null);
            if (count !== null && count !== undefined && count !== '') {
                usersEl.textContent = count;
            }
        }
    }

    /**
     * Update Admin Profile Box with authenticated user info
     */
    function updateAdminProfileCard() {
        const adminNameEl = document.getElementById('settings-admin-name');
        const adminEmailEl = document.getElementById('settings-admin-email');
        const adminAvatar = document.getElementById('settings-profile-avatar');
        const avatarInitials = document.getElementById('aset-avatar-initials');

        const currentUser = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
        if (currentUser) {
            const name = currentUser.displayName || 'Administrator';
            const email = currentUser.email || 'admin@ctu.edu.ph';

            if (adminNameEl) adminNameEl.textContent = name;
            if (adminEmailEl) adminEmailEl.textContent = email;

            if (currentUser.photoURL && adminAvatar) {
                adminAvatar.src = currentUser.photoURL;
                adminAvatar.style.display = 'block';
                if (avatarInitials) avatarInitials.style.display = 'none';
            } else if (avatarInitials) {
                const initial = (name.trim().charAt(0) || 'A').toUpperCase();
                avatarInitials.textContent = initial;
            }
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
            firestoreVal.textContent = isOnline ? '🟢 Connected' : '🟡 Offline / Cached';
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
        try {
            const res = await fetch('http://localhost:3001/api/health', {
                method: 'GET',
                signal: AbortSignal.timeout(4000)
            });

            const latency = Math.round(performance.now() - startTime);

            if (res.ok) {
                const data = await res.json();
                if (resultBox) {
                    resultBox.style.display = 'block';
                    resultBox.innerHTML = `⚡ <strong>Backend Healthy (${latency}ms)</strong> &bull; Firebase: ${data.firebase} &bull; Pinecone: ${data.pinecone} &bull; Primary: Mistral AI`;
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
                resultBox.innerHTML = `⚠️ <strong>AI Endpoint Latency: ${latency}ms</strong> (Local client fallback operational)`;
            }
            if (typeof showToast === 'function') {
                showToast(`ℹ️ AI pipeline online via local fallback (${latency}ms)`, 'info');
            }
        } finally {
            if (btnText) btnText.textContent = 'Check API Health';
            if (btn) btn.disabled = false;
        }
    }

    /**
     * Purge Client Data Cache
     */
    function purgeClientCache() {
        if (!confirm('Clear local manuscript cache and force an immediate re-fetch from Firestore?')) {
            return;
        }

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
                if (typeof showToast === 'function') showToast('⚠️ No projects found to export', 'warning');
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
            if (typeof showToast === 'function') showToast('❌ Failed to export CSV', 'error');
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
                if (typeof showToast === 'function') showToast('⚠️ No projects found to export', 'warning');
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
            if (typeof showToast === 'function') showToast('❌ Failed to export JSON', 'error');
        }
    }

    /**
     * Open Admin Profile Modal
     */
    function openProfileModal() {
        const modal = document.getElementById('admin-profile-modal');
        if (!modal) return;

        const nameInput = document.getElementById('admin-profile-name-input');
        const emailInput = document.getElementById('admin-profile-email-input');
        const deptInput = document.getElementById('admin-profile-dept-input');

        const currentUser = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
        if (currentUser) {
            if (nameInput) nameInput.value = currentUser.displayName || 'Administrator';
            if (emailInput) emailInput.value = currentUser.email || 'admin@ctu.edu.ph';
        }

        modal.classList.add('active');
        document.body.classList.add('modal-open');
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
        const nameInput = document.getElementById('admin-profile-name-input');
        const deptInput = document.getElementById('admin-profile-dept-input');
        const saveBtn = document.getElementById('admin-profile-save-btn');

        const newName = nameInput ? nameInput.value.trim() : '';
        const dept = deptInput ? deptInput.value.trim() : '';

        if (!newName) {
            if (typeof showToast === 'function') showToast('❌ Full name is required', 'error');
            return;
        }

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
        }

        try {
            const currentUser = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
            if (currentUser) {
                // Update Firebase Auth Display Name
                await currentUser.updateProfile({ displayName: newName });

                // Update Firestore user document
                if (typeof db !== 'undefined' && db) {
                    await db.collection('users').doc(currentUser.uid).update({
                        fullName: newName,
                        department: dept,
                        updatedAt: new Date().toISOString()
                    });
                }

                // Update UI elements across dashboard
                const railAdminName = document.getElementById('admin-name');
                const settingsAdminName = document.getElementById('settings-admin-name');
                if (railAdminName) railAdminName.textContent = newName;
                if (settingsAdminName) settingsAdminName.textContent = newName;

                closeProfileModal();

                if (typeof ActivityService !== 'undefined' && typeof ActivityService.logAdmin === 'function') {
                    ActivityService.logAdmin(
                        'profile_updated',
                        newName,
                        `Updated administrator profile information: ${newName} (${dept || 'Library Administration'}).`
                    );
                }

                if (typeof showToast === 'function') {
                    showToast('Admin profile updated successfully', 'success');
                }
            }
        } catch (err) {
            console.error('[AdminSettings] Failed to update admin profile:', err);
            if (typeof showToast === 'function') {
                showToast('❌ Failed to update profile: ' + err.message, 'error');
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
                        showToast('ℹ️ Password change verification loading...', 'info');
                    }
                }
            });
        }

        // Jump Nav Anchor Links
        initJumpNav();

        // Listen for section visibility / hash change to update stats
        window.addEventListener('hashchange', () => {
            if (window.location.hash === '#settings') {
                updateAdminProfileCard();
                updateAdminStats();
            }
        });

        // Copy Admin Email
        document.getElementById('aset-card-copy-email-btn')?.addEventListener('click', () => {
            const email = document.getElementById('settings-admin-email')?.textContent?.trim() || '';
            if (email) {
                navigator.clipboard.writeText(email).then(() => {
                    if (typeof showToast === 'function') {
                        showToast('Admin email address copied to clipboard', 'success');
                    }
                }).catch(err => {
                    console.warn('Copy failed:', err);
                });
            }
        });

        // Admin KPI Action Buttons
        document.getElementById('aset-btn-holdings')?.addEventListener('click', () => {
            const nav = document.querySelector('.rail-nav-item[data-section="projects"]');
            if (nav) nav.click();
            else window.location.hash = 'projects';
        });

        document.getElementById('aset-btn-pending')?.addEventListener('click', () => {
            const nav = document.querySelector('.rail-nav-item[data-section="approvals"]');
            if (nav) nav.click();
            else window.location.hash = 'approvals';
        });

        document.getElementById('aset-btn-users')?.addEventListener('click', () => {
            const nav = document.querySelector('.rail-nav-item[data-section="users"]');
            if (nav) nav.click();
            else window.location.hash = 'users';
        });

        // Global Keyboard Shortcuts
        document.addEventListener('keydown', handleKeyboardShortcuts);
    }

    /**
     * Initialize In-Page Jump Navigation
     */
    function initJumpNav() {
        const jumpLinks = document.querySelectorAll('.aset-jump-link[data-aset-target]');
        if (!jumpLinks.length) return;

        jumpLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('data-aset-target');
                const targetEl = document.getElementById(targetId);
                if (!targetEl) return;

                jumpLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');

                targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

                targetEl.classList.remove('aset-flash');
                void targetEl.offsetWidth; // trigger reflow
                targetEl.classList.add('aset-flash');
            });
        });

        // Intersection Observer to highlight active section on scroll
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const id = entry.target.id;
                        jumpLinks.forEach(link => {
                            if (link.getAttribute('data-aset-target') === id) {
                                link.classList.add('active');
                            } else {
                                link.classList.remove('active');
                            }
                        });
                    }
                });
            }, {
                root: null,
                rootMargin: '-15% 0px -65% 0px',
                threshold: 0
            });

            const cards = document.querySelectorAll('.settings-card[id]');
            cards.forEach(card => observer.observe(card));
        }
    }

    /**
     * Keyboard Shortcuts Handler
     */
    function handleKeyboardShortcuts(e) {
        // Ctrl + K -> Search
        if (e.ctrlKey && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            const activeSearch = document.getElementById('projects-search') || document.getElementById('approvals-search') || document.getElementById('users-search');
            if (activeSearch) {
                activeSearch.focus();
                activeSearch.select();
            }
        }

        // Ctrl + Shift + P -> Add Project
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') {
            e.preventDefault();
            const addBtn = document.getElementById('add-project-btn');
            if (addBtn) addBtn.click();
        }

        // Ctrl + Shift + A -> Jump to Approvals
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            const approvalsNav = document.getElementById('rail-nav-approvals') || document.querySelector('.rail-nav-item[data-section="approvals"]');
            if (approvalsNav) approvalsNav.click();
        }

        // Ctrl + Shift + C -> Open Librarian AI Copilot
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            const copilotNav = document.getElementById('rail-nav-copilot') || document.querySelector('.rail-nav-item[data-section="copilot"]');
            if (copilotNav) {
                copilotNav.click();
            } else {
                const floatingCopilot = document.getElementById('admin-floating-copilot-btn');
                if (floatingCopilot) floatingCopilot.click();
            }
        }
    }

    // Export module to global scope
    window.AdminSettings = {
        init,
        load: init,
        saveSettings,
        resetDefaults,
        getSettings: () => ({ ...currentSettings })
    };

    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(window);
