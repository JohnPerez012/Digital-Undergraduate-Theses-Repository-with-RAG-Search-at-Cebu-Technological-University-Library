/**
 * User Dashboard Logic
 * Handles rendering of saved projects on the student dashboard (student_page.html).
 */

document.addEventListener('DOMContentLoaded', async () => {
    const savedProjectsList = document.getElementById('saved-projects-list');
    const clearSavedBtn = document.getElementById('clear-all-saved-btn') || document.getElementById('clear-saved-btn');
    const viewToggleBtns = document.querySelectorAll('.view-toggle-btn');

    // Only run if the saved projects section is present (i.e., on student_page.html)
    if (!savedProjectsList) return;

    // RBAC check: Administrators cannot access or operate saved projects
    if (sessionStorage.getItem('userType') === 'admin') return;

    // Saved projects state
    let savedProjectIds = [];
    let allProjects = [];
    let currentUserId = null;

    // Get saved view preference or default to grid
    let currentView = localStorage.getItem('dashboardView') || 'grid';
    savedProjectsList.setAttribute('data-current-view', currentView);
    
    // Set active button based on saved view
    viewToggleBtns.forEach(btn => {
        if (btn.dataset.view === currentView) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // View toggle functionality
    viewToggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            currentView = view;
            
            // Update active button
            viewToggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update list view
            savedProjectsList.setAttribute('data-current-view', view);
            
            // Save preference
            localStorage.setItem('dashboardView', view);
            
            // Add transition animation
            savedProjectsList.style.opacity = '0.5';
            setTimeout(() => {
                savedProjectsList.style.opacity = '1';
            }, 150);
        });
    });

    // Function to load all projects (for full data)
    async function loadAllProjects() {
        try {
            // First check cache
            let cachedProjects = [];
            try {
                cachedProjects = JSON.parse(localStorage.getItem('projectsData')) || [];
            } catch (e) {}

            if (cachedProjects.length > 0) {
                allProjects = cachedProjects;
            } else {
                // Load from Firestore if cache not available
                if (typeof db !== 'undefined') {
                    const querySnapshot = await db.collection('projects').get();
                    allProjects = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                }
            }

            // Expose globally for student dashboard widgets
            window.__allProjectsData = allProjects;
            window.dispatchEvent(new CustomEvent('allProjectsLoaded', { detail: { count: allProjects.length, projects: allProjects } }));

            // Update truthful available projects count
            const availableCountEl = document.getElementById('available-projects-count');
            if (availableCountEl) {
                availableCountEl.textContent = allProjects.length;
            }
        } catch (error) {
            console.error('Error loading all projects:', error);
        }
    }

    // Function to load saved projects from Firestore
    async function loadSavedProjectsFromFirestore(userId) {
        try {
            const docRef = db.collection('usersSavedProjects').doc(userId);
            const doc = await docRef.get();
            
            if (doc.exists) {
                savedProjectIds = doc.data().UIDproject || [];
            } else {
                savedProjectIds = [];
            }
            
            // Sync with localStorage
            syncSavedProjectsWithLocalStorage();
            
            // Render
            renderSavedProjects();
        } catch (error) {
            console.error('Error loading saved projects from Firestore:', error);
        }
    }

    // Function to sync savedProjectIds with localStorage
    function syncSavedProjectsWithLocalStorage() {
        let savedProjectsFull = [];
        
        savedProjectIds.forEach(id => {
            const project = allProjects.find(p => p.id === id);
            if (project) {
                savedProjectsFull.push({
                    id: project.id,
                    title: project.title,
                    year: project.year,
                    program: project.program,
                    rawData: project
                });
            }
        });
        
        localStorage.setItem('savedProjects', JSON.stringify(savedProjectsFull));
    }

    // Function to remove project from Firestore
    async function removeProjectFromFirestore(userId, projectId) {
        try {
            const userDocRef = db.collection('usersSavedProjects').doc(userId);
            const projectDocRef = db.collection('projects').doc(projectId);

            await Promise.all([
                userDocRef.set({
                    UIDproject: firebase.firestore.FieldValue.arrayRemove(projectId)
                }, { merge: true }),
                projectDocRef.set({
                    saveCount: firebase.firestore.FieldValue.increment(-1)
                }, { merge: true }).catch(err => console.warn('[UserDashboard] Decrement saveCount warning:', err))
            ]);
            
            // Update local state
            savedProjectIds = savedProjectIds.filter(id => id !== projectId);
            
            syncSavedProjectsWithLocalStorage();

            if (window.ActivityService && typeof window.ActivityService.logBookmark === 'function') {
                const project = allProjects.find(p => p.id === projectId);
                window.ActivityService.logBookmark(projectId, project ? project.title : 'Capstone Project', 'removed');
            }

            renderSavedProjects();
            window.dispatchEvent(new CustomEvent('projectSavedStateChanged', {
                detail: { projectId, isSaved: false }
            }));
        } catch (error) {
            console.error('Error removing project from Firestore:', error);
        }
    }

    // Function to clear all saved projects
    async function clearAllSavedProjects(userId) {
        try {
            const idsToDecrement = [...savedProjectIds];
            const docRef = db.collection('usersSavedProjects').doc(userId);
            await docRef.set({
                UIDproject: []
            }, { merge: true });

            idsToDecrement.forEach(pId => {
                try {
                    db.collection('projects').doc(pId).set({
                        saveCount: firebase.firestore.FieldValue.increment(-1)
                    }, { merge: true });
                } catch (e) {}
            });
            
            savedProjectIds = [];
            syncSavedProjectsWithLocalStorage();
            renderSavedProjects();
            window.dispatchEvent(new CustomEvent('projectSavedStateChanged'));
        } catch (error) {
            console.error('Error clearing saved projects:', error);
        }
    }

    // Update saved projects count badges
    function updateSavedCount(count) {
        const savedCountBadge = document.getElementById('saved-count');
        const savedProjectsStats = document.getElementById('saved-projects-count');
        const launchpadSaved = document.getElementById('launchpad-saved-count');
        const pillCount = document.getElementById('dashboard-saved-count-pill');
        const syncEmail = document.getElementById('dashboard-sync-email');

        if (savedCountBadge) savedCountBadge.textContent = count;
        if (savedProjectsStats) savedProjectsStats.textContent = count;
        if (launchpadSaved) launchpadSaved.textContent = count;
        if (pillCount) pillCount.textContent = `${count} saved`;

        if (syncEmail) {
            const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
            if (user && user.email) {
                syncEmail.textContent = `Your saved capstones are connected to your account (${user.email}).`;
            } else {
                syncEmail.textContent = 'Your saved capstones are connected to your CTU account.';
            }
        }
    }

    // Render Saved Projects as cards on the dashboard (Elevated with Screen 1 UI/UX)
    function renderSavedProjects() {
        let savedProjects = [];
        try {
            savedProjects = JSON.parse(localStorage.getItem('savedProjects')) || [];
        } catch (e) {
            console.error('Error reading saved projects:', e);
        }

        savedProjectsList.innerHTML = '';

        // Update the count badges
        updateSavedCount(savedProjects.length);

        if (clearSavedBtn) {
            clearSavedBtn.disabled = savedProjects.length === 0;
            clearSavedBtn.style.opacity = savedProjects.length === 0 ? '0.5' : '1';
            clearSavedBtn.style.cursor = savedProjects.length === 0 ? 'not-allowed' : 'pointer';
        }

        if (savedProjects.length === 0) {
            const isInPagesFolder = window.location.pathname.includes('/pages/');
            const homeLink = isInPagesFolder ? '../index.html' : 'index.html';
            savedProjectsList.innerHTML = `
                <div class="saved-empty-state">
                    <div class="saved-empty-icon-wrap">
                        <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                            <line x1="8" y1="10" x2="16" y2="10"></line>
                            <line x1="8" y1="14" x2="13" y2="14"></line>
                        </svg>
                    </div>
                    <h3 class="saved-empty-title">No saved projects yet</h3>
                    <p class="saved-empty-desc">
                        Browse our undergraduate research catalog and bookmark capstone projects for your study, reference, and citations.
                    </p>
                    <a href="${homeLink}" class="saved-empty-btn">Explore Projects Catalog &rarr;</a>
                </div>
            `;
            return;
        }

        savedProjects.forEach(project => {
            const card = document.createElement('div');
            card.className = 'saved-project-card';

            const raw = project.rawData || project;
            let authors = 'CTU Researchers';
            if (Array.isArray(raw.authors)) authors = raw.authors.join(' · ');
            else if (typeof raw.authors === 'string' && raw.authors.trim()) authors = raw.authors;

            const year = raw.year || '2024';
            const program = raw.program || 'Capstone';
            const abstract = raw.abstract || 'No abstract preview available for this capstone project.';

            card.innerHTML = `
                <div class="saved-card-header">
                    <span class="saved-badge-program">${escapeHtml(program)}</span>
                    <span class="saved-badge-year">${escapeHtml(year)}</span>
                </div>
                <div class="saved-card-body">
                    <h3 class="saved-card-title">${escapeHtml(project.title)}</h3>
                    <div class="saved-card-authors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        <span>${escapeHtml(authors)}</span>
                    </div>
                    <p class="saved-card-abstract">${escapeHtml(abstract)}</p>
                </div>
                <div class="saved-card-actions">
                    <button class="saved-card-view-btn" data-id="${project.id}">View Details &rarr;</button>
                    <button class="saved-card-remove-btn" title="Remove from saved" data-id="${project.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <span>Remove</span>
                    </button>
                </div>
            `;

            // View button
            card.querySelector('.saved-card-view-btn').addEventListener('click', () => {
                const btn = card.querySelector('.saved-card-view-btn');
                btn.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    btn.style.transform = '';
                }, 100);

                sessionStorage.setItem('selectedProjectForViewDetails', JSON.stringify(raw));
                sessionStorage.setItem('showProjectDetails', 'true');
                setTimeout(() => {
                    const isInPagesFolder = window.location.pathname.includes('/pages/');
                    window.location.href = isInPagesFolder ? '../index.html' : 'index.html';
                }, 200);
            });

            // Remove button
            card.querySelector('.saved-card-remove-btn').addEventListener('click', async () => {
                if (currentUserId) {
                    showDeleteConfirmationModal(project.title, async () => {
                        await removeProjectFromFirestore(currentUserId, project.id);
                    });
                }
            });

            savedProjectsList.appendChild(card);
        });
    }

    function escapeHtml(text) {
        return String(text || '').replace(/[&<>"']/g, match => {
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
            return map[match] || match;
        });
    }

    // Show delete confirmation modal
    function showDeleteConfirmationModal(projectTitle, onConfirm) {
        // Check if modal already exists, remove it
        const existingModal = document.getElementById('delete-saved-project-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Create modal HTML
        const modalHTML = `
            <div class="logout-modal active" id="delete-saved-project-modal">
                <div class="logout-modal-overlay"></div>
                <div class="logout-modal-content">
                    <div class="logout-modal-header">
                        <div class="logout-modal-icon">
                            ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('trash-lg') : ''}
                        </div>
                        <h3 class="logout-modal-title">Delete Saved Project?</h3>
                        <p class="logout-modal-description">
                            Are you sure you want to remove <strong style="color: #e93232 ">"${escapeHtml(projectTitle)}"</strong> from your saved projects?
                        </p>
                    </div>
                    <div class="logout-modal-actions">
                        <button class="logout-modal-btn logout-modal-btn-abort" id="delete-cancel-btn">
                            Cancel
                        </button>
                        <button class="logout-modal-btn logout-modal-btn-confirm" id="delete-confirm-btn">
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Append to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const modal = document.getElementById('delete-saved-project-modal');
        const overlay = modal.querySelector('.logout-modal-overlay');
        const cancelBtn = document.getElementById('delete-cancel-btn');
        const confirmBtn = document.getElementById('delete-confirm-btn');

        // Close modal function
        function closeModal() {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.remove();
            }, 300);
        }

        // Cancel button
        cancelBtn.addEventListener('click', closeModal);

        // Overlay click to close
        overlay.addEventListener('click', closeModal);

        // Confirm button
        confirmBtn.addEventListener('click', async () => {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Deleting...';
            
            try {
                await onConfirm();
                closeModal();
            } catch (error) {
                console.error('Error deleting project:', error);
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Delete';
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', function escapeHandler(e) {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escapeHandler);
            }
        });
    }

    // Show clear all confirmation modal with brief statement and list of project titles
    function showClearAllConfirmationModal(projects, onConfirm) {
        // Check if modal already exists, remove it
        const existingModal = document.getElementById('clear-all-saved-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const count = projects.length;
        const countText = count === 1 ? '1 project' : `${count} projects`;

        // Create modal HTML
        const modalHTML = `
            <div class="logout-modal active" id="clear-all-saved-modal" role="dialog" aria-modal="true" aria-labelledby="clear-all-title">
                <div class="logout-modal-overlay"></div>
                <div class="logout-modal-content clear-all-modal-content">
                    <div class="logout-modal-header" style="margin-bottom: 1.25rem;">
                        <div class="logout-modal-icon">
                            ${(typeof SVGRegistry !== 'undefined' && SVGRegistry.get('trash-lg')) ? SVGRegistry.get('trash-lg') : `
                                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    <line x1="10" y1="11" x2="10" y2="17"></line>
                                    <line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                            `}
                        </div>
                        <h3 class="logout-modal-title" id="clear-all-title">Clear All Saved Projects?</h3>
                        <p class="logout-modal-description">
                            Are you sure you want to remove all <strong style="color: #ef4444;">${countText}</strong> from your saved list? This action cannot be undone and will delete the following:
                        </p>
                    </div>

                    <div class="clear-all-projects-list-container">
                        <div class="clear-all-projects-list-header">
                            <span>Projects to be removed</span>
                            <span class="clear-all-count-tag">${count} Total</span>
                        </div>
                        <ul class="clear-all-projects-list">
                            ${projects.map((p, idx) => `
                                <li class="clear-all-project-item">
                                    <span class="clear-all-project-number">${idx + 1}</span>
                                    <div class="clear-all-project-info">
                                        <span class="clear-all-project-title" title="${escapeHtml(p.title || 'Untitled Project')}">${escapeHtml(p.title || 'Untitled Project')}</span>
                                        ${(p.program || p.year) ? `<span class="clear-all-project-meta">${[p.program, p.year].filter(Boolean).map(escapeHtml).join(' · ')}</span>` : ''}
                                    </div>
                                </li>
                            `).join('')}
                        </ul>
                    </div>

                    <div class="logout-modal-actions">
                        <button class="logout-modal-btn logout-modal-btn-abort" id="clear-all-cancel-btn">
                            Cancel
                        </button>
                        <button class="logout-modal-btn logout-modal-btn-confirm" id="clear-all-confirm-btn">
                            Clear All
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Append to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const modal = document.getElementById('clear-all-saved-modal');
        const overlay = modal.querySelector('.logout-modal-overlay');
        const cancelBtn = document.getElementById('clear-all-cancel-btn');
        const confirmBtn = document.getElementById('clear-all-confirm-btn');

        function closeModal() {
            document.removeEventListener('keydown', escapeHandler);
            modal.classList.remove('active');
            setTimeout(() => {
                modal.remove();
            }, 300);
        }

        function escapeHandler(e) {
            if (e.key === 'Escape') {
                closeModal();
            }
        }

        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', closeModal);
        document.addEventListener('keydown', escapeHandler);

        confirmBtn.addEventListener('click', async () => {
            confirmBtn.disabled = true;
            cancelBtn.disabled = true;
            confirmBtn.innerHTML = `
                <span class="btn-spinner">
                    <svg class="spinner-icon" viewBox="0 0 50 50">
                        <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"></circle>
                    </svg>
                </span> Clearing...
            `;

            try {
                await onConfirm();
                closeModal();
            } catch (error) {
                console.error('Error clearing projects:', error);
                confirmBtn.disabled = false;
                cancelBtn.disabled = false;
                confirmBtn.textContent = 'Clear All';
            }
        });
    }

    // Load initial data
    await loadAllProjects();

    // Clear All button
    if (clearSavedBtn) {
        clearSavedBtn.addEventListener('click', () => {
            if (!currentUserId) return;

            let savedProjects = [];
            try {
                savedProjects = JSON.parse(localStorage.getItem('savedProjects')) || [];
            } catch (e) {}

            // Fallback to resolve from savedProjectIds and allProjects
            if (savedProjects.length === 0 && savedProjectIds.length > 0) {
                savedProjects = savedProjectIds.map(id => {
                    const found = allProjects.find(p => p.id === id);
                    return {
                        id,
                        title: found ? found.title : 'Untitled Project',
                        year: found ? found.year : '',
                        program: found ? found.program : ''
                    };
                });
            }

            if (savedProjects.length === 0) {
                if (typeof showToast === 'function') {
                    showToast('You have no saved projects to clear.', 'info');
                }
                return;
            }

            showClearAllConfirmationModal(savedProjects, async () => {
                await clearAllSavedProjects(currentUserId);
                if (typeof showToast === 'function') {
                    showToast('All saved projects have been cleared.', 'success');
                }
            });
        });
    }

    // Listen to changes from other parts of the app
    window.addEventListener('projectSavedStateChanged', () => {
        if (currentUserId) {
            loadSavedProjectsFromFirestore(currentUserId);
        }
    });

    // Auth state listener
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                // If user is admin, do not load or sync saved projects
                if (sessionStorage.getItem('userType') === 'admin') return;

                currentUserId = user.uid;
                
                // If local device still has guest saved projects, prompt to sync or delete
                if (typeof window.GuestSavedProjects !== 'undefined' && window.GuestSavedProjects.hasSaved()) {
                    promptSyncModalOnDashboard(user);
                } else {
                    await loadSavedProjectsFromFirestore(user.uid);
                }
            } else {
                currentUserId = null;
                savedProjectIds = [];
                localStorage.removeItem('savedProjects');
                renderSavedProjects();
            }
        });
    }

    // Fallback sync modal on role dashboard (ONLY DELETE OR CONTINUE)
    function promptSyncModalOnDashboard(user) {
        const guestProjects = (typeof window.GuestSavedProjects !== 'undefined') ? window.GuestSavedProjects.getAll() : [];
        const count = guestProjects.length;

        const overlay = document.createElement('div');
        overlay.className = 'welcome-modal-overlay';
        overlay.id = 'dashboard-sync-overlay';

        overlay.innerHTML = `
            <div class="sync-modal-content">
                <div class="sync-icon-wrapper">
                    <svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <h2 class="sync-modal-title">Sync Local Saved Data?</h2>
                <p class="sync-modal-text">Your device has local saved data. Do you want to sync to your account or not?</p>
                <div class="sync-data-pill">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <span>${count} project${count === 1 ? '' : 's'} saved on this device</span>
                </div>
                <div class="sync-modal-actions">
                    <button class="btn-sync-delete" id="dash-sync-btn-delete">DELETE</button>
                    <button class="btn-sync-continue" id="dash-sync-btn-continue">CONTINUE</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        setTimeout(() => {
            overlay.classList.add('active');
        }, 10);

        // DELETE
        document.getElementById('dash-sync-btn-delete').addEventListener('click', () => {
            if (typeof window.GuestSavedProjects !== 'undefined') {
                window.GuestSavedProjects.clear();
            }
            if (typeof showToast === 'function') {
                showToast('Locally saved projects deleted', 'info');
            }
            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.remove();
                loadSavedProjectsFromFirestore(user.uid);
            }, 350);
        });

        // CONTINUE
        document.getElementById('dash-sync-btn-continue').addEventListener('click', async () => {
            const btn = document.getElementById('dash-sync-btn-continue');
            btn.disabled = true;
            btn.textContent = 'SYNCING...';

            try {
                if (typeof window.GuestSavedProjects !== 'undefined') {
                    await window.GuestSavedProjects.syncToFirestore(user.uid, db);
                }
                if (typeof showToast === 'function') {
                    showToast('Projects synced to your account successfully', 'success');
                }
            } catch (err) {
                console.error('Error syncing projects on dashboard:', err);
                if (typeof window.GuestSavedProjects !== 'undefined') {
                    window.GuestSavedProjects.clear();
                }
            }

            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.remove();
                loadSavedProjectsFromFirestore(user.uid);
            }, 350);
        });
    }
});
