/**
 * Admin Panel Main Logic
 * Handles role-based authentication and all admin dashboard functionality
 */

document.addEventListener('DOMContentLoaded', async () => {
    // ===== Authentication & Role Check =====
    const checkAdminAuth = async () => {
        return new Promise((resolve) => {
            auth.onAuthStateChanged(async (user) => {
                if (!user) {
                    console.warn('No user logged in. Redirecting to home...');
                    window.location.href = 'index.html';
                    resolve(false);
                    return;
                }

                try {
                    // Check user role from Firestore
                    const userDoc = await db.collection('users').doc(user.uid).get();
                    if (!userDoc.exists) {
                        console.error('User document does not exist');
                        showToast('Access denied: User data not found', '❌');
                        setTimeout(() => window.location.href = 'index.html', 2000);
                        resolve(false);
                        return;
                    }

                    const userData = userDoc.data();
                    const userType = userData.userType || sessionStorage.getItem('userType');

                    // Check if user is admin
                    if (userType !== 'admin') {
                        console.warn('User is not an admin. Redirecting...');
                        showToast('Access denied: Admin privileges required', '❌');
                        setTimeout(() => {
                            if (userType === 'student') {
                                window.location.href = 'student_page.html';
                            } else {
                                window.location.href = 'index.html';
                            }
                        }, 2000);
                        resolve(false);
                        return;
                    }

                    // Admin authenticated successfully
                    sessionStorage.setItem('userId', user.uid);
                    sessionStorage.setItem('userEmail', user.email);
                    sessionStorage.setItem('userName', user.displayName || 'Administrator');
                    sessionStorage.setItem('userType', 'admin');

                    // Update admin profile display
                    updateAdminProfile(user, userData);
                    resolve(true);

                } catch (error) {
                    console.error('Error checking admin role:', error);
                    showToast('Authentication error occurred', '❌');
                    setTimeout(() => window.location.href = 'index.html', 2000);
                    resolve(false);
                }
            });
        });
    };

    // Wait for authentication check
    const isAdmin = await checkAdminAuth();
    if (!isAdmin) return;

    // ===== Confirmation Modal Helper =====
    let confirmationCallback = null;
    
    function showConfirmationModal(title, message, details = null, onConfirm = null, continueButtonText = 'Continue', continueButtonClass = 'btn-danger') {
        const modal = document.getElementById('confirmation-modal');
        const modalTitle = document.getElementById('confirmation-modal-title');
        const modalMessage = document.getElementById('confirmation-modal-message');
        const modalDetails = document.getElementById('confirmation-modal-details');
        const continueBtn = document.getElementById('confirmation-continue-btn');
        
        modalTitle.textContent = title;
        modalMessage.innerHTML = message;
        
        if (details) {
            modalDetails.innerHTML = details;
            modalDetails.style.display = 'block';
        } else {
            modalDetails.style.display = 'none';
        }
        
        // Update continue button
        continueBtn.textContent = continueButtonText;
        continueBtn.className = continueButtonClass;
        
        confirmationCallback = onConfirm;
        modal.classList.add('active');
    }
    
    function closeConfirmationModal() {
        const modal = document.getElementById('confirmation-modal');
        modal.classList.remove('active');
        confirmationCallback = null;
    }
    
    // Confirmation modal event listeners
    const confirmationModal = document.getElementById('confirmation-modal');
    const confirmationModalOverlay = document.getElementById('confirmation-modal-overlay');
    const confirmationModalCloseBtn = document.getElementById('confirmation-modal-close-btn');
    const confirmationCancelBtn = document.getElementById('confirmation-cancel-btn');
    const confirmationContinueBtn = document.getElementById('confirmation-continue-btn');
    
    if (confirmationModalOverlay) {
        confirmationModalOverlay.addEventListener('click', (e) => {
            if (e.target === confirmationModalOverlay) {
                closeConfirmationModal();
            }
        });
    }
    
    if (confirmationModalCloseBtn) {
        confirmationModalCloseBtn.addEventListener('click', closeConfirmationModal);
    }
    
    if (confirmationCancelBtn) {
        confirmationCancelBtn.addEventListener('click', closeConfirmationModal);
    }
    
    if (confirmationContinueBtn) {
        confirmationContinueBtn.addEventListener('click', () => {
            if (confirmationCallback) {
                confirmationCallback();
            }
            closeConfirmationModal();
        });
    }

    // ===== Chart References =====
    let analyticsCharts = {};

    // ===== DOM Elements =====
    const sidebar = document.getElementById('sidebar-rail');
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    // Use rail-nav-item selector to match the actual HTML class used in admin_page.html
    const navItems = document.querySelectorAll('.rail-nav-item[data-section]');
    const contentSections = document.querySelectorAll('.content-section');
    const pageTitle = document.getElementById('page-title');
    const logoutBtn = document.getElementById('admin-logout-btn');
    const backToHomeBtn = document.getElementById('back-to-home-btn');
    const themeToggleBtn = document.getElementById('theme-toggle-admin');

    // ===== Update Admin Profile =====
    function updateAdminProfile(user, userData) {
        const adminNameEl = document.getElementById('admin-name');
        const adminProfileImg = document.getElementById('admin-profile-img');

        if (adminNameEl) {
            adminNameEl.textContent = user.displayName || userData.fullName || 'Administrator';
        }

        if (adminProfileImg && user.photoURL) {
            adminProfileImg.src = user.photoURL;
        }
    }

    // ===== Navigation: hook loadSectionData onto rail nav clicks =====
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const section = item.getAttribute('data-section');
            if (section) {
                // Load the data for the clicked section
                loadSectionData(section);
            }
        });
    });

    // ===== Logout =====
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Use the new logout modal
            const modal = getLogoutModal();
            modal.show({
                onAbort: () => {
                    console.log('Logout cancelled by user');
                },
                onConfirm: async () => {
                    await auth.signOut();
                    sessionStorage.clear();
                    localStorage.removeItem('cachedAuthState');
                    showToast('Logged out successfully', '✅');
                    setTimeout(() => window.location.href = 'index.html', 1000);
                }
            });
        });
    }

    // ===== Back to Home =====
    if (backToHomeBtn) {
        backToHomeBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    // ===== Theme Toggle =====
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
        });
    }

    // ===== Load Section Data =====
    async function loadSectionData(section) {
        switch(section) {
            case 'dashboard':
                await loadDashboardData();
                break;
            case 'projects':
                await loadProjectsData();
                break;
            case 'users':
                await loadUsersData();
                break;
            case 'analytics':
                await loadAnalyticsData();
                break;
        }
    }

    // ===== Dashboard Data =====
    async function loadDashboardData() {
        // Safety check: Ensure user is authenticated
        if (!auth.currentUser) {
            console.warn('Cannot load dashboard - no authenticated user');
            return;
        }

        // Helper function to render all dashboard stats and lists in-memory
        function renderDashboardUI(projectsList, usersList) {
            const totalProjects = projectsList.length;
            const totalUsers = usersList.length;
            const studentUsers = usersList.filter(user => user.userType === 'student').length;
            const librarianUsers = usersList.filter(user => user.userType === 'librarian').length;

            document.getElementById('total-projects-stat').textContent = totalProjects;
            document.getElementById('total-users-stat').textContent = totalUsers;
            document.getElementById('student-users-stat').textContent = `${studentUsers} Students / ${librarianUsers} Librarians`;
            document.getElementById('recent-activity-stat').textContent = totalProjects + totalUsers;

            // Load recent projects
            const recentProjectsList = document.getElementById('recent-projects-list');
            if (recentProjectsList) {
                recentProjectsList.innerHTML = '';
                const sortedProjects = [...projectsList].sort((a, b) => {
                    const dateA = getTimestamp(a.createdAt);
                    const dateB = getTimestamp(b.createdAt);
                    return dateB - dateA;
                }).slice(0, 5);

                if (sortedProjects.length === 0) {
                    recentProjectsList.innerHTML = '<p class="empty-state">No projects yet</p>';
                } else {
                    sortedProjects.forEach(data => {
                        const item = document.createElement('div');
                        item.className = 'recent-item';
                        item.innerHTML = `
                            <div class="recent-item-title">${escapeHtml(data.title || 'Untitled')}</div>
                            <div class="recent-item-meta">
                                ${data.program || 'N/A'} · ${data.year || 'N/A'} · 
                                ${formatDate(data.createdAt)}
                            </div>
                        `;
                        recentProjectsList.appendChild(item);
                    });
                }
            }

            // Load recent users
            const recentUsersList = document.getElementById('recent-users-list');
            if (recentUsersList) {
                recentUsersList.innerHTML = '';
                const sortedUsers = [...usersList].sort((a, b) => {
                    const dateA = getTimestamp(a.createdAt);
                    const dateB = getTimestamp(b.createdAt);
                    return dateB - dateA;
                }).slice(0, 5);

                if (sortedUsers.length === 0) {
                    recentUsersList.innerHTML = '<p class="empty-state">No users yet</p>';
                } else {
                    sortedUsers.forEach(data => {
                        const item = document.createElement('div');
                        item.className = 'recent-item';
                        item.innerHTML = `
                            <div class="recent-item-title">${escapeHtml(data.fullName || data.email || 'Unknown')}</div>
                            <div class="recent-item-meta">
                                ${data.userType || 'N/A'} · Joined ${formatDate(data.createdAt)}
                            </div>
                        `;
                        recentUsersList.appendChild(item);
                    });
                }
            }
        }

        // Try to load cached data for instant load
        const cachedProjects = loadFromCache();
        const cachedUsers = loadUsersFromCache();
        
        let projects = cachedProjects || [];
        let users = cachedUsers || [];
        
        let renderedFromCache = false;
        
        if (projects.length > 0 || users.length > 0) {
            renderDashboardUI(projects, users);
            renderedFromCache = true;
            console.log('🚀 Loaded dashboard elements from cache immediately');
        } else {
            document.getElementById('total-projects-stat').textContent = '...';
            document.getElementById('total-users-stat').textContent = '...';
            document.getElementById('student-users-stat').textContent = '...';
            document.getElementById('recent-activity-stat').textContent = '...';
        }

        // Asynchronously check cache validation and fetch updates in background
        try {
            let needReRender = false;

            // 1. Verify project cache validity
            const cacheValid = await isCacheValid();
            if (!cacheValid || projects.length === 0) {
                console.log('📡 Dashboard fetching fresh projects (cache invalid or missing)...');
                let freshProjects = [];
                let retryCount = 0;
                const maxRetries = 2;

                while (retryCount <= maxRetries) {
                    try {
                        const projectsSnapshot = await db.collection('projects').get();
                        freshProjects = projectsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                        await saveToCache(freshProjects);
                        break;
                    } catch (fetchError) {
                        retryCount++;
                        if (retryCount > maxRetries) throw fetchError;
                        console.warn(`Retry ${retryCount}/${maxRetries} for dashboard projects...`);
                        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                    }
                }
                projects = freshProjects;
                needReRender = true;
            } else {
                console.log('✓ Projects cache is valid for dashboard');
            }

            // 2. Verify users cache freshness (less than 5 minutes old)
            let usersCacheAgeFresh = false;
            const cachedUsersMetadata = localStorage.getItem('usersMetadata');
            if (cachedUsersMetadata) {
                const metadata = JSON.parse(cachedUsersMetadata);
                const cacheAge = Date.now() - new Date(metadata.lastCached).getTime();
                if (cacheAge < 5 * 60 * 1000) {
                    usersCacheAgeFresh = true;
                }
            }

            if (!usersCacheAgeFresh || users.length === 0) {
                console.log('📡 Dashboard fetching fresh users (cache stale or missing)...');
                let freshUsers = [];
                let retryCount = 0;
                const maxRetries = 2;

                while (retryCount <= maxRetries) {
                    try {
                        const usersSnapshot = await db.collection('users').get();
                        freshUsers = usersSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                        await saveUsersToCache(freshUsers);
                        break;
                    } catch (fetchError) {
                        retryCount++;
                        if (retryCount > maxRetries) throw fetchError;
                        console.warn(`Retry ${retryCount}/${maxRetries} for dashboard users...`);
                        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                    }
                }
                users = freshUsers;
                needReRender = true;
            } else {
                console.log('✓ Users cache is valid/fresh for dashboard');
            }

            // 3. Re-render UI if any updates occurred
            if (needReRender || !renderedFromCache) {
                renderDashboardUI(projects, users);
                console.log('🔄 Dashboard UI updated with fresh database values');
            }

        } catch (error) {
            console.error('Error loading/revalidating dashboard data:', error);
            
            if (!renderedFromCache) {
                // Set error states for stats
                document.getElementById('total-projects-stat').textContent = 'Error';
                document.getElementById('total-users-stat').textContent = 'Error';
                document.getElementById('student-users-stat').textContent = 'Error';
                document.getElementById('recent-activity-stat').textContent = 'Error';
                
                let errorMessage = 'Error loading dashboard data';
                let errorDetail = '';
                
                if (error.code === 'permission-denied' || error.message?.includes('permission')) {
                    errorMessage = 'Permission Denied';
                    errorDetail = `
                        <div class="error-detail">
                            <p class="error-title">⚠️ Firestore Permission Error</p>
                            <p>Your admin account doesn't have permission to read the database.</p>
                            <p><strong>Common causes:</strong></p>
                            <ul>
                                <li>Firestore security rules need to be updated</li>
                                <li>Admin role not properly set in your user document</li>
                                <li>Missing database indexes</li>
                            </ul>
                            <button class="btn-secondary" onclick="location.reload()">Retry Connection</button>
                        </div>
                    `;
                } else if (error.message?.includes('offline') || error.message?.includes('network')) {
                    errorMessage = 'Connection Error';
                    errorDetail = `
                        <div class="error-detail">
                            <p class="error-title">🔌 Network Connection Issue</p>
                            <p>Unable to connect to the database. Please check your internet connection.</p>
                            <button class="btn-secondary" onclick="location.reload()">Retry</button>
                        </div>
                    `;
                } else {
                    errorDetail = `
                        <div class="error-detail">
                            <p class="error-title">⚠️ ${errorMessage}</p>
                            <p>${error.message || 'An unexpected error occurred'}</p>
                            <button class="btn-secondary" onclick="location.reload()">Retry</button>
                        </div>
                    `;
                }
                
                document.getElementById('recent-projects-list').innerHTML = errorDetail;
                document.getElementById('recent-users-list').innerHTML = errorDetail;
                showToast(errorMessage + ' - Check dashboard for details', '❌');
            } else {
                showToast('Failed to check for dashboard updates, using cached data.', '⚠️');
            }
        }
    }

    // ===== SMART CACHING WITH VERSION CHECKING =====
    
    /**
     * Check if cached data is up-to-date by comparing with RTDB counters
     * @returns {Promise<boolean>} True if cache is valid, false if needs refresh
     */
    async function isCacheValid() {
        try {
            // Get cached metadata
            const cachedMetadata = localStorage.getItem('projectsMetadata');
            if (!cachedMetadata) {
                console.log('📦 No cache found, fetching fresh data');
                return false;
            }
            
            const metadata = JSON.parse(cachedMetadata);
            const cachedCount = metadata.projectCount || 0;
            const cachedUpdateCounter = metadata.updateCounter || 0;
            
            console.log(`📦 Cached: ${cachedCount} projects, update counter: ${cachedUpdateCounter}`);
            
            // Fetch RTDB counters
            const rtdbResponse = await fetch('https://re-caps-default-rtdb.asia-southeast1.firebasedatabase.app/.json');
            const rtdbData = await rtdbResponse.json();
            
            const currentCount = rtdbData.projects_document_count || 0;
            const currentUpdateCounter = rtdbData.update_counter || 0;
            
            console.log(`🔄 RTDB: ${currentCount} projects, update counter: ${currentUpdateCounter}`);
            
            // Compare counters
            if (cachedCount !== currentCount) {
                console.log('⚠️ Project count mismatch! Cache outdated (new project added/deleted)');
                return false;
            }
            
            if (cachedUpdateCounter !== currentUpdateCounter) {
                console.log('⚠️ Update counter mismatch! Cache outdated (project was updated)');
                return false;
            }
            
            console.log('✓ Cache is up-to-date!');
            return true;
            
        } catch (error) {
            console.error('Error checking cache validity:', error);
            return false; // On error, fetch fresh data
        }
    }
    
    /**
     * Load projects from localStorage cache
     */
    function loadFromCache() {
        try {
            const cachedProjects = localStorage.getItem('projectsData');
            if (!cachedProjects) return null;
            
            const projects = JSON.parse(cachedProjects);
            console.log(`✓ Loaded ${projects.length} projects from cache`);
            return projects;
            
        } catch (error) {
            console.error('Error loading from cache:', error);
            return null;
        }
    }
    
    /**
     * Load users from localStorage cache
     */
    function loadUsersFromCache() {
        try {
            const cachedUsers = localStorage.getItem('usersData');
            if (!cachedUsers) return null;
            
            const users = JSON.parse(cachedUsers);
            console.log(`✓ Loaded ${users.length} users from cache`);
            return users;
            
        } catch (error) {
            console.error('Error loading users from cache:', error);
            return null;
        }
    }
    
    /**
     * Save projects to localStorage cache with metadata
     */
    async function saveToCache(projects) {
        try {
            // Fetch current RTDB counters
            const rtdbResponse = await fetch('https://re-caps-default-rtdb.asia-southeast1.firebasedatabase.app/.json');
            const rtdbData = await rtdbResponse.json();
            
            const metadata = {
                projectCount: rtdbData.projects_document_count || projects.length,
                updateCounter: rtdbData.update_counter || 0,
                lastCached: new Date().toISOString()
            };
            
            // Save projects data
            localStorage.setItem('projectsData', JSON.stringify(projects));
            
            // Save metadata
            localStorage.setItem('projectsMetadata', JSON.stringify(metadata));
            
            console.log(`✓ Cached ${projects.length} projects with metadata:`, metadata);
            
        } catch (error) {
            console.error('Error saving to cache:', error);
        }
    }
    
    /**
     * Save users to localStorage cache
     */
    async function saveUsersToCache(users) {
        try {
            const metadata = {
                userCount: users.length,
                lastCached: new Date().toISOString()
            };
            
            // Save users data
            localStorage.setItem('usersData', JSON.stringify(users));
            
            // Save metadata
            localStorage.setItem('usersMetadata', JSON.stringify(metadata));
            
            console.log(`✓ Cached ${users.length} users with metadata:`, metadata);
            
        } catch (error) {
            console.error('Error saving users to cache:', error);
        }
    }

    // ===== Projects Data =====
    async function loadProjectsData() {
        // Safety check: Ensure user is authenticated
        if (!auth.currentUser) {
            console.warn('Cannot load projects - no authenticated user');
            return;
        }
        
        const tbody = document.getElementById('projects-table-body');
        
        // 1. Try to load and render from cache immediately
        let projects = loadFromCache();
        let renderedFromCache = false;
        
        if (projects && projects.length > 0) {
            // Sort projects by createdAt descending
            projects.sort((a, b) => {
                const dateA = getTimestamp(a.createdAt);
                const dateB = getTimestamp(b.createdAt);
                return dateB - dateA;
            });
            
            // Render cached projects immediately
            renderProjectsTable(projects, tbody);
            
            // Re-apply filters if active
            if (typeof applyProjectFilters === 'function') {
                applyProjectFilters();
            }
            renderedFromCache = true;
            console.log('🚀 Using cached project data for instant render - revalidating in background...');
        } else {
            // Show loading spinner if no cache exists
            tbody.innerHTML = '<tr><td colspan="6" class="table-loading"><div class="spinner"></div> Loading projects...</td></tr>';
        }
        
        try {
            // 2. Perform cache validation asynchronously
            const cacheValid = await isCacheValid();
            
            if (cacheValid && renderedFromCache) {
                console.log('✓ Projects cache is valid. No Firestore fetch needed.');
                return;
            }
            
            // Cache invalid or not found - fetch from Firestore
            console.log('📡 Fetching fresh project data from Firestore...');
            if (!renderedFromCache) {
                tbody.innerHTML = '<tr><td colspan="6" class="table-loading"><div class="spinner"></div> Loading projects...</td></tr>';
            }
            
            let freshProjects = [];
            let retryCount = 0;
            const maxRetries = 2;
            
            while (retryCount <= maxRetries) {
                try {
                    // Try with orderBy first
                    try {
                        const projectsSnapshot = await db.collection('projects')
                            .orderBy('createdAt', 'desc')
                            .get();
                        
                        freshProjects = projectsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                        break; // Success
                    } catch (orderError) {
                        console.warn('OrderBy failed for projects, using fallback:', orderError);
                        // Fallback: get all projects and sort in memory
                        const projectsSnapshot = await db.collection('projects').get();
                        freshProjects = projectsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                        freshProjects.sort((a, b) => {
                            const dateA = getTimestamp(a.createdAt);
                            const dateB = getTimestamp(b.createdAt);
                            return dateB - dateA;
                        });
                        break; // Success
                    }
                } catch (fetchError) {
                    retryCount++;
                    if (retryCount > maxRetries) {
                        throw fetchError;
                    }
                    console.warn(`Retry ${retryCount}/${maxRetries} for projects...`);
                    if (!renderedFromCache) {
                        tbody.innerHTML = `<tr><td colspan="6" class="table-loading"><div class="spinner"></div> Retrying (${retryCount}/${maxRetries})...</td></tr>`;
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                }
            }

            // Save fresh data to cache
            await saveToCache(freshProjects);
            
            // Render fresh data
            renderProjectsTable(freshProjects, tbody);
            
            // Re-apply filters
            if (typeof applyProjectFilters === 'function') {
                applyProjectFilters();
            }

        } catch (error) {
            console.error('Error loading projects:', error);
            
            if (!renderedFromCache) {
                let errorHtml = '';
                if (error.code === 'permission-denied' || error.message?.includes('permission')) {
                    errorHtml = `
                        <tr><td colspan="6" class="table-error">
                            <div class="error-box">
                                <div class="error-icon">🔒</div>
                                <h4>Permission Denied</h4>
                                <p>Unable to access projects data. Please verify your Firestore security rules allow admin access.</p>
                                <button class="btn-secondary" onclick="location.reload()">Retry</button>
                            </div>
                        </td></tr>
                    `;
                    showToast('Permission denied - Check Firestore rules', '❌');
                } else {
                    errorHtml = `
                        <tr><td colspan="6" class="table-error">
                            <div class="error-box">
                                <div class="error-icon">⚠️</div>
                                <h4>Error Loading Projects</h4>
                                <p>${error.message || 'An unexpected error occurred'}</p>
                                <button class="btn-secondary" onclick="loadProjectsData()">Retry</button>
                            </div>
                        </td></tr>
                    `;
                    showToast('Error loading projects', '❌');
                }
                tbody.innerHTML = errorHtml;
            } else {
                showToast('Failed to check for database updates, using cached data.', '⚠️');
            }
        }
    }

    /**
     * Render projects table from array of project objects
     */
    function renderProjectsTable(projects, tbody) {
        tbody.innerHTML = '';

        if (projects.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No projects found</td></tr>';
            return;
        }

        projects.forEach(data => {
            const row = document.createElement('tr');
            // Store createdAt timestamp as data attribute for filtering
            const createdAtTimestamp = getTimestamp(data.createdAt);
            row.setAttribute('data-created-at', createdAtTimestamp);
            
            row.innerHTML = `
                <td><strong>${escapeHtml(data.title || 'Untitled')}</strong></td>
                <td>${escapeHtml((data.authors || []).join(', ') || 'N/A')}</td>
                <td><span class="badge badge-info">${escapeHtml(data.program || 'N/A')}</span></td>
                <td>${escapeHtml(data.year || 'N/A')}</td>
                <td>${escapeHtml(data.adviser || 'N/A')}</td>
                <td>
                    <div class="table-actions">
                        <button class="action-btn action-view" onclick="viewProject('${data.id}')" title="View details">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            View
                        </button>
                        <button class="action-btn action-edit" onclick="editProject('${data.id}')" title="Edit project">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            Edit
                        </button>
                        <button class="action-btn action-delete" onclick="deleteProject('${data.id}', '${escapeHtml(data.title || 'this project').replace(/'/g, "\\'")}')" title="Delete project">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            Delete
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    // ===== Users Data =====
    async function loadUsersData() {
        // Safety check: Ensure user is authenticated
        if (!auth.currentUser) {
            console.warn('Cannot load users - no authenticated user');
            return;
        }
        
        const tbody = document.getElementById('users-table-body');
        
        // Helper function to render users table in-memory
        function renderUsersTable(usersList) {
            tbody.innerHTML = '';
            if (usersList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No users found</td></tr>';
                return;
            }
            
            usersList.forEach(data => {
                const userType = data.userType || 'N/A';
                const badgeColor = userType === 'admin' ? '#667eea' : 
                                  userType === 'librarian' ? '#10b981' :
                                  userType === 'student' ? '#3b82f6' : '#94a3b8';
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>${escapeHtml(data.fullName || 'N/A')}</strong></td>
                    <td>${escapeHtml(data.email || 'N/A')}</td>
                    <td>
                        <span class="badge" style="background: ${badgeColor}; color: white;">
                            ${userType.toUpperCase()}
                        </span>
                    </td>
                    <td>${formatDate(data.createdAt)}</td>
                    <td>${formatDate(data.lastLogin) || 'Never'}</td>
                    <td>
                        <div class="table-actions">
                            <button class="action-btn action-view" onclick="viewUser('${data.id}')" title="View user details">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                View
                            </button>
                            ${data.userType !== 'admin' ? `
                                <button class="action-btn action-delete" onclick="deleteUser('${data.id}', '${escapeHtml(data.fullName || data.email).replace(/'/g, "\\'")}')" title="Delete user">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    Delete
                                </button>
                            ` : '<span class="badge" style="background: #cbd5e1; color: #475569;">Protected</span>'}
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });
        }

        // 1. Try to load and render from cache immediately
        let users = loadUsersFromCache();
        let renderedFromCache = false;
        
        if (users && users.length > 0) {
            // Sort users by createdAt descending
            users.sort((a, b) => {
                const dateA = getTimestamp(a.createdAt);
                const dateB = getTimestamp(b.createdAt);
                return dateB - dateA;
            });
            renderUsersTable(users);
            
            // Re-apply filter pills if active
            const activePill = document.querySelector('#user-filters .filter-pill.active');
            if (activePill) {
                const filter = activePill.dataset.filter;
                const rows = tbody.getElementsByTagName('tr');
                Array.from(rows).forEach(row => {
                    const badgeText = row.querySelector('.badge')?.textContent.trim().toLowerCase() || '';
                    if (filter === 'all') {
                        row.style.display = '';
                    } else {
                        row.style.display = badgeText === filter ? '' : 'none';
                    }
                });
            }
            renderedFromCache = true;
            console.log('🚀 Using cached user data for instant render - revalidating in background...');
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="table-loading"><div class="spinner"></div> Loading users...</td></tr>';
        }

        // 2. Asynchronously verify and update users cache
        try {
            let usersCacheAgeFresh = false;
            const cachedUsersMetadata = localStorage.getItem('usersMetadata');
            if (cachedUsersMetadata) {
                const metadata = JSON.parse(cachedUsersMetadata);
                const cacheAge = Date.now() - new Date(metadata.lastCached).getTime();
                if (cacheAge < 5 * 60 * 1000) {
                    usersCacheAgeFresh = true;
                }
            }

            if (usersCacheAgeFresh && renderedFromCache) {
                console.log('✓ Users cache is fresh. No Firestore fetch needed.');
                return;
            }

            console.log('📡 Fetching fresh users data from Firestore...');
            if (!renderedFromCache) {
                tbody.innerHTML = '<tr><td colspan="6" class="table-loading"><div class="spinner"></div> Loading users...</td></tr>';
            }

            let freshUsers = [];
            let retryCount = 0;
            const maxRetries = 2;
            
            while (retryCount <= maxRetries) {
                try {
                    // Try with orderBy first
                    try {
                        const usersSnapshot = await db.collection('users')
                            .orderBy('createdAt', 'desc')
                            .get();
                        freshUsers = usersSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                        break; // Success
                    } catch (orderError) {
                        console.warn('OrderBy failed for users, using fallback:', orderError);
                        // Fallback: get all users and sort in memory
                        const usersSnapshot = await db.collection('users').get();
                        freshUsers = usersSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                        freshUsers.sort((a, b) => {
                            const dateA = getTimestamp(a.createdAt);
                            const dateB = getTimestamp(b.createdAt);
                            return dateB - dateA;
                        });
                        break; // Success
                    }
                } catch (fetchError) {
                    retryCount++;
                    if (retryCount > maxRetries) {
                        throw fetchError;
                    }
                    console.warn(`Retry ${retryCount}/${maxRetries} for users...`);
                    if (!renderedFromCache) {
                        tbody.innerHTML = `<tr><td colspan="6" class="table-loading"><div class="spinner"></div> Retrying (${retryCount}/${maxRetries})...</td></tr>`;
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                }
            }

            // Save to cache
            await saveUsersToCache(freshUsers);

            // Render fresh data
            renderUsersTable(freshUsers);

            // Re-apply filter pills if active
            const activePill = document.querySelector('#user-filters .filter-pill.active');
            if (activePill) {
                const filter = activePill.dataset.filter;
                const rows = tbody.getElementsByTagName('tr');
                Array.from(rows).forEach(row => {
                    const badgeText = row.querySelector('.badge')?.textContent.trim().toLowerCase() || '';
                    if (filter === 'all') {
                        row.style.display = '';
                    } else {
                        row.style.display = badgeText === filter ? '' : 'none';
                    }
                });
            }

        } catch (error) {
            console.error('Error loading users:', error);
            
            if (!renderedFromCache) {
                let errorHtml = '';
                if (error.code === 'permission-denied' || error.message?.includes('permission')) {
                    errorHtml = `
                        <tr><td colspan="6" class="table-error">
                            <div class="error-box">
                                <div class="error-icon">🔒</div>
                                <h4>Permission Denied</h4>
                                <p>Unable to access users data. Please verify your Firestore security rules allow admin access.</p>
                                <button class="btn-secondary" onclick="location.reload()">Retry</button>
                            </div>
                        </td></tr>
                    `;
                    showToast('Permission denied - Check Firestore rules', '❌');
                } else {
                    errorHtml = `
                        <tr><td colspan="6" class="table-error">
                            <div class="error-box">
                                <div class="error-icon">⚠️</div>
                                <h4>Error Loading Users</h4>
                                <p>${error.message || 'An unexpected error occurred'}</p>
                                <button class="btn-secondary" onclick="loadUsersData()">Retry</button>
                            </div>
                        </td></tr>
                    `;
                    showToast('Error loading users', '❌');
                }
                tbody.innerHTML = errorHtml;
            } else {
                showToast('Failed to check for user database updates, using cached data.', '⚠️');
            }
        }
    }

    // ===== Analytics Data =====
    async function loadAnalyticsData() {
        const loadingOverlay = document.getElementById('analytics-loading');
        if (loadingOverlay) loadingOverlay.classList.add('active');

        try {
            // Load from cache first
            let projects = loadFromCache();
            let users = loadUsersFromCache();

            // If cache is empty, fetch from database in parallel
            if (!projects || !users) {
                const promises = [];
                if (!projects) {
                    promises.push(
                        db.collection('projects').get().then(snapshot => {
                            const list = [];
                            snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
                            localStorage.setItem('projectsData', JSON.stringify(list));
                            return list;
                        })
                    );
                } else {
                    promises.push(Promise.resolve(projects));
                }

                if (!users) {
                    promises.push(
                        db.collection('users').get().then(snapshot => {
                            const list = [];
                            snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
                            localStorage.setItem('usersData', JSON.stringify(list));
                            return list;
                        })
                    );
                } else {
                    promises.push(Promise.resolve(users));
                }

                const [freshProjects, freshUsers] = await Promise.all(promises);
                projects = freshProjects;
                users = freshUsers;
            }

            // Render KPI indicators immediately (these are just text, no canvas needed)
            renderKPIs(projects, users);

            // IMPORTANT: Always defer chart rendering into a requestAnimationFrame.
            // When cache is warm, this function is fully synchronous — no await is hit —
            // so renderCharts() would fire in the same tick as the nav click, before
            // the browser has had a chance to repaint the section from display:none to
            // display:block. Chart.js would measure the canvas at 0×0 and produce
            // invisible charts. The double-rAF guarantees we're past the layout pass.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    renderCharts(projects, users);
                    setupAnalyticsListeners(projects, users);
                    if (loadingOverlay) loadingOverlay.classList.remove('active');
                });
            });

        } catch (error) {
            console.error('Error loading analytics:', error);
            showToast('Failed to load analytics data', '❌');
            if (loadingOverlay) loadingOverlay.classList.remove('active');
        }

    }

    // Helper: get chart themes
    function getChartTheme() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        return {
            textColor: isDark ? '#94a3b8' : '#475569',
            gridColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            tooltipBg: isDark ? '#1e293b' : '#ffffff',
            tooltipText: isDark ? '#f8fafc' : '#1f2937',
            borderColor: isDark ? '#334155' : '#e2e8f0',
            palette: [
                '#764ba2', // Admin Purple Primary
                '#3b82f6', // Blue
                '#10b981', // Green
                '#f59e0b', // Orange
                '#ef4444', // Red
                '#ec4899', // Pink
                '#06b6d4', // Cyan
                '#8b5cf6', // Violet
                '#14b8a6', // Teal
                '#f43f5e'  // Rose
            ]
        };
    }

    // Render KPI numbers
    function renderKPIs(projects, users) {
        const totalProjEl = document.getElementById('kpi-total-projects');
        const totalUserEl = document.getElementById('kpi-total-users');
        const activeProgEl = document.getElementById('kpi-programs');
        const recentEl = document.getElementById('kpi-recent');
        const avgYearEl = document.getElementById('kpi-avg-year');

        if (totalProjEl) totalProjEl.textContent = projects.length;
        if (totalUserEl) totalUserEl.textContent = users.length;

        const uniquePrograms = [...new Set(projects.map(p => p.program).filter(Boolean))];
        if (activeProgEl) activeProgEl.textContent = uniquePrograms.length;

        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const recentProjects = projects.filter(p => getTimestamp(p.createdAt) >= thirtyDaysAgo);
        if (recentEl) recentEl.textContent = recentProjects.length;

        const years = projects.map(p => parseInt(p.year)).filter(y => !isNaN(y));
        const avgYear = years.length > 0 ? Math.round(years.reduce((a, b) => a + b, 0) / years.length) : 'N/A';
        if (avgYearEl) avgYearEl.textContent = avgYear;
    }

    // Render all charts
    function renderCharts(projects, users) {
        // Debounce Chart.js resize events to prevent cascade loops when DevTools
        // opens/closes and snaps the viewport width, which would otherwise cause
        // all canvas elements to resize in an infinite feedback cycle.
        if (typeof Chart !== 'undefined') {
            Chart.defaults.resizeDelay = 200;
        }
        const theme = getChartTheme();

        // 1. Projects by Program Chart Data
        const programCounts = {};
        projects.forEach(p => {
            if (p.program) programCounts[p.program] = (programCounts[p.program] || 0) + 1;
        });
        const programLabels = Object.keys(programCounts).sort((a, b) => programCounts[b] - programCounts[a]);
        const programData = programLabels.map(label => programCounts[label]);

        function buildProgramChart(chartType = 'bar') {
            if (analyticsCharts['programChart']) {
                analyticsCharts['programChart'].destroy();
            }

            const ctx = document.getElementById('programChart');
            if (!ctx) return;

            const isHorizontal = chartType === 'horizontalBar';
            const actualType = isHorizontal ? 'bar' : (chartType === 'doughnut' ? 'doughnut' : 'bar');

            analyticsCharts['programChart'] = new Chart(ctx.getContext('2d'), {
                type: actualType,
                data: {
                    labels: programLabels,
                    datasets: [{
                        label: 'Projects',
                        data: programData,
                        backgroundColor: actualType === 'doughnut' ? theme.palette : theme.palette[0],
                        borderRadius: actualType === 'doughnut' ? 0 : 6,
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: isHorizontal ? 'y' : 'x',
                    plugins: {
                        legend: {
                            display: actualType === 'doughnut',
                            position: 'bottom',
                            labels: { color: theme.textColor }
                        },
                        tooltip: {
                            backgroundColor: theme.tooltipBg,
                            titleColor: theme.tooltipText,
                            bodyColor: theme.tooltipText,
                            borderColor: theme.borderColor,
                            borderWidth: 1
                        }
                    },
                    scales: actualType === 'doughnut' ? {} : {
                        x: {
                            grid: { color: theme.gridColor },
                            ticks: { color: theme.textColor }
                        },
                        y: {
                            grid: { color: theme.gridColor },
                            ticks: { color: theme.textColor, precision: 0 }
                        }
                    }
                }
            });
        }

        // Get currently selected program chart type
        const progSwitcherActive = document.querySelector('.chart-type-switcher[data-chart="programChart"] .chart-switch-btn.active');
        const progType = progSwitcherActive ? progSwitcherActive.dataset.type : 'bar';
        buildProgramChart(progType);

        // 2. User Roles Chart
        const roleCounts = { admin: 0, librarian: 0, student: 0, teacher: 0 };
        users.forEach(u => {
            const role = (u.userType || 'student').toLowerCase();
            if (roleCounts[role] !== undefined) roleCounts[role]++;
        });
        const roleLabels = ['Admin', 'Librarian', 'Student', 'Teacher'];
        const roleData = [roleCounts.admin, roleCounts.librarian, roleCounts.student, roleCounts.teacher];
        const roleColors = ['#764ba2', '#10b981', '#3b82f6', '#f59e0b'];

        if (analyticsCharts['userRolesChart']) {
            analyticsCharts['userRolesChart'].destroy();
        }
        const userRolesCtx = document.getElementById('userRolesChart');
        if (userRolesCtx) {
            analyticsCharts['userRolesChart'] = new Chart(userRolesCtx.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: roleLabels,
                    datasets: [{
                        data: roleData,
                        backgroundColor: roleColors,
                        borderWidth: 0,
                        cutout: '70%'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: theme.tooltipBg,
                            titleColor: theme.tooltipText,
                            bodyColor: theme.tooltipText,
                            borderColor: theme.borderColor,
                            borderWidth: 1
                        }
                    }
                }
            });

            // Render custom legends
            const legendContainer = document.getElementById('userRolesLegend');
            if (legendContainer) {
                legendContainer.innerHTML = roleLabels.map((label, idx) => `
                    <div class="legend-item">
                        <span class="legend-color" style="background:${roleColors[idx]}"></span>
                        <span>${label}: <strong>${roleData[idx]}</strong></span>
                    </div>
                `).join('');
            }
        }

        // 3. Projects Over Time Chart
        const yearCounts = {};
        projects.forEach(p => {
            const y = parseInt(p.year);
            if (!isNaN(y)) yearCounts[y] = (yearCounts[y] || 0) + 1;
        });
        const sortedYears = Object.keys(yearCounts).map(Number).sort((a, b) => a - b);
        let cumulativeSum = 0;
        const cumulativeData = sortedYears.map(yr => {
            cumulativeSum += yearCounts[yr];
            return cumulativeSum;
        });

        function buildTimelineChart(chartType = 'line') {
            if (analyticsCharts['timelineChart']) {
                analyticsCharts['timelineChart'].destroy();
            }

            const ctx = document.getElementById('timelineChart');
            if (!ctx) return;

            const isLine = chartType === 'line';

            analyticsCharts['timelineChart'] = new Chart(ctx.getContext('2d'), {
                type: isLine ? 'line' : 'bar',
                data: {
                    labels: sortedYears,
                    datasets: [{
                        label: 'Total Projects (Cumulative)',
                        data: cumulativeData,
                        borderColor: '#764ba2',
                        backgroundColor: isLine ? 'rgba(118, 75, 162, 0.1)' : '#764ba2',
                        fill: isLine,
                        tension: 0.3,
                        borderWidth: 2,
                        borderRadius: isLine ? 0 : 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: theme.tooltipBg,
                            titleColor: theme.tooltipText,
                            bodyColor: theme.tooltipText,
                            borderColor: theme.borderColor,
                            borderWidth: 1
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: theme.gridColor },
                            ticks: { color: theme.textColor }
                        },
                        y: {
                            grid: { color: theme.gridColor },
                            ticks: { color: theme.textColor, precision: 0 }
                        }
                    }
                }
            });
        }

        const timelineSwitcherActive = document.querySelector('.chart-type-switcher[data-chart="timelineChart"] .chart-switch-btn.active');
        const timelineType = timelineSwitcherActive ? timelineSwitcherActive.dataset.type : 'line';
        buildTimelineChart(timelineType);

        // 4. Top Advisers Chart
        const adviserCounts = {};
        projects.forEach(p => {
            if (p.adviser) {
                const adv = p.adviser.trim();
                adviserCounts[adv] = (adviserCounts[adv] || 0) + 1;
            }
        });
        const sortedAdvisers = Object.keys(adviserCounts).sort((a, b) => adviserCounts[b] - adviserCounts[a]).slice(0, 5);
        const adviserData = sortedAdvisers.map(adv => adviserCounts[adv]);

        if (analyticsCharts['advisersChart']) {
            analyticsCharts['advisersChart'].destroy();
        }
        const advisersCtx = document.getElementById('advisersChart');
        if (advisersCtx) {
            analyticsCharts['advisersChart'] = new Chart(advisersCtx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: sortedAdvisers.map(name => name.split(' ').pop()),
                    datasets: [{
                        label: 'Projects Advised',
                        data: adviserData,
                        backgroundColor: '#10b981',
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: theme.tooltipBg,
                            titleColor: theme.tooltipText,
                            bodyColor: theme.tooltipText,
                            borderColor: theme.borderColor,
                            borderWidth: 1,
                            callbacks: {
                                title: (context) => sortedAdvisers[context[0].dataIndex]
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: theme.gridColor },
                            ticks: { color: theme.textColor, precision: 0 }
                        },
                        y: {
                            grid: { color: theme.gridColor },
                            ticks: { color: theme.textColor }
                        }
                    }
                }
            });
        }

        // 5. Batch Year Radar
        const radarCtx = document.getElementById('radarChart');
        if (radarCtx) {
            const activeYears = sortedYears.slice(-4);
            const topPrograms = programLabels.slice(0, 3);
            const radarDatasets = topPrograms.map((prog, idx) => {
                const color = theme.palette[idx + 1];
                const data = activeYears.map(yr => {
                    return projects.filter(p => p.program === prog && parseInt(p.year) === yr).length;
                });
                return {
                    label: prog,
                    data: data,
                    borderColor: color,
                    backgroundColor: color + '22',
                    borderWidth: 2,
                    pointBackgroundColor: color
                };
            });

            if (analyticsCharts['radarChart']) {
                analyticsCharts['radarChart'].destroy();
            }
            analyticsCharts['radarChart'] = new Chart(radarCtx.getContext('2d'), {
                type: 'radar',
                data: {
                    labels: activeYears,
                    datasets: radarDatasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: theme.textColor }
                        },
                        tooltip: {
                            backgroundColor: theme.tooltipBg,
                            titleColor: theme.tooltipText,
                            bodyColor: theme.tooltipText,
                            borderColor: theme.borderColor,
                            borderWidth: 1
                        }
                    },
                    scales: {
                        r: {
                            angleLines: { color: theme.gridColor },
                            grid: { color: theme.gridColor },
                            pointLabels: { color: theme.textColor },
                            ticks: { display: false }
                        }
                    }
                }
            });
        }

        // 6. Authors per Project Polar Area
        const authorCounts = { '1 Author': 0, '2 Authors': 0, '3 Authors': 0, '4+ Authors': 0 };
        projects.forEach(p => {
            let count = 1;
            if (p.authors) {
                if (Array.isArray(p.authors)) {
                    count = p.authors.length;
                } else if (typeof p.authors === 'string') {
                    count = p.authors.split(',').length;
                }
            }
            if (count === 1) authorCounts['1 Author']++;
            else if (count === 2) authorCounts['2 Authors']++;
            else if (count === 3) authorCounts['3 Authors']++;
            else authorCounts['4+ Authors']++;
        });

        if (analyticsCharts['authorCountChart']) {
            analyticsCharts['authorCountChart'].destroy();
        }
        const authorCtx = document.getElementById('authorCountChart');
        if (authorCtx) {
            analyticsCharts['authorCountChart'] = new Chart(authorCtx.getContext('2d'), {
                type: 'polarArea',
                data: {
                    labels: Object.keys(authorCounts),
                    datasets: [{
                        data: Object.values(authorCounts),
                        backgroundColor: [
                            theme.palette[1] + 'cc',
                            theme.palette[2] + 'cc',
                            theme.palette[3] + 'cc',
                            theme.palette[4] + 'cc'
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: theme.textColor }
                        },
                        tooltip: {
                            backgroundColor: theme.tooltipBg,
                            titleColor: theme.tooltipText,
                            bodyColor: theme.tooltipText,
                            borderColor: theme.borderColor,
                            borderWidth: 1
                        }
                    },
                    scales: {
                        r: {
                            grid: { color: theme.gridColor },
                            ticks: { display: false }
                        }
                    }
                }
            });
        }

        // 7. Monthly Submissions Chart
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthlyCounts = new Array(12).fill(0);
        projects.forEach(p => {
            const ts = getTimestamp(p.createdAt);
            if (ts) {
                const d = new Date(ts);
                if (d.getFullYear() === new Date().getFullYear()) {
                    monthlyCounts[d.getMonth()]++;
                }
            }
        });

        if (analyticsCharts['monthlyChart']) {
            analyticsCharts['monthlyChart'].destroy();
        }
        const monthlyCtx = document.getElementById('monthlyChart');
        if (monthlyCtx) {
            analyticsCharts['monthlyChart'] = new Chart(monthlyCtx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: months,
                    datasets: [{
                        label: 'Submissions',
                        data: monthlyCounts,
                        borderColor: '#fa709a',
                        backgroundColor: 'rgba(250, 112, 154, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: theme.tooltipBg,
                            titleColor: theme.tooltipText,
                            bodyColor: theme.tooltipText,
                            borderColor: theme.borderColor,
                            borderWidth: 1
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: theme.gridColor },
                            ticks: { color: theme.textColor }
                        },
                        y: {
                            grid: { color: theme.gridColor },
                            ticks: { color: theme.textColor, precision: 0 }
                        }
                    }
                }
            });
        }
    }

    // Set up control listeners
    function setupAnalyticsListeners(projects, users) {
        // Timeline & Program chart switchers
        const switchers = document.querySelectorAll('.chart-type-switcher');
        switchers.forEach(sw => {
            const chartKey = sw.dataset.chart;
            const buttons = sw.querySelectorAll('.chart-switch-btn');
            buttons.forEach(btn => {
                // Remove old event listeners to avoid duplicates
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                newBtn.addEventListener('click', () => {
                    sw.querySelectorAll('.chart-switch-btn').forEach(b => b.classList.remove('active'));
                    newBtn.classList.add('active');
                    const type = newBtn.dataset.type;
                    
                    // Re-render only the toggled chart
                    renderCharts(projects, users);
                });
            });
        });

        // Time Range filter tabs
        const rangeTabs = document.querySelectorAll('#analytics-time-tabs .analytics-tab');
        rangeTabs.forEach(tab => {
            const newTab = tab.cloneNode(true);
            tab.parentNode.replaceChild(newTab, tab);
            newTab.addEventListener('click', () => {
                document.querySelectorAll('#analytics-time-tabs .analytics-tab').forEach(t => t.classList.remove('active'));
                newTab.classList.add('active');
                
                const range = newTab.dataset.range;
                let filteredProjects = [...projects];
                
                if (range === 'year') {
                    const currentYear = new Date().getFullYear();
                    filteredProjects = projects.filter(p => new Date(getTimestamp(p.createdAt)).getFullYear() === currentYear);
                } else if (range === '30d') {
                    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
                    filteredProjects = projects.filter(p => getTimestamp(p.createdAt) >= thirtyDaysAgo);
                }
                
                renderKPIs(filteredProjects, users);
                renderCharts(filteredProjects, users);
            });
        });

        // Refresh Data button
        const refreshBtn = document.getElementById('analytics-refresh-btn');
        if (refreshBtn) {
            const newRefreshBtn = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(newRefreshBtn, refreshBtn);
            newRefreshBtn.addEventListener('click', async () => {
                showToast('Refreshing database counts & stats...', 'ℹ️');
                localStorage.removeItem('projectsData');
                localStorage.removeItem('usersData');
                await loadAnalyticsData();
                showToast('Analytics cache updated successfully', '✅');
            });
        }

        // Export CSV button
        const exportBtn = document.getElementById('analytics-export-btn');
        if (exportBtn) {
            const newExportBtn = exportBtn.cloneNode(true);
            exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
            newExportBtn.addEventListener('click', () => {
                try {
                    let csvContent = "data:text/csv;charset=utf-8,";
                    csvContent += "Title,Authors,Program,Year,Adviser,Date Added\n";
                    
                    projects.forEach(p => {
                        const title = `"${(p.title || '').replace(/"/g, '""')}"`;
                        const authors = `"${(Array.isArray(p.authors) ? p.authors.join(', ') : p.authors || '').replace(/"/g, '""')}"`;
                        const program = `"${(p.program || '').replace(/"/g, '""')}"`;
                        const year = `"${p.year || ''}"`;
                        const adviser = `"${(p.adviser || '').replace(/"/g, '""')}"`;
                        const dateAdded = `"${new Date(getTimestamp(p.createdAt)).toLocaleDateString()}"`;
                        
                        csvContent += `${title},${authors},${program},${year},${adviser},${dateAdded}\n`;
                    });
                    
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", `RE-CAPS_Analytics_Report_${new Date().toISOString().split('T')[0]}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    showToast('CSV Report exported successfully', '✅');
                } catch (e) {
                    console.error('Export error:', e);
                    showToast('Failed to export CSV report', '❌');
                }
            });
        }

        // Setup mutation observer for data-theme change
        if (!window.analyticsThemeObserverRegistered) {
            const observer = new MutationObserver(() => {
                const activeSection = document.querySelector('.content-section.active');
                if (activeSection && activeSection.id === 'section-analytics') {
                    const activeTab = document.querySelector('#analytics-time-tabs .analytics-tab.active');
                    const range = activeTab ? activeTab.dataset.range : 'all';
                    let filteredProjects = [...projects];
                    
                    if (range === 'year') {
                        const currentYear = new Date().getFullYear();
                        filteredProjects = projects.filter(p => new Date(getTimestamp(p.createdAt)).getFullYear() === currentYear);
                    } else if (range === '30d') {
                        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
                        filteredProjects = projects.filter(p => getTimestamp(p.createdAt) >= thirtyDaysAgo);
                    }
                    renderCharts(filteredProjects, users);
                }
            });
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
            window.analyticsThemeObserverRegistered = true;
        }
    }


    // ===== Helper Functions =====
    function getTimestamp(timestamp) {
        if (!timestamp) return 0;
        
        try {
            if (timestamp.toDate) {
                return timestamp.toDate().getTime();
            } else if (timestamp instanceof Date) {
                return timestamp.getTime();
            } else if (typeof timestamp === 'number') {
                return timestamp;
            } else if (typeof timestamp === 'string') {
                return new Date(timestamp).getTime();
            }
        } catch (error) {
            console.error('Error parsing timestamp:', error);
        }
        return 0;
    }

    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(text || '').replace(/[&<>"']/g, m => map[m]);
    }

    function formatDate(timestamp) {
        if (!timestamp) return 'N/A';
        
        try {
            let date;
            if (timestamp.toDate) {
                date = timestamp.toDate();
            } else if (timestamp instanceof Date) {
                date = timestamp;
            } else if (typeof timestamp === 'number') {
                date = new Date(timestamp);
            } else if (typeof timestamp === 'string') {
                date = new Date(timestamp);
            } else {
                return 'N/A';
            }

            // Check if date is valid
            if (isNaN(date.getTime())) {
                return 'N/A';
            }

            const options = { year: 'numeric', month: 'short', day: 'numeric' };
            return date.toLocaleDateString('en-US', options);
        } catch (error) {
            console.error('Error formatting date:', error);
            return 'N/A';
        }
    }

    // ===== Global Action Functions =====
    window.viewProject = async (projectId) => {
        console.log('View project:', projectId);
        try {
            showToast('Loading project details...', 'ℹ️');
            
            // Fetch the project data
            const doc = await db.collection('projects').doc(projectId).get();
            if (!doc.exists) {
                showToast('Project not found', '❌');
                return;
            }
            
            const projectData = {
                id: doc.id,
                ...doc.data()
            };
            
            // Store project data in sessionStorage for the details view
            sessionStorage.setItem('selectedProjectForViewDetails', JSON.stringify(projectData));
            
            // Set flag to show details view
            sessionStorage.setItem('showProjectDetails', 'true');
            
            // Navigate to index.html which will handle the view
            window.location.href = 'index.html';
            
        } catch (error) {
            console.error('Error loading project for view:', error);
            showToast('Error loading project: ' + error.message, '❌');
        }
    };

    window.editProject = async (projectId) => {
        console.log('Edit project:', projectId);
        try {
            showToast('Loading project details...', 'ℹ️');
            const doc = await db.collection('projects').doc(projectId).get();
            if (!doc.exists) {
                showToast('Project not found', '❌');
                return;
            }
            const data = doc.data();
            
            // Save original data for change detection
            const editAuthors = Array.isArray(data.authors) ? data.authors : (data.authors ? data.authors.split(',').map(a => a.trim()) : []);
            const editTopics = Array.isArray(data.topics) ? data.topics : [];
            const editKeywords = Array.isArray(data.keywords) ? data.keywords : [];
            
            originalFormData = {
                title: data.title || '',
                authors: editAuthors,
                program: data.program || '',
                year: data.year || new Date().getFullYear(),
                adviser: data.adviser || '',
                status: data.status || 'Completed',
                abstract: data.abstract || '',
                keyFindings: data.keyFindings || '',
                topics: editTopics,
                keywords: editKeywords
            };
            isEditMode = true;
            
            // Populate form fields
            document.getElementById('project-id-input').value = projectId;
            document.getElementById('project-title-input').value = data.title || '';
            document.getElementById('project-program-select').value = data.program || '';
            document.getElementById('project-year-input').value = data.year || '';
            document.getElementById('project-adviser-input').value = data.adviser || '';
            document.getElementById('project-status-select').value = data.status || 'Completed';
            document.getElementById('project-abstract-input').value = data.abstract || '';
            document.getElementById('project-findings-input').value = data.keyFindings || '';

            // Populate dynamic fields
            initDynamicContainers({ authors: editAuthors, topics: editTopics, keywords: editKeywords });

            // Customize modal for editing
            document.getElementById('project-modal-title').textContent = 'Edit Capstone Project';
            document.getElementById('submit-project-btn').textContent = 'Apply Edit';
            
            // Update button visibility
            updateButtonVisibility();
            
            // Show modal
            document.getElementById('project-modal').classList.add('active');
        } catch (error) {
            console.error('Error loading project for edit:', error);
            showToast('Error loading project details: ' + error.message, '❌');
        }
    };

    window.deleteProject = async (projectId, title) => {
        showSecureDeleteModal(projectId, title);
    };
    
    // Secure Delete Modal Logic
    let secureDeleteProjectId = null;
    let secureDeleteProjectTitle = null;
    
    function showSecureDeleteModal(projectId, title) {
        secureDeleteProjectId = projectId;
        secureDeleteProjectTitle = title;
        
        const modal = document.getElementById('secure-delete-modal');
        const projectTitleDiv = document.getElementById('secure-delete-project-title');
        const deleteInput = document.getElementById('secure-delete-input');
        const deleteBtn = document.getElementById('secure-delete-confirm-btn');
        const feedback = document.getElementById('delete-input-feedback');
        
        // Set project title
        projectTitleDiv.textContent = title;
        
        // Reset input
        deleteInput.value = '';
        deleteInput.className = 'secure-delete-input';
        deleteBtn.disabled = true;
        feedback.textContent = '';
        feedback.className = 'delete-input-feedback';
        
        // Show modal
        modal.classList.add('active');
        
        // Focus input after animation
        setTimeout(() => {
            deleteInput.focus();
        }, 300);
    }
    
    function closeSecureDeleteModal() {
        const modal = document.getElementById('secure-delete-modal');
        modal.classList.remove('active');
        secureDeleteProjectId = null;
        secureDeleteProjectTitle = null;
    }
    
    async function confirmSecureDelete() {
        if (!secureDeleteProjectId || !secureDeleteProjectTitle) return;
        
        const deleteBtn = document.getElementById('secure-delete-confirm-btn');
        const originalText = deleteBtn.innerHTML;
        
        try {
            deleteBtn.disabled = true;
            deleteBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="margin-right: 0.5rem; animation: spin 1s linear infinite;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 6v6l4 2"></path>
                </svg>
                Deleting...
            `;
            
            showToast('Deleting project...', 'ℹ️');
            await db.collection('projects').doc(secureDeleteProjectId).delete();
            
            // Update Realtime Database projects_document_count
            if (rtdb) {
                try {
                    const countSnapshot = await db.collection('projects').get();
                    const newCount = countSnapshot.size;
                    await rtdb.ref('projects_document_count').set(newCount);
                    console.log('Realtime database project count updated to:', newCount);
                } catch (rtdbErr) {
                    console.error('Error updating RTDB project count:', rtdbErr);
                }
            }

            closeSecureDeleteModal();
            showToast('Project deleted successfully', '✅');
            await loadProjectsData();
            await loadDashboardData(); // Refresh stats
        } catch (error) {
            console.error('Error deleting project:', error);
            showToast('Error deleting project: ' + error.message, '❌');
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = originalText;
        }
    }
    
    // Secure delete modal event listeners
    document.getElementById('secure-delete-input').addEventListener('input', function() {
        const input = this;
        const deleteBtn = document.getElementById('secure-delete-confirm-btn');
        const feedback = document.getElementById('delete-input-feedback');
        const inputValue = input.value.trim();
        
        // Case-insensitive comparison
        const isMatch = inputValue.toLowerCase() === secureDeleteProjectTitle.toLowerCase();
        
        if (inputValue === '') {
            // Empty input
            input.className = 'secure-delete-input';
            deleteBtn.disabled = true;
            feedback.textContent = '';
            feedback.className = 'delete-input-feedback';
        } else if (isMatch) {
            // Valid match
            input.className = 'secure-delete-input valid';
            deleteBtn.disabled = false;
            feedback.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="vertical-align: middle; margin-right: 0.25rem;">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                Title verified. You can now delete the project.
            `;
            feedback.className = 'delete-input-feedback valid';
        } else {
            // Invalid input
            input.className = 'secure-delete-input invalid';
            deleteBtn.disabled = true;
            feedback.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="vertical-align: middle; margin-right: 0.25rem;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                Title does not match. Please type exactly as shown.
            `;
            feedback.className = 'delete-input-feedback invalid';
        }
    });
    
    document.getElementById('secure-delete-confirm-btn').addEventListener('click', confirmSecureDelete);
    document.getElementById('secure-delete-cancel-btn').addEventListener('click', closeSecureDeleteModal);
    document.getElementById('secure-delete-modal-close-btn').addEventListener('click', closeSecureDeleteModal);
    document.getElementById('secure-delete-modal-overlay').addEventListener('click', closeSecureDeleteModal);
    
    // Allow Enter key to submit if valid
    document.getElementById('secure-delete-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const deleteBtn = document.getElementById('secure-delete-confirm-btn');
            if (!deleteBtn.disabled) {
                confirmSecureDelete();
            }
        }
    });

    window.viewUser = (userId) => {
        console.log('View user:', userId);
        showToast('User profile view coming soon', 'ℹ️');
        // TODO: Implement user profile view modal
    };

    window.deleteUser = async (userId, name) => {
        const confirmed = confirm(
            `⚠️ DELETE USER\n\n` +
            `Are you sure you want to delete user:\n"${name}"\n\n` +
            `This will remove their account and all associated data.\n` +
            `This action cannot be undone.`
        );
        
        if (!confirmed) return;

        try {
            showToast('Deleting user...', 'ℹ️');
            await db.collection('users').doc(userId).delete();
            showToast('User deleted successfully', '✅');
            await loadUsersData();
            await loadDashboardData(); // Refresh stats
        } catch (error) {
            console.error('Error deleting user:', error);
            showToast('Error deleting user: ' + error.message, '❌');
        }
    };

    // ===== Dynamic Field Helpers =====

    function createDynamicRow(containerId, placeholder, value = '') {
        const container = document.getElementById(containerId);
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'dynamic-input-row';
        row.innerHTML = `
            <input type="text" class="form-input" placeholder="${placeholder}" value="${value.replace(/"/g, '&quot;')}">
            <button type="button" class="remove-row-btn" title="Remove" aria-label="Remove entry">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>`;
        row.querySelector('.remove-row-btn').addEventListener('click', () => {
            row.remove();
            triggerAutoSave();
        });
        row.querySelector('input').addEventListener('input', triggerAutoSave);
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
        clearDynamicContainer('authors-container');
        clearDynamicContainer('topics-container');
        clearDynamicContainer('keywords-container');
        const authors = data.authors || [];
        const topics = data.topics || [];
        const keywords = data.keywords || [];
        if (authors.length === 0) createDynamicRow('authors-container', 'e.g., Reyes, A.');
        else authors.forEach(a => createDynamicRow('authors-container', 'e.g., Reyes, A.', a));
        if (topics.length > 0) topics.forEach(t => createDynamicRow('topics-container', 'e.g., Machine Learning', t));
        if (keywords.length > 0) keywords.forEach(k => createDynamicRow('keywords-container', 'e.g., Python', k));
    }

    // Auto-save timer
    let autoSaveTimer = null;
    function triggerAutoSave() {
        const toggle = document.getElementById('project-autosave-toggle');
        if (!toggle || !toggle.checked) return;
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
            const projectId = document.getElementById('project-id-input').value;
            if (!projectId) {
                // Draft auto-save to localStorage for new projects
                const draft = {
                    title: document.getElementById('project-title-input').value,
                    authors: getDynamicValues('authors-container'),
                    adviser: document.getElementById('project-adviser-input').value,
                    year: document.getElementById('project-year-input').value,
                    program: document.getElementById('project-program-select').value,
                    status: document.getElementById('project-status-select').value,
                    abstract: document.getElementById('project-abstract-input').value,
                    topics: getDynamicValues('topics-container'),
                    keywords: getDynamicValues('keywords-container'),
                    keyFindings: document.getElementById('project-findings-input').value
                };
                localStorage.setItem('admin_project_draft', JSON.stringify(draft));
                showToast('Draft auto-saved', '💾');
            }
        }, 1500);
    }

    // Auto-save toggle visual
    const autoSaveToggle = document.getElementById('project-autosave-toggle');
    if (autoSaveToggle) {
        autoSaveToggle.addEventListener('change', () => {
            const track = autoSaveToggle.nextElementSibling;
            const thumb = track && track.querySelector('.auto-save-switch-thumb');
            if (autoSaveToggle.checked) {
                if (track) track.style.background = 'var(--admin-primary)';
                if (thumb) thumb.style.transform = 'translateX(22px)';
            } else {
                if (track) track.style.background = 'var(--border)';
                if (thumb) thumb.style.transform = 'translateX(0)';
            }
        });
        // Init visual state
        const track = autoSaveToggle.nextElementSibling;
        const thumb = track && track.querySelector('.auto-save-switch-thumb');
        if (autoSaveToggle.checked) {
            if (track) track.style.background = 'var(--admin-primary)';
            if (thumb) thumb.style.transform = 'translateX(22px)';
        }
    }

    // ===== Add/Remove dynamic rows via buttons =====
    const addAuthorBtn = document.getElementById('add-author-btn');
    if (addAuthorBtn) addAuthorBtn.addEventListener('click', () => createDynamicRow('authors-container', 'e.g., Reyes, A.'));
    const addTopicBtn = document.getElementById('add-topic-btn');
    if (addTopicBtn) addTopicBtn.addEventListener('click', () => createDynamicRow('topics-container', 'e.g., Machine Learning'));
    const addKeywordBtn = document.getElementById('add-keyword-btn');
    if (addKeywordBtn) addKeywordBtn.addEventListener('click', () => createDynamicRow('keywords-container', 'e.g., Python'));

    // ===== Add Project Button =====
    const addProjectBtn = document.getElementById('add-project-btn');
    if (addProjectBtn) {
        addProjectBtn.addEventListener('click', () => {
            // Reset edit mode
            isEditMode = false;
            originalFormData = {};
            
            // Reset form fields
            document.getElementById('project-id-input').value = '';
            document.getElementById('project-title-input').value = '';
            document.getElementById('project-program-select').value = '';
            document.getElementById('project-year-input').value = new Date().getFullYear();
            document.getElementById('project-adviser-input').value = '';
            document.getElementById('project-status-select').value = 'Completed';
            document.getElementById('project-abstract-input').value = '';
            document.getElementById('project-findings-input').value = '';

            // Check for autosaved draft
            const draft = localStorage.getItem('admin_project_draft');
            if (draft) {
                try {
                    const d = JSON.parse(draft);
                    document.getElementById('project-title-input').value = d.title || '';
                    document.getElementById('project-adviser-input').value = d.adviser || '';
                    document.getElementById('project-year-input').value = d.year || new Date().getFullYear();
                    document.getElementById('project-program-select').value = d.program || '';
                    document.getElementById('project-status-select').value = d.status || 'Completed';
                    document.getElementById('project-abstract-input').value = d.abstract || '';
                    document.getElementById('project-findings-input').value = d.keyFindings || '';
                    initDynamicContainers({ authors: d.authors || [], topics: d.topics || [], keywords: d.keywords || [] });
                    showToast('Draft restored ✨', 'ℹ️');
                } catch { initDynamicContainers(); }
            } else {
                initDynamicContainers();
            }

            // Customize modal for creating
            document.getElementById('project-modal-title').textContent = 'Add New Project';
            document.getElementById('submit-project-btn').textContent = 'Save Project';
            
            // Update button visibility
            updateButtonVisibility();

            // Show modal
            document.getElementById('project-modal').classList.add('active');
        });
    }

    // ===== Year Selector Functionality =====
    const yearInput = document.getElementById('project-year-input');
    const yearBtnUp = document.querySelector('.year-btn-up');
    const yearBtnDown = document.querySelector('.year-btn-down');
    const MIN_YEAR = 2023;
    const MAX_YEAR = 2100;

    // Set default year to current year if empty
    if (yearInput && !yearInput.value) {
        yearInput.value = new Date().getFullYear();
    }

    // Year up button
    if (yearBtnUp) {
        yearBtnUp.addEventListener('click', (e) => {
            e.preventDefault();
            let currentYear = parseInt(yearInput.value) || new Date().getFullYear();
            if (currentYear < MAX_YEAR) {
                yearInput.value = currentYear + 1;
                // Trigger ripple effect
                createRipple(e, yearBtnUp);
            }
        });
    }

    // Year down button
    if (yearBtnDown) {
        yearBtnDown.addEventListener('click', (e) => {
            e.preventDefault();
            let currentYear = parseInt(yearInput.value) || new Date().getFullYear();
            if (currentYear > MIN_YEAR) {
                yearInput.value = currentYear - 1;
                // Trigger ripple effect
                createRipple(e, yearBtnDown);
            }
        });
    }

    // Optional: Keyboard support for year input
    if (yearInput) {
        yearInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                let currentYear = parseInt(yearInput.value) || new Date().getFullYear();
                if (currentYear < MAX_YEAR) {
                    yearInput.value = currentYear + 1;
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                let currentYear = parseInt(yearInput.value) || new Date().getFullYear();
                if (currentYear > MIN_YEAR) {
                    yearInput.value = currentYear - 1;
                }
            }
        });
    }

    // Ripple effect helper function
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
        
        setTimeout(() => {
            ripple.remove();
        }, 600);
    }

    // ===== Project Modal Handlers =====
    const projectModal = document.getElementById('project-modal');
    const projectForm = document.getElementById('project-form');
    const cancelProjectBtn = document.getElementById('cancel-project-btn');
    const projectModalCloseBtn = document.getElementById('project-modal-close-btn');
    const projectModalOverlay = document.getElementById('project-modal-overlay');
    const clearProjectBtn = document.getElementById('clear-project-btn');
    const submitProjectBtn = document.getElementById('submit-project-btn');

    // Track original form state for change detection
    let originalFormData = {};
    let isEditMode = false;

    // Check if form has any values
    function hasFormValues() {
        const title = document.getElementById('project-title-input')?.value.trim();
        const authors = getDynamicValues('authors-container');
        const program = document.getElementById('project-program-select')?.value;
        const year = document.getElementById('project-year-input')?.value;
        const adviser = document.getElementById('project-adviser-input')?.value.trim();
        const abstract = document.getElementById('project-abstract-input')?.value.trim();
        const topics = getDynamicValues('topics-container');
        const keywords = getDynamicValues('keywords-container');
        const keyFindings = document.getElementById('project-findings-input')?.value.trim();

        return title || authors.length > 0 || program || adviser || abstract || 
               topics.length > 0 || keywords.length > 0 || keyFindings;
    }

    // Check if form has changes from original data
    function hasFormChanges() {
        if (!isEditMode) return false;

        const currentData = {
            title: document.getElementById('project-title-input')?.value.trim() || '',
            authors: getDynamicValues('authors-container'),
            program: document.getElementById('project-program-select')?.value || '',
            year: parseInt(document.getElementById('project-year-input')?.value || '0'),
            adviser: document.getElementById('project-adviser-input')?.value.trim() || '',
            status: document.getElementById('project-status-select')?.value || '',
            abstract: document.getElementById('project-abstract-input')?.value.trim() || '',
            keyFindings: document.getElementById('project-findings-input')?.value.trim() || '',
            topics: getDynamicValues('topics-container'),
            keywords: getDynamicValues('keywords-container')
        };

        // Compare with original
        if (currentData.title !== originalFormData.title) return true;
        if (JSON.stringify(currentData.authors) !== JSON.stringify(originalFormData.authors)) return true;
        if (currentData.program !== originalFormData.program) return true;
        if (currentData.year !== originalFormData.year) return true;
        if (currentData.adviser !== originalFormData.adviser) return true;
        if (currentData.status !== originalFormData.status) return true;
        if (currentData.abstract !== originalFormData.abstract) return true;
        if (currentData.keyFindings !== originalFormData.keyFindings) return true;
        if (JSON.stringify(currentData.topics) !== JSON.stringify(originalFormData.topics)) return true;
        if (JSON.stringify(currentData.keywords) !== JSON.stringify(originalFormData.keywords)) return true;

        return false;
    }

    // Get changed fields with old and new values
    function getChangedFields() {
        const changes = [];
        const currentData = {
            title: document.getElementById('project-title-input')?.value.trim() || '',
            authors: getDynamicValues('authors-container'),
            program: document.getElementById('project-program-select')?.value || '',
            year: parseInt(document.getElementById('project-year-input')?.value || '0'),
            adviser: document.getElementById('project-adviser-input')?.value.trim() || '',
            status: document.getElementById('project-status-select')?.value || '',
            abstract: document.getElementById('project-abstract-input')?.value.trim() || '',
            keyFindings: document.getElementById('project-findings-input')?.value.trim() || '',
            topics: getDynamicValues('topics-container'),
            keywords: getDynamicValues('keywords-container')
        };

        if (currentData.title !== originalFormData.title) {
            changes.push({ field: 'Title', old: originalFormData.title, new: currentData.title });
        }
        if (JSON.stringify(currentData.authors) !== JSON.stringify(originalFormData.authors)) {
            changes.push({ 
                field: 'Authors', 
                old: originalFormData.authors.join(', ') || 'None', 
                new: currentData.authors.join(', ') || 'None'
            });
        }
        if (currentData.program !== originalFormData.program) {
            changes.push({ field: 'Program', old: originalFormData.program, new: currentData.program });
        }
        if (currentData.year !== originalFormData.year) {
            changes.push({ field: 'Year', old: originalFormData.year, new: currentData.year });
        }
        if (currentData.adviser !== originalFormData.adviser) {
            changes.push({ field: 'Adviser', old: originalFormData.adviser, new: currentData.adviser });
        }
        if (currentData.status !== originalFormData.status) {
            changes.push({ field: 'Status', old: originalFormData.status, new: currentData.status });
        }
        if (currentData.abstract !== originalFormData.abstract) {
            changes.push({ 
                field: 'Abstract', 
                old: originalFormData.abstract ? (originalFormData.abstract.substring(0, 100) + '...') : 'None', 
                new: currentData.abstract ? (currentData.abstract.substring(0, 100) + '...') : 'None'
            });
        }
        if (currentData.keyFindings !== originalFormData.keyFindings) {
            changes.push({ 
                field: 'Key Findings', 
                old: originalFormData.keyFindings || 'None', 
                new: currentData.keyFindings || 'None'
            });
        }
        if (JSON.stringify(currentData.topics) !== JSON.stringify(originalFormData.topics)) {
            changes.push({ 
                field: 'Topics', 
                old: originalFormData.topics.join(', ') || 'None', 
                new: currentData.topics.join(', ') || 'None'
            });
        }
        if (JSON.stringify(currentData.keywords) !== JSON.stringify(originalFormData.keywords)) {
            changes.push({ 
                field: 'Keywords', 
                old: originalFormData.keywords.join(', ') || 'None', 
                new: currentData.keywords.join(', ') || 'None'
            });
        }

        return changes;
    }

    // Update button visibility
    function updateButtonVisibility() {
        const hasValues = hasFormValues();
        const hasChanges = hasFormChanges();

        // Clear button: only show if form has values
        if (clearProjectBtn) {
            clearProjectBtn.style.display = hasValues ? 'inline-flex' : 'none';
        }

        // Submit button: 
        // - In edit mode: only show if there are changes
        // - In create mode: always show
        if (submitProjectBtn && isEditMode) {
            submitProjectBtn.style.display = hasChanges ? 'inline-flex' : 'none';
            submitProjectBtn.textContent = 'Apply Edit';
        } else if (submitProjectBtn) {
            submitProjectBtn.style.display = 'inline-flex';
            submitProjectBtn.textContent = 'Save Project';
        }
    }

    // Monitor form changes
    function setupFormChangeMonitoring() {
        if (!projectForm) return;

        // Monitor all input changes
        projectForm.addEventListener('input', updateButtonVisibility);
        projectForm.addEventListener('change', updateButtonVisibility);
        
        // Monitor dynamic field changes
        const authorsContainer = document.getElementById('authors-container');
        const topicsContainer = document.getElementById('topics-container');
        const keywordsContainer = document.getElementById('keywords-container');
        
        if (authorsContainer) {
            const observer = new MutationObserver(updateButtonVisibility);
            observer.observe(authorsContainer, { childList: true, subtree: true });
        }
        if (topicsContainer) {
            const observer = new MutationObserver(updateButtonVisibility);
            observer.observe(topicsContainer, { childList: true, subtree: true });
        }
        if (keywordsContainer) {
            const observer = new MutationObserver(updateButtonVisibility);
            observer.observe(keywordsContainer, { childList: true, subtree: true });
        }
    }

    // Initialize form monitoring
    setupFormChangeMonitoring();

    const closeProjectModal = () => {
        if (projectModal) {
            projectModal.classList.remove('active');
            if (projectForm) projectForm.reset();
            clearDynamicContainer('authors-container');
            clearDynamicContainer('topics-container');
            clearDynamicContainer('keywords-container');
            clearTimeout(autoSaveTimer);
            
            // Reset edit mode and original data
            isEditMode = false;
            originalFormData = {};
            
            // Reset button visibility
            if (clearProjectBtn) clearProjectBtn.style.display = 'none';
            if (submitProjectBtn) submitProjectBtn.style.display = 'inline-flex';
        }
    };

    if (cancelProjectBtn) cancelProjectBtn.addEventListener('click', closeProjectModal);
    if (projectModalCloseBtn) projectModalCloseBtn.addEventListener('click', closeProjectModal);
    if (projectModalOverlay) {
        projectModalOverlay.addEventListener('click', (e) => {
            // Only close if clicking directly on the overlay, not on modal content or its children
            if (e.target === projectModalOverlay) {
                closeProjectModal();
            }
        });
    }

    // Clear button handler (already declared above)
    if (clearProjectBtn) {
        clearProjectBtn.addEventListener('click', () => {
            // Show confirmation modal
            showConfirmationModal(
                '⚠️ Clear Form',
                'Are you sure you want to clear all form data? This action cannot be undone.',
                null,
                () => {
                    if (projectForm) projectForm.reset();
                    clearDynamicContainer('authors-container');
                    clearDynamicContainer('topics-container');
                    clearDynamicContainer('keywords-container');
                    createDynamicRow('authors-container', 'e.g., Reyes, A.');
                    localStorage.removeItem('admin_project_draft');
                    showToast('Form cleared', '✅');
                    updateButtonVisibility();
                },
                'Clear Form',
                'btn-danger'
            );
        });
    }

    if (projectForm) {
        projectForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const projectId = document.getElementById('project-id-input').value;
            const title = document.getElementById('project-title-input').value.trim();
            const authors = getDynamicValues('authors-container');
            const program = document.getElementById('project-program-select').value;
            const year = parseInt(document.getElementById('project-year-input').value.trim(), 10);
            const adviser = document.getElementById('project-adviser-input').value.trim();
            const status = document.getElementById('project-status-select').value;
            const abstract = document.getElementById('project-abstract-input').value.trim();
            const topics = getDynamicValues('topics-container');
            const keywords = getDynamicValues('keywords-container');
            const keyFindings = document.getElementById('project-findings-input').value.trim();

            // Validation
            if (authors.length === 0) {
                showToast('Please add at least one author', '⚠️');
                return;
            }

            try {
                if (projectId) {
                    // EDIT MODE: Show confirmation with changes
                    const changes = getChangedFields();
                    
                    if (changes.length === 0) {
                        showToast('No changes detected', 'ℹ️');
                        return;
                    }

                    // Build changes HTML
                    let changesHTML = '';
                    changes.forEach(change => {
                        changesHTML += `
                            <div class="change-item">
                                <div class="change-label">${change.field}:</div>
                                <div class="change-value">
                                    <div class="change-old">${escapeHtml(change.old)}</div>
                                    <div class="change-new">${escapeHtml(change.new)}</div>
                                </div>
                            </div>
                        `;
                    });

                    showConfirmationModal(
                        '📝 Confirm Changes',
                        `You are about to update <strong>${changes.length}</strong> field${changes.length > 1 ? 's' : ''} in this project:`,
                        changesHTML,
                        async () => {
                            // User confirmed, proceed with update
                            showToast('Updating project...', 'ℹ️');
                            await performProjectUpdate(projectId, title, authors, program, year, adviser, status, abstract, topics, keywords, keyFindings);
                        },
                        'Apply Changes',
                        'btn-primary'
                    );
                } else {
                    // CREATE MODE: Proceed directly
                    showToast('Creating project...', 'ℹ️');
                    await performProjectCreate(title, authors, program, year, adviser, status, abstract, topics, keywords, keyFindings);
                }
            } catch (error) {
                console.error('Error in form submission:', error);
                showToast('Error: ' + error.message, '❌');
            }
        });
    }

    // Separate function for performing project update
    async function performProjectUpdate(projectId, title, authors, program, year, adviser, status, abstract, topics, keywords, keyFindings) {
        try {
            // Fetch existing data
            const currentDoc = await db.collection('projects').doc(projectId).get();
            if (!currentDoc.exists) {
                showToast('Project not found to update', '❌');
                return;
            }
            const oldData = currentDoc.data();
            
            const changedFields = [];
            
            if ((oldData.title || '') !== title) changedFields.push('title');
            
            const oldAuthorsStr = Array.isArray(oldData.authors) ? oldData.authors.join(',') : (oldData.authors || '');
            const newAuthorsStr = authors.join(',');
            if (oldAuthorsStr !== newAuthorsStr) changedFields.push('authors');
            
            if ((oldData.program || '') !== program) changedFields.push('program');
            if (parseInt(oldData.year, 10) !== year) changedFields.push('year');
            if ((oldData.adviser || '') !== adviser) changedFields.push('adviser');
            if ((oldData.status || '') !== status) changedFields.push('status');
            if ((oldData.abstract || '') !== abstract) changedFields.push('abstract');
            if ((oldData.keyFindings || '') !== keyFindings) changedFields.push('keyFindings');
            if (JSON.stringify(oldData.topics || []) !== JSON.stringify(topics)) changedFields.push('topics');
            if (JSON.stringify(oldData.keywords || []) !== JSON.stringify(keywords)) changedFields.push('keywords');

            // Update Firestore
            const updatedData = {
                title,
                authors,
                program,
                year,
                adviser,
                status,
                abstract,
                topics,
                keywords,
                keyFindings,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await db.collection('projects').doc(projectId).update(updatedData);

                    // Update Realtime Database
                    if (changedFields.length > 0 && rtdb) {
                        try {
                            const recentRef = rtdb.ref('recent update');
                            const prevRef = rtdb.ref('prev update');
                            const counterRef = rtdb.ref('update_counter');
                            
                            // Fetch and increment the update counter
                            const counterSnapshot = await counterRef.once('value');
                            const currentCounter = counterSnapshot.val() || 0;
                            const nextUpdateId = currentCounter + 1;
                            
                            // Save updated counter
                            await counterRef.set(nextUpdateId);
                            
                            const snapshot = await recentRef.once('value');
                            const currentRecent = snapshot.val();
                            
                            if (currentRecent) {
                                await prevRef.set(currentRecent);
                            }
                            
                            const newUpdate = {
                                UpdateID: nextUpdateId,
                                DocID: projectId,
                                timestamp_updated: new Date().toISOString(),
                                field_updated: changedFields
                            };
                            await recentRef.set(newUpdate);
                            console.log('RTDB update logged:', newUpdate);
                            console.log('RTDB target path:', recentRef.toString());
                        } catch (rtdbErr) {
                            console.error('Error logging update to RTDB:', rtdbErr);
                        }
                    }

                    showToast('Project updated successfully', '✅');
                    closeProjectModal();
                    await loadProjectsData();
                    await loadDashboardData();
                } catch (error) {
                    console.error('Error updating project:', error);
                    showToast('Error updating project: ' + error.message, '❌');
                }
    }

    // Separate function for performing project creation
    async function performProjectCreate(title, authors, program, year, adviser, status, abstract, topics, keywords, keyFindings) {
        try {
            // Create in Firestore
            const newProject = {
                title,
                authors,
                program,
                year,
                adviser,
                status,
                abstract,
                topics,
                keywords,
                keyFindings,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            const docRef = await db.collection('projects').add(newProject);

            // Update Realtime Database count
            if (rtdb) {
                try {
                    const countSnapshot = await db.collection('projects').get();
                    const newCount = countSnapshot.size;
                    await rtdb.ref('projects_document_count').set(newCount);
                    console.log('RTDB project count updated to:', newCount);
                } catch (rtdbErr) {
                    console.error('Error updating RTDB project count:', rtdbErr);
                }
            }

            showToast('Project created successfully', '✅');
            // Clear auto-saved draft
            localStorage.removeItem('admin_project_draft');
            closeProjectModal();
            await loadProjectsData();
            await loadDashboardData();
        } catch (error) {
            console.error('Error creating project:', error);
            showToast('Error creating project: ' + error.message, '❌');
        }
    }

    // ===== Filter Pills Functionality =====
    const projectFilters = document.querySelectorAll('#project-filters .filter-pill');
    projectFilters.forEach(pill => {
        pill.addEventListener('click', () => {
            const filter = pill.dataset.filter;
            
            if (filter === 'all') {
                // If "All Projects" is clicked, deselect all others and activate only this
                projectFilters.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
            } else {
                // Toggle the clicked pill
                pill.classList.toggle('active');
                
                // Deactivate "All Projects" when any specific filter is selected
                const allPill = document.querySelector('#project-filters .filter-pill[data-filter="all"]');
                if (allPill && pill.classList.contains('active')) {
                    allPill.classList.remove('active');
                }
                
                // If no specific filters are active, reactivate "All Projects"
                const activeSpecificFilters = Array.from(projectFilters).filter(p => 
                    p.dataset.filter !== 'all' && p.classList.contains('active')
                );
                if (activeSpecificFilters.length === 0 && allPill) {
                    allPill.classList.add('active');
                }
            }
            
            // Apply filters
            applyProjectFilters();
        });
    });

    function applyProjectFilters() {
        const tbody = document.getElementById('projects-table-body');
        if (!tbody) return;
        
        const rows = tbody.getElementsByTagName('tr');
        const activeFilters = Array.from(projectFilters).filter(p => p.classList.contains('active'));
        const filterValues = activeFilters.map(p => p.dataset.filter);
        
        // Check if "All" is active
        const showAll = filterValues.includes('all');
        const hasRecent = filterValues.includes('recent');
        const programFilters = filterValues.filter(f => f !== 'all' && f !== 'recent');
        
        Array.from(rows).forEach(row => {
            // Skip loading/error rows
            if (row.classList.contains('table-loading') || row.classList.contains('table-error') || row.classList.contains('table-empty')) {
                return;
            }
            
            let shouldShow = false;
            
            if (showAll) {
                // Show all projects
                shouldShow = true;
            } else {
                // Check program filters
                const programCell = row.cells[2];
                const programMatch = programFilters.length === 0 || (programCell && programFilters.some(filter => {
                    const cellText = programCell.textContent.trim();
                    return cellText === filter || cellText.startsWith(filter);
                }));
                
                // Check recent filter (last 30 days)
                let recentMatch = true;
                if (hasRecent) {
                    const createdAtTimestamp = row.getAttribute('data-created-at');
                    if (createdAtTimestamp) {
                        const projectDate = new Date(parseInt(createdAtTimestamp));
                        const thirtyDaysAgo = new Date();
                        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                        recentMatch = !isNaN(projectDate.getTime()) && projectDate >= thirtyDaysAgo;
                    } else {
                        recentMatch = false;
                    }
                }
                
                // Show row if it matches program AND recent filter (if active)
                shouldShow = programMatch && (!hasRecent || recentMatch);
            }
            
            row.style.display = shouldShow ? '' : 'none';
        });
        
        // Count visible rows
        const visibleRows = Array.from(rows).filter(row => 
            row.style.display !== 'none' && 
            !row.classList.contains('table-loading') && 
            !row.classList.contains('table-error') &&
            !row.classList.contains('table-empty')
        ).length;
        
        // Show toast with active filters
        const activeFilterNames = activeFilters.map(p => p.textContent).join(', ');
        showToast(`Showing ${visibleRows} project${visibleRows !== 1 ? 's' : ''}: ${activeFilterNames}`, 'ℹ️');
    }

    const userFilters = document.querySelectorAll('#user-filters .filter-pill');
    userFilters.forEach(pill => {
        pill.addEventListener('click', () => {
            // Update active state
            userFilters.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            
            const filter = pill.dataset.filter;
            const tbody = document.getElementById('users-table-body');
            const rows = tbody.getElementsByTagName('tr');
            
            Array.from(rows).forEach(row => {
                if (filter === 'all') {
                    row.style.display = '';
                } else {
                    const typeCell = row.cells[2];
                    if (typeCell) {
                        const typeText = typeCell.textContent.toLowerCase();
                        row.style.display = typeText.includes(filter) ? '' : 'none';
                    }
                }
            });
            
            showToast(`Filtered: ${pill.textContent}`, 'ℹ️');
        });
    });

    // ===== Search Functionality =====
    const projectsSearch = document.getElementById('projects-search');
    if (projectsSearch) {
        projectsSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const tbody = document.getElementById('projects-table-body');
            const rows = tbody.getElementsByTagName('tr');

            Array.from(rows).forEach(row => {
                const text = row.textContent.toLowerCase();
                if (text.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }

    const usersSearch = document.getElementById('users-search');
    if (usersSearch) {
        usersSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const tbody = document.getElementById('users-table-body');
            const rows = tbody.getElementsByTagName('tr');

            Array.from(rows).forEach(row => {
                const text = row.textContent.toLowerCase();
                if (text.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }

    // ===== Refresh Dashboard =====
    const refreshDashboardBtn = document.getElementById('refresh-dashboard-btn');
    if (refreshDashboardBtn) {
        refreshDashboardBtn.addEventListener('click', async () => {
            refreshDashboardBtn.disabled = true;
            refreshDashboardBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                Refreshing...
            `;
            
            await loadDashboardData();
            
            setTimeout(() => {
                refreshDashboardBtn.disabled = false;
                refreshDashboardBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                    Refresh
                `;
                showToast('Dashboard refreshed successfully', '✅');
            }, 500);
        });
    }

    // ===== Keyboard Shortcuts =====
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + K for search focus
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const activeSection = document.querySelector('.content-section.active');
            const searchInput = activeSection?.querySelector('input[type="text"]');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }

        // Escape to close sidebar on mobile
        if (e.key === 'Escape') {
            if (window.innerWidth <= 1024 && sidebar) {
                sidebar.classList.remove('mobile-open');
            }
        }
    });

    // ===== Click outside to close sidebar on mobile =====
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 1024) {
            if (sidebar && menuToggleBtn && !sidebar.contains(e.target) && !menuToggleBtn.contains(e.target)) {
                sidebar.classList.remove('mobile-open');
            }
        }
    });

    // ===== Settings Functionality =====
    const changePasswordBtn = document.getElementById('change-password-btn');
    const updateProfileBtn = document.getElementById('update-profile-btn');

    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', () => {
            showToast('Password change feature coming soon', 'ℹ️');
        });
    }

    if (updateProfileBtn) {
        updateProfileBtn.addEventListener('click', () => {
            showToast('Profile update feature coming soon', 'ℹ️');
        });
    }

    // ===== Export Analytics Functionality =====
    const exportAnalyticsBtn = document.getElementById('export-analytics-btn');
    if (exportAnalyticsBtn) {
        exportAnalyticsBtn.addEventListener('click', async () => {
            try {
                showToast('Generating report...', 'ℹ️');
                
                const projectsSnapshot = await db.collection('projects').get();
                const usersSnapshot = await db.collection('users').get();
                
                // Prepare CSV data
                let csvContent = "data:text/csv;charset=utf-8,";
                
                // Summary statistics
                csvContent += "RE-CAPS Analytics Report\n";
                csvContent += `Generated on: ${new Date().toLocaleString()}\n\n`;
                csvContent += "=== SUMMARY STATISTICS ===\n";
                csvContent += `Total Projects,${projectsSnapshot.size}\n`;
                csvContent += `Total Users,${usersSnapshot.size}\n`;
                csvContent += `Admin Users,${usersSnapshot.docs.filter(d => d.data().userType === 'admin').length}\n`;
                csvContent += `Librarian Users,${usersSnapshot.docs.filter(d => d.data().userType === 'librarian').length}\n`;
                csvContent += `Student Users,${usersSnapshot.docs.filter(d => d.data().userType === 'student').length}\n\n`;
                
                // Projects by Year
                csvContent += "=== PROJECTS BY YEAR ===\n";
                csvContent += "Year,Count\n";
                const projectsByYear = {};
                projectsSnapshot.docs.forEach(doc => {
                    const year = doc.data().year || 'Unknown';
                    projectsByYear[year] = (projectsByYear[year] || 0) + 1;
                });
                Object.entries(projectsByYear).sort((a, b) => b[0].localeCompare(a[0])).forEach(([year, count]) => {
                    csvContent += `${year},${count}\n`;
                });
                csvContent += "\n";
                
                // Projects by Program
                csvContent += "=== PROJECTS BY PROGRAM ===\n";
                csvContent += "Program,Count\n";
                const projectsByProgram = {};
                projectsSnapshot.docs.forEach(doc => {
                    const program = doc.data().program || 'Unknown';
                    projectsByProgram[program] = (projectsByProgram[program] || 0) + 1;
                });
                Object.entries(projectsByProgram).sort((a, b) => b[1] - a[1]).forEach(([program, count]) => {
                    csvContent += `${program},${count}\n`;
                });
                csvContent += "\n";
                
                // All Projects Details
                csvContent += "=== ALL PROJECTS ===\n";
                csvContent += "Title,Authors,Program,Year,Created Date\n";
                projectsSnapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const title = (data.title || 'Untitled').replace(/,/g, ';');
                    const authors = ((data.authors || []).join('; ') || 'N/A').replace(/,/g, ';');
                    const program = data.program || 'N/A';
                    const year = data.year || 'N/A';
                    const created = formatDate(data.createdAt);
                    csvContent += `"${title}","${authors}",${program},${year},${created}\n`;
                });
                
                // Create download link
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", `RE-CAPS_Analytics_${new Date().toISOString().split('T')[0]}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                showToast('✅ Report exported successfully!', '✅');
            } catch (error) {
                console.error('Export error:', error);
                showToast('Error exporting report', '❌');
            }
        });
    }

    // ===== Real-time Listeners =====
    let unsubscribeProjects = null;
    let unsubscribeUsers = null;

    function setupRealtimeListeners() {
        // Real-time projects listener
        if (unsubscribeProjects) unsubscribeProjects();
        unsubscribeProjects = db.collection('projects').onSnapshot(
            (snapshot) => {
                console.log('Projects updated in real-time');
                const activeSection = document.querySelector('.content-section.active');
                if (activeSection && activeSection.id === 'section-projects') {
                    loadProjectsData();
                }
                // Update dashboard stats if on dashboard
                if (activeSection && activeSection.id === 'section-dashboard') {
                    updateDashboardStats();
                }
            },
            (error) => {
                console.warn('Real-time projects listener error:', error);
            }
        );

        // Real-time users listener
        if (unsubscribeUsers) unsubscribeUsers();
        unsubscribeUsers = db.collection('users').onSnapshot(
            (snapshot) => {
                console.log('Users updated in real-time');
                const activeSection = document.querySelector('.content-section.active');
                if (activeSection && activeSection.id === 'section-users') {
                    loadUsersData();
                }
                // Update dashboard stats if on dashboard
                if (activeSection && activeSection.id === 'section-dashboard') {
                    updateDashboardStats();
                }
            },
            (error) => {
                console.warn('Real-time users listener error:', error);
            }
        );

        console.log('Real-time listeners activated ✓');
    }

    // Quick stats update function (lighter than full reload)
    async function updateDashboardStats() {
        try {
            const projectsSnapshot = await db.collection('projects').get();
            const usersSnapshot = await db.collection('users').get();

            const totalProjects = projectsSnapshot.size;
            const totalUsers = usersSnapshot.size;
            const studentUsers = usersSnapshot.docs.filter(doc => doc.data().userType === 'student').length;
            const librarianUsers = usersSnapshot.docs.filter(doc => doc.data().userType === 'librarian').length;

            document.getElementById('total-projects-stat').textContent = totalProjects;
            document.getElementById('total-users-stat').textContent = totalUsers;
            document.getElementById('student-users-stat').textContent = `${studentUsers} Students / ${librarianUsers} Librarians`;
            document.getElementById('recent-activity-stat').textContent = totalProjects + totalUsers;
        } catch (error) {
            console.warn('Stats update failed:', error);
        }
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (unsubscribeProjects) unsubscribeProjects();
        if (unsubscribeUsers) unsubscribeUsers();
    });

    // ===== Table Sorting =====
    window.sortTable = (tableId, columnIndex, dataType = 'string') => {
        const table = document.getElementById(tableId);
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const header = table.querySelectorAll('thead th')[columnIndex];
        
        // Remove sort classes from all headers
        table.querySelectorAll('thead th').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
        });
        
        // Determine sort direction
        const currentSort = header.dataset.sortDirection || 'none';
        const newSort = currentSort === 'asc' ? 'desc' : 'asc';
        header.dataset.sortDirection = newSort;
        header.classList.add(`sort-${newSort}`);
        
        // Sort rows
        rows.sort((a, b) => {
            const aText = a.cells[columnIndex]?.textContent.trim() || '';
            const bText = b.cells[columnIndex]?.textContent.trim() || '';
            
            let comparison = 0;
            if (dataType === 'number') {
                const aNum = parseFloat(aText.replace(/[^0-9.-]/g, '')) || 0;
                const bNum = parseFloat(bText.replace(/[^0-9.-]/g, '')) || 0;
                comparison = aNum - bNum;
            } else if (dataType === 'date') {
                const aDate = new Date(aText);
                const bDate = new Date(bText);
                comparison = aDate - bDate;
            } else {
                comparison = aText.localeCompare(bText);
            }
            
            return newSort === 'asc' ? comparison : -comparison;
        });
        
        // Re-append sorted rows
        rows.forEach(row => tbody.appendChild(row));
        
        showToast(`Sorted by ${header.textContent} (${newSort === 'asc' ? 'A-Z' : 'Z-A'})`, 'ℹ️');
    };

    // ===== Initial Load =====
    await loadDashboardData();
    
    // Setup real-time listeners
    setupRealtimeListeners();

    // ===== Create Librarian Functionality =====
    const createLibrarianBtn = document.getElementById('create-librarian-btn');
    const createLibrarianModal = document.getElementById('create-librarian-modal');
    const modalOverlay = document.getElementById('modal-overlay');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const cancelLibrarianBtn = document.getElementById('cancel-librarian-btn');
    const createLibrarianForm = document.getElementById('create-librarian-form');

    // Open modal
    if (createLibrarianBtn) {
        createLibrarianBtn.addEventListener('click', () => {
            createLibrarianModal.classList.add('active');
            document.body.style.overflow = 'hidden'; // Prevent background scroll
            
            // Reset button visibility
            updateLibrarianButtonVisibility();
        });
    }

    // Close modal function
    function closeLibrarianModal() {
        createLibrarianModal.classList.remove('active');
        document.body.style.overflow = ''; // Restore scroll
        createLibrarianForm.reset();
        
        // Reset button visibility
        if (clearLibrarianBtn) clearLibrarianBtn.style.display = 'none';
    }

    // Close modal events
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            // Only close if clicking directly on the overlay, not on modal content or its children
            if (e.target === modalOverlay) {
                closeLibrarianModal();
            }
        });
    }

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeLibrarianModal);
    }

    if (cancelLibrarianBtn) {
        cancelLibrarianBtn.addEventListener('click', closeLibrarianModal);
    }

    // Clear librarian form with confirmation
    const clearLibrarianBtn = document.getElementById('clear-librarian-btn');
    const submitLibrarianBtn = document.getElementById('submit-librarian-btn');
    
    // Check if librarian form has values
    function hasLibrarianFormValues() {
        const name = document.getElementById('librarian-name')?.value.trim();
        const email = document.getElementById('librarian-email')?.value.trim();
        const password = document.getElementById('librarian-password')?.value;
        const confirmPassword = document.getElementById('librarian-confirm-password')?.value;
        
        return name || email || password || confirmPassword;
    }
    
    // Update librarian button visibility
    function updateLibrarianButtonVisibility() {
        const hasValues = hasLibrarianFormValues();
        if (clearLibrarianBtn) {
            clearLibrarianBtn.style.display = hasValues ? 'inline-flex' : 'none';
        }
    }
    
    // Monitor librarian form changes
    if (createLibrarianForm) {
        createLibrarianForm.addEventListener('input', updateLibrarianButtonVisibility);
        createLibrarianForm.addEventListener('change', updateLibrarianButtonVisibility);
    }
    
    if (clearLibrarianBtn) {
        clearLibrarianBtn.addEventListener('click', () => {
            showConfirmationModal(
                '⚠️ Clear Form',
                'Are you sure you want to clear all form data? This action cannot be undone.',
                null,
                () => {
                    if (createLibrarianForm) createLibrarianForm.reset();
                    showToast('Form cleared', '✅');
                    updateLibrarianButtonVisibility();
                },
                'Clear Form',
                'btn-danger'
            );
        });
    }

    // Handle form submission
    if (createLibrarianForm) {
        createLibrarianForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('librarian-name').value.trim();
            const email = document.getElementById('librarian-email').value.trim();
            const password = document.getElementById('librarian-password').value;
            const confirmPassword = document.getElementById('librarian-confirm-password').value;
            const submitBtn = document.getElementById('submit-librarian-btn');

            // Validation
            if (!name || !email || !password || !confirmPassword) {
                showToast('Please fill in all fields', '❌');
                return;
            }

            if (password.length < 6) {
                showToast('Password must be at least 6 characters', '❌');
                return;
            }

            if (password !== confirmPassword) {
                showToast('Passwords do not match', '❌');
                return;
            }

            // Disable submit button
            submitBtn.disabled = true;
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.innerHTML = 'Creating...';


            try {
                // Create Firebase Authentication user
                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                const user = userCredential.user;

                // Update display name
                await user.updateProfile({
                    displayName: name
                });

                // Create Firestore document with librarian role
                await db.collection('users').doc(user.uid).set({
                    email: email,
                    fullName: name,
                    userType: 'librarian', // IMPORTANT: Set role to librarian
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: auth.currentUser.uid, // Track who created this account
                    lastLogin: null,
                    photoURL: user.photoURL || null
                });

                // Success!
                showToast('✅ Librarian account created successfully!', '✅');
                
                // Close modal and reset form
                closeLibrarianModal();
                
                // Reload users table if on users section
                const usersSection = document.getElementById('section-users');
                if (usersSection.classList.contains('active')) {
                    await loadUsersData();
                }

                // Sign out the newly created user (Firebase auto-signs in)
                // We need to sign back in as admin
                const adminEmail = sessionStorage.getItem('userEmail');
                if (adminEmail) {
                    // Force refresh auth state
                    await auth.signOut();
                    showToast('Please log back in as admin', 'ℹ️');
                    setTimeout(() => {
                        window.location.reload();
                    }, 2000);
                }

            } catch (error) {
                console.error('Error creating librarian:', error);
                
                let errorMessage = 'Error creating librarian account';
                
                if (error.code === 'auth/email-already-in-use') {
                    errorMessage = 'This email is already registered';
                } else if (error.code === 'auth/invalid-email') {
                    errorMessage = 'Invalid email address';
                } else if (error.code === 'auth/weak-password') {
                    errorMessage = 'Password is too weak';
                } else if (error.code === 'auth/operation-not-allowed') {
                    errorMessage = 'Email/password authentication is not enabled';
                } else {
                    errorMessage = error.message || errorMessage;
                }
                
                showToast(errorMessage, '❌');

                // Re-enable submit button
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        });
    }

    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && createLibrarianModal.classList.contains('active')) {
            closeLibrarianModal();
        }
    });
});
