/**
 * User Dashboard Logic
 * Handles rendering of saved projects on the student dashboard (student_page.html).
 */

document.addEventListener('DOMContentLoaded', async () => {
    const savedProjectsList = document.getElementById('saved-projects-list');
    const clearSavedBtn = document.getElementById('clear-saved-btn');
    const viewToggleBtns = document.querySelectorAll('.view-toggle-btn');

    // Only run if the saved projects section is present (i.e., on student_page.html)
    if (!savedProjectsList) return;

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
            const docRef = db.collection('usersSavedProjects').doc(userId);
            await docRef.set({
                UIDproject: firebase.firestore.FieldValue.arrayRemove(projectId)
            }, { merge: true });
            
            // Update local state
            savedProjectIds = savedProjectIds.filter(id => id !== projectId);
            
            syncSavedProjectsWithLocalStorage();
            renderSavedProjects();
            window.dispatchEvent(new CustomEvent('projectSavedStateChanged'));
        } catch (error) {
            console.error('Error removing project from Firestore:', error);
        }
    }

    // Function to clear all saved projects
    async function clearAllSavedProjects(userId) {
        try {
            const docRef = db.collection('usersSavedProjects').doc(userId);
            await docRef.set({
                UIDproject: []
            }, { merge: true });
            
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
        if (savedCountBadge) savedCountBadge.textContent = count;
        if (savedProjectsStats) savedProjectsStats.textContent = count;
    }

    // Render Saved Projects as cards on the dashboard
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

        if (savedProjects.length === 0) {
            savedProjectsList.innerHTML = `
                <div class="saved-empty-state">
                    <span class="saved-empty-icon">🔖</span>
                    <p>No saved projects yet.</p>
                    <a href="index.html" class="saved-empty-link">Explore Projects →</a>
                </div>
            `;
            return;
        }

        savedProjects.forEach(project => {
            const card = document.createElement('div');
            card.className = 'saved-project-card';

            const authors = Array.isArray(project.rawData?.authors)
                ? project.rawData.authors.join(', ')
                : (project.rawData?.authors || 'Unknown Authors');

            const year = project.rawData?.year || '';
            const program = project.rawData?.program || '';

            card.innerHTML = `
                <div class="saved-card-body">
                    <p class="saved-card-meta">${[program, year].filter(Boolean).join(' · ')}</p>
                    <h3 class="saved-card-title">${escapeHtml(project.title)}</h3>
                    <p class="saved-card-authors">${escapeHtml(authors)}</p>
                </div>
                <div class="saved-card-actions">
                    <button class="saved-card-view-btn" data-id="${project.id}">View Details →</button>
                    <button class="saved-card-remove-btn" title="Remove" data-id="${project.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            `;

            // View button
            card.querySelector('.saved-card-view-btn').addEventListener('click', () => {
                // Add ripple effect
                const btn = card.querySelector('.saved-card-view-btn');
                btn.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    btn.style.transform = '';
                }, 100);
                
                sessionStorage.setItem('selectedProjectForViewDetails', JSON.stringify(project.rawData));
                // Set flag to show details view
                sessionStorage.setItem('showProjectDetails', 'true');
                // Navigate to index.html which will handle the view
                setTimeout(() => {
                    const isInPagesFolder = window.location.pathname.includes('/pages/');
                    window.location.href = isInPagesFolder ? '../index.html' : 'index.html';
                }, 200);
            });

            // Remove button
            card.querySelector('.saved-card-remove-btn').addEventListener('click', async () => {
                if (currentUserId) {
                    await removeProjectFromFirestore(currentUserId, project.id);
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

    // Load initial data
    await loadAllProjects();

    // Clear All button
    if (clearSavedBtn) {
        clearSavedBtn.addEventListener('click', async () => {
            if (currentUserId) {
                await clearAllSavedProjects(currentUserId);
            }
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
                currentUserId = user.uid;
                await loadSavedProjectsFromFirestore(user.uid);
            } else {
                currentUserId = null;
                savedProjectIds = [];
                localStorage.removeItem('savedProjects');
                renderSavedProjects();
            }
        });
    }
});
