/**
 * Settings Handler
 * Manages user settings in the student dashboard
 */

document.addEventListener('DOMContentLoaded', () => {
    // Only run on student page
    if (!document.getElementById('section-settings')) return;

    console.log('[Settings] Initializing settings handler...');

    // Theme Toggle
    const themeToggle = document.getElementById('settings-theme-toggle');
    if (themeToggle) {
        // Set initial state based on current theme
        const currentTheme = localStorage.getItem('theme') || 
            (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        themeToggle.checked = currentTheme === 'dark';

        themeToggle.addEventListener('change', (e) => {
            const newTheme = e.target.checked ? 'dark' : 'light';
            localStorage.setItem('theme', newTheme);
            document.documentElement.setAttribute('data-theme', newTheme);
            
            // Show toast notification
            if (typeof showToast === 'function') {
                showToast(`Switched to ${newTheme} mode`, 'success');
            }
            
            // Log setting change
            if (window.ActivityService && typeof window.ActivityService.logSetting === 'function') {
                window.ActivityService.logSetting('theme', newTheme);
            }
            
            console.log(`[Settings] Theme changed to: ${newTheme}`);
        });
    }

    // Toast Notifications Toggle
    const toastToggle = document.getElementById('settings-toast-toggle');
    if (toastToggle) {
        // Get saved preference
        const toastEnabled = localStorage.getItem('toastNotifications') !== 'false';
        toastToggle.checked = toastEnabled;

        toastToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            localStorage.setItem('toastNotifications', enabled);
            
            if (enabled && typeof showToast === 'function') {
                showToast('Toast notifications enabled', 'success');
            }
            
            // Log setting change
            if (window.ActivityService && typeof window.ActivityService.logSetting === 'function') {
                window.ActivityService.logSetting('toast_notifications', enabled ? 'enabled' : 'disabled');
            }
            
            console.log(`[Settings] Toast notifications: ${enabled ? 'enabled' : 'disabled'}`);
        });
    }

    // Display user email
    const userEmailDisplay = document.getElementById('settings-user-email');
    if (userEmailDisplay && typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
            if (user && user.email) {
                userEmailDisplay.textContent = user.email;
            } else {
                userEmailDisplay.textContent = 'Not logged in';
            }
        });
    }

    // Clear Search History Button
    const clearHistoryBtn = document.getElementById('clear-search-history-btn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', async () => {
            const confirmed = await ModalDialog.confirm({
                    title: 'Clear Search History',
                    message: 'Are you sure you want to clear your local search history? This action cannot be undone.',
                    confirmText: 'Clear History',
                    cancelText: 'Cancel',
                    isDanger: true,
                    icon: 'trash'
                });

            if (confirmed) {
                localStorage.removeItem('recap_search_history');
                
                if (typeof showToast === 'function') {
                    showToast('Search history cleared', 'success');
                }
                
                console.log('[Settings] Search history cleared');
            }
        });
    }

    // Export Saved Projects Button
    const exportBtn = document.getElementById('export-saved-projects-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            try {
                // Get saved projects from localStorage
                const savedProjects = JSON.parse(localStorage.getItem('savedProjects') || '[]');
                
                if (savedProjects.length === 0) {
                    if (typeof showToast === 'function') {
                        showToast('No saved projects to export', 'warning');
                    }
                    return;
                }

                // Create export data
                const exportData = {
                    exportDate: new Date().toISOString(),
                    projectCount: savedProjects.length,
                    projects: savedProjects.map(proj => ({
                        title: proj.title,
                        id: proj.id,
                        authors: proj.rawData?.authors || [],
                        year: proj.rawData?.year || '',
                        program: proj.rawData?.program || '',
                        abstract: proj.rawData?.abstract || ''
                    }))
                };

                // Create downloadable JSON file
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `recaps-saved-projects-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                if (typeof showToast === 'function') {
                    showToast(`Exported ${savedProjects.length} projects`, 'success');
                }
                
                console.log(`[Settings] Exported ${savedProjects.length} projects`);
            } catch (error) {
                console.error('[Settings] Export error:', error);
                if (typeof showToast === 'function') {
                    showToast('Failed to export projects', 'error');
                }
            }
        });
    }

    console.log('[Settings] Settings handler initialized');

    // ========================================
    // BACKGROUND IMAGE PREFERENCE
    // ========================================
    
    // Available library images (1-11)
    const LIBRARY_IMAGES = Array.from({length: 11}, (_, i) => `assets/library_images/img (${i + 1}).jpg`);
    
    // Initialize background preference
    function initBackgroundPreference() {
        const randomRadio = document.getElementById('bg-mode-random');
        const staticRadio = document.getElementById('bg-mode-static');
        const gallery = document.getElementById('bg-image-gallery');
        
        if (!randomRadio || !staticRadio || !gallery) return;
        
        // Load saved preference
        const savedMode = localStorage.getItem('bgImageMode') || 'random';
        const savedImage = localStorage.getItem('bgStaticImage');
        
        // Set initial radio state
        if (savedMode === 'static') {
            staticRadio.checked = true;
            gallery.style.display = 'block';
        } else {
            randomRadio.checked = true;
            gallery.style.display = 'none';
        }
        
        // Create image gallery
        createImageGallery(gallery, savedImage);
        
        // Handle mode change
        randomRadio.addEventListener('change', () => {
            if (randomRadio.checked) {
                localStorage.setItem('bgImageMode', 'random');
                gallery.style.display = 'none';
                localStorage.removeItem('bgStaticImage');
                
                if (typeof showToast === 'function') {
                    showToast('Background set to random mode', 'success');
                }
                
                console.log('[Settings] Background mode: random');
            }
        });
        
        staticRadio.addEventListener('change', () => {
            if (staticRadio.checked) {
                localStorage.setItem('bgImageMode', 'static');
                gallery.style.display = 'block';
                
                // If no image selected yet, select first one
                if (!localStorage.getItem('bgStaticImage')) {
                    selectBackgroundImage(LIBRARY_IMAGES[0]);
                }
                
                if (typeof showToast === 'function') {
                    showToast('Background set to static mode - select your image', 'info');
                }
                
                console.log('[Settings] Background mode: static');
            }
        });
    }
    
    function createImageGallery(container, selectedImage) {
        const galleryGrid = container.querySelector('div[style*="grid-template-columns"]');
        if (!galleryGrid) return;
        
        galleryGrid.innerHTML = '';
        
        LIBRARY_IMAGES.forEach((imagePath, index) => {
            const isSelected = imagePath === selectedImage;
            
            const imageItem = document.createElement('div');
            imageItem.className = 'bg-image-item' + (isSelected ? ' selected' : '');
            imageItem.innerHTML = `
                <img src="../${imagePath}" alt="Library Image ${index + 1}" loading="lazy">
                <div class="selected-badge">✓</div>
            `;
            
            imageItem.addEventListener('click', () => {
                selectBackgroundImage(imagePath);
                
                // Update visual selection
                galleryGrid.querySelectorAll('.bg-image-item').forEach(item => {
                    item.classList.remove('selected');
                });
                imageItem.classList.add('selected');
            });
            
            galleryGrid.appendChild(imageItem);
        });
    }
    
    function selectBackgroundImage(imagePath) {
        localStorage.setItem('bgStaticImage', imagePath);
        localStorage.setItem('bgImageMode', 'static');
        
        if (typeof showToast === 'function') {
            showToast('Background image selected', 'success');
        }
        
        console.log('[Settings] Selected background:', imagePath);
    }
    
    // Initialize on load
    initBackgroundPreference();
    initDangerZone();

    // ========================================
    // DANGER ZONE (DROPDOWN COLLAPSIBLE)
    // Low-contrast, inconspicuous by design
    // ========================================
    function initDangerZone() {
        const toggle = document.getElementById('danger-zone-toggle');
        const content = document.getElementById('danger-zone-content');
        if (!toggle || !content) return;

        toggle.addEventListener('click', () => {
            const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', !isExpanded);
            content.style.display = isExpanded ? 'none' : 'block';
        });

        initClearAccountData();
        initDeleteAccount();
    }

    /**
     * Clear Account Data
     * Erases saved capstones, search history, activity logs, and chat conversations
     * Leaves user login account intact
     */
    function initClearAccountData() {
        const clearBtn = document.getElementById('clear-account-data-btn');
        if (!clearBtn) return;

        clearBtn.addEventListener('click', async () => {
            const confirmed = await ModalDialog.confirm({
                    title: 'Clear Account Data',
                    message: 'Are you sure you want to clear your account data? This will permanently erase your saved capstones, search queries, reading history, and chat conversations. Your login credentials and account will remain active.',
                    confirmText: 'Yes, Clear All Data',
                    cancelText: 'Cancel',
                    isDanger: true,
                    icon: 'trash'
                });

            if (!confirmed) return;

            const originalContent = clearBtn.innerHTML;
            clearBtn.disabled = true;
            clearBtn.innerHTML = `<span>Clearing...</span>`;

            try {
                const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
                const uid = user ? user.uid : sessionStorage.getItem('userId');

                // 1. Clear Firestore User Collections
                if (uid && typeof db !== 'undefined') {
                    // Delete saved projects doc
                    try {
                        await db.collection('usersSavedProjects').doc(uid).delete();
                    } catch (e) {
                        console.warn('[Settings] Failed to delete usersSavedProjects doc:', e);
                    }

                    // Delete personal conversations
                    try {
                        const convSnap = await db.collection('conversations').where('userId', '==', uid).get();
                        if (!convSnap.empty) {
                            const batch = db.batch();
                            convSnap.forEach(doc => batch.delete(doc.ref));
                            await batch.commit();
                        }
                    } catch (e) {
                        console.warn('[Settings] Failed to delete conversations:', e);
                    }

                    // Delete user activities
                    try {
                        const actSnap = await db.collection('userActivities').where('userId', '==', uid).get();
                        if (!actSnap.empty) {
                            const batch = db.batch();
                            actSnap.forEach(doc => batch.delete(doc.ref));
                            await batch.commit();
                        }
                    } catch (e) {
                        console.warn('[Settings] Failed to delete userActivities:', e);
                    }
                }

                // 2. Clear Local Storage Data
                localStorage.removeItem('savedProjects');
                localStorage.removeItem('recap_search_history');
                localStorage.removeItem('recap_recent_searches');
                localStorage.removeItem('activity_logs');
                localStorage.removeItem('bgStaticImage');
                localStorage.removeItem('active_conversation_id');

                // 3. Log Activity
                if (window.ActivityService && typeof window.ActivityService.logActivity === 'function') {
                    window.ActivityService.logActivity('account_data_cleared', {
                        timestamp: new Date().toISOString()
                    });
                }

                // 4. Notify User
                if (typeof showToast === 'function') {
                    showToast('Account data cleared successfully', 'success');
                } else {
                    alert('Account data cleared successfully');
                }

                // 5. Notify UI to update any active badges/lists
                window.dispatchEvent(new CustomEvent('accountDataCleared'));

            } catch (error) {
                console.error('[Settings] Error clearing account data:', error);
                if (typeof showToast === 'function') {
                    showToast('Failed to clear some account data: ' + error.message, 'error');
                }
            } finally {
                clearBtn.disabled = false;
                clearBtn.innerHTML = originalContent;
            }
        });
    }

    /**
     * Delete Account
     * High security confirmation modal requiring exact word "DELETE"
     * Handles Firestore deletion, Firebase Auth user deletion, and re-authentication
     */
    function initDeleteAccount() {
        const deleteBtn = document.getElementById('delete-account-btn');
        if (!deleteBtn) return;

        deleteBtn.addEventListener('click', () => {
            showDeleteAccountModal(async (closeDeleteModal, submitBtn) => {
                const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
                if (!user) {
                    if (typeof showToast === 'function') {
                        showToast('You must be logged in to delete your account', 'error');
                    }
                    closeDeleteModal();
                    return;
                }

                const uid = user.uid;

                async function performActualDeletion() {
                    try {
                        // 1. Delete Firestore records
                        if (typeof db !== 'undefined') {
                            try {
                                await db.collection('usersSavedProjects').doc(uid).delete();
                            } catch (e) {
                                console.warn('[Settings] Failed to delete saved projects doc:', e);
                            }
                            try {
                                const convSnap = await db.collection('conversations').where('userId', '==', uid).get();
                                if (!convSnap.empty) {
                                    const batch = db.batch();
                                    convSnap.forEach(doc => batch.delete(doc.ref));
                                    await batch.commit();
                                }
                            } catch (e) {
                                console.warn('[Settings] Failed to delete conversations:', e);
                            }
                            try {
                                const actSnap = await db.collection('userActivities').where('userId', '==', uid).get();
                                if (!actSnap.empty) {
                                    const batch = db.batch();
                                    actSnap.forEach(doc => batch.delete(doc.ref));
                                    await batch.commit();
                                }
                            } catch (e) {
                                console.warn('[Settings] Failed to delete userActivities:', e);
                            }
                            try {
                                await db.collection('users').doc(uid).delete();
                            } catch (e) {
                                console.warn('[Settings] Failed to delete users doc:', e);
                            }
                        }

                        // 2. Delete Firebase Auth user
                        await user.delete();

                        // 3. Clear all storage
                        sessionStorage.clear();
                        localStorage.clear();

                        closeDeleteModal();

                        if (window.ModalDialog) {
                            await ModalDialog.alert({
                                title: 'Account Deleted',
                                message: 'Your account and all associated records have been permanently deleted.',
                                type: 'info'
                            });
                        } else if (typeof showToast === 'function') {
                            showToast('Account deleted successfully', 'success');
                        }

                        window.location.href = '../index.html';
                    } catch (error) {
                        console.error('[Settings] Error during account deletion:', error);
                        if (error.code === 'auth/requires-recent-login') {
                            closeDeleteModal();
                            showReauthModal(user.email, async (password, closeReauth, reauthBtn) => {
                                try {
                                    const cred = firebase.auth.EmailAuthProvider.credential(user.email, password);
                                    await user.reauthenticateWithCredential(cred);
                                    closeReauth();
                                    await performActualDeletion();
                                } catch (reauthErr) {
                                    console.error('[Settings] Reauthentication failed:', reauthErr);
                                    reauthBtn.disabled = false;
                                    reauthBtn.textContent = 'Verify & Delete';
                                    if (typeof showToast === 'function') {
                                        showToast(reauthErr.message || 'Incorrect password. Deletion cancelled.', 'error');
                                    }
                                }
                            });
                        } else {
                            submitBtn.disabled = false;
                            submitBtn.textContent = 'Delete My Account';
                            if (typeof showToast === 'function') {
                                showToast(error.message || 'Failed to delete account', 'error');
                            }
                        }
                    }
                }

                await performActualDeletion();
            });
        });
    }

    /**
     * Modal requiring typing "DELETE" to prevent accidental clicks
     * Uses centered icon, title, and description matching standard RE-CAPS modal design
     */
    function showDeleteAccountModal(onConfirm) {
        const existing = document.getElementById('delete-account-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'delete-account-modal';
        modal.className = 'app-dialog-modal active';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        modal.innerHTML = `
            <div class="app-dialog-overlay" id="delete-modal-overlay"></div>
            <div class="app-dialog-card" style="max-width: 500px;">
                <button type="button" class="app-dialog-close-btn" id="delete-modal-close" aria-label="Close dialog">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                <div class="app-dialog-header">
                    <div class="app-dialog-icon-wrapper app-dialog-icon-danger">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    </div>
                    <h3 class="app-dialog-title">Delete Account Permanently</h3>
                    <p class="app-dialog-description">
                        This action is <strong>irreversible</strong>. Your account credentials, user profile, saved research, activity history, and university platform access will be permanently destroyed.
                    </p>
                </div>
                
                <div style="margin-bottom: 1.5rem; padding: 0.875rem 1rem; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 12px; text-align: left;">
                    <p style="font-size: 0.8125rem; color: #ef4444; margin: 0 0 0.5rem 0; font-weight: 600;">
                        To confirm deletion, type <span style="letter-spacing: 1px; background: rgba(239, 68, 68, 0.15); padding: 2px 6px; border-radius: 4px;">DELETE</span> below:
                    </p>
                    <input type="text" id="delete-confirm-input" class="app-dialog-input" placeholder="Type DELETE to confirm" autocomplete="off">
                </div>

                <div class="app-dialog-actions">
                    <button type="button" class="app-dialog-btn app-dialog-btn-cancel" id="delete-modal-cancel">
                        Cancel
                    </button>
                    <button type="button" class="app-dialog-btn app-dialog-btn-danger" id="delete-modal-submit" disabled style="opacity: 0.5; cursor: not-allowed;">
                        Delete My Account
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const overlay = document.getElementById('delete-modal-overlay');
        const closeBtn = document.getElementById('delete-modal-close');
        const cancelBtn = document.getElementById('delete-modal-cancel');
        const input = document.getElementById('delete-confirm-input');
        const submitBtn = document.getElementById('delete-modal-submit');

        const closeModal = () => modal.remove();

        overlay.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        input.addEventListener('input', () => {
            if (input.value.trim() === 'DELETE') {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                submitBtn.style.cursor = 'pointer';
            } else {
                submitBtn.disabled = true;
                submitBtn.style.opacity = '0.5';
                submitBtn.style.cursor = 'not-allowed';
            }
        });

        submitBtn.addEventListener('click', async () => {
            if (input.value.trim() !== 'DELETE') return;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Deleting...';
            await onConfirm(closeModal, submitBtn);
        });

        setTimeout(() => input.focus(), 100);
    }

    /**
     * Modal for re-authentication if Firebase requires recent sign-in
     */
    function showReauthModal(email, onReauthSuccess) {
        const modal = document.createElement('div');
        modal.className = 'app-dialog-modal active';
        modal.setAttribute('role', 'dialog');
        modal.innerHTML = `
            <div class="app-dialog-overlay" id="reauth-modal-overlay"></div>
            <div class="app-dialog-card" style="max-width: 460px;">
                <button type="button" class="app-dialog-close-btn" id="reauth-modal-close" aria-label="Close dialog">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                <div class="app-dialog-header">
                    <div class="app-dialog-icon-wrapper app-dialog-icon-warning">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    </div>
                    <h3 class="app-dialog-title">Security Verification</h3>
                    <p class="app-dialog-description">
                        Deleting an account requires recent authentication. Please enter your password to proceed:
                    </p>
                </div>
                <div style="margin-bottom: 1.25rem;">
                    <input type="password" id="reauth-password-input" class="app-dialog-input" placeholder="Enter your current password" autocomplete="current-password">
                </div>
                <div class="app-dialog-actions">
                    <button type="button" class="app-dialog-btn app-dialog-btn-cancel" id="reauth-modal-cancel">Cancel</button>
                    <button type="button" class="app-dialog-btn app-dialog-btn-danger" id="reauth-modal-submit">Verify &amp; Delete</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const closeReauth = () => modal.remove();
        document.getElementById('reauth-modal-overlay').addEventListener('click', closeReauth);
        document.getElementById('reauth-modal-close').addEventListener('click', closeReauth);
        document.getElementById('reauth-modal-cancel').addEventListener('click', closeReauth);

        const passInput = document.getElementById('reauth-password-input');
        const submitBtn = document.getElementById('reauth-modal-submit');

        submitBtn.addEventListener('click', async () => {
            const password = passInput.value;
            if (!password) {
                if (typeof showToast === 'function') showToast('Please enter your password', 'warning');
                return;
            }
            submitBtn.disabled = true;
            submitBtn.textContent = 'Verifying...';
            await onReauthSuccess(password, closeReauth, submitBtn);
        });

        setTimeout(() => passInput.focus(), 100);
    }
});
