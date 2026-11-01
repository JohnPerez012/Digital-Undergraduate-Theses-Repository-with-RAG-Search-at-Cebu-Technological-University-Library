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

    // Hydrate Student Profile Card & Academic Telemetry
    function updateStudentProfileCard() {
        const studentNameEl = document.getElementById('settings-student-name');
        const userEmailDisplay = document.getElementById('settings-user-email');
        const cardEmailDisplay = document.getElementById('settings-user-email-card');
        const studentAvatar = document.getElementById('settings-student-avatar');
        const avatarInitials = document.getElementById('sset-avatar-initials');

        const savedStatsEl = document.getElementById('sset-stat-saved');
        const citationStatsEl = document.getElementById('sset-stat-citations');
        const searchStatsEl = document.getElementById('sset-stat-searches');

        const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
        const displayName = (user && user.displayName) || sessionStorage.getItem('userName') || document.getElementById('student-name')?.textContent || 'Student Researcher';
        const email = (user && user.email) || sessionStorage.getItem('userEmail') || 'student@ctu.edu.ph';

        if (studentNameEl) studentNameEl.textContent = displayName;
        if (userEmailDisplay) userEmailDisplay.textContent = email;
        if (cardEmailDisplay) cardEmailDisplay.textContent = email;

        if (user && user.photoURL && studentAvatar) {
            studentAvatar.src = user.photoURL;
            studentAvatar.style.display = 'block';
            if (avatarInitials) avatarInitials.style.display = 'none';
        } else if (avatarInitials) {
            const initial = (displayName.trim().charAt(0) || 'S').toUpperCase();
            avatarInitials.textContent = initial;
        }

        // Stats
        if (savedStatsEl) {
            try {
                const saved = JSON.parse(localStorage.getItem('savedProjects') || '[]');
                savedStatsEl.textContent = saved.length;
            } catch (e) {
                const railCount = document.getElementById('saved-count')?.textContent || '0';
                savedStatsEl.textContent = railCount;
            }
        }

        if (searchStatsEl) {
            try {
                const searches = JSON.parse(localStorage.getItem('recap_search_history') || '[]');
                searchStatsEl.textContent = searches.length;
            } catch (e) {
                searchStatsEl.textContent = '0';
            }
        }

        if (citationStatsEl) {
            try {
                const saved = JSON.parse(localStorage.getItem('savedProjects') || '[]');
                citationStatsEl.textContent = saved.length; // saved references eligible for citation
            } catch (e) {
                citationStatsEl.textContent = '0';
            }
        }

        // Strictly student role check & ID hydration
        const studentIdEl = document.getElementById('settings-student-id-card');
        const studentIdWrap = document.getElementById('sset-student-id-wrap');
        const role = sessionStorage.getItem('userType') || localStorage.getItem('userType');
        const isStudent = !role || role === 'student';

        if (isStudent && studentIdWrap && studentIdEl) {
            const cachedId = sessionStorage.getItem('studentId');
            if (cachedId) {
                studentIdEl.textContent = cachedId;
                studentIdWrap.style.display = 'inline-flex';
            } else if (user && typeof db !== 'undefined') {
                db.collection('users').doc(user.uid).get().then(doc => {
                    if (doc.exists) {
                        const data = doc.data() || {};
                        const sid = data.studentId || data.idNumber;
                        const uType = data.userType || role;
                        if (uType === 'student' && sid) {
                            sessionStorage.setItem('studentId', sid);
                            studentIdEl.textContent = sid;
                            studentIdWrap.style.display = 'inline-flex';
                        } else {
                            studentIdWrap.style.display = 'none';
                        }
                    }
                }).catch(err => console.debug('[Settings] ID retrieval deferred:', err));
            }
        } else if (studentIdWrap) {
            studentIdWrap.style.display = 'none';
        }
    }

    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
            updateStudentProfileCard();
        });
    } else {
        updateStudentProfileCard();
    }

    

    // ── Collapsible Settings Cards on Mobile (Student & Teacher) ──
    function initCollapsibleSettingsCards() {
        const blocks = document.querySelectorAll('.sset-block');
        if (!blocks.length) return;

        blocks.forEach(block => {
            const hd = block.querySelector('.sset-block-hd');
            if (!hd) return;

            hd.setAttribute('role', 'button');
            hd.setAttribute('tabindex', '0');
            hd.setAttribute('aria-expanded', block.classList.contains('is-expanded') ? 'true' : 'false');

            const toggleCard = (e) => {
                // Strictly mobile behavior (<= 1024px)
                if (window.innerWidth > 1024) return;

                // Don't toggle when tapping interactive inputs or buttons inside header
                if (e.target.closest('button, input, select, a, label')) return;

                const isExpanded = block.classList.contains('is-expanded');
                if (isExpanded) {
                    block.classList.remove('is-expanded');
                    hd.setAttribute('aria-expanded', 'false');
                } else {
                    block.classList.add('is-expanded');
                    hd.setAttribute('aria-expanded', 'true');
                    setTimeout(() => {
                        const rect = block.getBoundingClientRect();
                        if (rect.top < 65 || (window.innerHeight - rect.top < 160)) {
                            block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                    }, 120);
                }
            };

            hd.addEventListener('click', toggleCard);
            hd.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleCard(e);
                }
            });
        });
    }

    initCollapsibleSettingsCards();


    // Helper: Copy with SVG Checkmark Morph (2.5s duration)
    function setupCopyActionBtn(buttonId, textElementId, successToastMsg, defaultTitle) {
        const btn = document.getElementById(buttonId);
        if (!btn) return;

        btn.addEventListener('click', (e) => {
            const currentBtn = e.currentTarget;
            const textEl = document.getElementById(textElementId) || document.getElementById('settings-user-email');
            const text = textEl?.textContent?.trim() || '';
            if (!text || text === 'Loading...' || text === '--') return;

            const copySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
            const checkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

            const triggerCheckFeedback = () => {
                currentBtn.classList.add('is-copied');
                currentBtn.innerHTML = checkSvg;
                currentBtn.setAttribute('title', 'Copied to clipboard!');
                if (typeof showToast === 'function') {
                    showToast(successToastMsg || 'Copied to clipboard', 'success');
                }
                if (currentBtn._copyTimeout) clearTimeout(currentBtn._copyTimeout);
                currentBtn._copyTimeout = setTimeout(() => {
                    currentBtn.classList.remove('is-copied');
                    currentBtn.innerHTML = copySvg;
                    currentBtn.setAttribute('title', defaultTitle || 'Copy');
                    currentBtn._copyTimeout = null;
                }, 2500); // Revert after 2.5 seconds
            };

            // Clipboard API with LAN HTTP fallback
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(triggerCheckFeedback).catch(err => {
                    console.warn('[Settings] navigator.clipboard failed, attempting execCommand fallback:', err);
                    executeFallbackCopy(text, triggerCheckFeedback);
                });
            } else {
                executeFallbackCopy(text, triggerCheckFeedback);
            }
        });
    }

    function executeFallbackCopy(text, onSuccess) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '-9999px';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            const success = document.execCommand('copy');
            document.body.removeChild(ta);
            if (success && typeof onSuccess === 'function') {
                onSuccess();
            }
        } catch (e) {
            console.error('[Settings] Fallback copy failed:', e);
        }
    }

    // Initialize Copy Buttons for Student and Teacher
    setupCopyActionBtn('sset-card-copy-email-btn', 'settings-user-email-card', 'Email address copied to clipboard', 'Copy email address');
    setupCopyActionBtn('tset-card-copy-email-btn', 'settings-user-email', 'Email address copied to clipboard', 'Copy email address');
    setupCopyActionBtn('sset-card-copy-id-btn', 'settings-student-id-card', 'Student ID copied to clipboard', 'Copy Student ID');

    // Student Contributions Action Buttons
    document.getElementById('sset-btn-saved')?.addEventListener('click', () => {
        const navItem = document.querySelector('.rail-nav-item[data-section="saved"]');
        if (navItem) navItem.click();
        else window.location.hash = 'saved';
    });

    document.getElementById('sset-btn-citations')?.addEventListener('click', () => {
        const navItem = document.querySelector('.rail-nav-item[data-section="citations"]');
        if (navItem) navItem.click();
        else window.location.hash = 'citations';
    });

    document.getElementById('sset-btn-searches')?.addEventListener('click', () => {
        const navItem = document.querySelector('.rail-nav-item[data-section="activity"]');
        if (navItem) navItem.click();
        else window.location.hash = 'activity';
    });

    // Listen for hashchange to update stats on #settings
    window.addEventListener('hashchange', () => {
        if (window.location.hash === '#settings') {
            updateStudentProfileCard();
        }
    });

    window.addEventListener('accountDataCleared', () => {
        updateStudentProfileCard();
    });

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

    // Export Saved Projects Button (Modal with Format & Metrics Options)
    const exportBtn = document.getElementById('export-saved-projects-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            openExportSavedModal();
        });
    }

    function openExportSavedModal() {
        const savedProjects = JSON.parse(localStorage.getItem('savedProjects') || '[]');
        if (savedProjects.length === 0) {
            if (typeof showToast === 'function') {
                showToast('No saved projects to export. Bookmark projects from the catalog first.', 'warning');
            }
            return;
        }

        const existing = document.getElementById('export-saved-modal');
        if (existing) existing.remove();

        const count = savedProjects.length;
        const jsonSample = JSON.stringify(savedProjects);
        const estimatedSize = Math.max(1, Math.round(jsonSample.length / 1024)) + ' KB';
        const todayStr = new Date().toISOString().split('T')[0];
        const defaultBaseName = `recaps-saved-projects-${todayStr}`;

        const modal = document.createElement('div');
        modal.id = 'export-saved-modal';
        modal.className = 'modal export-modal-modern active';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        modal.innerHTML = `
            <div class="modal-backdrop" id="export-saved-backdrop"></div>
            <div class="modal-content" style="max-width: 520px; width: 95%;">
                <div class="export-modal-header">
                    <div class="export-modal-icon-wrap">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </div>
                    <div>
                        <h2 class="modal-title" style="margin: 0; text-align: left;">Export Saved Collection</h2>
                        <p style="margin: 0.25rem 0 0; color: var(--text-secondary); font-size: 0.88rem;">Review collection metrics and choose your preferred export format.</p>
                    </div>
                </div>

                <div class="export-metrics-card">
                    <div class="export-metric-item">
                        <span class="export-metric-label">Saved Projects</span>
                        <span class="export-metric-value">${count} items</span>
                    </div>
                    <div class="export-metric-item">
                        <span class="export-metric-label">Estimated Size</span>
                        <span class="export-metric-value">${estimatedSize}</span>
                    </div>
                    <div class="export-metric-item">
                        <span class="export-metric-label">Export Date</span>
                        <span class="export-metric-value">${todayStr}</span>
                    </div>
                    <div class="export-metric-item">
                        <span class="export-metric-label">Export Format</span>
                        <span class="export-metric-value" id="export-metric-format-label">JSON (.json)</span>
                    </div>
                </div>

                <div class="export-field-group">
                    <div class="export-field-label-row">
                        <label for="export-filename-input" class="export-field-label">Custom File Name</label>
                        <span class="export-optional-badge">Optional</span>
                    </div>
                    <div class="export-input-wrap">
                        <input type="text" id="export-filename-input" class="export-text-input" placeholder="${defaultBaseName}" autocomplete="off">
                        <span class="export-extension-badge" id="export-extension-badge">.json</span>
                    </div>
                    <span class="export-field-hint">Leave blank to use default: <code id="export-default-preview">${defaultBaseName}.json</code></span>
                </div>

                <div class="export-format-selector">
                    <label class="export-format-option selected">
                        <input type="radio" name="export-saved-format" value="json" checked>
                        <span>JSON</span>
                    </label>
                    <label class="export-format-option">
                        <input type="radio" name="export-saved-format" value="csv">
                        <span>CSV</span>
                    </label>
                    <label class="export-format-option">
                        <input type="radio" name="export-saved-format" value="bib">
                        <span>BibTeX</span>
                    </label>
                </div>

                <div class="export-modal-actions">
                    <button type="button" class="btn btn-secondary" id="export-modal-cancel-btn">Cancel</button>
                    <button type="button" class="btn btn-primary" id="export-modal-download-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <span>Download File</span>
                    </button>
                </div>
                <button type="button" class="modal-close" id="export-modal-close-x" aria-label="Close modal">&times;</button>
            </div>
        `;

        document.body.appendChild(modal);

        const closeModal = () => modal.remove();
        document.getElementById('export-saved-backdrop').addEventListener('click', closeModal);
        document.getElementById('export-modal-cancel-btn').addEventListener('click', closeModal);
        document.getElementById('export-modal-close-x').addEventListener('click', closeModal);

        const formatRadios = modal.querySelectorAll('input[name="export-saved-format"]');
        const extBadge = document.getElementById('export-extension-badge');
        const formatLabel = document.getElementById('export-metric-format-label');
        const defaultPreview = document.getElementById('export-default-preview');

        formatRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                modal.querySelectorAll('.export-format-option').forEach(opt => opt.classList.remove('selected'));
                e.target.closest('.export-format-option').classList.add('selected');
                const fmt = e.target.value;
                const ext = '.' + fmt;
                extBadge.textContent = ext;
                defaultPreview.textContent = `${defaultBaseName}${ext}`;
                if (fmt === 'json') formatLabel.textContent = 'JSON (.json)';
                else if (fmt === 'csv') formatLabel.textContent = 'CSV (.csv)';
                else if (fmt === 'bib') formatLabel.textContent = 'BibTeX (.bib)';
            });
        });

        document.getElementById('export-modal-download-btn').addEventListener('click', () => {
            const selectedFormat = modal.querySelector('input[name="export-saved-format"]:checked')?.value || 'json';
            const filenameInput = document.getElementById('export-filename-input');
            const customName = filenameInput?.value?.trim() || defaultBaseName;
            const fullFilename = customName.endsWith('.' + selectedFormat) ? customName : `${customName}.${selectedFormat}`;

            let fileContent = '';
            let mimeType = 'text/plain';

            if (selectedFormat === 'json') {
                mimeType = 'application/json';
                const exportObj = {
                    exportDate: new Date().toISOString(),
                    projectCount: count,
                    projects: savedProjects.map(proj => ({
                        id: proj.id,
                        title: proj.title,
                        authors: proj.rawData?.authors || proj.authors || [],
                        year: proj.rawData?.year || proj.year || '',
                        program: proj.rawData?.program || proj.program || '',
                        abstract: proj.rawData?.abstract || proj.abstract || ''
                    }))
                };
                fileContent = JSON.stringify(exportObj, null, 2);
            } else if (selectedFormat === 'csv') {
                mimeType = 'text/csv;charset=utf-8;';
                const escapeCsv = (str) => '"' + String(str || '').replace(/"/g, '""').replace(/\n/g, ' ') + '"';
                const headers = ['ID', 'Title', 'Authors', 'Year', 'Program', 'Abstract'];
                const rows = savedProjects.map(p => [
                    escapeCsv(p.id),
                    escapeCsv(p.title),
                    escapeCsv(Array.isArray(p.rawData?.authors || p.authors) ? (p.rawData?.authors || p.authors).join('; ') : (p.rawData?.authors || p.authors)),
                    escapeCsv(p.rawData?.year || p.year),
                    escapeCsv(p.rawData?.program || p.program),
                    escapeCsv(p.rawData?.abstract || p.abstract)
                ]);
                fileContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
            } else if (selectedFormat === 'bib') {
                mimeType = 'application/x-bibtex';
                fileContent = savedProjects.map((p, idx) => {
                    const key = (p.id || 'recaps_' + (idx + 1)).replace(/[^a-zA-Z0-9_-]/g, '_');
                    const authors = Array.isArray(p.rawData?.authors || p.authors) ? (p.rawData?.authors || p.authors).join(' and ') : (p.rawData?.authors || p.authors || 'Unknown');
                    const title = p.title || 'Untitled';
                    const year = p.rawData?.year || p.year || new Date().getFullYear();
                    const program = p.rawData?.program || p.program || '';
                    return `@misc{${key},\n  author = {${authors}},\n  title = {{${title}}},\n  year = {${year}},\n  school = {Cebu Technological University},\n  note = {Academic Program: ${program}}\n}\n`;
                }).join('\n');
            }

            const blob = new Blob([fileContent], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fullFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            closeModal();
            if (typeof showToast === 'function') {
                showToast(`Exported ${count} saved projects as ${selectedFormat.toUpperCase()}`, 'success');
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
                <div class="selected-badge"></div>
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
            if (!isExpanded) {
                setTimeout(() => {
                    content.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 100);
            }
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

                    // Clear local user activities (activities stored on local device only to protect Firebase free-tier quota)
                    try {
                        if (window.ActivityService && typeof window.ActivityService.clearUserActivities === 'function') {
                            await window.ActivityService.clearUserActivities(uid);
                        } else {
                            localStorage.removeItem('recaps_activities_' + uid);
                        }
                    } catch (e) {
                        console.warn('[Settings] Failed to clear local activities:', e);
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
     * Progressive 4-Step Account Deletion Wizard
     * Step 1: Input exact word "DELETE"
     * Step 2: Select 15 or 30 days inactivity countdown grace period
     * Step 3: Provide reason (menu selection + "Other" text box)
     * Step 4: Password verification to initiate countdown -> immediate automatic logout
     * Cancellation: Logging in before timer expiration automatically removes the timer.
     */
    function initDeleteAccount() {
        const deleteBtn = document.getElementById('delete-account-btn');
        if (!deleteBtn) return;

        deleteBtn.addEventListener('click', () => {
            const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
            if (!user) {
                if (typeof showToast === 'function') {
                    showToast('You must be logged in to manage account deletion', 'error');
                }
                return;
            }
            showDeleteAccountModal(user);
        });
    }

    function showDeleteAccountModal(user) {
        const existing = document.getElementById('delete-account-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'delete-account-modal';
        modal.className = 'app-dialog-modal active';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        let currentStep = 1;
        let selectedGraceDays = 15;
        let selectedReason = '';

        modal.innerHTML = `
            <div class="app-dialog-overlay" id="del-wizard-overlay"></div>
            <div class="app-dialog-card" style="max-width: 520px; width: 95%; text-align: left;">
                <button type="button" class="app-dialog-close-btn" id="del-wizard-close" aria-label="Close dialog">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>

                <div class="app-dialog-header" style="text-align: left; display: flex; gap: 14px; align-items: center; margin-bottom: 1.25rem;">
                    <div class="app-dialog-icon-wrapper app-dialog-icon-danger" style="margin: 0; flex-shrink: 0;">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    </div>
                    <div>
                        <h3 class="app-dialog-title" style="margin: 0; font-size: 1.25rem;">Schedule Account Deletion</h3>
                        <p id="del-step-indicator" style="margin: 2px 0 0; font-size: 0.8rem; color: var(--text-secondary); font-weight: 600;">
                            Step 1 of 4: Security Confirmation
                        </p>
                    </div>
                </div>

                <!-- Progress Bar -->
                <div style="display: flex; gap: 6px; margin-bottom: 1.5rem;">
                    <div id="del-progress-1" style="flex: 1; height: 4px; border-radius: 2px; background: #ef4444; transition: all 0.25s ease;"></div>
                    <div id="del-progress-2" style="flex: 1; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.1); transition: all 0.25s ease;"></div>
                    <div id="del-progress-3" style="flex: 1; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.1); transition: all 0.25s ease;"></div>
                    <div id="del-progress-4" style="flex: 1; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.1); transition: all 0.25s ease;"></div>
                </div>

                <!-- STEP 1: Type DELETE -->
                <div id="del-step-1" class="del-step-content">
                    <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5; margin: 0 0 1rem 0;">
                        Scheduling deletion will start an inactive grace period. During this period, your profile remains dormant until permanent purge. You can cancel at any time simply by logging in.
                    </p>
                    <div style="margin-bottom: 1.25rem; padding: 0.875rem 1rem; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 10px;">
                        <label for="del-confirm-input" style="display: block; font-size: 0.8125rem; color: #ef4444; margin: 0 0 0.5rem 0; font-weight: 600;">
                            To begin, please type <span style="letter-spacing: 1px; background: rgba(239, 68, 68, 0.15); padding: 2px 6px; border-radius: 4px;">DELETE</span> below:
                        </label>
                        <input type="text" id="del-confirm-input" class="app-dialog-input" placeholder="Type DELETE to continue" autocomplete="off">
                    </div>
                    <div class="app-dialog-actions">
                        <button type="button" class="app-dialog-btn app-dialog-btn-cancel" id="del-btn-cancel-1">Cancel</button>
                        <button type="button" class="app-dialog-btn app-dialog-btn-danger" id="del-btn-next-1" disabled style="opacity: 0.5; cursor: not-allowed;">Next Step &rarr;</button>
                    </div>
                </div>

                <!-- STEP 2: Select 15 or 30 Days -->
                <div id="del-step-2" class="del-step-content" style="display: none;">
                    <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5; margin: 0 0 1rem 0;">
                        Select the number of inactive days before permanent account purge. If you change your mind, logging in at any point before this time expires stops and removes the timer.
                    </p>
                    <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 1.5rem;">
                        <label class="grace-period-card selected" id="grace-card-15" style="display: flex; align-items: flex-start; gap: 12px; padding: 14px; border-radius: 10px; border: 1.5px solid #ef4444; background: rgba(239, 68, 68, 0.08); cursor: pointer;">
                            <input type="radio" name="del-grace-period" value="15" checked style="margin-top: 3px; accent-color: #ef4444;">
                            <div style="flex: 1;">
                                <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary);">15 Days Inactive (Standard)</div>
                                <div style="font-size: 0.8125rem; color: var(--text-secondary); margin-top: 2px;">
                                    Account enters 15 days of dormancy before permanent deletion.
                                </div>
                            </div>
                        </label>
                        <label class="grace-period-card" id="grace-card-30" style="display: flex; align-items: flex-start; gap: 12px; padding: 14px; border-radius: 10px; border: 1.5px solid var(--border); background: var(--bg-surface); cursor: pointer;">
                            <input type="radio" name="del-grace-period" value="30" style="margin-top: 3px; accent-color: #ef4444;">
                            <div style="flex: 1;">
                                <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary);">30 Days Inactive (Extended)</div>
                                <div style="font-size: 0.8125rem; color: var(--text-secondary); margin-top: 2px;">
                                    Extended 30 days window before permanent database destruction.
                                </div>
                            </div>
                        </label>
                    </div>
                    <div class="app-dialog-actions">
                        <button type="button" class="app-dialog-btn app-dialog-btn-cancel" id="del-btn-back-2">&larr; Back</button>
                        <button type="button" class="app-dialog-btn app-dialog-btn-danger" id="del-btn-next-2">Next Step &rarr;</button>
                    </div>
                </div>

                <!-- STEP 3: Reason Selection (Menu + Other Text Box) -->
                <div id="del-step-3" class="del-step-content" style="display: none;">
                    <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5; margin: 0 0 1rem 0;">
                        Please tell us why you are leaving RE-CAPS. Your feedback helps our institutional library improve:
                    </p>
                    <div style="margin-bottom: 1rem;">
                        <label for="del-reason-select" style="display: block; font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">Primary Reason</label>
                        <select id="del-reason-select" class="app-dialog-input" style="cursor: pointer; width: 100%;">
                            <option value="">Select a reason...</option>
                            <option value="Completed degree / Graduated">Completed degree / Graduated</option>
                            <option value="Transferring to another university or program">Transferring to another university or program</option>
                            <option value="Privacy, intellectual property, or data concerns">Privacy, intellectual property, or data concerns</option>
                            <option value="Temporary break / No longer conducting research">Temporary break / No longer conducting research</option>
                            <option value="Switching to a different RE-CAPS account">Switching to a different RE-CAPS account</option>
                            <option value="other">Other reason (specify below)</option>
                        </select>
                    </div>
                    <div id="del-other-wrap" style="display: none; margin-bottom: 1.25rem;">
                        <label for="del-other-text" style="display: block; font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">Please specify details:</label>
                        <textarea id="del-other-text" class="app-dialog-input" rows="3" placeholder="Provide additional details regarding your deletion request..." style="resize: vertical;"></textarea>
                    </div>
                    <div class="app-dialog-actions">
                        <button type="button" class="app-dialog-btn app-dialog-btn-cancel" id="del-btn-back-3">&larr; Back</button>
                        <button type="button" class="app-dialog-btn app-dialog-btn-danger" id="del-btn-next-3" disabled style="opacity: 0.5; cursor: not-allowed;">Next Step &rarr;</button>
                    </div>
                </div>

                <!-- STEP 4: Password Verification & Countdown Start -->
                <div id="del-step-4" class="del-step-content" style="display: none;">
                    <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5; margin: 0 0 1rem 0;">
                        Enter your account password to confirm deletion. Once verified, the <strong id="del-summary-days" style="color: #ef4444;">15</strong>-day countdown will begin and you will be signed out immediately.
                    </p>
                    <div style="margin-bottom: 1.25rem;">
                        <label for="del-password-input" style="display: block; font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">Current Password</label>
                        <input type="password" id="del-password-input" class="app-dialog-input" placeholder="Enter your current password" autocomplete="current-password">
                        <div id="del-step4-error" style="display: none; color: #ef4444; font-size: 0.8125rem; margin-top: 6px; font-weight: 600;"></div>
                    </div>
                    <div style="padding: 0.75rem 0.875rem; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px; margin-bottom: 1.25rem; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
                        <strong style="color: #ef4444;">Notice:</strong> You will be automatically logged out. Logging back in before the timer expires is the <em>only condition</em> that cancels the deletion timer.
                    </div>
                    <div class="app-dialog-actions">
                        <button type="button" class="app-dialog-btn app-dialog-btn-cancel" id="del-btn-back-4">&larr; Back</button>
                        <button type="button" class="app-dialog-btn app-dialog-btn-danger" id="del-btn-submit-4" disabled style="opacity: 0.5; cursor: not-allowed;">
                            Start Deletion Timer
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const overlay = document.getElementById('del-wizard-overlay');
        const closeBtn = document.getElementById('del-wizard-close');
        const closeModal = () => modal.remove();

        overlay.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        document.getElementById('del-btn-cancel-1').addEventListener('click', closeModal);

        // Navigation elements
        const indicator = document.getElementById('del-step-indicator');
        const step1 = document.getElementById('del-step-1');
        const step2 = document.getElementById('del-step-2');
        const step3 = document.getElementById('del-step-3');
        const step4 = document.getElementById('del-step-4');

        function goToStep(step) {
            currentStep = step;
            [step1, step2, step3, step4].forEach((el, idx) => {
                el.style.display = (idx + 1 === step) ? 'block' : 'none';
            });
            for (let i = 1; i <= 4; i++) {
                const prog = document.getElementById(`del-progress-${i}`);
                if (prog) {
                    prog.style.background = (i <= step) ? '#ef4444' : 'rgba(255,255,255,0.1)';
                }
            }
            if (step === 1) {
                indicator.textContent = 'Step 1 of 4: Security Confirmation';
                setTimeout(() => document.getElementById('del-confirm-input')?.focus(), 50);
            } else if (step === 2) {
                indicator.textContent = 'Step 2 of 4: Select Inactivity Grace Period';
            } else if (step === 3) {
                indicator.textContent = 'Step 3 of 4: Reason for Deletion';
                setTimeout(() => document.getElementById('del-reason-select')?.focus(), 50);
            } else if (step === 4) {
                indicator.textContent = 'Step 4 of 4: Password Verification';
                const summaryDays = document.getElementById('del-summary-days');
                if (summaryDays) summaryDays.textContent = selectedGraceDays;
                setTimeout(() => document.getElementById('del-password-input')?.focus(), 50);
            }
        }

        // --- Step 1 Handlers ---
        const confirmInput = document.getElementById('del-confirm-input');
        const nextBtn1 = document.getElementById('del-btn-next-1');
        confirmInput.addEventListener('input', () => {
            const isMatch = confirmInput.value.trim() === 'DELETE';
            nextBtn1.disabled = !isMatch;
            nextBtn1.style.opacity = isMatch ? '1' : '0.5';
            nextBtn1.style.cursor = isMatch ? 'pointer' : 'not-allowed';
        });
        nextBtn1.addEventListener('click', () => {
            if (confirmInput.value.trim() === 'DELETE') goToStep(2);
        });

        // --- Step 2 Handlers (Grace Period) ---
        const card15 = document.getElementById('grace-card-15');
        const card30 = document.getElementById('grace-card-30');
        const graceRadios = modal.querySelectorAll('input[name="del-grace-period"]');
        graceRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                selectedGraceDays = parseInt(e.target.value, 10) || 15;
                if (selectedGraceDays === 15) {
                    card15.classList.add('selected');
                    card15.style.borderColor = '#ef4444';
                    card15.style.background = 'rgba(239, 68, 68, 0.08)';
                    card30.classList.remove('selected');
                    card30.style.borderColor = 'var(--border)';
                    card30.style.background = 'var(--bg-surface)';
                } else {
                    card30.classList.add('selected');
                    card30.style.borderColor = '#ef4444';
                    card30.style.background = 'rgba(239, 68, 68, 0.08)';
                    card15.classList.remove('selected');
                    card15.style.borderColor = 'var(--border)';
                    card15.style.background = 'var(--bg-surface)';
                }
            });
        });
        document.getElementById('del-btn-back-2').addEventListener('click', () => goToStep(1));
        document.getElementById('del-btn-next-2').addEventListener('click', () => goToStep(3));

        // --- Step 3 Handlers (Reason) ---
        const reasonSelect = document.getElementById('del-reason-select');
        const otherWrap = document.getElementById('del-other-wrap');
        const otherText = document.getElementById('del-other-text');
        const nextBtn3 = document.getElementById('del-btn-next-3');

        function validateStep3() {
            const val = reasonSelect.value;
            let isValid = false;
            if (val && val !== 'other') {
                isValid = true;
                selectedReason = val;
            } else if (val === 'other') {
                const textVal = otherText.value.trim();
                isValid = textVal.length > 0;
                selectedReason = textVal ? `Other: ${textVal}` : '';
            }
            nextBtn3.disabled = !isValid;
            nextBtn3.style.opacity = isValid ? '1' : '0.5';
            nextBtn3.style.cursor = isValid ? 'pointer' : 'not-allowed';
        }

        reasonSelect.addEventListener('change', () => {
            if (reasonSelect.value === 'other') {
                otherWrap.style.display = 'block';
                setTimeout(() => otherText.focus(), 50);
            } else {
                otherWrap.style.display = 'none';
            }
            validateStep3();
        });
        otherText.addEventListener('input', validateStep3);

        document.getElementById('del-btn-back-3').addEventListener('click', () => goToStep(2));
        nextBtn3.addEventListener('click', () => {
            if (!nextBtn3.disabled) goToStep(4);
        });

        // --- Step 4 Handlers (Password & Countdown) ---
        const passInput = document.getElementById('del-password-input');
        const submitBtn4 = document.getElementById('del-btn-submit-4');
        const errorDiv = document.getElementById('del-step4-error');

        passInput.addEventListener('input', () => {
            const hasPass = passInput.value.length > 0;
            submitBtn4.disabled = !hasPass;
            submitBtn4.style.opacity = hasPass ? '1' : '0.5';
            submitBtn4.style.cursor = hasPass ? 'pointer' : 'not-allowed';
            errorDiv.style.display = 'none';
        });

        document.getElementById('del-btn-back-4').addEventListener('click', () => goToStep(3));

        submitBtn4.addEventListener('click', async () => {
            const password = passInput.value;
            if (!password) return;

            submitBtn4.disabled = true;
            submitBtn4.textContent = 'Verifying Password...';
            errorDiv.style.display = 'none';

            try {
                // Re-authenticate user
                const cred = firebase.auth.EmailAuthProvider.credential(user.email, password);
                await user.reauthenticateWithCredential(cred);

                submitBtn4.textContent = 'Scheduling Deletion...';

                // Calculate countdown timestamp
                const scheduledTimestamp = Date.now() + (selectedGraceDays * 24 * 60 * 60 * 1000);

                // Update Firestore user document
                if (typeof db !== 'undefined') {
                    await db.collection('users').doc(user.uid).update({
                        deletionScheduled: true,
                        scheduledDeletionTimestamp: scheduledTimestamp,
                        deletionGraceDays: selectedGraceDays,
                        deletionReason: selectedReason || 'User requested account termination',
                        accountStatus: 'pending_deletion',
                        deletionRequestedAt: new Date().toISOString()
                    });
                }

                // Set local indicator
                localStorage.setItem(`recaps_account_pending_deletion_${user.uid}`, JSON.stringify({
                    scheduledDeletionTimestamp: scheduledTimestamp,
                    deletionGraceDays: selectedGraceDays,
                    reason: selectedReason
                }));

                // Immediately logout without any condition or prompts
                modal.remove();
                await firebase.auth().signOut();
                sessionStorage.clear();
                localStorage.removeItem('active_conversation_id');
                window.location.href = '../index.html';

            } catch (authErr) {
                console.error('[Settings] Account deletion re-auth error:', authErr);
                submitBtn4.disabled = false;
                submitBtn4.textContent = 'Start Deletion Timer';
                errorDiv.textContent = authErr.code === 'auth/wrong-password' 
                    ? 'Incorrect password. Please verify and try again.'
                    : (authErr.message || 'Verification failed. Please try again.');
                errorDiv.style.display = 'block';
                passInput.focus();
            }
        });

        setTimeout(() => confirmInput.focus(), 100);
    }
});
