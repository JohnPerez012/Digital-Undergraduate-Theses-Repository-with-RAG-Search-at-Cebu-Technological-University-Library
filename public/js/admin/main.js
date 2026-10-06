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
                    window.location.href = '../index.html';
                    resolve(false);
                    return;
                }

                try {
                    // Check user role from Firestore
                    const userDoc = await db.collection('users').doc(user.uid).get();
                    if (!userDoc.exists) {
                        console.error('User document does not exist');
                        showToast('Access denied: User data not found', '❌');
                        setTimeout(() => window.location.href = '../index.html', 2000);
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
                                window.location.href = '../index.html';
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
                    setTimeout(() => window.location.href = '../index.html', 2000);
                    resolve(false);
                }
            });
        });
    };

    // Wait for authentication check
    const isAdmin = await checkAdminAuth();
    if (!isAdmin) return;

    // ===== Backend API URL Helper =====
    function getBackendUrl() {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3001';
        }
        return 'https://recap-backend-jy5b.onrender.com';
    }

    // ===== Title Normalization (for duplicate detection) =====
    // Collapses whitespace and lowercases so "Effect of Guyabano" === "effect of  guyabano"
    function normalizeTitle(str) {
        return (str || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    // ===== Confirmation Dialogs use centralized ModalDialog.confirm() =====
    // (showConfirmationModal removed – all confirmations now use ModalDialog)


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
                    setTimeout(() => window.location.href = '../index.html', 1000);
                }
            });
        });
    }

    // ===== Back to Home =====
    if (backToHomeBtn) {
        backToHomeBtn.addEventListener('click', () => {
            window.location.href = '../index.html';
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
    async function loadDashboardData(forceRefresh = false) {
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
            const cacheValid = forceRefresh ? false : await isCacheValid();
            if (!cacheValid || projects.length === 0 || forceRefresh) {
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
            if (!forceRefresh) {
                const cachedUsersMetadata = localStorage.getItem('usersMetadata');
                if (cachedUsersMetadata) {
                    const metadata = JSON.parse(cachedUsersMetadata);
                    const cacheAge = Date.now() - new Date(metadata.lastCached).getTime();
                    if (cacheAge < 5 * 60 * 1000) {
                        usersCacheAgeFresh = true;
                    }
                }
            }

            if (!usersCacheAgeFresh || users.length === 0 || forceRefresh) {
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
    
    /**
     * Invalidate cache - clears all cached data to force fresh fetch
     */
    function invalidateCache() {
        try {
            localStorage.removeItem('projectsData');
            localStorage.removeItem('projectsMetadata');
            console.log('🗑️ Cache invalidated');
        } catch (error) {
            console.error('Error invalidating cache:', error);
        }
    }

    /**
     * Invalidate users cache - clears cached user data to force fresh fetch
     */
    function invalidateUsersCache() {
        try {
            localStorage.removeItem('usersData');
            localStorage.removeItem('usersMetadata');
            console.log('🗑️ Users cache invalidated');
        } catch (error) {
            console.error('Error invalidating users cache:', error);
        }
    }

    // ===== Pagination State =====
    let allProjectsData = []; // Store all projects
    let currentProjectsPage = 1;
    const PROJECTS_PER_PAGE = 10;

    // ===== Projects Data =====
    async function loadProjectsData(forceRefresh = false) {
        // Safety check: Ensure user is authenticated
        if (!auth.currentUser) {
            console.warn('Cannot load projects - no authenticated user');
            return;
        }
        
        const tbody = document.getElementById('projects-table-body');
        
        // 1. Try to load and render from cache immediately (unless force refresh)
        let projects = forceRefresh ? null : loadFromCache();
        let renderedFromCache = false;
        
        if (projects && projects.length > 0) {
            // Sort projects by createdAt descending
            projects.sort((a, b) => {
                const dateA = getTimestamp(a.createdAt);
                const dateB = getTimestamp(b.createdAt);
                return dateB - dateA;
            });
            
            // Store all projects globally
            allProjectsData = projects;
            
            // Reset to page 1 and render with pagination
            currentProjectsPage = 1;
            renderProjectsTablePaginated(tbody);
            
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
            // 2. Perform cache validation asynchronously (skip if forceRefresh is true)
            if (!forceRefresh) {
                const cacheValid = await isCacheValid();
                
                if (cacheValid && renderedFromCache) {
                    console.log('✓ Projects cache is valid. Reconciling Pinecone status in background...');
                    checkPineconeSyncStatus();
                    return;
                }
            }
            
            // Cache invalid or not found or forceRefresh - fetch from Firestore
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
            
            // Store all projects globally
            allProjectsData = freshProjects;
            
            // Reset to page 1 and render
            currentProjectsPage = 1;
            renderProjectsTablePaginated(tbody);
            
            // Re-apply filters
            if (typeof applyProjectFilters === 'function') {
                applyProjectFilters();
            }

            // Verify and reconcile with Pinecone vector database in background
            checkPineconeSyncStatus();

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
                                <button class="btn-secondary" onclick="loadProjectsData(true)">Retry</button>
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
     * Check Pinecone directly for all indexed vector IDs and reconcile UI & Firestore
     */
    async function checkPineconeSyncStatus() {
        try {
            const backendUrl = getBackendUrl();
            const res = await fetch(`${backendUrl}/api/projects/sync-status`);
            if (!res.ok) return;

            const data = await res.json();
            if (data.success && Array.isArray(data.vectorIds)) {
                const vectorSet = new Set(data.vectorIds);
                let updatedAny = false;

                allProjectsData.forEach(project => {
                    const existsInPinecone = vectorSet.has(project.id);
                    if (existsInPinecone && project.pineconeSynced !== true) {
                        project.pineconeSynced = true;
                        updatedAny = true;
                    }
                });

                if (updatedAny) {
                    console.log(`✓ Reconciled projects with Pinecone: updated sync indicators`);
                    const tbody = document.getElementById('projects-table-body');
                    if (tbody) {
                        renderProjectsTablePaginated(tbody);
                        if (typeof applyProjectFilters === 'function') {
                            applyProjectFilters();
                        }
                    }
                    if (typeof saveToCache === 'function') {
                        await saveToCache(allProjectsData);
                    }
                }
            }
        } catch (err) {
            console.warn('Pinecone sync-status check error (non-fatal):', err.message);
        }
    }

    /**
     * Highlight search terms in text (matches word-by-word / text-by-text)
     * @param {string} text - The text to highlight
     * @param {string} query - The search query
     * @returns {string} - Safe HTML string with highlighted terms
     */
    function highlightSearchTerms(text, query) {
        if (!text && text !== 0) return '';
        const raw = String(text);
        
        // Escape HTML in the original text first to prevent XSS
        const escapeHtml = (str) => {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        };
        const escapedText = escapeHtml(raw);

        if (!query || typeof query !== 'string' || !query.trim()) {
            return escapedText;
        }

        // Split query into terms to support word-by-word and phrase matching
        const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rawTokens = query.trim().split(/\s+/).filter(t => t.length > 0);
        if (rawTokens.length === 0) return escapedText;

        // Sort by length descending so longer words match before substrings
        const tokens = rawTokens.map(escapeRegex).sort((a, b) => b.length - a.length);
        const regex = new RegExp(`(${tokens.join('|')})`, 'gi');

        return escapedText.replace(regex, '<mark class="search-highlight">$1</mark>');
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

        const searchQuery = (document.getElementById('projects-search')?.value || '').trim();

        projects.forEach(data => {
            const row = document.createElement('tr');
            // Store createdAt timestamp as data attribute for filtering
            const createdAtTimestamp = getTimestamp(data.createdAt);
            row.setAttribute('data-created-at', createdAtTimestamp);
            const isSynced = data.pineconeSynced === true;
            row.setAttribute('data-synced', isSynced ? 'true' : 'false');
            row.setAttribute('data-project-id', data.id);
            
            const syncStatusTitle = isSynced 
                ? 'Synced with Pinecone (AI Search active) - Click to re-sync' 
                : 'Not synced with Pinecone - Click to sync now';
            
            row.innerHTML = `
                <td>
                    <div class="project-title-cell">
                        <button type="button" 
                                class="sync-indicator-btn ${isSynced ? 'synced' : 'unsynced'}" 
                                title="${syncStatusTitle}"
                                onclick="syncSingleProject(event, '${data.id}')">
                            <span class="sync-dot ${isSynced ? 'synced' : 'unsynced'}"></span>
                        </button>
                        <strong class="project-title-text">${highlightSearchTerms(data.title || 'Untitled', searchQuery)}</strong>${(data.cataloged || data.catalogLocation) ? `<span class="project-catalog-pill" title="Cataloged by ${escapeHtml(data.catalogAudit?.lastUpdatedByName || data.lastCatalogedByName || 'Librarian')}">📍 Cataloged</span>` : ''}
                    </div>
                </td>
                <td>${highlightSearchTerms((data.authors || []).join(', ') || 'N/A', searchQuery)}</td>
                <td><span class="badge badge-info">${highlightSearchTerms(data.program || 'N/A', searchQuery)}</span></td>
                <td>${highlightSearchTerms(data.year || 'N/A', searchQuery)}</td>
                <td>${highlightSearchTerms(data.adviser || 'N/A', searchQuery)}</td>
                <td>
                    <div class="table-actions">
                        <button class="action-btn action-view" onclick="viewProject('${data.id}')" title="View details" aria-label="View details">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            <span class="action-btn-text">View</span>
                        </button>
                        <button class="action-btn action-edit" onclick="editProject('${data.id}')" title="Edit project" aria-label="Edit project">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            <span class="action-btn-text">Edit</span>
                        </button>
                        <button class="action-btn action-delete" onclick="deleteProject('${data.id}', '${escapeHtml(data.title || 'this project').replace(/'/g, "\\'")}')" title="Delete project" aria-label="Delete project">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            <span class="action-btn-text">Delete</span>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    /**
     * Get filtered projects according to active search box and filter pills
     */
    function getFilteredProjects() {
        if (!allProjectsData || allProjectsData.length === 0) return [];

        const searchInput = document.getElementById('projects-search');
        const searchTerm = (searchInput ? searchInput.value : '').trim().toLowerCase();

        const pills = document.querySelectorAll('#project-filters .filter-pill');
        const activeFilters = pills ? Array.from(pills).filter(p => p.classList.contains('active')) : [];
        const filterValues = activeFilters.map(p => p.dataset.filter);
        const showAll = filterValues.length === 0 || filterValues.includes('all');
        const hasRecent = filterValues.includes('recent');
        const hasUnsynced = filterValues.includes('unsynced');
        const programFilters = filterValues.filter(f => f !== 'all' && f !== 'recent' && f !== 'unsynced');

        return allProjectsData.filter(project => {
            // 1. Program filter
            if (!showAll && programFilters.length > 0) {
                const prog = (project.program || '').trim();
                const progMatch = programFilters.some(f => prog === f || prog.startsWith(f));
                if (!progMatch) return false;
            }

            // 2. Recent filter (last 30 days)
            if (!showAll && hasRecent) {
                const ts = getTimestamp(project.createdAt);
                if (!ts) return false;
                const d = new Date(ts);
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                if (d < thirtyDaysAgo) return false;
            }

            // 3. Unsynced filter
            if (!showAll && hasUnsynced) {
                if (project.pineconeSynced === true) return false;
            }

            // 4. Search term filter
            if (searchTerm) {
                const title = String(project.title || '').toLowerCase();
                const authors = Array.isArray(project.authors) ? project.authors.join(' ').toLowerCase() : String(project.authors || '').toLowerCase();
                const adviser = String(project.adviser || '').toLowerCase();
                const program = String(project.program || '').toLowerCase();
                const year = String(project.year || '').toLowerCase();
                const keywords = Array.isArray(project.keywords) ? project.keywords.join(' ').toLowerCase() : String(project.keywords || '').toLowerCase();

                let parsedAdviserMatch = false;
                if (typeof AcademicNameParser !== 'undefined' && project.adviser) {
                    const parsed = AcademicNameParser.parse(project.adviser);
                    if (parsed) {
                        if (parsed.surname.toLowerCase().includes(searchTerm) ||
                            parsed.clusterKey.toLowerCase().includes(searchTerm) ||
                            parsed.fullDisplay.toLowerCase().includes(searchTerm)) {
                            parsedAdviserMatch = true;
                        }
                    }
                }

                const matches = title.includes(searchTerm) ||
                                authors.includes(searchTerm) ||
                                adviser.includes(searchTerm) ||
                                parsedAdviserMatch ||
                                program.includes(searchTerm) ||
                                year.includes(searchTerm) ||
                                keywords.includes(searchTerm);
                if (!matches) return false;
            }

            return true;
        });
    }

    /**
     * Render projects table with pagination (new paginated version)
     */
    function renderProjectsTablePaginated(tbody) {
        tbody.innerHTML = '';

        const projectsToDisplay = getFilteredProjects();

        if (projectsToDisplay.length === 0) {
            const searchVal = document.getElementById('projects-search')?.value.trim();
            tbody.innerHTML = `<tr><td colspan="6" class="table-empty">${searchVal ? `No projects found matching "${escapeHtml(searchVal)}"` : 'No projects found'}</td></tr>`;
            renderProjectsPagination();
            return;
        }

        // Calculate pagination
        const startIndex = (currentProjectsPage - 1) * PROJECTS_PER_PAGE;
        const endIndex = startIndex + PROJECTS_PER_PAGE;
        const projectsToShow = projectsToDisplay.slice(startIndex, endIndex);

        const searchQuery = (document.getElementById('projects-search')?.value || '').trim();

        // Render current page projects
        projectsToShow.forEach(data => {
            const row = document.createElement('tr');
            const createdAtTimestamp = getTimestamp(data.createdAt);
            row.setAttribute('data-created-at', createdAtTimestamp);
            const isSynced = data.pineconeSynced === true;
            row.setAttribute('data-synced', isSynced ? 'true' : 'false');
            row.setAttribute('data-project-id', data.id);
            
            const syncStatusTitle = isSynced 
                ? 'Synced with Pinecone (AI Search active) - Click to re-sync' 
                : 'Not synced with Pinecone - Click to sync now';
            
            row.innerHTML = `
                <td>
                    <div class="project-title-cell">
                        <button type="button" 
                                class="sync-indicator-btn ${isSynced ? 'synced' : 'unsynced'}" 
                                title="${syncStatusTitle}"
                                onclick="syncSingleProject(event, '${data.id}')">
                            <span class="sync-dot ${isSynced ? 'synced' : 'unsynced'}"></span>
                        </button>
                        <strong class="project-title-text">${highlightSearchTerms(data.title || 'Untitled', searchQuery)}</strong>
                    </div>
                </td>
                <td>${highlightSearchTerms((data.authors || []).join(', ') || 'N/A', searchQuery)}</td>
                <td><span class="badge badge-info">${highlightSearchTerms(data.program || 'N/A', searchQuery)}</span></td>
                <td>${highlightSearchTerms(data.year || 'N/A', searchQuery)}</td>
                <td>${highlightSearchTerms(data.adviser || 'N/A', searchQuery)}</td>
                <td>
                    <div class="table-actions">
                        <button class="action-btn action-view" onclick="viewProject('${data.id}')" title="View details" aria-label="View details">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            <span class="action-btn-text">View</span>
                        </button>
                        <button class="action-btn action-edit" onclick="editProject('${data.id}')" title="Edit project" aria-label="Edit project">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            <span class="action-btn-text">Edit</span>
                        </button>
                        <button class="action-btn action-delete" onclick="deleteProject('${data.id}', '${escapeHtml(data.title || 'this project').replace(/'/g, "\\'")}')" title="Delete project" aria-label="Delete project">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            <span class="action-btn-text">Delete</span>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Render pagination controls
        renderProjectsPagination();
    }

    /**
     * Render pagination controls for projects table
     */
    function renderProjectsPagination() {
        const paginationContainer = document.getElementById('projects-pagination-container');
        if (!paginationContainer) return;

        paginationContainer.innerHTML = '';

        const projectsToDisplay = getFilteredProjects();
        const totalCount = projectsToDisplay.length;
        const totalPages = Math.ceil(totalCount / PROJECTS_PER_PAGE);

        if (totalPages <= 1) {
            if (totalCount > 0 && totalCount < allProjectsData.length) {
                const infoText = document.createElement('span');
                infoText.className = 'pagination-info';
                infoText.textContent = `Showing ${totalCount} of ${allProjectsData.length} projects`;
                paginationContainer.appendChild(infoText);
            }
            return; // No pagination needed
        }

        // Calculate range
        const startItem = (currentProjectsPage - 1) * PROJECTS_PER_PAGE + 1;
        const endItem = Math.min(currentProjectsPage * PROJECTS_PER_PAGE, totalCount);

        // Previous button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'pagination-btn';
        prevBtn.innerHTML = '&laquo;';
        prevBtn.disabled = currentProjectsPage === 1;
        prevBtn.addEventListener('click', () => {
            if (currentProjectsPage > 1) {
                goToProjectsPage(currentProjectsPage - 1);
            }
        });
        paginationContainer.appendChild(prevBtn);

        // Page number buttons
        const maxVisiblePages = 7;
        let startPage = Math.max(1, currentProjectsPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        // Always show first page
        if (startPage > 1) {
            const firstBtn = createPageButton(1);
            paginationContainer.appendChild(firstBtn);
            
            if (startPage > 2) {
                const ellipsis = document.createElement('span');
                ellipsis.className = 'pagination-info';
                ellipsis.textContent = '...';
                paginationContainer.appendChild(ellipsis);
            }
        }

        // Page numbers
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = createPageButton(i);
            paginationContainer.appendChild(pageBtn);
        }

        // Always show last page
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                const ellipsis = document.createElement('span');
                ellipsis.className = 'pagination-info';
                ellipsis.textContent = '...';
                paginationContainer.appendChild(ellipsis);
            }
            
            const lastBtn = createPageButton(totalPages);
            paginationContainer.appendChild(lastBtn);
        }

        // Next button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'pagination-btn';
        nextBtn.innerHTML = '&raquo;';
        nextBtn.disabled = currentProjectsPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (currentProjectsPage < totalPages) {
                goToProjectsPage(currentProjectsPage + 1);
            }
        });
        paginationContainer.appendChild(nextBtn);

        // Info text
        const infoText = document.createElement('span');
        infoText.className = 'pagination-info';
        infoText.textContent = `${startItem}-${endItem} of ${totalCount}`;
        paginationContainer.appendChild(infoText);
    }

    /**
     * Create a page button
     */
    function createPageButton(pageNumber) {
        const btn = document.createElement('button');
        btn.className = 'pagination-btn' + (pageNumber === currentProjectsPage ? ' active' : '');
        btn.textContent = pageNumber;
        btn.addEventListener('click', () => {
            goToProjectsPage(pageNumber);
        });
        return btn;
    }

    /**
     * Navigate to a specific page
     */
    function goToProjectsPage(pageNumber) {
        currentProjectsPage = pageNumber;
        const tbody = document.getElementById('projects-table-body');
        renderProjectsTablePaginated(tbody);

        // Scroll to top of table (instant scroll for better UX)
        const section = document.getElementById('section-projects');
        if (section) {
            // Use instant scroll instead of smooth for pagination
            section.scrollIntoView({ behavior: 'instant', block: 'start' });
        }
    }

    /**
     * Unified filtering & real-time search for Users table
     * Evaluates active filter pills, search queries (Name, Email, Role/UserType),
     * and applies brand-yellow term highlighting.
     */
    function filterUsersTable() {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;
        const rows = tbody.getElementsByTagName('tr');

        const activePill = document.querySelector('#user-filters .filter-pill.active');
        const activeFilter = activePill ? (activePill.dataset.filter || 'all').toLowerCase() : 'all';

        const usersSearch = document.getElementById('users-search');
        const rawSearch = (usersSearch?.value || '').trim();
        const searchLower = rawSearch.toLowerCase();
        const searchTokens = searchLower.split(/\s+/).filter(t => t.length > 0);

        Array.from(rows).forEach(row => {
            if (row.classList.contains('table-loading') || row.classList.contains('table-empty')) return;
            const nameCell = row.cells[0]?.querySelector('strong') || row.cells[0];
            const emailCell = row.cells[1];
            const typeCell = row.cells[2]?.querySelector('.badge') || row.cells[2];

            // Keep raw original text to re-highlight cleanly
            const rawName = row.getAttribute('data-original-name') || (nameCell ? nameCell.textContent.trim() : '');
            const rawEmail = row.getAttribute('data-original-email') || (emailCell ? emailCell.textContent.trim() : '');
            const rawType = row.getAttribute('data-original-type') || (typeCell ? typeCell.textContent.trim() : '');
            if (!row.getAttribute('data-original-name') && rawName) row.setAttribute('data-original-name', rawName);
            if (!row.getAttribute('data-original-email') && rawEmail) row.setAttribute('data-original-email', rawEmail);
            if (!row.getAttribute('data-original-type') && rawType) row.setAttribute('data-original-type', rawType);

            const rowTypeLower = rawType.toLowerCase();

            // 1. Filter pill check
            let matchesPill = true;
            if (activeFilter !== 'all') {
                if (activeFilter === 'teacher' || activeFilter === 'faculty') {
                    matchesPill = rowTypeLower.includes('teacher') || rowTypeLower.includes('faculty');
                } else if (activeFilter === 'admin') {
                    matchesPill = rowTypeLower.includes('admin');
                } else {
                    matchesPill = rowTypeLower.includes(activeFilter);
                }
            }

            // 2. Search check (Name, Email, or Role / Type with synonyms)
            let matchesSearch = true;
            if (searchTokens.length > 0) {
                let searchableRole = rowTypeLower;
                if (rowTypeLower.includes('teacher') || rowTypeLower.includes('faculty')) {
                    searchableRole += ' teacher faculty professor instructor';
                }
                if (rowTypeLower.includes('admin')) {
                    searchableRole += ' admin administrator';
                }
                if (rowTypeLower.includes('student')) {
                    searchableRole += ' student learner undergraduate';
                }
                if (rowTypeLower.includes('librarian')) {
                    searchableRole += ' librarian library staff';
                }

                const fullSearchable = `${rawName} ${rawEmail} ${rawType} ${searchableRole}`.toLowerCase();
                matchesSearch = searchTokens.every(token => fullSearchable.includes(token));
            }

            if (matchesPill && matchesSearch) {
                row.style.display = '';
                if (nameCell) nameCell.innerHTML = highlightSearchTerms(rawName, rawSearch);
                if (emailCell) emailCell.innerHTML = highlightSearchTerms(rawEmail, rawSearch);
                if (typeCell) {
                    let typeHighlightQuery = rawSearch;
                    if ((searchLower.includes('teacher') || searchLower.includes('faculty')) && 
                        (rowTypeLower.includes('teacher') || rowTypeLower.includes('faculty'))) {
                        typeHighlightQuery = rawType;
                    }
                    typeCell.innerHTML = highlightSearchTerms(rawType, typeHighlightQuery);
                }
            } else {
                row.style.display = 'none';
            }
        });
    }

    // ===== Users Data =====
    async function loadUsersData(forceRefresh = false) {
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
            
            const userSearchQuery = (document.getElementById('users-search')?.value || '').trim();

            usersList.forEach(data => {
                const userType = data.userType || 'N/A';
                const badgeColor = userType === 'admin' ? 'linear-gradient(to right, #08D488, #FCCC56)' : 
                                  userType === 'librarian' ? '#08D488' :
                                  userType === 'student' ? '#fad882ff' : '#94a3b8';
                
                const row = document.createElement('tr');
                row.setAttribute('data-original-name', data.fullName || 'N/A');
                row.setAttribute('data-original-email', data.email || 'N/A');
                row.setAttribute('data-original-type', userType.toUpperCase());
                row.innerHTML = `
                    <td><strong>${highlightSearchTerms(data.fullName || 'N/A', userSearchQuery)}</strong></td>
                    <td>${highlightSearchTerms(data.email || 'N/A', userSearchQuery)}</td>
                    <td>
                        <span class="badge" style="background: ${badgeColor}; color: white;">
                            ${highlightSearchTerms(userType.toUpperCase(), userSearchQuery)}
                        </span>
                    </td>
                    <td>${formatDate(data.createdAt)}</td>
                    <td>${formatDate(data.lastLogin) || 'Never'}</td>
                    <td>
                        <div class="table-actions">
                            <button class="action-btn action-view" onclick="viewUser('${data.id}')" title="View user details" aria-label="View user details">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                <span class="action-btn-text">View</span>
                            </button>
                            ${data.userType !== 'admin' ? `
                                <button class="action-btn action-delete" onclick="deleteUser('${data.id}', '${escapeHtml(data.fullName || data.email).replace(/'/g, "\\'")}')" title="Delete user" aria-label="Delete user">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    <span class="action-btn-text">Delete</span>
                                </button>
                            ` : '<span class="badge" style="background: #cbd5e1; color: #475569;">Protected</span>'}
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });
        }

        // 1. Try to load and render from cache immediately (unless forceRefresh is true)
        let users = forceRefresh ? null : loadUsersFromCache();
        let renderedFromCache = false;
        
        if (users && users.length > 0) {
            // Sort users by createdAt descending
            users.sort((a, b) => {
                const dateA = getTimestamp(a.createdAt);
                const dateB = getTimestamp(b.createdAt);
                return dateB - dateA;
            });
            renderUsersTable(users);
            
            // Re-apply filter pills and search if active
            if (typeof filterUsersTable === 'function') {
                filterUsersTable();
            }
            renderedFromCache = true;
            console.log('🚀 Using cached user data for instant render - revalidating in background...');
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="table-loading"><div class="spinner"></div> Loading users...</td></tr>';
        }

        // 2. Asynchronously verify and update users cache (skip check if forceRefresh is true)
        try {
            let usersCacheAgeFresh = false;
            if (!forceRefresh) {
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

            // Re-apply filter pills and search if active
            if (typeof filterUsersTable === 'function') {
                filterUsersTable();
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

    // ===== Analytics Intelligence & Reporting =====
    let currentAnalyticsFilter = {
        range: 'all',
        program: 'all'
    };
    let cachedAnalyticsData = {
        projects: null,
        users: null,
        savedProjects: null,
        activities: null
    };

    async function loadAnalyticsData() {
        const loadingOverlay = document.getElementById('analytics-loading');
        if (loadingOverlay) loadingOverlay.classList.add('active');

        try {
            // Load projects & users (cache or DB)
            let projects = loadFromCache();
            let users = loadUsersFromCache();
            let savedProjects = null;
            let activities = null;

            // Check session storage for savedProjects & activities cache
            try {
                const spCache = sessionStorage.getItem('recap_analytics_saved');
                if (spCache) savedProjects = JSON.parse(spCache);
            } catch (e) {}

            try {
                const actCache = sessionStorage.getItem('recap_analytics_activities');
                if (actCache) activities = JSON.parse(actCache);
            } catch (e) {}

            // Assemble parallel promises for any missing collections
            const promises = [];

            // 1. Projects
            if (!projects) {
                promises.push(
                    db.collection('projects').get().then(snapshot => {
                        const list = [];
                        snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
                        localStorage.setItem('projectsData', JSON.stringify(list));
                        return { type: 'projects', data: list };
                    }).catch(err => {
                        console.error('Projects fetch error:', err);
                        return { type: 'projects', data: [] };
                    })
                );
            } else {
                promises.push(Promise.resolve({ type: 'projects', data: projects }));
            }

            // 2. Users
            if (!users) {
                promises.push(
                    db.collection('users').get().then(snapshot => {
                        const list = [];
                        snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
                        localStorage.setItem('usersData', JSON.stringify(list));
                        return { type: 'users', data: list };
                    }).catch(err => {
                        console.error('Users fetch error:', err);
                        return { type: 'users', data: [] };
                    })
                );
            } else {
                promises.push(Promise.resolve({ type: 'users', data: users }));
            }

            // 3. Saved Projects (usersSavedProjects)
            if (!savedProjects) {
                promises.push(
                    db.collection('usersSavedProjects').get().then(snapshot => {
                        const list = [];
                        snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
                        try { sessionStorage.setItem('recap_analytics_saved', JSON.stringify(list)); } catch (e) {}
                        return { type: 'savedProjects', data: list };
                    }).catch(err => {
                        console.warn('usersSavedProjects fetch warning:', err);
                        return { type: 'savedProjects', data: [] };
                    })
                );
            } else {
                promises.push(Promise.resolve({ type: 'savedProjects', data: savedProjects }));
            }

            // 4. Activities (userActivities)
            if (!activities) {
                promises.push(
                    db.collection('userActivities').limit(500).get().then(snapshot => {
                        const list = [];
                        snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
                        try { sessionStorage.setItem('recap_analytics_activities', JSON.stringify(list)); } catch (e) {}
                        return { type: 'activities', data: list };
                    }).catch(err => {
                        console.warn('userActivities fetch warning:', err);
                        return { type: 'activities', data: [] };
                    })
                );
            } else {
                promises.push(Promise.resolve({ type: 'activities', data: activities }));
            }

            const results = await Promise.all(promises);
            results.forEach(res => {
                if (res.type === 'projects') {
                    projects = res.data;
                    if (!allProjectsData || allProjectsData.length === 0) {
                        allProjectsData = res.data;
                    }
                }
                if (res.type === 'users') users = res.data;
                if (res.type === 'savedProjects') savedProjects = res.data;
                if (res.type === 'activities') activities = res.data;
            });

            // Store in cachedAnalyticsData
            cachedAnalyticsData = { projects, users, savedProjects, activities };

            // Populate program filter dropdown
            populateProgramFilter(projects);

            // Calculate filtered dataset according to active filters
            const filteredProjects = getFilteredAnalyticsProjects(projects, currentAnalyticsFilter);

            // Render KPIs immediately
            renderKPIs(filteredProjects, users, savedProjects, projects, currentAnalyticsFilter);

            // Double requestAnimationFrame guarantees layout is painted before canvas draws
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    renderCharts(filteredProjects, users, savedProjects, activities, currentAnalyticsFilter);
                    renderTopBookmarked(filteredProjects, savedProjects);
                    setupAnalyticsListeners(projects, users, savedProjects, activities);
                    if (loadingOverlay) loadingOverlay.classList.remove('active');
                });
            });

        } catch (error) {
            console.error('Error loading analytics:', error);
            showToast('Failed to load analytics data', '❌');
            if (loadingOverlay) loadingOverlay.classList.remove('active');
        }
    }

    // Canonical CTU Academic Programs
    const CANONICAL_ACADEMIC_PROGRAMS = [
        { code: 'BEEd', name: 'Bachelor of Elementary Education' },
        { code: 'BIT-Automotive', name: 'Bachelor of Industrial Technology Major in Automotive' },
        { code: 'BIT-Computer', name: 'Bachelor of Industrial Technology Major in Computer' },
        { code: 'BIT-Electronics', name: 'Bachelor of Industrial Technology Major in Electronics' },
        { code: 'BSEd-Math', name: 'Bachelor of Secondary Education Major in Mathematics' },
        { code: 'BSFi', name: 'Bachelor of Science in Fisheries' },
        { code: 'BSHM', name: 'Bachelor of Science in Hospitality Management' },
        { code: 'BSIE', name: 'Bachelor of Science in Industrial Engineering' },
        { code: 'BSIT', name: 'Bachelor of Science in Information Technology' },
        { code: 'BTLEd-HE', name: 'Bachelor in Technology and Livelihood Education Major in Home Economics' }
    ];

    // Populate Program Filter Dropdown (Includes All Campus Programs + Project Counts)
    function populateProgramFilter(projects) {
        const progSelect = document.getElementById('analytics-program-filter');
        if (!progSelect) return;

        // Calculate count of projects per program
        const programCounts = {};
        (projects || []).forEach(p => {
            if (p.program && p.program.trim()) {
                const prog = p.program.trim();
                programCounts[prog] = (programCounts[prog] || 0) + 1;
            }
        });

        // Collect all canonical campus programs + any custom programs found in projects
        const allProgramCodes = new Set(CANONICAL_ACADEMIC_PROGRAMS.map(p => p.code));
        Object.keys(programCounts).forEach(code => allProgramCodes.add(code));
        const programs = Array.from(allProgramCodes).sort((a, b) => a.localeCompare(b));

        const currentVal = progSelect.value || currentAnalyticsFilter.program || 'all';
        const totalProjectsCount = (projects || []).length;

        let html = `<option value="all">All Academic Programs (${totalProjectsCount})</option>`;
        programs.forEach(prog => {
            const count = programCounts[prog] || 0;
            html += `<option value="${escapeHtml(prog)}">${escapeHtml(prog)} (${count})</option>`;
        });
        progSelect.innerHTML = html;
        if (programs.includes(currentVal) || currentVal === 'all') {
            progSelect.value = currentVal;
        }
    }

    // Filter Dataset by Program and Time Range
    function getFilteredAnalyticsProjects(projects, filters) {
        let list = [...(projects || [])];

        // 1. Filter by program
        if (filters && filters.program && filters.program !== 'all') {
            list = list.filter(p => (p.program || '').trim().toLowerCase() === filters.program.trim().toLowerCase());
        }

        // 2. Filter by date range
        if (filters && filters.range) {
            const now = Date.now();
            if (filters.range === 'year') {
                const currentYear = new Date().getFullYear();
                list = list.filter(p => {
                    const ts = getTimestamp(p.createdAt);
                    const matchesTs = ts ? new Date(ts).getFullYear() === currentYear : false;
                    const matchesYear = p.year ? parseInt(p.year) === currentYear : false;
                    return matchesTs || matchesYear;
                });
            } else if (filters.range === '90d') {
                const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
                list = list.filter(p => getTimestamp(p.createdAt) >= ninetyDaysAgo);
            } else if (filters.range === '30d') {
                const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
                list = list.filter(p => getTimestamp(p.createdAt) >= thirtyDaysAgo);
            }
        }

        return list;
    }

    // Helper: get chart themes adapted for light and dark modes
    function getChartTheme() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        return {
            textColor: isDark ? '#94a3b8' : '#475569',
            headingColor: isDark ? '#f8fafc' : '#0f172a',
            gridColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.05)',
            tooltipBg: isDark ? '#1e293b' : '#ffffff',
            tooltipText: isDark ? '#f8fafc' : '#1f2937',
            borderColor: isDark ? '#334155' : '#e2e8f0',
            palette: [
                '#08D488', // RE-CAPS Teal / Emerald
                '#FCCC56', // CTU Gold / Amber
                '#6366f1', // Indigo
                '#3b82f6', // Ocean Blue
                '#ec4899', // Pink / Magenta
                '#14b8a6', // Cyan / Teal
                '#8b5cf6', // Violet
                '#f97316', // Orange
                '#06b6d4', // Sky Blue
                '#10b981'  // Forest Green
            ]
        };
    }

    // Render KPI indicators
    function renderKPIs(filteredProjects, users, savedProjects, allProjects, filters) {
        const totalProjEl = document.getElementById('kpi-total-projects');
        const projBadgeEl = document.getElementById('kpi-projects-badge');
        const totalUserEl = document.getElementById('kpi-total-users');
        const userBadgeEl = document.getElementById('kpi-users-badge');
        const totalSavesEl = document.getElementById('kpi-total-saves');
        const savesBadgeEl = document.getElementById('kpi-saves-badge');
        const activeProgEl = document.getElementById('kpi-programs');
        const progBadgeEl = document.getElementById('kpi-programs-badge');
        const recentEl = document.getElementById('kpi-recent');
        const recentBadgeEl = document.getElementById('kpi-recent-badge');
        const pineconeEl = document.getElementById('kpi-pinecone-rate');
        const pineconeBadgeEl = document.getElementById('kpi-pinecone-badge');

        // 1. Total Capstones
        if (totalProjEl) totalProjEl.textContent = (filteredProjects || []).length;
        if (projBadgeEl) {
            if (filters.program !== 'all') {
                projBadgeEl.textContent = `${filters.program}`;
            } else {
                projBadgeEl.textContent = filters.range === 'all' ? 'All Theses' : `${filters.range.toUpperCase()} Inflow`;
            }
        }

        // 2. Total Users & Roles
        const totalUsersCount = (users || []).length;
        if (totalUserEl) totalUserEl.textContent = totalUsersCount;
        if (userBadgeEl) {
            const students = (users || []).filter(u => (u.userType || '').toLowerCase() === 'student').length;
            const faculty = (users || []).filter(u => ['teacher', 'faculty', 'librarian'].includes((u.userType || '').toLowerCase())).length;
            userBadgeEl.textContent = `${students} Students · ${faculty} Faculty`;
        }

        // 3. Research Bookmarks / Saves
        const filteredProjectIds = new Set((filteredProjects || []).map(p => p.id));
        let totalSavesInFiltered = 0;
        const projectSaveTally = {};

        (savedProjects || []).forEach(doc => {
            const list = doc.UIDproject || [];
            if (Array.isArray(list)) {
                list.forEach(id => {
                    if (filteredProjectIds.has(id)) {
                        totalSavesInFiltered++;
                        projectSaveTally[id] = (projectSaveTally[id] || 0) + 1;
                    }
                });
            }
        });
        const uniqueBookmarkedCount = Object.keys(projectSaveTally).length;

        if (totalSavesEl) totalSavesEl.textContent = totalSavesInFiltered;
        if (savesBadgeEl) {
            savesBadgeEl.textContent = `${uniqueBookmarkedCount} Capstones Saved`;
        }

        // 4. Programs count & leader
        const programCounts = {};
        (filteredProjects || []).forEach(p => {
            if (p.program && p.program.trim()) {
                const prog = p.program.trim();
                programCounts[prog] = (programCounts[prog] || 0) + 1;
            }
        });
        const programKeys = Object.keys(programCounts).sort((a, b) => programCounts[b] - programCounts[a]);
        if (activeProgEl) activeProgEl.textContent = programKeys.length;
        if (progBadgeEl) {
            progBadgeEl.textContent = programKeys.length > 0 ? `Top: ${programKeys[0]} (${programCounts[programKeys[0]]})` : 'No Programs';
        }

        // 5. Recent Inflow (Past 30 Days)
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const recentCount = (filteredProjects || []).filter(p => getTimestamp(p.createdAt) >= thirtyDaysAgo).length;
        if (recentEl) recentEl.textContent = recentCount;
        if (recentBadgeEl) {
            recentBadgeEl.textContent = `+${recentCount} Inflow (30d)`;
        }

        // 6. Pinecone AI Vector Index Health
        const totalInSet = (filteredProjects || []).length;
        const syncedCount = (filteredProjects || []).filter(p => p.pineconeSynced === true).length;
        const syncPercent = totalInSet > 0 ? Math.round((syncedCount / totalInSet) * 100) : 0;
        if (pineconeEl) pineconeEl.textContent = `${syncPercent}%`;
        if (pineconeBadgeEl) {
            pineconeBadgeEl.textContent = `${syncedCount} / ${totalInSet} Synced`;
        }
    }

    // =========================================================================
    // SYSTEMATIC ACADEMIC NAME & POST-NOMINAL CREDENTIAL PARSER
    // Automatically identifies, extracts, and separates:
    // 1. Honorific Prefixes (Dr., Engr., Prof., Assoc. Prof., Dean, etc.)
    // 2. Given Names & Middle Names/Initials
    // 3. True Surnames (including compound names: "de la Cruz", "Del Rosario", etc.)
    // 4. Generational Suffixes (Jr., Sr., II, III, IV, etc.)
    // 5. Post-nominal Academic Degrees & Credentials (Ph. D., Ph.D., MSME, MBA, MSIT, Ed.D., PECE, LPT, etc.)
    // =========================================================================
    const AcademicNameParser = {
        prefixRegex: /^(dr\.?|doctor|engr\.?|engineer|prof\.?|professor|assoc\.?\s*prof\.?|asst\.?\s*prof\.?|dean|atty\.?|rev\.?|hon\.?|mr\.?|ms\.?|mrs\.?)\s+/i,
        suffixRegex: /^(jr\.?|sr\.?|ii|iii|iv|v)$/i,

        credentialPatterns: [
            // Doctorates
            'ph.?\\s*d.?', 'ed.?\\s*d.?', 'd.?\\s*eng.?', 'dit', 'dba', 'dpa', 'dm', 'sc.?\\s*d.?', 'd.?\\s*tech.?',
            // Masters
            'msme', 'msit', 'mit', 'mba', 'mpa', 'man', 'maed', 'm.?\\s*ed.?', 'm.?\\s*sc.?', 'm.?\\s*s.?', 'm.?\\s*eng.?',
            'me', 'mscs', 'mst', 'mem', 'mm', 'ma',
            // Bachelors
            'bsit', 'bscs', 'bsie', 'bscpe', 'bsee', 'bsme', 'bs', 'b.?\\s*s.?', 'ab', 'ba',
            // Professional Certifications & Fellowships
            'pece', 'ece', 'cpa', 'lpt', 'rn', 'md', 'jd', 'ree', 'rme', 'csp', 'pmp', 'friedr', 'che', 'ce', 'pie'
        ],

        isCredential(token) {
            if (!token) return false;
            const clean = token.replace(/[.,\s]/g, '').toLowerCase();
            return this.credentialPatterns.some(pattern => {
                const regex = new RegExp('^' + pattern + '$', 'i');
                return regex.test(token.trim()) || regex.test(clean);
            });
        },

        parse(raw) {
            if (!raw) return null;
            let str = String(raw).trim();
            if (!str || /^(not specified|n\/?a|none|unknown|null|tbd)$/i.test(str)) return null;

            let prefix = '';
            let suffix = '';
            const credentials = [];

            // 1. Honorific prefix
            const pMatch = str.match(this.prefixRegex);
            if (pMatch) {
                prefix = pMatch[1].trim();
                str = str.replace(this.prefixRegex, '').trim();
            }

            // 2. Comma-separated parts (e.g. "Cyros M. Suson, Ph. D.")
            const commaParts = str.split(',').map(s => s.trim()).filter(Boolean);
            let baseName = commaParts[0] || '';

            for (let i = 1; i < commaParts.length; i++) {
                const part = commaParts[i];
                if (this.suffixRegex.test(part)) {
                    suffix = part;
                } else {
                    credentials.push(part);
                }
            }

            // 3. Standalone trailing credentials or suffixes without commas (e.g. "Cyros M. Suson Ph. D.")
            let tokens = baseName.split(/\s+/).filter(Boolean);
            while (tokens.length > 1) {
                if (tokens.length >= 2) {
                    const combinedTwo = tokens[tokens.length - 2] + ' ' + tokens[tokens.length - 1];
                    if (/^(ph\.?\s*d\.?|ed\.?\s*d\.?|d\.?\s*eng\.?|sc\.?\s*d\.?|m\.?\s*ed\.?|m\.?\s*sc\.?|m\.?\s*s\.?|b\.?\s*s\.?)$/i.test(combinedTwo)) {
                        credentials.unshift(combinedTwo);
                        tokens.splice(tokens.length - 2, 2);
                        continue;
                    }
                }

                const lastToken = tokens[tokens.length - 1];
                if (this.isCredential(lastToken)) {
                    credentials.unshift(lastToken);
                    tokens.pop();
                    continue;
                }
                if (this.suffixRegex.test(lastToken)) {
                    suffix = lastToken;
                    tokens.pop();
                    continue;
                }
                break;
            }

            if (tokens.length === 0) return null;

            // 4. Resolve Surname, Middle, First from remaining tokens
            let surname = '';
            let firstName = '';
            let middle = '';

            const len = tokens.length;
            if (len === 1) {
                surname = tokens[0];
                firstName = tokens[0];
            } else if (len >= 3 && /^(de|del|dela|san|santa|sta\.?|sto\.?)$/i.test(tokens[len - 2])) {
                surname = tokens[len - 2] + ' ' + tokens[len - 1];
                const rest = tokens.slice(0, len - 2);
                if (rest.length > 1 && /^[A-Za-z]\.?$/.test(rest[rest.length - 1])) {
                    middle = rest.pop();
                }
                firstName = rest.join(' ');
            } else if (len >= 4 && /^(de|van|von)$/i.test(tokens[len - 3]) && /^(la|los|las)$/i.test(tokens[len - 2])) {
                surname = tokens[len - 3] + ' ' + tokens[len - 2] + ' ' + tokens[len - 1];
                const rest = tokens.slice(0, len - 3);
                if (rest.length > 1 && /^[A-Za-z]\.?$/.test(rest[rest.length - 1])) {
                    middle = rest.pop();
                }
                firstName = rest.join(' ');
            } else {
                surname = tokens[tokens.length - 1];
                const pen = tokens[tokens.length - 2];
                if (/^[A-Za-z]\.?$/.test(pen)) {
                    middle = pen;
                    firstName = tokens.slice(0, tokens.length - 2).join(' ');
                } else {
                    firstName = tokens.slice(0, tokens.length - 1).join(' ');
                }
            }

            // Clean punctuation on surname
            surname = surname.replace(/[,;]+$/, '').trim();

            // Normalized canonical clustering key (for merging variations like "Annalie C. Rubio" and "Annalie C. Rubio, MSME")
            const normFirst = firstName.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
            let normLast = surname.toLowerCase().replace(/[^a-z]/g, '');
            if (normLast.includes('rubio')) normLast = 'rubio'; // Typo tolerance for 'cmrubio'
            const clusterKey = (normFirst ? normFirst + '_' : '') + normLast;

            // Full display name with all credentials
            const cleanCreds = credentials.length > 0 ? ', ' + credentials.join(', ') : '';
            const fullDisplay = [prefix, firstName, middle, surname, suffix].filter(Boolean).join(' ') + cleanCreds;

            return {
                raw,
                prefix,
                firstName,
                middle,
                surname,
                suffix,
                credentials: credentials.join(', '),
                clusterKey,
                fullDisplay
            };
        }
    };
    window.AcademicNameParser = AcademicNameParser;

    // Render all analytics charts
    function renderCharts(projects, users, savedProjects, activities, filters) {
        if (typeof Chart !== 'undefined') {
            Chart.defaults.resizeDelay = 200;
        }
        const theme = getChartTheme();

        // ===== Interactive Navigation from Analytics to Projects =====
        function navigateToProjectsAndSearch(searchKeyword, displayName, contextLabel = '') {
            if (!searchKeyword) return;

            // 1. Reset project filter pills or activate matching program pill
            const pills = document.querySelectorAll('#project-filters .filter-pill');
            if (pills && pills.length > 0) {
                pills.forEach(p => p.classList.remove('active'));
                const matchedPill = document.querySelector(`#project-filters .filter-pill[data-filter="${searchKeyword}"]`);
                if (matchedPill) {
                    matchedPill.classList.add('active');
                } else {
                    const allPill = document.querySelector('#project-filters .filter-pill[data-filter="all"]');
                    if (allPill) allPill.classList.add('active');
                }
            }

            // 2. Set search input value
            const projectsSearchInput = document.getElementById('projects-search');
            if (projectsSearchInput) {
                projectsSearchInput.value = searchKeyword;
            }

            // 3. Navigate to Projects section via sidebar rail
            const railProjectsBtn = document.querySelector('.rail-nav-item[data-section="projects"]');
            if (railProjectsBtn) {
                railProjectsBtn.click();
            } else {
                document.querySelectorAll('.rail-nav-item').forEach(n => n.classList.remove('active'));
                document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
                const section = document.getElementById('section-projects');
                if (section) section.classList.add('active');
                if (typeof loadProjectsData === 'function') {
                    loadProjectsData();
                }
            }

            // 4. Ensure pagination is reset to 1 and filtered table renders
            currentProjectsPage = 1;
            const tbody = document.getElementById('projects-table-body');
            if (tbody && typeof renderProjectsTablePaginated === 'function') {
                renderProjectsTablePaginated(tbody);
            }

            // 5. Trigger input event and focus search box with smooth scroll
            if (projectsSearchInput) {
                projectsSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
                setTimeout(() => {
                    projectsSearchInput.focus();
                    projectsSearchInput.select();
                    projectsSearchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }

            // 6. User feedback toast
            const label = displayName || searchKeyword;
            const prefix = contextLabel ? `Filtered projects for ${contextLabel}: ` : 'Filtered projects: ';
            if (typeof showToast === 'function') {
                showToast(`${prefix}${label}`, '🔍');
            }
        }

        // ===== Interactive Navigation from Analytics to Users =====
        function navigateToUsersAndSearch(roleKey, displayName) {
            if (!roleKey) return;

            // 1. Reset user filter pills or activate matching role pill
            const pills = document.querySelectorAll('#user-filters .filter-pill');
            if (pills && pills.length > 0) {
                pills.forEach(p => p.classList.remove('active'));
                const matchedPill = document.querySelector(`#user-filters .filter-pill[data-filter="${roleKey.toLowerCase()}"]`);
                if (matchedPill) {
                    matchedPill.classList.add('active');
                } else {
                    const allPill = document.querySelector('#user-filters .filter-pill[data-filter="all"]');
                    if (allPill) allPill.classList.add('active');
                }
            }

            // 2. Set search input value
            const usersSearchInput = document.getElementById('users-search');
            if (usersSearchInput) {
                usersSearchInput.value = roleKey;
            }

            // 3. Navigate to Users section via sidebar rail
            const railUsersBtn = document.querySelector('.rail-nav-item[data-section="users"]');
            if (railUsersBtn) {
                railUsersBtn.click();
            } else {
                document.querySelectorAll('.rail-nav-item').forEach(n => n.classList.remove('active'));
                document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
                const section = document.getElementById('section-users');
                if (section) section.classList.add('active');
                if (typeof loadUsersData === 'function') {
                    loadUsersData();
                }
            }

            // 4. Trigger input event, filter users, and focus with smooth scroll
            if (typeof filterUsersTable === 'function') {
                filterUsersTable();
            }
            if (usersSearchInput) {
                usersSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
                setTimeout(() => {
                    usersSearchInput.focus();
                    usersSearchInput.select();
                    usersSearchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }

            // 5. User feedback toast
            const label = displayName || roleKey;
            if (typeof showToast === 'function') {
                showToast(`Filtered users for role: ${label}`, '👥');
            }
        }

        // -------------------------------------------------------------
        // 1. Projects by Program Chart
        // -------------------------------------------------------------
        const programCounts = {};
        (projects || []).forEach(p => {
            if (p.program && p.program.trim()) {
                const prog = p.program.trim();
                programCounts[prog] = (programCounts[prog] || 0) + 1;
            }
        });
        const programLabels = Object.keys(programCounts).sort((a, b) => programCounts[b] - programCounts[a]);
        const programData = programLabels.map(label => programCounts[label]);

        function buildProgramChart(chartType = 'bar') {
            if (analyticsCharts['programChart']) {
                analyticsCharts['programChart'].destroy();
            }
            const ctx = document.getElementById('programChart');
            if (!ctx) return;

            ctx.style.cursor = 'pointer';
            const isHorizontal = chartType === 'horizontalBar';
            const actualType = isHorizontal ? 'bar' : (chartType === 'doughnut' ? 'doughnut' : 'bar');

            analyticsCharts['programChart'] = new Chart(ctx.getContext('2d'), {
                type: actualType,
                data: {
                    labels: programLabels.length > 0 ? programLabels : ['No Data'],
                    datasets: [{
                        label: 'Theses & Capstones',
                        data: programData.length > 0 ? programData : [0],
                        backgroundColor: actualType === 'doughnut' 
                            ? theme.palette 
                            : programLabels.map((_, i) => theme.palette[i % theme.palette.length]),
                        borderRadius: actualType === 'doughnut' ? 0 : 6,
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: isHorizontal ? 'y' : 'x',
                    onClick: (event, elements, chart) => {
                        let clickedIndex = -1;
                        if (elements && elements.length > 0) {
                            clickedIndex = elements[0].index;
                        } else if (actualType !== 'doughnut' && chart && chart.scales) {
                            const scale = isHorizontal ? chart.scales.y : chart.scales.x;
                            if (scale) {
                                const pixel = isHorizontal 
                                    ? (event.y !== undefined ? event.y : (event.native ? event.native.offsetY : null))
                                    : (event.x !== undefined ? event.x : (event.native ? event.native.offsetX : null));
                                if (pixel !== null) {
                                    const val = scale.getValueForPixel(pixel);
                                    if (typeof val === 'number' && val >= 0 && val < programLabels.length) {
                                        clickedIndex = Math.round(val);
                                    }
                                }
                            }
                        }

                        if (clickedIndex >= 0 && clickedIndex < programLabels.length) {
                            const programName = programLabels[clickedIndex];
                            if (programName && programName !== 'No Data') {
                                navigateToProjectsAndSearch(programName, programName, 'academic program');
                            }
                        }
                    },
                    onHover: (event, elements) => {
                        const target = event.native ? event.native.target : ctx;
                        if (target) {
                            target.style.cursor = elements && elements.length > 0 ? 'pointer' : 'default';
                        }
                    },
                    plugins: {
                        legend: {
                            display: actualType === 'doughnut',
                            position: 'bottom',
                            labels: { color: theme.textColor, boxWidth: 12, padding: 10 }
                        },
                        tooltip: {
                            backgroundColor: theme.tooltipBg,
                            titleColor: theme.tooltipText,
                            bodyColor: theme.tooltipText,
                            borderColor: theme.borderColor,
                            borderWidth: 1,
                            padding: 10,
                            callbacks: {
                                afterLabel: () => '👉 Click to view in Projects'
                            }
                        }
                    },
                    scales: actualType === 'doughnut' ? {} : {
                        x: {
                            grid: { color: theme.gridColor },
                            ticks: { color: theme.textColor, font: { size: 11 } }
                        },
                        y: {
                            grid: { color: theme.gridColor },
                            ticks: { color: theme.textColor, precision: 0, font: { size: 11 } }
                        }
                    }
                }
            });
        }

        const progSwitcherActive = document.querySelector('.chart-type-switcher[data-chart="programChart"] .chart-switch-btn.active');
        const progType = progSwitcherActive ? progSwitcherActive.dataset.type : 'bar';
        buildProgramChart(progType);

        // -------------------------------------------------------------
        // 2. User Community Roles Chart
        // -------------------------------------------------------------
        const roleCounts = { student: 0, teacher: 0, librarian: 0, admin: 0 };
        (users || []).forEach(u => {
            const role = (u.userType || u.role || 'student').toLowerCase();
            if (role === 'teacher' || role === 'faculty') roleCounts.teacher++;
            else if (role === 'librarian') roleCounts.librarian++;
            else if (role === 'admin' || role === 'administrator') roleCounts.admin++;
            else roleCounts.student++;
        });

        const totalUserCount = (users || []).length || 1;
        const roleLabels = ['Students', 'Faculty / Teachers', 'Librarians', 'Administrators'];
        const roleKeys = ['student', 'teacher', 'librarian', 'admin'];
        const roleData = [roleCounts.student, roleCounts.teacher, roleCounts.librarian, roleCounts.admin];
        const roleColors = ['#3b82f6', '#FCCC56', '#08D488', '#764ba2'];

        if (analyticsCharts['userRolesChart']) {
            analyticsCharts['userRolesChart'].destroy();
        }
        const userRolesCtx = document.getElementById('userRolesChart');
        if (userRolesCtx) {
            userRolesCtx.style.cursor = 'pointer';
            analyticsCharts['userRolesChart'] = new Chart(userRolesCtx.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: roleLabels,
                    datasets: [{
                        data: roleData,
                        backgroundColor: roleColors,
                        borderWidth: 0,
                        cutout: '72%'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: (event, elements, chart) => {
                        let clickedIndex = -1;
                        if (elements && elements.length > 0) {
                            clickedIndex = elements[0].index;
                        }
                        if (clickedIndex >= 0 && clickedIndex < roleKeys.length) {
                            navigateToUsersAndSearch(roleKeys[clickedIndex], roleLabels[clickedIndex]);
                        }
                    },
                    onHover: (event, elements) => {
                        const target = event.native ? event.native.target : userRolesCtx;
                        if (target) {
                            target.style.cursor = elements && elements.length > 0 ? 'pointer' : 'default';
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: theme.tooltipBg,
                            titleColor: theme.tooltipText,
                            bodyColor: theme.tooltipText,
                            borderColor: theme.borderColor,
                            borderWidth: 1,
                            callbacks: {
                                label: (context) => {
                                    const val = context.raw || 0;
                                    const pct = Math.round((val / totalUserCount) * 100);
                                    return ` ${context.label}: ${val} (${pct}%)`;
                                },
                                afterLabel: () => '👉 Click to view in Users'
                            }
                        }
                    }
                }
            });

            const legendContainer = document.getElementById('userRolesLegend');
            if (legendContainer) {
                legendContainer.innerHTML = roleLabels.map((label, idx) => {
                    const count = roleData[idx];
                    const pct = Math.round((count / totalUserCount) * 100);
                    return `
                        <div class="legend-item" title="Click to view ${label} in Users" data-role-idx="${idx}" style="cursor: pointer; user-select: none;">
                            <span class="legend-color" style="background:${roleColors[idx]}"></span>
                            <span>${label.split('/')[0].trim()}: <strong>${count}</strong> <small style="opacity:0.8">(${pct}%)</small></span>
                        </div>
                    `;
                }).join('');

                legendContainer.querySelectorAll('.legend-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const idx = parseInt(item.getAttribute('data-role-idx'), 10);
                        if (!isNaN(idx) && idx >= 0 && idx < roleKeys.length) {
                            navigateToUsersAndSearch(roleKeys[idx], roleLabels[idx]);
                        }
                    });
                });
            }
        }

        // -------------------------------------------------------------
        // 3. Repository Growth & Timeline Chart
        // -------------------------------------------------------------
        const yearCounts = {};
        (projects || []).forEach(p => {
            const y = parseInt(p.year);
            if (!isNaN(y)) yearCounts[y] = (yearCounts[y] || 0) + 1;
        });
        const sortedYears = Object.keys(yearCounts).map(Number).sort((a, b) => a - b);
        let cumulativeSum = 0;
        const cumulativeData = sortedYears.map(yr => {
            cumulativeSum += yearCounts[yr];
            return cumulativeSum;
        });
        const annualData = sortedYears.map(yr => yearCounts[yr]);

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
                    labels: sortedYears.length > 0 ? sortedYears : ['No Data'],
                    datasets: [{
                        label: isLine ? 'Cumulative Repository Volume' : 'Annual Inflow',
                        data: isLine ? (cumulativeData.length > 0 ? cumulativeData : [0]) : (annualData.length > 0 ? annualData : [0]),
                        borderColor: '#08D488',
                        backgroundColor: isLine ? 'rgba(8, 212, 136, 0.12)' : '#08D488',
                        fill: isLine,
                        tension: 0.35,
                        borderWidth: 2.5,
                        pointBackgroundColor: '#08D488',
                        pointHoverRadius: 6,
                        borderRadius: isLine ? 0 : 5
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

        // -------------------------------------------------------------
        // 4. Top Capstone Advisers Chart
        // -------------------------------------------------------------
        const adviserClusters = {};
        (projects || []).forEach(p => {
            const parsed = AcademicNameParser.parse(p.adviser);
            if (!parsed) return;

            if (!adviserClusters[parsed.clusterKey]) {
                adviserClusters[parsed.clusterKey] = {
                    clusterKey: parsed.clusterKey,
                    surname: parsed.surname,
                    firstName: parsed.firstName,
                    count: 0,
                    canonicalDisplay: parsed.fullDisplay,
                    rawVariations: []
                };
            }
            const item = adviserClusters[parsed.clusterKey];
            item.count++;
            item.rawVariations.push(p.adviser);
            if (parsed.fullDisplay.length > item.canonicalDisplay.length) {
                item.canonicalDisplay = parsed.fullDisplay;
            }
        });

        const topAdvisers = Object.values(adviserClusters)
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);

        // Check for duplicate surnames among top advisers to disambiguate with first initial
        const surnameCounts = {};
        topAdvisers.forEach(a => {
            surnameCounts[a.surname] = (surnameCounts[a.surname] || 0) + 1;
        });

        const adviserLabels = topAdvisers.length > 0 ? topAdvisers.map(a => {
            if (surnameCounts[a.surname] > 1 && a.firstName) {
                return `${a.firstName.charAt(0).toUpperCase()}. ${a.surname}`;
            }
            return a.surname;
        }) : ['No Data'];

        const adviserData = topAdvisers.length > 0 ? topAdvisers.map(a => a.count) : [0];


        if (analyticsCharts['advisersChart']) {
            analyticsCharts['advisersChart'].destroy();
        }
        const advisersCtx = document.getElementById('advisersChart');
        if (advisersCtx) {
            advisersCtx.style.cursor = 'pointer';
            analyticsCharts['advisersChart'] = new Chart(advisersCtx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: adviserLabels,
                    datasets: [{
                        label: 'Supervised Theses',
                        data: adviserData,
                        backgroundColor: '#6366f1',
                        borderRadius: 5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    onClick: (event, elements, chart) => {
                        let clickedIndex = -1;
                        if (elements && elements.length > 0) {
                            clickedIndex = elements[0].index;
                        } else if (chart && chart.scales && chart.scales.y) {
                            const yPixel = event.y !== undefined ? event.y : (event.native ? event.native.offsetY : null);
                            if (yPixel !== null) {
                                const yVal = chart.scales.y.getValueForPixel(yPixel);
                                if (typeof yVal === 'number' && yVal >= 0 && yVal < topAdvisers.length) {
                                    clickedIndex = Math.round(yVal);
                                }
                            }
                        }

                        if (clickedIndex >= 0 && clickedIndex < topAdvisers.length) {
                            const adviser = topAdvisers[clickedIndex];
                            if (adviser) {
                                const searchKeyword = adviser.surname || adviserLabels[clickedIndex];
                                navigateToProjectsAndSearch(searchKeyword, adviser.canonicalDisplay);
                            }
                        }
                    },
                    onHover: (event, elements) => {
                        const target = event.native ? event.native.target : advisersCtx;
                        if (target) {
                            target.style.cursor = 'pointer';
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: theme.tooltipBg,
                            titleColor: theme.tooltipText,
                            bodyColor: theme.tooltipText,
                            borderColor: theme.borderColor,
                            borderWidth: 1,
                            callbacks: {
                                title: (context) => topAdvisers[context[0].dataIndex]?.canonicalDisplay || '',
                                label: (context) => ` Advised: ${context.raw} projects`,
                                afterLabel: () => '👉 Click to view & search projects'
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

    }

    // Render Top Bookmarked Theses Table
    function renderTopBookmarked(filteredProjects, savedProjects) {
        const tbody = document.getElementById('top-bookmarked-tbody');
        const badge = document.getElementById('top-bookmarked-count-badge');
        if (!tbody) return;

        // Calculate bookmarks per project
        const bookmarkCounts = {};
        (savedProjects || []).forEach(doc => {
            const list = doc.UIDproject || [];
            if (Array.isArray(list)) {
                list.forEach(id => {
                    if (id) bookmarkCounts[id] = (bookmarkCounts[id] || 0) + 1;
                });
            }
        });

        // Pair projects with saves count
        const projectsWithSaves = (filteredProjects || []).map(p => ({
            ...p,
            saveCount: bookmarkCounts[p.id] || 0
        }));

        // Sort descending by saves, then by creation date
        projectsWithSaves.sort((a, b) => {
            if (b.saveCount !== a.saveCount) {
                return b.saveCount - a.saveCount;
            }
            return getTimestamp(b.createdAt) - getTimestamp(a.createdAt);
        });

        const topTheses = projectsWithSaves.slice(0, 10);

        if (badge) {
            const totalWithSaves = projectsWithSaves.filter(p => p.saveCount > 0).length;
            badge.textContent = `${totalWithSaves} Projects Bookmarked`;
        }

        if (topTheses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="analytics-table-empty">No capstone projects match the current filter criteria.</td></tr>';
            return;
        }

        tbody.innerHTML = topTheses.map((p, idx) => {
            const rank = idx + 1;
            const rankClass = rank === 1 ? 'top-1' : (rank === 2 ? 'top-2' : (rank === 3 ? 'top-3' : ''));
            const authorsStr = Array.isArray(p.authors) ? p.authors.join(', ') : (p.authors || 'Unknown Authors');
            const isSynced = p.pineconeSynced === true;

            return `
                <tr>
                    <td>
                        <span class="analytics-rank-badge ${rankClass}">#${rank}</span>
                    </td>
                    <td>
                        <div style="font-weight:600; color:var(--text-primary); margin-bottom:2px; line-height:1.3;">
                            ${escapeHtml(p.title || 'Untitled Thesis')}
                        </div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); max-width:400px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${escapeHtml(authorsStr)}
                        </div>
                    </td>
                    <td>
                        <span class="badge badge-info" style="font-size:0.75rem;">${escapeHtml(p.program || 'N/A')}</span>
                    </td>
                    <td>${escapeHtml(p.year || 'N/A')}</td>
                    <td style="font-size:0.8rem; color:var(--text-secondary);">${escapeHtml(p.adviser || 'N/A')}</td>
                    <td style="text-align:center;">
                        <span class="saves-count-badge">★ ${p.saveCount}</span>
                    </td>
                    <td style="text-align:center;">
                        <span class="pinecone-pill ${isSynced ? 'synced' : 'unsynced'}">
                            ${isSynced ? '● Synced' : '○ Pending'}
                        </span>
                    </td>
                    <td style="text-align:center;">
                        <button class="action-btn action-view" onclick="viewProject('${p.id}')" title="Inspect capstone details" aria-label="Inspect capstone details">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            <span class="action-btn-text">View</span>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Set up control listeners
    function setupAnalyticsListeners(projects, users, savedProjects, activities) {
        // 1. Chart type switchers
        const switchers = document.querySelectorAll('.chart-type-switcher');
        switchers.forEach(sw => {
            const chartKey = sw.dataset.chart;
            const buttons = sw.querySelectorAll('.chart-switch-btn');
            buttons.forEach(btn => {
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                newBtn.addEventListener('click', () => {
                    sw.querySelectorAll('.chart-switch-btn').forEach(b => b.classList.remove('active'));
                    newBtn.classList.add('active');
                    const filteredProjects = getFilteredAnalyticsProjects(projects, currentAnalyticsFilter);
                    renderCharts(filteredProjects, users, savedProjects, activities, currentAnalyticsFilter);
                });
            });
        });

        // Helper to update active filter state and UI reset button
        function updateAnalyticsFilterState() {
            const resetBtn = document.getElementById('analytics-reset-filters-btn');
            const hasFilter = (currentAnalyticsFilter.program && currentAnalyticsFilter.program !== 'all') || 
                              (currentAnalyticsFilter.range && currentAnalyticsFilter.range !== 'all');
            
            if (resetBtn) {
                if (hasFilter) {
                    const label = currentAnalyticsFilter.program !== 'all' 
                        ? `Reset ${currentAnalyticsFilter.program}` 
                        : `Reset ${currentAnalyticsFilter.range.toUpperCase()}`;
                    resetBtn.innerHTML = `<span>${label}</span><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
                    resetBtn.style.display = 'inline-flex';
                } else {
                    resetBtn.style.display = 'none';
                }
            }
        }

        // 2. Program Selector Filter
        const progSelect = document.getElementById('analytics-program-filter');
        if (progSelect) {
            const newProgSelect = progSelect.cloneNode(true);
            progSelect.parentNode.replaceChild(newProgSelect, progSelect);
            newProgSelect.addEventListener('change', () => {
                currentAnalyticsFilter.program = newProgSelect.value;
                updateAnalyticsFilterState();
                const filtered = getFilteredAnalyticsProjects(projects, currentAnalyticsFilter);
                renderKPIs(filtered, users, savedProjects, projects, currentAnalyticsFilter);
                renderCharts(filtered, users, savedProjects, activities, currentAnalyticsFilter);
                renderTopBookmarked(filtered, savedProjects);
            });
        }

        // 3. Time Range Filter Tabs
        const rangeTabs = document.querySelectorAll('#analytics-time-tabs .analytics-tab');
        rangeTabs.forEach(tab => {
            const newTab = tab.cloneNode(true);
            tab.parentNode.replaceChild(newTab, tab);
            newTab.addEventListener('click', () => {
                document.querySelectorAll('#analytics-time-tabs .analytics-tab').forEach(t => {
                    t.classList.remove('active');
                    t.setAttribute('aria-selected', 'false');
                });
                newTab.classList.add('active');
                newTab.setAttribute('aria-selected', 'true');
                currentAnalyticsFilter.range = newTab.dataset.range || 'all';
                updateAnalyticsFilterState();

                const filtered = getFilteredAnalyticsProjects(projects, currentAnalyticsFilter);
                renderKPIs(filtered, users, savedProjects, projects, currentAnalyticsFilter);
                renderCharts(filtered, users, savedProjects, activities, currentAnalyticsFilter);
                renderTopBookmarked(filtered, savedProjects);
            });
        });

        // 3b. Reset Filter Pill Action
        const resetFiltersBtn = document.getElementById('analytics-reset-filters-btn');
        if (resetFiltersBtn) {
            const newResetBtn = resetFiltersBtn.cloneNode(true);
            resetFiltersBtn.parentNode.replaceChild(newResetBtn, resetFiltersBtn);
            newResetBtn.addEventListener('click', () => {
                currentAnalyticsFilter.program = 'all';
                currentAnalyticsFilter.range = 'all';

                const pSelect = document.getElementById('analytics-program-filter');
                if (pSelect) pSelect.value = 'all';

                document.querySelectorAll('#analytics-time-tabs .analytics-tab').forEach(t => {
                    const isAll = t.dataset.range === 'all';
                    t.classList.toggle('active', isAll);
                    t.setAttribute('aria-selected', isAll ? 'true' : 'false');
                });

                updateAnalyticsFilterState();
                const filtered = getFilteredAnalyticsProjects(projects, currentAnalyticsFilter);
                renderKPIs(filtered, users, savedProjects, projects, currentAnalyticsFilter);
                renderCharts(filtered, users, savedProjects, activities, currentAnalyticsFilter);
                renderTopBookmarked(filtered, savedProjects);
                showToast('Analytics filters reset to default', 'ℹ️');
            });
        }

        // Initial filter state check
        updateAnalyticsFilterState();

        // 4. Refresh Button with tactile animation
        const refreshBtn = document.getElementById('analytics-refresh-btn');
        if (refreshBtn) {
            const newRefreshBtn = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(newRefreshBtn, refreshBtn);
            newRefreshBtn.addEventListener('click', async () => {
                const icon = newRefreshBtn.querySelector('.refresh-icon') || newRefreshBtn.querySelector('svg');
                const label = newRefreshBtn.querySelector('.action-btn-label') || newRefreshBtn.querySelector('span');
                
                if (icon) icon.classList.add('rotating');
                if (label) label.textContent = 'Refreshing...';
                newRefreshBtn.disabled = true;

                try {
                    showToast('Refreshing repository data & intelligence...', 'ℹ️');
                    localStorage.removeItem('projectsData');
                    localStorage.removeItem('usersData');
                    sessionStorage.removeItem('recap_analytics_saved');
                    sessionStorage.removeItem('recap_analytics_activities');
                    await loadAnalyticsData();
                    showToast('Analytics refreshed with latest database snapshot', '✅');
                } catch (err) {
                    console.error('Refresh error:', err);
                    showToast('Failed to refresh analytics', '❌');
                } finally {
                    if (icon) icon.classList.remove('rotating');
                    if (label) label.textContent = 'Refresh';
                    newRefreshBtn.disabled = false;
                }
            });
        }

        // 5. Print Official Report Button
        const printBtn = document.getElementById('analytics-print-btn');
        if (printBtn) {
            const newPrintBtn = printBtn.cloneNode(true);
            printBtn.parentNode.replaceChild(newPrintBtn, printBtn);
            newPrintBtn.addEventListener('click', () => {
                const tsEl = document.getElementById('analytics-print-timestamp');
                if (tsEl) {
                    tsEl.textContent = `Generated on ${new Date().toLocaleString()} | Filter: ${currentAnalyticsFilter.program} (${currentAnalyticsFilter.range.toUpperCase()})`;
                }
                window.print();
            });
        }

        // 6. Export Comprehensive CSV with Blob and Excel UTF-8 BOM
        const exportBtn = document.getElementById('analytics-export-btn');
        if (exportBtn) {
            const newExportBtn = exportBtn.cloneNode(true);
            exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
            newExportBtn.addEventListener('click', () => {
                try {
                    const filtered = getFilteredAnalyticsProjects(projects, currentAnalyticsFilter);
                    const bookmarkCounts = {};
                    (savedProjects || []).forEach(doc => {
                        const list = doc.UIDproject || [];
                        if (Array.isArray(list)) {
                            list.forEach(id => {
                                if (id) bookmarkCounts[id] = (bookmarkCounts[id] || 0) + 1;
                            });
                        }
                    });

                    let csvContent = "Rank,Title,Authors,Program,Year,Adviser,BookmarksCount,PineconeSynced,DateAdded\n";

                    filtered.forEach((p, index) => {
                        const title = `"${(p.title || '').replace(/"/g, '""')}"`;
                        const authors = `"${(Array.isArray(p.authors) ? p.authors.join(', ') : p.authors || '').replace(/"/g, '""')}"`;
                        const program = `"${(p.program || '').replace(/"/g, '""')}"`;
                        const year = `"${p.year || ''}"`;
                        const adviser = `"${(p.adviser || '').replace(/"/g, '""')}"`;
                        const saves = bookmarkCounts[p.id] || 0;
                        const synced = p.pineconeSynced ? 'Yes' : 'No';
                        const dateAdded = `"${new Date(getTimestamp(p.createdAt)).toLocaleDateString()}"`;

                        csvContent += `${index + 1},${title},${authors},${program},${year},${adviser},${saves},${synced},${dateAdded}\n`;
                    });

                    // Use Blob with UTF-8 BOM for flawless Excel and multi-language support
                    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.setAttribute("href", url);
                    link.setAttribute("download", `RE-CAPS_Analytics_Report_${currentAnalyticsFilter.program}_${new Date().toISOString().split('T')[0]}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);

                    showToast('Analytics CSV dataset exported successfully', '✅');
                } catch (e) {
                    console.error('Export error:', e);
                    showToast('Failed to export CSV report', '❌');
                }
            });
        }

        // 7. Theme change Mutation Observer
        if (!window.analyticsThemeObserverRegistered) {
            const observer = new MutationObserver(() => {
                const activeSection = document.querySelector('.content-section.active');
                if (activeSection && activeSection.id === 'section-analytics') {
                    const filtered = getFilteredAnalyticsProjects(projects, currentAnalyticsFilter);
                    renderCharts(filtered, users, savedProjects, activities, currentAnalyticsFilter);
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
            window.location.href = '../index.html';
            
        } catch (error) {
            console.error('Error loading project for view:', error);
            showToast('Error loading project: ' + error.message, '❌');
        }
    };

    window.editProject = async (projectId) => {
        console.log('Edit project:', projectId);
        try {
            // showToast('Loading project details...', 'ℹ️');
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

            // Populate dynamic fields
            initDynamicContainers({ authors: editAuthors, topics: editTopics, keywords: editKeywords });

            // Load and populate Section 5: Cataloging & Accountability
            try {
                const cnDoc = await db.collection('catalogNotes').doc(projectId).get();
                const cnData = cnDoc.exists ? cnDoc.data() : null;
                const isCataloged = !!(cnData?.note || cnData?.callNumber || data.catalogLocation || data.cataloged);

                const auditBox = document.getElementById('admin-catalog-audit-box');
                const badge = document.getElementById('admin-audit-badge');
                const details = document.getElementById('admin-audit-details');
                const createdByEl = document.getElementById('admin-audit-created-by');
                const updatedByEl = document.getElementById('admin-audit-updated-by');
                const updatedAtEl = document.getElementById('admin-audit-updated-at');
                const countEl = document.getElementById('admin-audit-count');
                const historyList = document.getElementById('admin-audit-history-list');

                // Location fields
                const locInput = document.getElementById('project-catalog-location');
                const callInput = document.getElementById('project-call-number');
                const accInput = document.getElementById('project-accession-number');
                if (locInput) locInput.value = cnData?.note || data.catalogLocation || '';
                if (callInput) callInput.value = cnData?.callNumber || data.callNumber || '';
                if (accInput) accInput.value = cnData?.accessionNumber || data.accessionNumber || '';

                if (isCataloged) {
                    if (badge) {
                        badge.textContent = 'Cataloged';
                        badge.classList.add('cataloged');
                    }
                    if (details) details.style.display = 'block';

                    const creatorName = cnData?.createdByName || data.catalogAudit?.createdByName || 'Librarian';
                    const creatorEmail = cnData?.createdByEmail || '';
                    if (createdByEl) createdByEl.textContent = creatorEmail ? `${creatorName} (${creatorEmail})` : creatorName;

                    const updaterName = cnData?.lastUpdatedByName || data.catalogAudit?.lastUpdatedByName || creatorName;
                    const updaterEmail = cnData?.lastUpdatedByEmail || data.catalogAudit?.lastUpdatedByEmail || creatorEmail;
                    if (updatedByEl) updatedByEl.textContent = updaterEmail ? `${updaterName} (${updaterEmail})` : updaterName;

                    const updatedTs = cnData?.updatedAt || cnData?.createdAt || data.lastCatalogedAt;
                    if (updatedAtEl) updatedAtEl.textContent = formatDate(updatedTs);

                    const history = Array.isArray(cnData?.auditHistory) ? cnData.auditHistory : [];
                    if (countEl) countEl.textContent = `${history.length || 1} revision(s)`;

                    if (historyList) {
                        if (history.length === 0) {
                            historyList.innerHTML = '<div style="color:var(--text-secondary);font-size:0.75rem;padding:0.5rem;">Initial record created.</div>';
                        } else {
                            historyList.innerHTML = history.map(item => `
                                <div class="admin-audit-history-entry">
                                    <div class="admin-audit-entry-top">
                                        <span>${escapeHtml(item.action || 'Updated')}</span>
                                        <span style="font-size:0.7rem;color:var(--text-secondary);">${formatDate(item.timestamp)}</span>
                                    </div>
                                    <div class="admin-audit-entry-desc">
                                        Librarian: <strong>${escapeHtml(item.userName || 'Librarian')}</strong> (${escapeHtml(item.userEmail || '')})
                                    </div>
                                    ${item.details ? `<div style="font-size:0.7rem;color:var(--text-secondary);margin-top:2px;">${escapeHtml(item.details)}</div>` : ''}
                                </div>
                            `).join('');
                        }
                    }
                } else {
                    if (badge) {
                        badge.textContent = 'Not Cataloged';
                        badge.classList.remove('cataloged');
                    }
                    if (details) details.style.display = 'none';
                }

                // Toggle history button
                const toggleBtn = document.getElementById('admin-audit-history-toggle');
                if (toggleBtn) {
                    toggleBtn.onclick = () => {
                        if (historyList) {
                            historyList.style.display = historyList.style.display === 'none' ? 'flex' : 'none';
                        }
                    };
                }
            } catch (cnErr) {
                console.warn('Could not load catalog audit for admin:', cnErr);
            }

            // Populate existing project images
            projectExistingImages = Array.isArray(data.images) ? [...data.images] : [];
            projectImageFiles = [];
            renderProjectImagesPreview();

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
    
    // ── Processing state helpers ──────────────────────────────────────────────
    // Shows a full-modal blur overlay with a spinner so the admin cannot
    // accidentally click anything else while the delete is in progress.
    function setDeleteProcessing(active) {
        const modal    = document.getElementById('secure-delete-modal');
        const overlay  = document.getElementById('delete-processing-overlay');
        const closeBtn = document.getElementById('secure-delete-modal-close-btn');
        const cancelBtn = document.getElementById('secure-delete-cancel-btn');
        const deleteBtn = document.getElementById('secure-delete-confirm-btn');
        const input    = document.getElementById('secure-delete-input');

        if (active) {
            // Show spinner overlay
            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');
            // Add guard class to the outer modal (blocks backdrop click via CSS)
            modal.classList.add('is-processing');
            // Disable all interactive elements as a belt-and-suspenders measure
            closeBtn.disabled  = true;
            cancelBtn.disabled = true;
            deleteBtn.disabled = true;
            input.disabled     = true;
        } else {
            // Hide spinner overlay
            overlay.classList.remove('active');
            overlay.setAttribute('aria-hidden', 'true');
            modal.classList.remove('is-processing');
            // Re-enable close/cancel (delete btn stays disabled — it's a one-shot)
            closeBtn.disabled  = false;
            cancelBtn.disabled = false;
            input.disabled     = false;
        }
    }

    async function confirmSecureDelete() {
        if (!secureDeleteProjectId || !secureDeleteProjectTitle) return;
        
        const deleteBtn  = document.getElementById('secure-delete-confirm-btn');
        const originalText = deleteBtn.innerHTML;
        
        try {
            // ── Activate processing state ─────────────────────────────────────
            // Shows blur overlay + spinner and disables all modal controls so
            // the admin cannot accidentally click Cancel, Close, or the backdrop.
            setDeleteProcessing(true);
            showToast('Deleting project...', 'ℹ️');

            // Fetch project data to get image URLs before deletion
            let projectImages = [];
            try {
                const projectDoc = await db.collection('projects').doc(secureDeleteProjectId).get();
                if (projectDoc.exists) {
                    const projectData = projectDoc.data();
                    projectImages = projectData.images || [];
                    console.log(`📸 Found ${projectImages.length} images to delete`);
                }
            } catch (fetchError) {
                console.warn('Could not fetch project images:', fetchError);
            }
            
            // Delete from Firestore
            await db.collection('projects').doc(secureDeleteProjectId).delete();
            
            // Delete images from Cloudinary (non-blocking)
            if (projectImages.length > 0 && window.CloudinaryService) {
                console.log(`🗑️  Deleting ${projectImages.length} images from Cloudinary...`);
                try {
                    const deleteResults = await window.CloudinaryService.deleteMultipleImages(projectImages);
                    console.log(`✓ Deleted ${deleteResults.deletedCount} images, ${deleteResults.failedCount} failed`);
                    
                    if (deleteResults.failedCount > 0) {
                        console.warn('Some images failed to delete:', deleteResults.results.filter(r => !r.success));
                    }
                } catch (imgError) {
                    console.error('⚠️  Image deletion failed (non-critical):', imgError);
                    // Don't fail the entire operation if image deletion fails
                }
            }
            
            // Update Realtime Database counters
            try {
                if (rtdb) {
                    const countRef = rtdb.ref('projects_document_count');
                    await countRef.transaction((current) => Math.max(0, (current || 0) - 1));
                    const updateCounterRef = rtdb.ref('update_counter');
                    await updateCounterRef.transaction((current) => (current || 0) + 1);
                    console.log('✓ RTDB counters updated after deletion');
                } else {
                    console.warn('RTDB not available, skipping counter update');
                }
            } catch (rtdbError) {
                console.warn('RTDB counter update failed:', rtdbError);
            }
            
            // Invalidate cache to force fresh data on next load
            invalidateCache();

            // Delete from Pinecone
            try {
                console.log('🔄 Deleting project from Pinecone...');
                const backendUrl = getBackendUrl();
                const deleteResponse = await fetch(`${backendUrl}/api/projects/sync/${secureDeleteProjectId}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!deleteResponse.ok) {
                    const errorData = await deleteResponse.json();
                    throw new Error(errorData.error || 'Pinecone delete failed');
                }

                console.log('✓ Project deleted from Pinecone successfully');
            } catch (pineconeErr) {
                console.error('⚠️ Pinecone delete failed (non-critical):', pineconeErr);
            }

            // ── Deactivate processing state before closing ────────────────────
            setDeleteProcessing(false);
            closeSecureDeleteModal();
            showToast('Project deleted successfully', '✅');
            
            // Log admin activity
            if (window.ActivityService && typeof window.ActivityService.logAdmin === 'function') {
                window.ActivityService.logAdmin('project_deleted', secureDeleteProjectTitle, `Permanently deleted project: "${secureDeleteProjectTitle}"`);
            }
            
            await loadProjectsData();
            await loadDashboardData();
        } catch (error) {
            console.error('Error deleting project:', error);
            // ── Deactivate processing state on error so admin can retry/cancel ─
            setDeleteProcessing(false);
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = originalText;
            showToast('Error deleting project: ' + error.message, '❌');
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

    // Guard close/cancel/backdrop so they are no-ops while deletion is processing
    const guardedClose = () => {
        if (document.getElementById('secure-delete-modal').classList.contains('is-processing')) return;
        closeSecureDeleteModal();
    };
    document.getElementById('secure-delete-cancel-btn').addEventListener('click', guardedClose);
    document.getElementById('secure-delete-modal-close-btn').addEventListener('click', guardedClose);
    document.getElementById('secure-delete-modal-overlay').addEventListener('click', guardedClose);
    
    // Allow Enter key to submit if valid
    document.getElementById('secure-delete-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const deleteBtn = document.getElementById('secure-delete-confirm-btn');
            const isProcessing = document.getElementById('secure-delete-modal').classList.contains('is-processing');
            if (!deleteBtn.disabled && !isProcessing) {
                confirmSecureDelete();
            }
        }
    });

    window.viewUser = (userId) => {
        console.log('View user:', userId);
        showToast('User profile view coming soon', 'ℹ️');
        // TODO: Implement user profile view modal
    };

    // ===== User Deletion Logic (Auth + Firestore + Cache) =====

    async function performUserDeletion(userId, userData, name) {
        try {
            showToast('Deleting user from database & authentication...', 'ℹ️');

            // 1. Immediately remove row from the DOM table for instant feedback
            const tbody = document.getElementById('users-table-body');
            if (tbody) {
                const rows = Array.from(tbody.querySelectorAll('tr'));
                rows.forEach(row => {
                    const deleteBtn = row.querySelector(`button[onclick*="${userId}"]`);
                    if (deleteBtn) {
                        row.remove();
                    }
                });
                if (tbody.querySelectorAll('tr').length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No users found</td></tr>';
                }
            }

            // 2. Immediately update local cache to remove the deleted user
            try {
                const cachedUsers = loadUsersFromCache();
                if (cachedUsers && Array.isArray(cachedUsers)) {
                    const filtered = cachedUsers.filter(u => u.id !== userId);
                    localStorage.setItem('usersData', JSON.stringify(filtered));
                    localStorage.setItem('usersMetadata', JSON.stringify({
                        userCount: filtered.length,
                        lastCached: new Date().toISOString()
                    }));
                }
            } catch (cacheErr) {
                console.warn('Could not update user cache:', cacheErr);
            }

            // 3. Call backend to delete user from Firebase Authentication & Firestore
            const backendUrl = getBackendUrl();
            let authDeleted = false;
            try {
                const response = await fetch(`${backendUrl}/api/users/${userId}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: userData?.email || '',
                        fullName: name || userData?.fullName || ''
                    })
                });

                if (response.ok) {
                    const resJson = await response.json();
                    authDeleted = resJson.authDeleted;
                    console.log('✓ Backend user delete success:', resJson);
                } else {
                    console.warn(`⚠️ Backend delete returned status ${response.status}`);
                }
            } catch (backendError) {
                console.warn('⚠️ Backend user delete failed or unreachable:', backendError.message);
            }

            // 4. Also guarantee Firestore document deletion directly from client SDK
            try {
                await db.collection('users').doc(userId).delete();
                console.log(`✓ Firestore document deleted for ${userId}`);
            } catch (fsError) {
                console.warn('⚠️ Client-side Firestore delete:', fsError.message);
            }

            // 5. Invalidate users cache completely
            invalidateUsersCache();

            showToast('User deleted successfully', '✅');

            // Log admin activity
            if (window.ActivityService && typeof window.ActivityService.logAdmin === 'function') {
                const displayName = userData?.fullName || userData?.email || name || userId;
                window.ActivityService.logAdmin('user_deleted', displayName, `Deleted user account: ${displayName} (${userData?.userType || 'unknown role'})`);
            }

            // 6. Force reload users data and dashboard stats immediately
            await loadUsersData(true);
            await loadDashboardData(true);

        } catch (error) {
            console.error('Error deleting user:', error);
            showToast('Error deleting user: ' + error.message, '❌');
            // Re-render users table on error to ensure correct state
            await loadUsersData(true);
        }
    }

    window.deleteUser = async (userId, name) => {
        try {
            // Fetch user data to get security question
            const userDoc = await db.collection('users').doc(userId).get();
            
            if (!userDoc.exists) {
                // Doc not in Firestore – offer to purge the Auth account directly
                const confirmed = await ModalDialog.confirm({
                    title: 'Delete Account',
                    message: `This user does not exist in the Firestore database, but may still remain in Firebase Authentication.\n\nDo you want to permanently delete authentication account "${name || userId}"?`,
                    confirmText: 'Delete Auth Account',
                    cancelText: 'Cancel',
                    isDanger: true,
                    icon: 'trash'
                });
                if (confirmed) {
                    await performUserDeletion(userId, { email: '' }, name);
                }
                return;
            }
            
            const userData = userDoc.data();
            
            // Check if user has security question/answer
            if (!userData.securityQuestion || !userData.securityAnswer) {
                // Fallback for accounts without security questions
                const confirmed = await ModalDialog.confirm({
                    title: 'Delete User',
                    message: `This user has not configured a security question.\n\nAre you sure you want to permanently delete "${name || userData.fullName || userData.email}"?\nThis will delete their account from both Firebase Authentication and Firestore.`,
                    confirmText: 'Delete User',
                    cancelText: 'Cancel',
                    isDanger: true,
                    icon: 'trash'
                });
                if (confirmed) {
                    await performUserDeletion(userId, userData, name);
                }
                return;
            }
            
            // Map security question codes to readable text
            const questionMap = {
                'pet': 'What was the name of your first pet?',
                'school': 'What was the name of your first school?',
                'city': 'What city were you born in?',
                'maiden': 'What is your mother\'s maiden name?',
                'book': 'What is your favorite book?'
            };
            
            const questionText = questionMap[userData.securityQuestion] || userData.securityQuestion;
            
            // Show security question modal
            const modal = document.getElementById('security-question-modal');
            const overlay = document.getElementById('security-question-modal-overlay');
            const userNameEl = document.getElementById('security-question-user-name');
            const questionDisplayEl = document.getElementById('security-question-display');
            const answerInput = document.getElementById('security-answer-input');
            const errorEl = document.getElementById('security-answer-error');
            const closeBtn = document.getElementById('security-question-modal-close-btn');
            const cancelBtn = document.getElementById('security-question-cancel-btn');
            const verifyBtn = document.getElementById('security-question-verify-btn');
            
            // Set modal content
            userNameEl.textContent = name;
            questionDisplayEl.textContent = questionText;
            answerInput.value = '';
            errorEl.style.display = 'none';
            
            // Show modal
            modal.classList.add('active');
            answerInput.focus();
            
            // Close modal function
            const closeModal = () => {
                modal.classList.remove('active');
                answerInput.value = '';
                errorEl.style.display = 'none';
            };
            
            // Event listeners (remove any existing ones first)
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
            const newCancelBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
            const newVerifyBtn = verifyBtn.cloneNode(true);
            verifyBtn.parentNode.replaceChild(newVerifyBtn, verifyBtn);
            const newOverlay = overlay.cloneNode(true);
            overlay.parentNode.replaceChild(newOverlay, overlay);
            
            // Add new event listeners
            newCloseBtn.addEventListener('click', closeModal);
            newCancelBtn.addEventListener('click', closeModal);
            newOverlay.addEventListener('click', (e) => {
                if (e.target === newOverlay) closeModal();
            });
            
            // Handle Enter key in input
            answerInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    newVerifyBtn.click();
                }
            });
            
            // Verify and delete
            newVerifyBtn.addEventListener('click', async () => {
                const enteredAnswer = answerInput.value.trim();
                const correctAnswer = userData.securityAnswer.trim();
                
                // Case-insensitive comparison
                if (enteredAnswer.toLowerCase() === correctAnswer.toLowerCase()) {
                    closeModal();
                    await performUserDeletion(userId, userData, name);
                } else {
                    // Incorrect answer
                    errorEl.style.display = 'block';
                    answerInput.style.borderColor = '#e53e3e';
                    answerInput.focus();
                    
                    // Reset border color after 3 seconds
                    setTimeout(() => {
                        answerInput.style.borderColor = '';
                    }, 3000);
                }
            });
            
        } catch (error) {
            console.error('Error in deleteUser:', error);
            showToast('Error: ' + error.message, '❌');
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
            triggerAutoSave();
        });

        input.addEventListener('input', triggerAutoSave);

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
            if (text && (text.includes(';') || text.includes('\n') || (text.match(/,/g) || []).length > 1)) {
                e.preventDefault();
                let parts = [];
                if (text.includes(';')) parts = text.split(';');
                else if (text.includes('\n')) parts = text.split('\n');
                else parts = text.split(',');
                parts = parts.map(s => s.trim()).filter(Boolean);
                if (parts.length > 0) {
                    input.value = parts[0];
                    for (let i = 1; i < parts.length; i++) {
                        createDynamicRow(containerId, placeholder, parts[i]);
                    }
                    triggerAutoSave();
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
        clearDynamicContainer('authors-container');
        clearDynamicContainer('topics-container');
        clearDynamicContainer('keywords-container');
        const authors = data.authors || [];
        const topics = data.topics || [];
        const keywords = data.keywords || [];
        const authorPlaceholder = 'Author name (e.g., Juan Dela Cruz or Reyes, A.)';
        if (authors.length === 0) createDynamicRow('authors-container', authorPlaceholder);
        else authors.forEach(a => createDynamicRow('authors-container', authorPlaceholder, a));
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
                    keywords: getDynamicValues('keywords-container')
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
    if (addAuthorBtn) addAuthorBtn.addEventListener('click', () => createDynamicRow('authors-container', 'Author name (e.g., Juan Dela Cruz or Reyes, A.)'));
    const addTopicBtn = document.getElementById('add-topic-btn');
    if (addTopicBtn) addTopicBtn.addEventListener('click', () => createDynamicRow('topics-container', 'e.g., Machine Learning'));
    const addKeywordBtn = document.getElementById('add-keyword-btn');
    if (addKeywordBtn) addKeywordBtn.addEventListener('click', () => createDynamicRow('keywords-container', 'e.g., Python'));

    // ===== Pinecone Vector Sync Modal Controller =====
    const syncPineconeBtn              = document.getElementById('sync-pinecone-btn');
    const pineconeSyncModal            = document.getElementById('pinecone-sync-modal');
    const pineconeSyncModalOverlay     = document.getElementById('pinecone-sync-modal-overlay');
    const pineconeSyncCloseBtn         = document.getElementById('pinecone-sync-modal-close-btn');
    const pineconeSyncCancelBtn        = document.getElementById('pinecone-sync-cancel-btn');
    const pineconeSyncConfirmBtn       = document.getElementById('pinecone-sync-confirm-btn');
    const pineconeSyncDoneBtn          = document.getElementById('pinecone-sync-done-btn');
    const pineconeSyncRetryFailedBtn   = document.getElementById('pinecone-sync-retry-failed-btn');

    // Views
    const pineconeSyncReadyView        = document.getElementById('pinecone-sync-ready-view');
    const pineconeSyncProgressView     = document.getElementById('pinecone-sync-progress-view');
    const pineconeSyncResultView       = document.getElementById('pinecone-sync-result-view');

    // Option cards & inputs
    const pineconeOptionUnsyncedCard   = document.getElementById('pinecone-option-unsynced-card');
    const pineconeOptionAllCard        = document.getElementById('pinecone-option-all-card');
    const pineconeModeUnsynced         = document.getElementById('pinecone-sync-mode-unsynced');
    const pineconeModeAll              = document.getElementById('pinecone-sync-mode-all');

    // Live stat elements
    const pineconeStatTotal            = document.getElementById('pinecone-stat-total');
    const pineconeStatSynced           = document.getElementById('pinecone-stat-synced');
    const pineconeStatUnsynced         = document.getElementById('pinecone-stat-unsynced');
    const pineconeOptionUnsyncedDesc   = document.getElementById('pinecone-option-unsynced-desc');

    // Progress elements
    const pineconeProgressBarFill      = document.getElementById('pinecone-progress-bar-fill');
    const pineconeProgressPercent      = document.getElementById('pinecone-progress-percent');
    const pineconeProgressCounter      = document.getElementById('pinecone-progress-counter');
    const pineconeProgressStatusText   = document.getElementById('pinecone-progress-status-text');
    const pineconeCurrentProjectTitle  = document.getElementById('pinecone-current-project-title');

    // Result elements
    const pineconeResultHero           = document.getElementById('pinecone-result-hero');
    const pineconeResultIcon           = document.getElementById('pinecone-result-icon');
    const pineconeResultTitle          = document.getElementById('pinecone-result-title');
    const pineconeResultSubtitle       = document.getElementById('pinecone-result-subtitle');
    const pineconeResultSuccessCount   = document.getElementById('pinecone-result-success-count');
    const pineconeResultFailedCount    = document.getElementById('pinecone-result-failed-count');
    const pineconeResultTotalCount     = document.getElementById('pinecone-result-total-count');
    const pineconeResultFailedCard     = document.getElementById('pinecone-result-failed-card');
    const pineconeResultErrorsContainer = document.getElementById('pinecone-result-errors-container');
    const pineconeResultErrorsCount    = document.getElementById('pinecone-result-errors-count');
    const pineconeResultErrorsList     = document.getElementById('pinecone-result-errors-list');

    let isPineconeSyncRunning = false;
    let lastPineconeFailedProjects = [];

    // Open Pinecone Sync Modal
    function openPineconeSyncModal() {
        if (!pineconeSyncModal) return;

        const totalProjects = (allProjectsData || []).length;
        const syncedProjects = (allProjectsData || []).filter(p => p.pineconeSynced === true).length;
        const unsyncedProjects = (allProjectsData || []).filter(p => p.pineconeSynced !== true);

        // Update live stats
        if (pineconeStatTotal) pineconeStatTotal.textContent = totalProjects;
        if (pineconeStatSynced) pineconeStatSynced.textContent = syncedProjects;
        if (pineconeStatUnsynced) pineconeStatUnsynced.textContent = unsyncedProjects.length;

        // Auto-select mode based on unsynced count
        if (unsyncedProjects.length > 0) {
            if (pineconeModeUnsynced) pineconeModeUnsynced.checked = true;
            if (pineconeOptionUnsyncedCard) pineconeOptionUnsyncedCard.classList.add('active');
            if (pineconeOptionAllCard) pineconeOptionAllCard.classList.remove('active');
            if (pineconeOptionUnsyncedDesc) {
                pineconeOptionUnsyncedDesc.textContent = `Quickly uploads and generates vector embeddings only for the ${unsyncedProjects.length} pending project(s).`;
            }
        } else {
            if (pineconeModeAll) pineconeModeAll.checked = true;
            if (pineconeOptionAllCard) pineconeOptionAllCard.classList.add('active');
            if (pineconeOptionUnsyncedCard) pineconeOptionUnsyncedCard.classList.remove('active');
            if (pineconeOptionUnsyncedDesc) {
                pineconeOptionUnsyncedDesc.textContent = `All ${totalProjects} projects are currently synced with Pinecone. Choose Full Re-Sync if you need to re-index.`;
            }
        }

        // Show Ready view, reset progress/results
        if (pineconeSyncReadyView) pineconeSyncReadyView.style.display = 'block';
        if (pineconeSyncProgressView) pineconeSyncProgressView.style.display = 'none';
        if (pineconeSyncResultView) pineconeSyncResultView.style.display = 'none';

        if (pineconeSyncCancelBtn) pineconeSyncCancelBtn.style.display = 'inline-flex';
        if (pineconeSyncConfirmBtn) pineconeSyncConfirmBtn.style.display = 'inline-flex';
        if (pineconeSyncDoneBtn) pineconeSyncDoneBtn.style.display = 'none';
        if (pineconeSyncRetryFailedBtn) pineconeSyncRetryFailedBtn.style.display = 'none';

        if (pineconeSyncCloseBtn) pineconeSyncCloseBtn.disabled = false;
        if (pineconeSyncCancelBtn) pineconeSyncCancelBtn.disabled = false;
        if (pineconeSyncConfirmBtn) pineconeSyncConfirmBtn.disabled = false;

        pineconeSyncModal.classList.add('active');
    }

    // Close modal safely (guarded against closing while sync is active)
    function closePineconeSyncModal() {
        if (isPineconeSyncRunning) return;
        if (pineconeSyncModal) {
            pineconeSyncModal.classList.remove('active');
        }
    }

    // Option cards selection handlers
    if (pineconeOptionUnsyncedCard) {
        pineconeOptionUnsyncedCard.addEventListener('click', () => {
            if (pineconeModeUnsynced) pineconeModeUnsynced.checked = true;
            pineconeOptionUnsyncedCard.classList.add('active');
            if (pineconeOptionAllCard) pineconeOptionAllCard.classList.remove('active');
        });
    }

    if (pineconeOptionAllCard) {
        pineconeOptionAllCard.addEventListener('click', () => {
            if (pineconeModeAll) pineconeModeAll.checked = true;
            pineconeOptionAllCard.classList.add('active');
            if (pineconeOptionUnsyncedCard) pineconeOptionUnsyncedCard.classList.remove('active');
        });
    }

    // Modal close buttons
    if (pineconeSyncCloseBtn) {
        pineconeSyncCloseBtn.addEventListener('click', closePineconeSyncModal);
    }
    if (pineconeSyncCancelBtn) {
        pineconeSyncCancelBtn.addEventListener('click', closePineconeSyncModal);
    }
    if (pineconeSyncDoneBtn) {
        pineconeSyncDoneBtn.addEventListener('click', closePineconeSyncModal);
    }
    if (pineconeSyncModalOverlay) {
        pineconeSyncModalOverlay.addEventListener('click', (e) => {
            if (e.target === pineconeSyncModalOverlay) {
                closePineconeSyncModal();
            }
        });
    }

    // Execute Pinecone Sync loop with live progress
    async function executePineconeSync(projectsToSync) {
        if (!projectsToSync || projectsToSync.length === 0) {
            showToast('No projects to sync.', 'ℹ️');
            return;
        }

        isPineconeSyncRunning = true;
        lastPineconeFailedProjects = [];

        // Switch to progress view
        if (pineconeSyncReadyView) pineconeSyncReadyView.style.display = 'none';
        if (pineconeSyncResultView) pineconeSyncResultView.style.display = 'none';
        if (pineconeSyncProgressView) pineconeSyncProgressView.style.display = 'block';

        if (pineconeSyncConfirmBtn) pineconeSyncConfirmBtn.style.display = 'none';
        if (pineconeSyncCancelBtn) pineconeSyncCancelBtn.style.display = 'none';
        if (pineconeSyncDoneBtn) pineconeSyncDoneBtn.style.display = 'none';
        if (pineconeSyncRetryFailedBtn) pineconeSyncRetryFailedBtn.style.display = 'none';
        if (pineconeSyncCloseBtn) pineconeSyncCloseBtn.disabled = true;

        if (pineconeProgressBarFill) pineconeProgressBarFill.style.width = '0%';
        if (pineconeProgressPercent) pineconeProgressPercent.textContent = '0%';
        if (pineconeProgressCounter) pineconeProgressCounter.textContent = `0 of ${projectsToSync.length} processed`;
        if (pineconeProgressStatusText) pineconeProgressStatusText.textContent = 'Connecting to Pinecone Inference API…';
        if (pineconeCurrentProjectTitle) pineconeCurrentProjectTitle.textContent = projectsToSync[0].title || 'Starting sync…';

        let successCount = 0;
        let failedCount = 0;
        const failedProjects = [];
        const backendUrl = getBackendUrl();

        for (let i = 0; i < projectsToSync.length; i++) {
            const project = projectsToSync[i];
            const currentPct = Math.round((i / projectsToSync.length) * 100);

            if (pineconeProgressBarFill) pineconeProgressBarFill.style.width = `${currentPct}%`;
            if (pineconeProgressPercent) pineconeProgressPercent.textContent = `${currentPct}%`;
            if (pineconeProgressCounter) pineconeProgressCounter.textContent = `${i + 1} of ${projectsToSync.length} processed`;
            if (pineconeProgressStatusText) pineconeProgressStatusText.textContent = `Embedding & indexing (${i + 1} of ${projectsToSync.length})…`;
            if (pineconeCurrentProjectTitle) pineconeCurrentProjectTitle.textContent = project.title || project.id;

            try {
                const response = await fetch(`${backendUrl}/api/projects/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        projectId: project.id,
                        projectData: project
                    })
                });

                const data = await response.json().catch(() => ({}));
                if (!response.ok || !data.success) {
                    throw new Error(data.error || 'Sync request failed');
                }

                successCount++;
                project.pineconeSynced = true;

                // Update table row indicator if visible in current table page
                const row = document.querySelector(`tr[data-project-id="${project.id}"]`);
                if (row) {
                    row.setAttribute('data-synced', 'true');
                    const dot = row.querySelector('.sync-dot');
                    if (dot) dot.className = 'sync-dot synced';
                    const btn = row.querySelector('.sync-indicator-btn');
                    if (btn) {
                        btn.className = 'sync-indicator-btn synced';
                        btn.title = 'Synced with Pinecone (AI Search active) - Click to re-sync';
                    }
                }
            } catch (err) {
                console.warn(`Pinecone sync error for "${project.title}":`, err.message);
                failedCount++;
                failedProjects.push({
                    project,
                    error: err.message || 'Sync failed'
                });
                project.pineconeSynced = false;

                const row = document.querySelector(`tr[data-project-id="${project.id}"]`);
                if (row) {
                    row.setAttribute('data-synced', 'false');
                    const dot = row.querySelector('.sync-dot');
                    if (dot) dot.className = 'sync-dot unsynced';
                    const btn = row.querySelector('.sync-indicator-btn');
                    if (btn) {
                        btn.className = 'sync-indicator-btn unsynced';
                        btn.title = 'Not synced with Pinecone - Click to sync now';
                    }
                }
            }

            const postPct = Math.round(((i + 1) / projectsToSync.length) * 100);
            if (pineconeProgressBarFill) pineconeProgressBarFill.style.width = `${postPct}%`;
            if (pineconeProgressPercent) pineconeProgressPercent.textContent = `${postPct}%`;
        }

        // Sync complete: save cache
        if (typeof saveToCache === 'function') {
            await saveToCache(allProjectsData).catch(() => {});
        }

        // Re-render table paginated
        const tbody = document.getElementById('projects-table-body');
        if (tbody && typeof renderProjectsTablePaginated === 'function') {
            renderProjectsTablePaginated(tbody);
            if (typeof applyProjectFilters === 'function') {
                applyProjectFilters();
            }
        }

        // Switch to Result View
        isPineconeSyncRunning = false;
        lastPineconeFailedProjects = failedProjects.map(f => f.project);
        if (pineconeSyncCloseBtn) pineconeSyncCloseBtn.disabled = false;

        if (pineconeSyncProgressView) pineconeSyncProgressView.style.display = 'none';
        if (pineconeSyncResultView) pineconeSyncResultView.style.display = 'block';

        if (pineconeResultSuccessCount) pineconeResultSuccessCount.textContent = successCount;
        if (pineconeResultFailedCount) pineconeResultFailedCount.textContent = failedCount;
        if (pineconeResultTotalCount) pineconeResultTotalCount.textContent = projectsToSync.length;

        if (failedCount === 0) {
            if (pineconeResultHero) pineconeResultHero.classList.remove('has-errors');
            if (pineconeResultIcon) {
                pineconeResultIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
            }
            if (pineconeResultTitle) pineconeResultTitle.textContent = 'Vector Synchronization Complete!';
            if (pineconeResultSubtitle) pineconeResultSubtitle.textContent = `All ${successCount} project(s) are now active in the Pinecone vector database.`;
            if (pineconeResultErrorsContainer) pineconeResultErrorsContainer.style.display = 'none';
            if (pineconeSyncRetryFailedBtn) pineconeSyncRetryFailedBtn.style.display = 'none';
            showToast(`Pinecone sync completed: ${successCount} project(s) indexed`, '✅');
        } else {
            if (pineconeResultHero) pineconeResultHero.classList.add('has-errors');
            if (pineconeResultIcon) {
                pineconeResultIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
            }
            if (pineconeResultTitle) pineconeResultTitle.textContent = 'Sync Finished with Issues';
            if (pineconeResultSubtitle) pineconeResultSubtitle.textContent = `${successCount} project(s) synced, ${failedCount} project(s) failed.`;

            if (pineconeResultErrorsCount) pineconeResultErrorsCount.textContent = failedCount;
            if (pineconeResultErrorsList) {
                pineconeResultErrorsList.innerHTML = '';
                failedProjects.forEach(fp => {
                    const li = document.createElement('li');
                    li.innerHTML = `<strong>${escapeHtml(fp.project.title || fp.project.id)}</strong>: ${escapeHtml(fp.error)}`;
                    pineconeResultErrorsList.appendChild(li);
                });
            }
            if (pineconeResultErrorsContainer) pineconeResultErrorsContainer.style.display = 'block';
            if (pineconeSyncRetryFailedBtn) pineconeSyncRetryFailedBtn.style.display = 'inline-flex';
            showToast(`Pinecone sync finished: ${successCount} synced, ${failedCount} failed`, '⚠️');
        }

        if (pineconeSyncDoneBtn) pineconeSyncDoneBtn.style.display = 'inline-flex';
    }

    // Confirm button in Ready View -> trigger sync
    if (pineconeSyncConfirmBtn) {
        pineconeSyncConfirmBtn.addEventListener('click', () => {
            const isUnsyncedOnly = pineconeModeUnsynced && pineconeModeUnsynced.checked;
            let projectsToSync = [];

            if (isUnsyncedOnly) {
                projectsToSync = (allProjectsData || []).filter(p => p.pineconeSynced !== true);
                if (projectsToSync.length === 0) {
                    showToast('All projects are already synced! Choose "Full Index Re-Sync" to re-index all.', 'ℹ️');
                    return;
                }
            } else {
                projectsToSync = [...(allProjectsData || [])];
                if (projectsToSync.length === 0) {
                    showToast('No projects available to sync.', 'ℹ️');
                    return;
                }
            }

            executePineconeSync(projectsToSync);
        });
    }

    // Retry button for failed projects
    if (pineconeSyncRetryFailedBtn) {
        pineconeSyncRetryFailedBtn.addEventListener('click', () => {
            if (lastPineconeFailedProjects.length > 0) {
                executePineconeSync(lastPineconeFailedProjects);
            }
        });
    }

    // Attach open handler to "Sync Pinecone" button in header
    if (syncPineconeBtn) {
        syncPineconeBtn.addEventListener('click', openPineconeSyncModal);
    }

    // ===== Sync Single Project to Pinecone =====
    window.syncSingleProject = async (event, projectId) => {
        if (event) {
            event.stopPropagation();
        }

        const btn = event ? event.currentTarget : null;
        const dot = btn ? btn.querySelector('.sync-dot') : null;

        if (dot) {
            dot.className = 'sync-dot syncing';
            btn.title = 'Syncing to Pinecone...';
        }

        showToast('Syncing project to Pinecone...', 'ℹ️');

        try {
            const project = (allProjectsData || []).find(p => p.id === projectId);
            const backendUrl = getBackendUrl();
            const response = await fetch(`${backendUrl}/api/projects/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    projectId,
                    projectData: project || undefined
                })
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Failed to sync');
            }

            // Update in-memory data
            if (project) {
                project.pineconeSynced = true;
            }

            // Update DOM row attributes and indicator
            const row = document.querySelector(`tr[data-project-id="${projectId}"]`) || (btn ? btn.closest('tr') : null);
            if (row) {
                row.setAttribute('data-synced', 'true');
            }

            if (btn && dot) {
                dot.className = 'sync-dot synced';
                btn.className = 'sync-indicator-btn synced';
                btn.title = 'Synced with Pinecone (AI Search active) - Click to re-sync';
            }

            // Update cache
            if (typeof saveToCache === 'function') {
                await saveToCache(allProjectsData);
            }

            showToast('Project synced to Pinecone successfully', '✅');
        } catch (err) {
            console.error('❌ Project sync error:', err);
            if (btn && dot) {
                dot.className = 'sync-dot unsynced';
                btn.className = 'sync-indicator-btn unsynced';
                btn.title = 'Not synced with Pinecone - Click to sync now';
            }
            showToast(`Sync failed: ${err.message}`, '❌');
        }
    };

    // ===== Refresh Projects Button =====
    const refreshProjectsBtn = document.getElementById('refresh-projects-btn');
    if (refreshProjectsBtn) {
        refreshProjectsBtn.addEventListener('click', async () => {
            // Disable button and show loading state
            refreshProjectsBtn.disabled = true;
            const originalHTML = refreshProjectsBtn.innerHTML;
            refreshProjectsBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
                Refreshing...
            `;

            try {
                showToast('Refreshing projects...', 'ℹ️');
                
                // Invalidate cache to force fresh data
                invalidateCache();
                
                // Reload projects data with forced fresh fetch
                await loadProjectsData(true);
                await checkPineconeSyncStatus();
                
                showToast('Projects refreshed successfully', '✅');
            } catch (error) {
                console.error('Error refreshing projects:', error);
                showToast('Failed to refresh projects', '❌');
            } finally {
                // Restore button state
                refreshProjectsBtn.disabled = false;
                refreshProjectsBtn.innerHTML = originalHTML;
            }
        });
    }

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
                    initDynamicContainers({ authors: d.authors || [], topics: d.topics || [], keywords: d.keywords || [] });
                    showToast('Draft restored ✨', 'ℹ️');
                } catch { initDynamicContainers(); }
            } else {
                initDynamicContainers();
            }

            // Reset project images
            projectExistingImages = [];
            projectImageFiles = [];
            renderProjectImagesPreview();

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

    // Project Images State (Section 04)
    let projectImageFiles = []; // Local File objects to upload
    let projectExistingImages = []; // Existing Cloudinary URLs

    // Initialize Project Image Dropzone and Events
    function initProjectImageHandlers() {
        const dropzone = document.getElementById('project-image-dropzone');
        const fileInput = document.getElementById('project-images-input');
        const browseBtn = document.getElementById('project-images-browse-btn');

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
                fileInput.value = ''; // Reset input to allow selecting same file again
            }
        });
    }

    function handleSelectedImageFiles(files) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
        const maxSizeBytes = 10 * 1024 * 1024; // 10MB

        for (const file of files) {
            if (!allowedTypes.includes(file.type)) {
                showToast(`Skipped ${file.name}: Only JPG, PNG, WEBP are allowed`, '⚠️');
                continue;
            }
            if (file.size > maxSizeBytes) {
                showToast(`Skipped ${file.name}: Exceeds 10MB limit`, '⚠️');
                continue;
            }
            projectImageFiles.push(file);
        }

        renderProjectImagesPreview();
        updateButtonVisibility();
    }

    function renderProjectImagesPreview() {
        const grid = document.getElementById('project-images-preview-grid');
        if (!grid) return;

        grid.innerHTML = '';

        // 1. Render existing Cloudinary images
        projectExistingImages.forEach((imgUrl, index) => {
            const rawUrl = typeof imgUrl === 'string' ? imgUrl : (imgUrl.secure_url || imgUrl.url);
            const thumbUrl = (typeof CloudinaryService !== 'undefined' && CloudinaryService.getThumbnailUrl)
                ? CloudinaryService.getThumbnailUrl(rawUrl, 200, 260)
                : rawUrl;
            const isCover = index === 0;

            const card = document.createElement('div');
            card.className = `image-preview-card ${isCover ? 'is-cover' : ''}`;
            card.innerHTML = `
                <img src="${thumbUrl}" alt="Project Image ${index + 1}">
                ${isCover ? '<span class="cover-badge">Cover</span>' : ''}
                <div class="image-preview-actions">
                    <button type="button" class="remove-img-btn" title="Remove image" data-existing-index="${index}">✕</button>
                </div>
            `;

            card.querySelector('.remove-img-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                projectExistingImages.splice(index, 1);
                renderProjectImagesPreview();
                updateButtonVisibility();
            });

            grid.appendChild(card);
        });

        // 2. Render new selected local files
        const existingOffset = projectExistingImages.length;
        projectImageFiles.forEach((file, index) => {
            const isCover = (existingOffset === 0 && index === 0);
            const previewUrl = URL.createObjectURL(file);

            const card = document.createElement('div');
            card.className = `image-preview-card ${isCover ? 'is-cover' : ''}`;
            card.id = `new-image-preview-${index}`;
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
                projectImageFiles.splice(index, 1);
                renderProjectImagesPreview();
                updateButtonVisibility();
            });

            grid.appendChild(card);
        });
    }

    initProjectImageHandlers();

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

        return title || authors.length > 0 || program || adviser || abstract || 
               topics.length > 0 || keywords.length > 0;
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

    // ── Save Processing state helper ─────────────────────────────────────────
    // Activates a blurred overlay over the project modal while create/update
    // is running so the admin cannot click Cancel, Close, or the backdrop.
    function setSaveProcessing(active, label) {
        const modal      = document.getElementById('project-modal');
        const overlay    = document.getElementById('save-processing-overlay');
        const labelEl    = document.getElementById('save-processing-label');
        const closeBtn   = document.getElementById('project-modal-close-btn');
        const cancelBtn  = document.getElementById('cancel-project-btn');
        const submitBtn  = document.getElementById('submit-project-btn');
        const clearBtn   = document.getElementById('clear-project-btn');

        if (active) {
            if (labelEl && label) labelEl.textContent = label;
            overlay && overlay.classList.add('active');
            overlay && overlay.setAttribute('aria-hidden', 'false');
            modal   && modal.classList.add('is-saving');
            if (closeBtn)  closeBtn.disabled  = true;
            if (cancelBtn) cancelBtn.disabled = true;
            if (submitBtn) submitBtn.disabled = true;
            if (clearBtn)  clearBtn.disabled  = true;
        } else {
            overlay && overlay.classList.remove('active');
            overlay && overlay.setAttribute('aria-hidden', 'true');
            modal   && modal.classList.remove('is-saving');
            if (closeBtn)  closeBtn.disabled  = false;
            if (cancelBtn) cancelBtn.disabled = false;
            if (clearBtn)  clearBtn.disabled  = false;
            // submitBtn visibility is managed by updateButtonVisibility — do not touch
        }
    }

    // Guard closeProjectModal against running while saving
    const closeProjectModal = () => {
        const modal = document.getElementById('project-modal');
        if (modal && modal.classList.contains('is-saving')) {
            return; // Interaction locked while save is processing
        }
        if (projectModal) {
            projectModal.classList.remove('active');
            if (projectForm) projectForm.reset();
            clearDynamicContainer('authors-container');
            clearDynamicContainer('topics-container');
            clearDynamicContainer('keywords-container');
            clearTimeout(autoSaveTimer);
            
            // Reset project images
            projectExistingImages = [];
            projectImageFiles = [];
            renderProjectImagesPreview();

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
        clearProjectBtn.addEventListener('click', async () => {
            const confirmed = await ModalDialog.confirm({
                title: 'Clear Form',
                message: 'Are you sure you want to clear all form data? This action cannot be undone.',
                confirmText: 'Clear Form',
                cancelText: 'Keep Data',
                isDanger: true
            });
            if (!confirmed) return;
            if (projectForm) projectForm.reset();
            clearDynamicContainer('authors-container');
            clearDynamicContainer('topics-container');
            clearDynamicContainer('keywords-container');
            createDynamicRow('authors-container', 'e.g., Reyes, A.');
            localStorage.removeItem('admin_project_draft');
            showToast('Form cleared', '✅');
            updateButtonVisibility();
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

                    const confirmed = await ModalDialog.confirm({
                        title: 'Confirm Changes',
                        message: `You are about to update ${changes.length} field${changes.length > 1 ? 's' : ''} in this project:\n\n${changes.map(c => `• ${c.field}`).join('\n')}`,
                        confirmText: 'Apply Changes',
                        cancelText: 'Review Again',
                        type: 'info'
                    });
                    if (confirmed) {
                        showToast('Updating project...', 'ℹ️');
                        await performProjectUpdate(projectId, title, authors, program, year, adviser, status, abstract, topics, keywords);
                    }
                } else {
                    // CREATE MODE: Proceed directly
                    showToast('Creating project...', 'ℹ️');
                    await performProjectCreate(title, authors, program, year, adviser, status, abstract, topics, keywords);
                }
            } catch (error) {
                console.error('Error in form submission:', error);
                showToast('Error: ' + error.message, '❌');
            }
        });
    }

    // Separate function for performing project update
    async function performProjectUpdate(projectId, title, authors, program, year, adviser, status, abstract, topics, keywords) {
        setSaveProcessing(true, 'Updating project…');
        try {
            // ===== Duplicate title check (skip if title belongs to this same doc) =====
            const titleNorm = normalizeTitle(title);
            const dupSnap = await db.collection('projects')
                .where('titleNorm', '==', titleNorm)
                .limit(1)
                .get();
            if (!dupSnap.empty && dupSnap.docs[0].id !== projectId) {
                showToast('Another project with this title already exists in the database.', '⚠️');
                setSaveProcessing(false);
                return;
            }

            // Fetch existing data
            const currentDoc = await db.collection('projects').doc(projectId).get();
            if (!currentDoc.exists) {
                showToast('Project not found to update', '❌');
                setSaveProcessing(false);
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
            if (JSON.stringify(oldData.topics || []) !== JSON.stringify(topics)) changedFields.push('topics');
            if (JSON.stringify(oldData.keywords || []) !== JSON.stringify(keywords)) changedFields.push('keywords');

            // Upload new images to Cloudinary if any
            let finalImages = [...projectExistingImages];
            if (projectImageFiles.length > 0) {
                if (typeof CloudinaryService !== 'undefined' && CloudinaryService.isConfigured()) {
                    showToast(`Uploading ${projectImageFiles.length} image(s) to Cloudinary...`, 'ℹ️');
                    for (let i = 0; i < projectImageFiles.length; i++) {
                        const file = projectImageFiles[i];
                        const card = document.getElementById(`new-image-preview-${i}`);
                        if (card) {
                            card.innerHTML += `
                                <div class="image-upload-progress-overlay" id="upload-overlay-${i}">
                                    <div class="image-progress-bar-container">
                                        <div class="image-progress-bar-fill" id="upload-fill-${i}"></div>
                                    </div>
                                    <div class="image-progress-text" id="upload-text-${i}">0%</div>
                                </div>
                            `;
                        }
                        try {
                            const uploadRes = await CloudinaryService.uploadImage(file, (percent) => {
                                const fill = document.getElementById(`upload-fill-${i}`);
                                const text = document.getElementById(`upload-text-${i}`);
                                if (fill) fill.style.width = `${percent}%`;
                                if (text) text.textContent = `${percent}%`;
                            });
                            finalImages.push(uploadRes.secure_url || uploadRes.url);
                        } catch (uploadErr) {
                            console.error(`Failed to upload ${file.name} to Cloudinary:`, uploadErr);
                            showToast(`Image upload failed: ${uploadErr.message}`, '⚠️');
                        }
                    }
                } else {
                    showToast('Cloudinary is not configured yet. Project saved without new image uploads.', '⚠️');
                }
            }

            // Update Firestore
            const updatedData = {
                title,
                titleNorm: normalizeTitle(title), // keep shadow field in sync
                authors,
                program,
                year,
                adviser,
                status,
                abstract,
                topics,
                keywords,
                images: finalImages,
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

            // Sync to Pinecone
            let isPineconeSynced = false;
            try {
                console.log('🔄 Syncing project to Pinecone...');
                const backendUrl = getBackendUrl();
                const syncResponse = await fetch(`${backendUrl}/api/projects/sync`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        projectId,
                        projectData: updatedData
                    })
                });

                if (!syncResponse.ok) {
                    const errorData = await syncResponse.json().catch(() => ({}));
                    throw new Error(errorData.error || 'Pinecone sync failed');
                }

                isPineconeSynced = true;
                console.log('✓ Project synced to Pinecone successfully');
            } catch (pineconeErr) {
                console.error('⚠️ Pinecone sync failed (non-critical):', pineconeErr);
                // Don't fail the entire operation if Pinecone sync fails
                showToast('Project updated (Pinecone sync failed - click red dot to retry)', '⚠️');
            }

            // Update pineconeSynced in Firestore
            await db.collection('projects').doc(projectId).update({
                pineconeSynced: isPineconeSynced
            }).catch(() => {});

            showToast('Project updated successfully', '✅');
            
            // Log admin activity
            if (window.ActivityService && typeof window.ActivityService.logAdmin === 'function') {
                const changedFieldNames = changedFields.join(', ');
                window.ActivityService.logAdmin('project_updated', title, `Updated project "${title}" — changed: ${changedFieldNames || 'metadata'}`);
            }
            
            setSaveProcessing(false);
            closeProjectModal();
            await loadProjectsData();
            await loadDashboardData();
        } catch (error) {
            setSaveProcessing(false);
            console.error('Error updating project:', error);
            showToast('Error updating project: ' + error.message, '❌');
        }
    }

    // Separate function for performing project creation
    async function performProjectCreate(title, authors, program, year, adviser, status, abstract, topics, keywords) {
        setSaveProcessing(true, 'Creating project…');
        try {
            // ===== Duplicate title check (targeted query — no full collection fetch) =====
            const titleNorm = normalizeTitle(title);
            const dupSnap = await db.collection('projects')
                .where('titleNorm', '==', titleNorm)
                .limit(1)
                .get();
            if (!dupSnap.empty) {
                showToast('A project with this title already exists in the database.', '⚠️');
                setSaveProcessing(false);
                return;
            }

            // Upload new images to Cloudinary if any
            let finalImages = [...projectExistingImages];
            if (projectImageFiles.length > 0) {
                if (typeof CloudinaryService !== 'undefined' && CloudinaryService.isConfigured()) {
                    showToast(`Uploading ${projectImageFiles.length} image(s) to Cloudinary...`, 'ℹ️');
                    for (let i = 0; i < projectImageFiles.length; i++) {
                        const file = projectImageFiles[i];
                        const card = document.getElementById(`new-image-preview-${i}`);
                        if (card) {
                            card.innerHTML += `
                                <div class="image-upload-progress-overlay" id="upload-overlay-${i}">
                                    <div class="image-progress-bar-container">
                                        <div class="image-progress-bar-fill" id="upload-fill-${i}"></div>
                                    </div>
                                    <div class="image-progress-text" id="upload-text-${i}">0%</div>
                                </div>
                            `;
                        }
                        try {
                            const uploadRes = await CloudinaryService.uploadImage(file, (percent) => {
                                const fill = document.getElementById(`upload-fill-${i}`);
                                const text = document.getElementById(`upload-text-${i}`);
                                if (fill) fill.style.width = `${percent}%`;
                                if (text) text.textContent = `${percent}%`;
                            });
                            finalImages.push(uploadRes.secure_url || uploadRes.url);
                        } catch (uploadErr) {
                            console.error(`Failed to upload ${file.name} to Cloudinary:`, uploadErr);
                            showToast(`Image upload failed: ${uploadErr.message}`, '⚠️');
                        }
                    }
                } else {
                    showToast('Cloudinary is not configured yet. Project saved without new image uploads.', '⚠️');
                }
            }

            // Create in Firestore
            const newProject = {
                title,
                titleNorm: normalizeTitle(title), // shadow field for dup detection
                authors,
                program,
                year,
                adviser,
                status,
                abstract,
                topics,
                keywords,
                images: finalImages,
                pineconeSynced: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            const docRef = await db.collection('projects').add(newProject);
            const projectId = docRef.id;

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

            // Sync to Pinecone
            let isPineconeSynced = false;
            try {
                console.log('🔄 Syncing new project to Pinecone...');
                const backendUrl = getBackendUrl();
                const syncResponse = await fetch(`${backendUrl}/api/projects/sync`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        projectId,
                        projectData: newProject
                    })
                });

                if (!syncResponse.ok) {
                    const errorData = await syncResponse.json().catch(() => ({}));
                    throw new Error(errorData.error || 'Pinecone sync failed');
                }

                isPineconeSynced = true;
                console.log('✓ New project synced to Pinecone successfully');
            } catch (pineconeErr) {
                console.error('⚠️ Pinecone sync failed (non-critical):', pineconeErr);
                // Don't fail the entire operation if Pinecone sync fails
                showToast('Project created (Pinecone sync failed - click red dot to retry)', '⚠️');
            }

            if (isPineconeSynced) {
                await db.collection('projects').doc(projectId).update({ pineconeSynced: true }).catch(() => {});
            }

            // Invalidate cache so fresh sync state is rendered
            invalidateCache();

            showToast('Project created successfully', '✅');
            // Clear auto-saved draft
            localStorage.removeItem('admin_project_draft');
            
            // Log admin activity
            if (window.ActivityService && typeof window.ActivityService.logAdmin === 'function') {
                window.ActivityService.logAdmin('project_created', title, `Created new project: ${title} by ${authors.join(', ')} (${program}, ${year})`);
            }
            
            setSaveProcessing(false);
            closeProjectModal();
            await loadProjectsData(true);
            await loadDashboardData();
        } catch (error) {
            setSaveProcessing(false);
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
        currentProjectsPage = 1;
        renderProjectsTablePaginated(tbody);
    }

    const userFilters = document.querySelectorAll('#user-filters .filter-pill');
    userFilters.forEach(pill => {
        pill.addEventListener('click', () => {
            // Update active state
            userFilters.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            filterUsersTable();
            showToast(`Filtered: ${pill.textContent}`, 'ℹ️');
        });
    });

    // ===== Search Functionality =====
    const projectsSearch = document.getElementById('projects-search');
    if (projectsSearch) {
        projectsSearch.addEventListener('input', () => {
            currentProjectsPage = 1;
            const tbody = document.getElementById('projects-table-body');
            if (tbody) {
                renderProjectsTablePaginated(tbody);
            }
        });
    }

    const usersSearch = document.getElementById('users-search');
    if (usersSearch) {
        usersSearch.addEventListener('input', () => {
            filterUsersTable();
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
                if (snapshot && snapshot.docs) {
                    const freshProjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    freshProjects.sort((a, b) => {
                        const dateA = getTimestamp(a.createdAt);
                        const dateB = getTimestamp(b.createdAt);
                        return dateB - dateA;
                    });
                    allProjectsData = freshProjects;
                    try {
                        localStorage.setItem('projectsData', JSON.stringify(freshProjects));
                    } catch (e) {}

                    const activeSection = document.querySelector('.content-section.active');
                    if (activeSection && activeSection.id === 'section-projects') {
                        const tbody = document.getElementById('projects-table-body');
                        if (tbody) {
                            renderProjectsTablePaginated(tbody);
                            if (typeof applyProjectFilters === 'function') {
                                applyProjectFilters();
                            }
                        }
                    }
                }
                // Update dashboard stats if on dashboard
                const activeSection = document.querySelector('.content-section.active');
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
                const freshUsers = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                freshUsers.sort((a, b) => {
                    const dateA = getTimestamp(a.createdAt);
                    const dateB = getTimestamp(b.createdAt);
                    return dateB - dateA;
                });
                try {
                    localStorage.setItem('usersData', JSON.stringify(freshUsers));
                    localStorage.setItem('usersMetadata', JSON.stringify({
                        userCount: freshUsers.length,
                        lastCached: new Date().toISOString()
                    }));
                } catch (e) {}

                const activeSection = document.querySelector('.content-section.active');
                if (activeSection && activeSection.id === 'section-users') {
                    loadUsersData(true);
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

    // ===== Create Librarian Functionality (Enhanced & Aligned) =====
    const createLibrarianBtn = document.getElementById('create-librarian-btn');
    const createLibrarianModal = document.getElementById('create-librarian-modal');
    const modalOverlay = document.getElementById('modal-overlay');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const cancelLibrarianBtn = document.getElementById('cancel-librarian-btn');
    const createLibrarianForm = document.getElementById('create-librarian-form');
    const clearLibrarianBtn = document.getElementById('clear-librarian-btn');
    const submitLibrarianBtn = document.getElementById('submit-librarian-btn');

    // Enhanced UI Elements
    const librarianNameInput = document.getElementById('librarian-name');
    const librarianEmailInput = document.getElementById('librarian-email');
    const librarianPasswordInput = document.getElementById('librarian-password');
    const librarianConfirmPasswordInput = document.getElementById('librarian-confirm-password');
    const chipCtuDomain = document.getElementById('chip-ctu-domain');
    const generateLibrarianPwdBtn = document.getElementById('generate-librarian-pwd');
    const toggleLibrarianPwdBtn = document.getElementById('toggle-librarian-pwd');
    const toggleLibrarianConfirmPwdBtn = document.getElementById('toggle-librarian-confirm-pwd');
    const librarianPwdMeter = document.getElementById('librarian-pwd-meter');
    const pwdSeg1 = document.getElementById('pwd-seg-1');
    const pwdSeg2 = document.getElementById('pwd-seg-2');
    const pwdSeg3 = document.getElementById('pwd-seg-3');
    const pwdSeg4 = document.getElementById('pwd-seg-4');
    const pwdStrengthLabel = document.getElementById('pwd-strength-label');
    const pwdStrengthHint = document.getElementById('pwd-strength-hint');
    const librarianPwdMatchHint = document.getElementById('librarian-pwd-match-hint');

    // Success View Elements
    const librarianSuccessView = document.getElementById('librarian-success-view');
    const successLibrarianName = document.getElementById('success-librarian-name');
    const successLibrarianEmail = document.getElementById('success-librarian-email');
    const successLibrarianPassword = document.getElementById('success-librarian-password');
    const toggleSuccessPwdBtn = document.getElementById('toggle-success-pwd');
    const copyLibrarianCredsBtn = document.getElementById('copy-librarian-creds-btn');
    const createAnotherLibrarianBtn = document.getElementById('create-another-librarian-btn');
    const finishLibrarianBtn = document.getElementById('finish-librarian-btn');

    let currentCreatedLibrarian = null;
    let isSuccessPwdVisible = false;

    // Open modal
    if (createLibrarianBtn) {
        createLibrarianBtn.addEventListener('click', () => {
            showLibrarianFormView();
            createLibrarianModal.classList.add('active');
            document.body.style.overflow = 'hidden';
            updateLibrarianButtonVisibility();
            if (librarianNameInput) librarianNameInput.focus();
        });
    }

    function showLibrarianFormView() {
        if (createLibrarianForm) {
            createLibrarianForm.style.display = 'block';
            createLibrarianForm.reset();
        }
        if (librarianSuccessView) {
            librarianSuccessView.classList.remove('active');
        }
        if (librarianPwdMeter) librarianPwdMeter.style.display = 'none';
        if (librarianPwdMatchHint) librarianPwdMatchHint.textContent = '';
        resetPasswordToggle(librarianPasswordInput, toggleLibrarianPwdBtn);
        resetPasswordToggle(librarianConfirmPasswordInput, toggleLibrarianConfirmPwdBtn);
        updateLibrarianButtonVisibility();
    }

    function showLibrarianSuccessView(librarianData) {
        currentCreatedLibrarian = librarianData;
        if (createLibrarianForm) createLibrarianForm.style.display = 'none';
        if (librarianSuccessView) {
            librarianSuccessView.classList.add('active');
            if (successLibrarianName) successLibrarianName.textContent = librarianData.fullName || '-';
            if (successLibrarianEmail) successLibrarianEmail.textContent = librarianData.email || '-';
            if (successLibrarianPassword) {
                isSuccessPwdVisible = false;
                successLibrarianPassword.textContent = '••••••••••••';
            }
        }
    }

    // Close modal function
    function closeLibrarianModal() {
        if (!createLibrarianModal) return;
        createLibrarianModal.classList.remove('active');
        document.body.style.overflow = '';
        showLibrarianFormView();
        currentCreatedLibrarian = null;
    }

    // Close modal events
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeLibrarianModal();
        });
    }
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeLibrarianModal);
    if (cancelLibrarianBtn) cancelLibrarianBtn.addEventListener('click', closeLibrarianModal);
    if (finishLibrarianBtn) finishLibrarianBtn.addEventListener('click', closeLibrarianModal);
    if (createAnotherLibrarianBtn) {
        createAnotherLibrarianBtn.addEventListener('click', () => {
            showLibrarianFormView();
            if (librarianNameInput) librarianNameInput.focus();
        });
    }

    // Toggle Password Visibility Helper
    function setupPasswordToggle(inputEl, btnEl) {
        if (!inputEl || !btnEl) return;
        btnEl.addEventListener('click', () => {
            const isPassword = inputEl.type === 'password';
            inputEl.type = isPassword ? 'text' : 'password';
            const eyeOpen = btnEl.querySelector('.eye-open');
            const eyeClosed = btnEl.querySelector('.eye-closed');
            if (eyeOpen && eyeClosed) {
                eyeOpen.style.display = isPassword ? 'none' : 'block';
                eyeClosed.style.display = isPassword ? 'block' : 'none';
            }
            btnEl.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        });
    }

    function resetPasswordToggle(inputEl, btnEl) {
        if (!inputEl || !btnEl) return;
        inputEl.type = 'password';
        const eyeOpen = btnEl.querySelector('.eye-open');
        const eyeClosed = btnEl.querySelector('.eye-closed');
        if (eyeOpen) eyeOpen.style.display = 'block';
        if (eyeClosed) eyeClosed.style.display = 'none';
    }

    setupPasswordToggle(librarianPasswordInput, toggleLibrarianPwdBtn);
    setupPasswordToggle(librarianConfirmPasswordInput, toggleLibrarianConfirmPwdBtn);

    // Toggle success password visibility
    if (toggleSuccessPwdBtn && successLibrarianPassword) {
        toggleSuccessPwdBtn.addEventListener('click', () => {
            if (!currentCreatedLibrarian) return;
            isSuccessPwdVisible = !isSuccessPwdVisible;
            successLibrarianPassword.textContent = isSuccessPwdVisible
                ? currentCreatedLibrarian.password
                : '••••••••••••';
            toggleSuccessPwdBtn.title = isSuccessPwdVisible ? 'Hide password' : 'Show password';
        });
    }

    // Copy credentials to clipboard
    if (copyLibrarianCredsBtn) {
        copyLibrarianCredsBtn.addEventListener('click', async () => {
            if (!currentCreatedLibrarian) return;
            const textToCopy = `RE-CAPS Librarian Credentials:\nName: ${currentCreatedLibrarian.fullName}\nEmail: ${currentCreatedLibrarian.email}\nPassword: ${currentCreatedLibrarian.password}\nRole: Librarian (Catalog Manager)\nPortal: ${window.location.origin}/pages/login.html`;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(textToCopy);
                } else {
                    const tempInput = document.createElement('textarea');
                    tempInput.value = textToCopy;
                    document.body.appendChild(tempInput);
                    tempInput.select();
                    document.execCommand('copy');
                    document.body.removeChild(tempInput);
                }
                showToast('Credentials copied to clipboard! 📋', '✅');
            } catch (copyErr) {
                console.error('Failed to copy credentials:', copyErr);
                showToast('Could not copy automatically. Please select and copy manually.', '⚠️');
            }
        });
    }

    // CTU Domain Quick Chip
    if (chipCtuDomain && librarianEmailInput) {
        chipCtuDomain.addEventListener('click', () => {
            const currentVal = librarianEmailInput.value.trim();
            if (!currentVal) {
                librarianEmailInput.value = '@ctu.edu.ph';
                librarianEmailInput.focus();
                librarianEmailInput.setSelectionRange(0, 0);
            } else if (currentVal.includes('@')) {
                const prefix = currentVal.split('@')[0];
                librarianEmailInput.value = prefix ? `${prefix}@ctu.edu.ph` : '@ctu.edu.ph';
            } else {
                librarianEmailInput.value = `${currentVal}@ctu.edu.ph`;
            }
            updateLibrarianButtonVisibility();
        });
    }

    // Strong Password Generator
    if (generateLibrarianPwdBtn && librarianPasswordInput && librarianConfirmPasswordInput) {
        generateLibrarianPwdBtn.addEventListener('click', () => {
            const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
            let generated = 'CtuLib!';
            for (let i = 0; i < 5; i++) {
                generated += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            librarianPasswordInput.value = generated;
            librarianConfirmPasswordInput.value = generated;

            // Make sure both are visible briefly so admin can see the generated password
            librarianPasswordInput.type = 'text';
            librarianConfirmPasswordInput.type = 'text';
            const eyeOpen1 = toggleLibrarianPwdBtn?.querySelector('.eye-open');
            const eyeClosed1 = toggleLibrarianPwdBtn?.querySelector('.eye-closed');
            if (eyeOpen1 && eyeClosed1) {
                eyeOpen1.style.display = 'none';
                eyeClosed1.style.display = 'block';
            }
            const eyeOpen2 = toggleLibrarianConfirmPwdBtn?.querySelector('.eye-open');
            const eyeClosed2 = toggleLibrarianConfirmPwdBtn?.querySelector('.eye-closed');
            if (eyeOpen2 && eyeClosed2) {
                eyeOpen2.style.display = 'none';
                eyeClosed2.style.display = 'block';
            }

            evaluatePasswordStrength(generated);
            evaluatePasswordMatch();
            updateLibrarianButtonVisibility();
            showToast('Strong password generated! 🔑', 'ℹ️');
        });
    }

    // Password strength evaluation
    function evaluatePasswordStrength(pwd) {
        if (!librarianPwdMeter) return;
        if (!pwd || pwd.length === 0) {
            librarianPwdMeter.style.display = 'none';
            return;
        }
        librarianPwdMeter.style.display = 'flex';

        let score = 0;
        if (pwd.length >= 6) score++;
        if (pwd.length >= 8) score++;
        if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
        if (/[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;

        [pwdSeg1, pwdSeg2, pwdSeg3, pwdSeg4].forEach(seg => {
            if (seg) seg.className = 'pform-strength-segment';
        });

        if (score === 1) {
            if (pwdSeg1) pwdSeg1.classList.add('active-weak');
            if (pwdStrengthLabel) { pwdStrengthLabel.textContent = 'Weak'; pwdStrengthLabel.style.color = '#ef4444'; }
            if (pwdStrengthHint) pwdStrengthHint.textContent = 'Add uppercase letters & numbers';
        } else if (score === 2) {
            if (pwdSeg1) pwdSeg1.classList.add('active-fair');
            if (pwdSeg2) pwdSeg2.classList.add('active-fair');
            if (pwdStrengthLabel) { pwdStrengthLabel.textContent = 'Fair'; pwdStrengthLabel.style.color = '#f59e0b'; }
            if (pwdStrengthHint) pwdStrengthHint.textContent = 'Include special symbols';
        } else if (score === 3) {
            if (pwdSeg1) pwdSeg1.classList.add('active-good');
            if (pwdSeg2) pwdSeg2.classList.add('active-good');
            if (pwdSeg3) pwdSeg3.classList.add('active-good');
            if (pwdStrengthLabel) { pwdStrengthLabel.textContent = 'Good'; pwdStrengthLabel.style.color = '#10b981'; }
            if (pwdStrengthHint) pwdStrengthHint.textContent = 'Strong credentials';
        } else if (score >= 4) {
            if (pwdSeg1) pwdSeg1.classList.add('active-strong');
            if (pwdSeg2) pwdSeg2.classList.add('active-strong');
            if (pwdSeg3) pwdSeg3.classList.add('active-strong');
            if (pwdSeg4) pwdSeg4.classList.add('active-strong');
            if (pwdStrengthLabel) { pwdStrengthLabel.textContent = 'Strong'; pwdStrengthLabel.style.color = '#08D488'; }
            if (pwdStrengthHint) pwdStrengthHint.textContent = 'Excellent security strength';
        }
    }

    // Password match evaluation
    function evaluatePasswordMatch() {
        if (!librarianPwdMatchHint || !librarianPasswordInput || !librarianConfirmPasswordInput) return;
        const pwd = librarianPasswordInput.value;
        const confirm = librarianConfirmPasswordInput.value;

        if (!confirm) {
            librarianPwdMatchHint.textContent = '';
            librarianPwdMatchHint.className = 'pform-match-feedback';
            return;
        }

        if (pwd === confirm) {
            librarianPwdMatchHint.textContent = '✓ Passwords match';
            librarianPwdMatchHint.className = 'pform-match-feedback match';
        } else {
            librarianPwdMatchHint.textContent = '✗ Passwords do not match';
            librarianPwdMatchHint.className = 'pform-match-feedback mismatch';
        }
    }

    if (librarianPasswordInput) {
        librarianPasswordInput.addEventListener('input', () => {
            evaluatePasswordStrength(librarianPasswordInput.value);
            evaluatePasswordMatch();
        });
    }

    if (librarianConfirmPasswordInput) {
        librarianConfirmPasswordInput.addEventListener('input', () => {
            evaluatePasswordMatch();
        });
    }

    // Check if librarian form has values
    function hasLibrarianFormValues() {
        const name = librarianNameInput?.value.trim();
        const email = librarianEmailInput?.value.trim();
        const password = librarianPasswordInput?.value;
        const confirmPassword = librarianConfirmPasswordInput?.value;
        return name || email || password || confirmPassword;
    }

    // Update librarian button visibility
    function updateLibrarianButtonVisibility() {
        const hasValues = hasLibrarianFormValues();
        if (clearLibrarianBtn) {
            clearLibrarianBtn.style.display = hasValues ? 'inline-flex' : 'none';
        }
    }

    if (createLibrarianForm) {
        createLibrarianForm.addEventListener('input', updateLibrarianButtonVisibility);
        createLibrarianForm.addEventListener('change', updateLibrarianButtonVisibility);
    }

    if (clearLibrarianBtn) {
        clearLibrarianBtn.addEventListener('click', async () => {
            const confirmed = await ModalDialog.confirm({
                title: 'Clear Form',
                message: 'Are you sure you want to clear all form fields? This action cannot be undone.',
                confirmText: 'Clear Form',
                cancelText: 'Keep Data',
                isDanger: true
            });
            if (!confirmed) return;
            if (createLibrarianForm) createLibrarianForm.reset();
            if (librarianPwdMeter) librarianPwdMeter.style.display = 'none';
            if (librarianPwdMatchHint) librarianPwdMatchHint.textContent = '';
            resetPasswordToggle(librarianPasswordInput, toggleLibrarianPwdBtn);
            resetPasswordToggle(librarianConfirmPasswordInput, toggleLibrarianConfirmPwdBtn);
            showToast('Form cleared', '✅');
            updateLibrarianButtonVisibility();
        });
    }

    // Handle form submission
    if (createLibrarianForm) {
        createLibrarianForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = (librarianNameInput?.value || '').trim();
            const email = (librarianEmailInput?.value || '').trim().toLowerCase();
            const password = librarianPasswordInput?.value || '';
            const confirmPassword = librarianConfirmPasswordInput?.value || '';
            const submitBtn = document.getElementById('submit-librarian-btn');
            const cancelBtn = document.getElementById('cancel-librarian-btn');
            const clearBtn = document.getElementById('clear-librarian-btn');

            // Validation
            if (!name || !email || !password || !confirmPassword) {
                showToast('Please fill in all required fields', '❌');
                return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showToast('Please enter a valid email address', '❌');
                if (librarianEmailInput) librarianEmailInput.focus();
                return;
            }

            if (password.length < 6) {
                showToast('Password must be at least 6 characters long', '❌');
                if (librarianPasswordInput) librarianPasswordInput.focus();
                return;
            }

            if (password !== confirmPassword) {
                showToast('Passwords do not match. Please verify.', '❌');
                if (librarianConfirmPasswordInput) librarianConfirmPasswordInput.focus();
                return;
            }

            // Lock UI during account creation
            submitBtn.disabled = true;
            if (cancelBtn) cancelBtn.disabled = true;
            if (clearBtn) clearBtn.disabled = true;
            const originalBtnHTML = submitBtn.innerHTML;
            submitBtn.innerHTML = `
                <div class="spinner" style="width: 16px; height: 16px; border-width: 2px; margin-right: 6px; display: inline-block; vertical-align: middle;"></div>
                Creating Account...
            `;

            // Capture current admin ID so it is preserved
            const currentAdminUid = auth.currentUser ? auth.currentUser.uid : (sessionStorage.getItem('userId') || 'admin');

            let creationSuccess = false;
            let createdUserRecord = null;

            // Strategy 1: Attempt creation via Backend API (uses Firebase Admin SDK, never touches client session)
            try {
                console.log('📡 Calling backend to create librarian account...');
                const backendUrl = getBackendUrl();
                const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
                const response = await fetch(`${backendUrl}/api/users/create-librarian`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
                    },
                    body: JSON.stringify({
                        email: email,
                        password: password,
                        fullName: name,
                        adminUid: currentAdminUid
                    })
                });

                const result = await response.json().catch(() => ({ success: false, message: 'Backend endpoint returned ' + response.status }));
                if (response.ok && result.success) {
                    console.log('✓ Librarian created successfully via backend API');
                    creationSuccess = true;
                    createdUserRecord = result.user || { uid: 'lib_' + Date.now(), email, fullName: name, userType: 'librarian' };
                } else {
                    console.warn('⚠️ Backend create-librarian responded with non-200:', result.message);
                    if (response.status === 409 || (result.code && result.code === 'auth/email-already-exists')) {
                        throw new Error('An account with this email address already exists.');
                    }
                    if ([400, 401, 403].includes(response.status)) {
                        const finalErr = new Error(result.message || 'Request rejected by server');
                        finalErr.noFallback = true;
                        throw finalErr;
                    }
                    throw new Error(result.message || 'Backend service failed');
                }
            } catch (backendError) {
                console.warn('⚠️ Backend endpoint attempt failed, evaluating secondary fallback:', backendError.message);

                if (backendError.noFallback || backendError.message.includes('already exists') || backendError.message.includes('already registered')) {
                    showToast(backendError.message, '❌');
                    submitBtn.disabled = false;
                    if (cancelBtn) cancelBtn.disabled = false;
                    if (clearBtn) clearBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnHTML;
                    return;
                }

                // Strategy 2: Client-side Secondary Firebase App (creates user in isolated auth instance, keeping admin logged in!)
                try {
                    console.log('🔄 Initializing secondary Firebase app for safe client creation...');
                    const secondaryAppName = 'SecondaryAuth_' + Date.now();
                    const secondaryApp = firebase.initializeApp(firebaseConfig, secondaryAppName);

                    try {
                        const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
                        const newUser = userCredential.user;

                        await newUser.updateProfile({ displayName: name });

                        await db.collection('users').doc(newUser.uid).set({
                            email: email,
                            fullName: name,
                            userType: 'librarian',
                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                            createdBy: currentAdminUid,
                            lastLogin: null,
                            photoURL: null
                        });

                        await secondaryApp.auth().signOut();
                        creationSuccess = true;
                        createdUserRecord = {
                            uid: newUser.uid,
                            email: email,
                            fullName: name,
                            userType: 'librarian'
                        };
                        console.log('✓ Librarian created successfully via secondary client instance');
                    } finally {
                        await secondaryApp.delete();
                    }
                } catch (fallbackError) {
                    console.error('❌ Secondary client instance creation failed:', fallbackError);

                    let errMsg = 'Failed to create librarian account';
                    if (fallbackError.code === 'auth/email-already-in-use') {
                        errMsg = 'This email address is already registered';
                    } else if (fallbackError.code === 'auth/invalid-email') {
                        errMsg = 'Invalid email address format';
                    } else if (fallbackError.code === 'auth/weak-password') {
                        errMsg = 'Password is too weak. Please use a stronger password.';
                    } else {
                        errMsg = fallbackError.message || errMsg;
                    }

                    showToast(errMsg, '❌');
                    submitBtn.disabled = false;
                    if (cancelBtn) cancelBtn.disabled = false;
                    if (clearBtn) clearBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnHTML;
                    return;
                }
            }

            // Successful creation processing
            if (creationSuccess) {
                showToast(`✅ Librarian account created for ${name}!`, '✅');

                // Log system activity if ActivityService is available
                try {
                    if (window.ActivityService && typeof window.ActivityService.logActivity === 'function') {
                        window.ActivityService.logActivity('account_created', {
                            title: 'Created Librarian Account',
                            description: `Admin created librarian profile for ${name} (${email})`,
                            targetEmail: email,
                            role: 'librarian'
                        });
                    }
                } catch (logErr) {
                    console.debug('Activity logging skipped:', logErr);
                }

                // Force refresh the user table in the background
                try {
                    if (typeof loadUsersData === 'function') {
                        await loadUsersData(true);
                    }
                } catch (tableErr) {
                    console.warn('Could not auto-refresh users table:', tableErr);
                }

                // Unlock buttons and reset button state
                submitBtn.disabled = false;
                if (cancelBtn) cancelBtn.disabled = false;
                if (clearBtn) clearBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHTML;

                // Transition to modern credentials success card view
                showLibrarianSuccessView({
                    fullName: name,
                    email: email,
                    password: password,
                    uid: createdUserRecord?.uid
                });
            }
        });
    }

    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && createLibrarianModal?.classList.contains('active')) {
            closeLibrarianModal();
        }
    });

    // ===== BULK IMPORT FEATURE =====
    
    // State: Array of batch objects { id, batchNumber, fileName, fileSize, fileType, projects }
    let bulkImportBatches = [];
    const bulkImportModal = document.getElementById('bulk-import-modal');
    const bulkImportBtn = document.getElementById('bulk-import-btn');
    const bulkImportModalOverlay = document.getElementById('bulk-import-modal-overlay');
    const bulkImportModalCloseBtn = document.getElementById('bulk-import-modal-close-btn');
    const bulkImportCancelBtn = document.getElementById('bulk-import-cancel-btn');
    const bulkImportChooseBtn = document.getElementById('bulk-import-choose-btn');
    const bulkImportFileInput = document.getElementById('bulk-import-file-input');
    const bulkImportDropzone = document.getElementById('bulk-import-dropzone');
    const bulkDropzoneTitle = document.getElementById('bulk-dropzone-title');
    const bulkDropzoneSubtext = document.getElementById('bulk-dropzone-subtext');
    const bulkBatchesContainer = document.getElementById('bulk-batches-container');
    const bulkBatchesList = document.getElementById('bulk-batches-list');
    const bulkBatchesPill = document.getElementById('bulk-batches-pill');
    const bulkClearAllBatchesBtn = document.getElementById('bulk-clear-all-batches-btn');
    const bulkImportPreview = document.getElementById('bulk-import-preview');
    const bulkImportPreviewList = document.getElementById('bulk-import-preview-list');
    const bulkImportCount = document.getElementById('bulk-import-count');
    const bulkImportBatchCount = document.getElementById('bulk-import-batch-count');
    const bulkImportSubmitBtn = document.getElementById('bulk-import-submit-btn');
    const bulkImportSubmitText = document.getElementById('bulk-import-submit-text');
    const bulkImportProgress = document.getElementById('bulk-import-progress');
    const bulkImportProgressBar = document.getElementById('bulk-import-progress-bar');
    const bulkImportProgressText = document.getElementById('bulk-import-progress-text');
    const bulkImportResults = document.getElementById('bulk-import-results');
    const bulkSuccessCount = document.getElementById('bulk-success-count');
    const bulkErrorCount = document.getElementById('bulk-error-count');
    const bulkImportErrors = document.getElementById('bulk-import-errors');
    const bulkImportErrorList = document.getElementById('bulk-import-error-list');
    const downloadExcelTemplateBtn = document.getElementById('download-excel-template');
    const downloadJsonTemplateBtn = document.getElementById('download-json-template');
    
    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(text).replace(/[&<>"']/g, (m) => map[m]);
    }
    
    // Sample template data
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
            status: "Published"
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
            status: "Completed"
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
            status: "Published",
        }
    ];
    
    // Download Excel template
    if (downloadExcelTemplateBtn) {
        downloadExcelTemplateBtn.addEventListener('click', () => {
            generateExcelTemplate(sampleProjects);
            showToast('Excel template downloaded', '✅');
        });
    }
    
    // Download JSON template
    if (downloadJsonTemplateBtn) {
        downloadJsonTemplateBtn.addEventListener('click', () => {
            generateJsonTemplate(sampleProjects);
            showToast('JSON template downloaded', '✅');
        });
    }
    
    /**
     * Generate and download Excel template
     */
    function generateExcelTemplate(projects) {
        // Create workbook
        const wb = XLSX.utils.book_new();
        
        // Convert projects to worksheet format
        const wsData = [
            // Headers
            ['title', 'authors', 'program', 'year', 'adviser', 'abstract', 'keywords', 'topics', 'status']
        ];
        
        // Add sample data
        projects.forEach(project => {
            wsData.push([
                project.title,
                Array.isArray(project.authors) ? project.authors.join(', ') : project.authors,
                project.program,
                project.year,
                project.adviser,
                project.abstract,
                Array.isArray(project.keywords) ? project.keywords.join(', ') : project.keywords || '',
                Array.isArray(project.topics) ? project.topics.join(', ') : project.topics || '',
                project.status || 'Completed',
            ]);
        });
        
        // Create worksheet
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        
        // Set column widths
        ws['!cols'] = [
            { wch: 50 },  // title
            { wch: 30 },  // authors
            { wch: 15 },  // program
            { wch: 8 },   // year
            { wch: 25 },  // adviser
            { wch: 60 },  // abstract
            { wch: 30 },  // keywords
            { wch: 30 },  // topics
            { wch: 12 }     // status
        ];
        
        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, 'Projects');
        
        // Generate file and trigger download
        XLSX.writeFile(wb, 'RECAP_Bulk_Import_Template.xlsx');
    }
    
    /**
     * Generate and download JSON template
     */
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
    
    // Open bulk import modal
    if (bulkImportBtn) {
        bulkImportBtn.addEventListener('click', () => {
            bulkImportModal.classList.add('active');
            resetBulkImportModal();
            // Load draft after reset
            loadBulkImportDraft();
        });
    }
    
    // Bulk Import Processing state helper
    function setBulkImportProcessing(active, label, sublabel) {
        const modal      = document.getElementById('bulk-import-modal');
        const overlay    = document.getElementById('bulk-processing-overlay');
        const labelEl    = document.getElementById('bulk-processing-label');
        const sublabelEl = document.getElementById('bulk-processing-sublabel');
        const closeBtn   = document.getElementById('bulk-import-modal-close-btn');
        const cancelBtn  = document.getElementById('bulk-import-cancel-btn');
        const submitBtn  = document.getElementById('bulk-import-submit-btn');

        if (active) {
            const bodyEl = modal ? modal.querySelector('.modal-body') : null;
            if (bodyEl) bodyEl.scrollTop = 0;
            if (labelEl && label) labelEl.textContent = label;
            if (sublabelEl && sublabel) sublabelEl.textContent = sublabel;
            overlay && overlay.classList.add('active');
            overlay && overlay.setAttribute('aria-hidden', 'false');
            modal   && modal.classList.add('is-importing');
            if (closeBtn)  closeBtn.disabled  = true;
            if (cancelBtn) cancelBtn.disabled = true;
            if (submitBtn) submitBtn.disabled = true;
        } else {
            overlay && overlay.classList.remove('active');
            overlay && overlay.setAttribute('aria-hidden', 'true');
            modal   && modal.classList.remove('is-importing');
            if (closeBtn)  closeBtn.disabled  = false;
            if (cancelBtn) cancelBtn.disabled = false;
        }
    }

    // Close bulk import modal
    function closeBulkImportModal() {
        if (bulkImportModal && bulkImportModal.classList.contains('is-importing')) {
            return; // Interaction locked while bulk import is running
        }
        bulkImportModal.classList.remove('active');
        resetBulkImportModal();
    }
    
    if (bulkImportModalOverlay) {
        bulkImportModalOverlay.addEventListener('click', (e) => {
            if (e.target === bulkImportModalOverlay) {
                closeBulkImportModal();
            }
        });
    }
    
    if (bulkImportModalCloseBtn) {
        bulkImportModalCloseBtn.addEventListener('click', closeBulkImportModal);
    }
    
    if (bulkImportCancelBtn) {
        bulkImportCancelBtn.addEventListener('click', closeBulkImportModal);
    }
    
    // Guard flag: prevent drop-zone from re-triggering when file dialog is cancelled
    let _bulkPickerOpen = false;

    /**
     * Helper: format bytes into readable string
     */
    function formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    /**
     * Get all projects across all currently staged batches
     */
    function getAllBulkProjects() {
        return bulkImportBatches.flatMap(b => b.projects);
    }

    /**
     * Re-calculate batch numbers and update all related UI elements:
     * - Staged batches pill & list
     * - Dropzone text (inviting the next batch)
     * - Preview list grouped by batch
     * - Submit button status & text
     */
    function updateBatchesUI() {
        // Re-index batchNumber 1..N
        bulkImportBatches.forEach((batch, index) => {
            batch.batchNumber = index + 1;
        });

        const totalBatches = bulkImportBatches.length;
        const totalProjects = getAllBulkProjects().length;

        if (totalBatches === 0) {
            // Reset to clean initial state
            if (bulkBatchesContainer) bulkBatchesContainer.style.display = 'none';
            if (bulkImportPreview) bulkImportPreview.style.display = 'none';
            if (bulkImportSubmitBtn) bulkImportSubmitBtn.disabled = true;
            if (bulkImportSubmitText) bulkImportSubmitText.textContent = 'Import Projects';

            if (bulkImportDropzone) {
                bulkImportDropzone.classList.remove('has-batches', 'drag-active');
                if (bulkDropzoneTitle) bulkDropzoneTitle.innerHTML = '<strong>Drag &amp; drop files here to add a batch</strong>';
                if (bulkDropzoneSubtext) bulkDropzoneSubtext.style.display = 'block';
                if (bulkImportChooseBtn) bulkImportChooseBtn.textContent = 'Browse Files';
            }
            return;
        }

        // Show and update batches container
        if (bulkBatchesContainer) bulkBatchesContainer.style.display = 'block';
        if (bulkBatchesPill) {
            bulkBatchesPill.textContent = `${totalBatches} batch${totalBatches !== 1 ? 'es' : ''} • ${totalProjects} project${totalProjects !== 1 ? 's' : ''}`;
        }

        // Render staged batches cards
        if (bulkBatchesList) {
            bulkBatchesList.innerHTML = '';
            bulkImportBatches.forEach((batch) => {
                const item = document.createElement('div');
                item.className = 'bulk-batch-item';
                item.dataset.batchId = batch.id;
                const typeClass = batch.fileType === 'Excel' ? 'excel' : 'json';
                item.innerHTML = `
                    <div class="bulk-batch-left">
                        <span class="batch-badge">Batch ${batch.batchNumber}</span>
                        <span class="batch-type-pill ${typeClass}">${batch.fileType}</span>
                        <span class="batch-filename" title="${escapeHtml(batch.fileName)}">${escapeHtml(batch.fileName)}</span>
                        <span class="batch-meta-info">(${batch.projects.length} project${batch.projects.length !== 1 ? 's' : ''} • ${batch.fileSize})</span>
                    </div>
                    <button type="button" class="bulk-batch-remove-btn" title="Remove Batch ${batch.batchNumber}" data-batch-id="${batch.id}">✕</button>
                `;

                const removeBtn = item.querySelector('.bulk-batch-remove-btn');
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeBatch(batch.id);
                });

                bulkBatchesList.appendChild(item);
            });
        }

        // Dropzone remains open and invites next batch!
        if (bulkImportDropzone) {
            bulkImportDropzone.classList.add('has-batches');
            if (bulkDropzoneTitle) bulkDropzoneTitle.innerHTML = `<strong>+ Drag &amp; drop more files or Browse to add Batch ${totalBatches + 1}</strong>`;
            if (bulkDropzoneSubtext) bulkDropzoneSubtext.style.display = 'none';
            if (bulkImportChooseBtn) bulkImportChooseBtn.textContent = `+ Add Batch ${totalBatches + 1}`;
        }

        // Render preview grouped by batch
        renderBulkImportPreview();
        if (bulkImportCount) bulkImportCount.textContent = totalProjects;
        if (bulkImportBatchCount) bulkImportBatchCount.textContent = totalBatches;
        if (bulkImportPreview) bulkImportPreview.style.display = totalProjects > 0 ? 'block' : 'none';

        // Update submit button text and enabled state
        if (bulkImportSubmitBtn) bulkImportSubmitBtn.disabled = totalProjects === 0;
        if (bulkImportSubmitText) {
            bulkImportSubmitText.textContent = `Import All Batches (${totalProjects} Project${totalProjects !== 1 ? 's' : ''})`;
        }
    }

    /**
     * Remove a batch by ID and re-sync the UI
     */
    function removeBatch(batchId) {
        const idx = bulkImportBatches.findIndex(b => b.id === batchId);
        if (idx !== -1) {
            const removed = bulkImportBatches.splice(idx, 1)[0];
            showToast(`Removed Batch: "${removed.fileName}"`, '🗑️');
            updateBatchesUI();
            
            // Auto-save draft after removal
            saveBulkImportDraft();
        }
    }

    /**
     * Clear all staged batches button
     */
    if (bulkClearAllBatchesBtn) {
        bulkClearAllBatchesBtn.addEventListener('click', () => {
            bulkImportBatches = [];
            bulkImportFileInput.value = '';
            updateBatchesUI();
            showToast('All staged batches removed', '🗑️');
            
            // Clear draft when all batches removed
            clearBulkImportDraft();
        });
    }

    /**
     * Render the preview section with cards grouped under each Batch header
     */
    function renderBulkImportPreview() {
        if (!bulkImportPreviewList) return;
        bulkImportPreviewList.innerHTML = '';

        bulkImportBatches.forEach((batch) => {
            const groupEl = document.createElement('div');
            groupEl.className = 'bulk-batch-group';
            groupEl.dataset.batchId = batch.id;

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

            const groupRemoveBtn = groupEl.querySelector('.bulk-batch-remove-btn');
            groupRemoveBtn.addEventListener('click', () => {
                removeBatch(batch.id);
            });

            const itemsContainer = groupEl.querySelector('.bulk-batch-group-items');

            batch.projects.forEach((project, pIndex) => {
                const item = document.createElement('div');
                item.className = 'bulk-preview-item';
                item.dataset.batchId = batch.id;
                item.dataset.pIndex = pIndex;

                const authors = Array.isArray(project.authors) ? project.authors.join(', ') : project.authors;
                const imgCount = (project._imageFiles || []).length;

                item.innerHTML = `
                    <div class="bulk-preview-item-header">
                        <div>
                            <div class="bulk-preview-item-title">${pIndex + 1}. ${escapeHtml(project.title)}</div>
                            <div class="bulk-preview-item-meta">
                                <span>${escapeHtml(authors)}</span>
                                <span>${escapeHtml(project.program)}</span>
                                <span>${project.year}</span>
                            </div>
                        </div>
                        <button type="button" class="bulk-preview-remove-btn" title="Remove this project from batch">✕</button>
                    </div>
                    <div class="bulk-preview-img-row">
                        <input type="file" id="bulk-img-input-${batch.id}-${pIndex}" accept="image/png,image/jpeg,image/webp,image/jpg" multiple style="display:none;">
                        <button type="button" class="bulk-preview-img-btn" id="bulk-img-add-btn-${batch.id}-${pIndex}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                            Add Images
                        </button>
                        <button type="button" class="bulk-preview-toggle-imgs-btn" id="bulk-toggle-imgs-${batch.id}-${pIndex}" style="display: ${imgCount > 0 ? 'inline-flex' : 'none'};" title="Click to view and manage staged images">
                            <span>🖼️ Review Images (<span class="imgs-count-num">${imgCount}</span>)</span>
                            <span class="toggle-arrow">▾</span>
                        </button>
                        <span class="bulk-preview-img-count" id="bulk-img-count-${batch.id}-${pIndex}" style="display: ${imgCount > 0 ? 'none' : 'inline'};">No images</span>
                    </div>

                    <!-- Staged Images Dropdown Preview Tray -->
                    <div class="bulk-project-images-tray" id="bulk-img-tray-${batch.id}-${pIndex}" style="display: none;">
                        <div class="bulk-images-tray-header">
                            <span class="bulk-images-tray-title">
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                Staged Images (<span class="tray-count">${imgCount}</span>) — Review or remove wrong images
                            </span>
                            <button type="button" class="bulk-images-tray-add-more-btn" id="bulk-img-add-more-${batch.id}-${pIndex}">+ Add More</button>
                        </div>
                        <div class="bulk-images-tray-grid" id="bulk-img-grid-${batch.id}-${pIndex}"></div>
                    </div>
                `;

                itemsContainer.appendChild(item);

                // Elements
                const imgInput = item.querySelector(`#bulk-img-input-${batch.id}-${pIndex}`);
                const imgBtn = item.querySelector(`#bulk-img-add-btn-${batch.id}-${pIndex}`);
                const toggleImgsBtn = item.querySelector(`#bulk-toggle-imgs-${batch.id}-${pIndex}`);
                const imgCountSpan = item.querySelector(`#bulk-img-count-${batch.id}-${pIndex}`);
                const imgsTray = item.querySelector(`#bulk-img-tray-${batch.id}-${pIndex}`);
                const imgsGrid = item.querySelector(`#bulk-img-grid-${batch.id}-${pIndex}`);
                const trayCountSpan = item.querySelector('.tray-count');
                const addMoreBtn = item.querySelector(`#bulk-img-add-more-${batch.id}-${pIndex}`);
                const imgsCountNum = item.querySelector('.imgs-count-num');

                // Render thumbnails in tray
                function refreshImagesTray() {
                    const images = project._imageFiles || [];
                    const count = images.length;

                    if (count === 0) {
                        toggleImgsBtn.style.display = 'none';
                        toggleImgsBtn.classList.remove('open');
                        imgCountSpan.style.display = 'inline';
                        imgsTray.style.display = 'none';
                        imgsGrid.innerHTML = '';
                        return;
                    }

                    toggleImgsBtn.style.display = 'inline-flex';
                    imgsCountNum.textContent = count;
                    trayCountSpan.textContent = count;
                    imgCountSpan.style.display = 'none';

                    imgsGrid.innerHTML = '';
                    images.forEach((file, imgIdx) => {
                        const thumbCard = document.createElement('div');
                        thumbCard.className = 'bulk-img-thumb-card';
                        const previewUrl = URL.createObjectURL(file);

                        thumbCard.innerHTML = `
                            <img src="${previewUrl}" alt="${escapeHtml(file.name)}" title="Click to view full image in new tab: ${escapeHtml(file.name)}">
                            <button type="button" class="bulk-img-thumb-remove" title="Remove this image" data-img-idx="${imgIdx}">✕</button>
                            <div class="bulk-img-thumb-info">
                                <span class="bulk-img-thumb-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                                <span class="bulk-img-thumb-size">${formatFileSize(file.size)}</span>
                            </div>
                        `;

                        // Clicking image opens full-size preview
                        const imgEl = thumbCard.querySelector('img');
                        imgEl.addEventListener('click', () => {
                            window.open(previewUrl, '_blank');
                        });

                        // Remove single image
                        const removeImgBtn = thumbCard.querySelector('.bulk-img-thumb-remove');
                        removeImgBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            URL.revokeObjectURL(previewUrl);
                            project._imageFiles.splice(imgIdx, 1);
                            showToast(`Removed "${file.name}" from ${project.title}`, '🗑️');
                            refreshImagesTray();
                        });

                        imgsGrid.appendChild(thumbCard);
                    });
                }

                // Initial render of thumbnails if already staged
                if (imgCount > 0) {
                    refreshImagesTray();
                }

                // Toggle dropdown tray
                toggleImgsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isOpen = imgsTray.style.display !== 'none';
                    imgsTray.style.display = isOpen ? 'none' : 'block';
                    toggleImgsBtn.classList.toggle('open', !isOpen);
                });

                // Browse / Add Images
                imgBtn.addEventListener('click', () => imgInput.click());
                if (addMoreBtn) {
                    addMoreBtn.addEventListener('click', () => imgInput.click());
                }

                imgInput.addEventListener('change', (e) => {
                    const files = Array.from(e.target.files || []);
                    if (!project._imageFiles) project._imageFiles = [];
                    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
                    let added = 0;
                    files.forEach(f => {
                        if (!allowed.includes(f.type)) { showToast(`Skipped ${f.name}: not a valid image`, '⚠️'); return; }
                        if (f.size > 10 * 1024 * 1024) { showToast(`Skipped ${f.name}: exceeds 10MB`, '⚠️'); return; }
                        project._imageFiles.push(f);
                        added++;
                    });

                    if (added > 0) {
                        showToast(`Added ${added} image${added > 1 ? 's' : ''} to "${project.title}"`, '🖼️');
                        // Auto-open tray when images are added so admin can inspect immediately
                        imgsTray.style.display = 'block';
                        toggleImgsBtn.classList.add('open');
                    }
                    refreshImagesTray();
                    imgInput.value = '';
                });

                // Wire remove individual project
                const removeProjectBtn = item.querySelector('.bulk-preview-remove-btn');
                removeProjectBtn.addEventListener('click', () => {
                    batch.projects.splice(pIndex, 1);
                    if (batch.projects.length === 0) {
                        const bIdx = bulkImportBatches.findIndex(b => b.id === batch.id);
                        if (bIdx !== -1) bulkImportBatches.splice(bIdx, 1);
                    }
                    updateBatchesUI();
                });
            });

            bulkImportPreviewList.appendChild(groupEl);
        });
    }

    /**
     * Shared handler: parse, validate, and register a file as a new Batch.
     * Can be called multiple times for single files or in a loop for multiple files.
     */
    async function processBulkFile(file) {
        const fileName = file.name.toLowerCase();
        const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
        const isJSON  = fileName.endsWith('.json');

        if (!isExcel && !isJSON) {
            showToast('Please select a valid Excel (.xlsx, .xls) or JSON file', '❌');
            return;
        }

        try {
            let data;
            if (isExcel) {
                data = await parseExcelFile(file);
            } else {
                const text = await file.text();
                data = JSON.parse(text);
            }

            if (!Array.isArray(data)) { showToast(`"${file.name}" must contain an array of projects`, '❌'); return; }
            if (data.length === 0)    { showToast(`"${file.name}" is empty`, '❌'); return; }

            const fileErrors = [];
            const validProjects = [];
            // Track normalized titles seen in THIS file to catch intra-file duplicates immediately (no Firestore reads)
            const seenInFile = new Set();

            data.forEach((project, index) => {
                if (project.abstract === 'None' || project.abstract === 'null' || project.abstract === null) project.abstract = '';
                if (project.adviser  === 'None' || project.adviser  === 'null' || project.adviser  === null) project.adviser  = '';

                const missing = ['title', 'authors', 'program', 'year'].filter(f => !project[f]);
                if (missing.length > 0) {
                    fileErrors.push(`"${project.title || 'Untitled'}" (row ${index + 1}): missing ${missing.join(', ')}`);
                } else {
                    // Intra-file duplicate check (client-side only — zero Firestore reads)
                    const norm = normalizeTitle(project.title);
                    if (seenInFile.has(norm)) {
                        fileErrors.push(`"${project.title}" (row ${index + 1}): duplicate title within this file — skipped`);
                    } else {
                        seenInFile.add(norm);
                        if (!project.abstract || !project.abstract.trim()) project.abstract = 'No abstract provided.';
                        if (!project.adviser  || !project.adviser.trim())  project.adviser  = 'Not specified';
                        project._imageFiles = []; // per-project image staging
                        validProjects.push(project);
                    }
                }
            });

            if (validProjects.length === 0) {
                showToast(`No valid projects in "${file.name}"`, '❌');
                return;
            }
            if (fileErrors.length > 0) {
                console.warn('Bulk file errors:', fileErrors);
                showToast(`${validProjects.length} valid, ${fileErrors.length} skipped from "${file.name}"`, '⚠️');
            }

            // Create new batch
            const newBatch = {
                id: 'batch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                batchNumber: bulkImportBatches.length + 1,
                fileName: file.name,
                fileSize: formatFileSize(file.size),
                fileType: isExcel ? 'Excel' : 'JSON',
                projects: validProjects
            };

            bulkImportBatches.push(newBatch);
            updateBatchesUI();
            
            // Auto-save draft
            saveBulkImportDraft();

            showToast(`Added Batch ${newBatch.batchNumber}: "${file.name}" (${validProjects.length} projects)`, '✅');

        } catch (error) {
            console.error('Error parsing file:', error);
            showToast(isExcel ? 'Invalid Excel file format' : 'Invalid JSON file format', '❌');
        }
    }

    // Utility: open file picker safely (guard against cancel-vanish)
    function openBulkFilePicker() {
        if (_bulkPickerOpen) return;
        _bulkPickerOpen = true;
        bulkImportFileInput.click();
        // Detect picker close (focus returns to window) and reset flag
        const onFocus = () => {
            _bulkPickerOpen = false;
            window.removeEventListener('focus', onFocus);
        };
        window.addEventListener('focus', onFocus, { once: true });
    }

    // Browse button inside dropzone → open file picker
    if (bulkImportChooseBtn) {
        bulkImportChooseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openBulkFilePicker();
        });
    }

    // Clicking anywhere on the dropzone also opens file picker
    if (bulkImportDropzone) {
        bulkImportDropzone.addEventListener('click', (e) => {
            if (e.target.closest('#bulk-import-choose-btn')) return;
            openBulkFilePicker();
        });

        bulkImportDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            bulkImportDropzone.classList.add('drag-active');
        });

        bulkImportDropzone.addEventListener('dragleave', (e) => {
            if (!bulkImportDropzone.contains(e.relatedTarget)) {
                bulkImportDropzone.classList.remove('drag-active');
            }
        });

        // Drop supports single or multiple files (each becomes its own batch)
        bulkImportDropzone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            bulkImportDropzone.classList.remove('drag-active');
            const files = Array.from(e.dataTransfer.files);
            for (const file of files) {
                await processBulkFile(file);
            }
        });
    }

    // File input change — supports multiple files selected at once
    if (bulkImportFileInput) {
        bulkImportFileInput.addEventListener('change', async (e) => {
            _bulkPickerOpen = false;
            const files = Array.from(e.target.files || []);
            for (const file of files) {
                await processBulkFile(file);
            }
            // Reset input so the same file can be re-added if removed
            bulkImportFileInput.value = '';
        });
    }
    
    /**
     * Parse Excel file using SheetJS
     */
    async function parseExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    // Get first sheet
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    // Convert to JSON
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                        raw: false,
                        defval: ''
                    });
                    
                    // Process the data
                    const projects = jsonData.map(row => {
                        // Handle authors (split by comma if string)
                        let authors = row.authors || row.Authors || '';
                        if (typeof authors === 'string') {
                            authors = authors.split(',').map(a => a.trim()).filter(a => a);
                        }
                        
                        // Handle keywords (split by comma if string)
                        let keywords = row.keywords || row.Keywords || '';
                        if (typeof keywords === 'string') {
                            keywords = keywords.split(',').map(k => k.trim()).filter(k => k);
                        }
                        
                        // Handle topics (split by comma if string)
                        let topics = row.topics || row.Topics || '';
                        if (typeof topics === 'string') {
                            topics = topics.split(',').map(t => t.trim()).filter(t => t);
                        }
                        
                        return {
                            title: row.title || row.Title || '',
                            authors: authors,
                            program: row.program || row.Program || '',
                            year: parseInt(row.year || row.Year) || 0,
                            adviser: row.adviser || row.Adviser || '',
                            abstract: row.abstract || row.Abstract || '',
                            keywords: keywords,
                            topics: topics,
                            status: row.status || row.Status || 'Completed',
                        };
                    });
                    
                    resolve(projects);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    }
    
    // Submit bulk import across all staged batches
    if (bulkImportSubmitBtn) {
        bulkImportSubmitBtn.addEventListener('click', async () => {
            const allProjects = getAllBulkProjects();
            if (bulkImportBatches.length === 0 || allProjects.length === 0) {
                showToast('No projects to import', '❌');
                return;
            }

            const total = allProjects.length;
            
            // Hide preview & staged batches, hide submit button
            if (bulkImportPreview) bulkImportPreview.style.display = 'none';
            if (bulkBatchesContainer) bulkBatchesContainer.style.display = 'none';
            bulkImportSubmitBtn.style.display = 'none';
            bulkImportCancelBtn.disabled = true;
            
            // Show progress
            bulkImportProgress.style.display = 'block';

            // Activate processing blur state: blocks close, cancel, backdrop, and all interaction
            setBulkImportProcessing(true, 'Importing projects…', `Processing 0 of ${total} projects…`);
            const overlayBar = document.getElementById('bulk-overlay-progress-bar');
            const overlayText = document.getElementById('bulk-overlay-progress-text');
            const overlaySublabel = document.getElementById('bulk-processing-sublabel');
            if (overlayBar) overlayBar.style.width = '0%';
            if (overlayText) overlayText.textContent = '0%';
            
            let successCount = 0;
            let errorCount = 0;
            const errors = [];
            let overallProcessed = 0;
            
            // Set to catch duplicate titles within the same import run (zero extra Firestore reads)
            const seenTitlesInBatch = new Set();

            try {
                for (let b = 0; b < bulkImportBatches.length; b++) {
                    const currentBatch = bulkImportBatches[b];
                    const bProjects = currentBatch.projects;

                    for (let p = 0; p < bProjects.length; p++) {
                        const project = bProjects[p];
                        
                        // Update progress UI & overlay
                        const progress = Math.round((overallProcessed / total) * 100);
                        bulkImportProgressBar.style.width = `${progress}%`;
                        bulkImportProgressBar.textContent = `${progress}%`;
                        bulkImportProgressText.textContent = `Batch ${currentBatch.batchNumber}/${bulkImportBatches.length} (${currentBatch.fileName}) • Project ${p + 1}/${bProjects.length}: "${project.title}" (${overallProcessed + 1}/${total})`;
                        if (overlayBar) overlayBar.style.width = `${progress}%`;
                        if (overlayText) overlayText.textContent = `${progress}% (${overallProcessed + 1}/${total})`;
                        if (overlaySublabel) overlaySublabel.textContent = `Batch ${currentBatch.batchNumber}/${bulkImportBatches.length} • "${project.title.substring(0, 45)}${project.title.length > 45 ? '…' : ''}"`;

                        try {
                            // ===== Duplicate check 1: intra-import (Set, zero Firestore reads) =====
                            const projTitleNorm = normalizeTitle(project.title);
                            if (seenTitlesInBatch.has(projTitleNorm)) {
                                errors.push(`[Batch ${currentBatch.batchNumber}] "${project.title}": duplicate title within this import — skipped`);
                                errorCount++;
                                overallProcessed++;
                                const postProg = Math.round((overallProcessed / total) * 100);
                                bulkImportProgressBar.style.width = `${postProg}%`;
                                bulkImportProgressBar.textContent = `${postProg}%`;
                                if (overlayBar) overlayBar.style.width = `${postProg}%`;
                                if (overlayText) overlayText.textContent = `${postProg}% (${overallProcessed}/${total})`;
                                continue;
                            }

                            // ===== Duplicate check 2: against Firestore (targeted .where query — no full fetch) =====
                            const bulkDupSnap = await db.collection('projects')
                                .where('titleNorm', '==', projTitleNorm)
                                .limit(1)
                                .get();
                            if (!bulkDupSnap.empty) {
                                errors.push(`[Batch ${currentBatch.batchNumber}] "${project.title}": already exists in database — skipped`);
                                errorCount++;
                                overallProcessed++;
                                const postProg = Math.round((overallProcessed / total) * 100);
                                bulkImportProgressBar.style.width = `${postProg}%`;
                                bulkImportProgressBar.textContent = `${postProg}%`;
                                if (overlayBar) overlayBar.style.width = `${postProg}%`;
                                if (overlayText) overlayText.textContent = `${postProg}% (${overallProcessed}/${total})`;
                                continue;
                            }

                            // Mark this title as seen for the rest of this import run
                            seenTitlesInBatch.add(projTitleNorm);

                            // Upload per-project images to Cloudinary (if any)
                            let projectImages = [];
                            const imageFiles = project._imageFiles || [];
                            if (imageFiles.length > 0 && window.CloudinaryService) {
                                for (const imgFile of imageFiles) {
                                    try {
                                        const url = await window.CloudinaryService.uploadImage(imgFile);
                                        if (url) projectImages.push(url);
                                    } catch (imgErr) {
                                        console.warn('Image upload failed for', imgFile.name, imgErr);
                                    }
                                }
                            }

                            // Prepare project data
                            const projectData = {
                                title: project.title,
                                titleNorm: normalizeTitle(project.title), // shadow field for dup detection
                                authors: Array.isArray(project.authors) ? project.authors : [project.authors],
                                program: project.program,
                                year: parseInt(project.year),
                                adviser: project.adviser,
                                abstract: project.abstract,
                                keywords: project.keywords || [],
                                topics: project.topics || [],
                                status: project.status || 'Completed',
                                images: projectImages,
                                batchSource: currentBatch.fileName,
                                pineconeSynced: false,
                                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                                uploadedBy: auth.currentUser.uid,
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            };

                            // Add to Firestore
                            const docRef = await db.collection('projects').add(projectData);
                            
                            // Sync to Pinecone (backend)
                            try {
                                const backendUrl = getBackendUrl();
                                const syncResponse = await fetch(`${backendUrl}/api/projects/sync`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        projectId: docRef.id,
                                        projectData: {
                                            ...projectData,
                                            createdAt: new Date().toISOString()
                                        }
                                    })
                                });
                                
                                if (syncResponse.ok) {
                                    await docRef.update({ pineconeSynced: true }).catch(() => {});
                                } else {
                                    console.warn(`Pinecone sync failed for project: ${project.title}`);
                                }
                            } catch (syncError) {
                                console.warn('Pinecone sync error:', syncError);
                            }
                            
                            // Increment RTDB counter
                            try {
                                if (rtdb) {
                                    const countRef = rtdb.ref('projects_document_count');
                                    await countRef.transaction((current) => (current || 0) + 1);
                                    
                                    const updateCounterRef = rtdb.ref('update_counter');
                                    await updateCounterRef.transaction((current) => (current || 0) + 1);
                                } else {
                                    console.warn('RTDB not available, skipping counter update');
                                }
                            } catch (rtdbError) {
                                console.warn('RTDB counter update failed:', rtdbError);
                            }
                            
                            successCount++;
                            
                        } catch (error) {
                            console.error(`Error importing project "${project.title}":`, error);
                            errorCount++;
                            errors.push(`[Batch ${currentBatch.batchNumber}] ${project.title}: ${error.message}`);
                        }

                        overallProcessed++;
                        const postProgress = Math.round((overallProcessed / total) * 100);
                        bulkImportProgressBar.style.width = `${postProgress}%`;
                        bulkImportProgressBar.textContent = `${postProgress}%`;
                        if (overlayBar) overlayBar.style.width = `${postProgress}%`;
                        if (overlayText) overlayText.textContent = `${postProgress}% (${overallProcessed}/${total})`;
                    }
                }
            } finally {
                // Deactivate blur overlay so results are visible and usable
                setBulkImportProcessing(false);
            }
            
            // Hide progress
            bulkImportProgress.style.display = 'none';
            
            // Show results
            bulkSuccessCount.textContent = successCount;
            bulkErrorCount.textContent = errorCount;
            bulkImportResults.classList.remove('is-success', 'is-error');
            const resultsTitle = bulkImportResults.querySelector('h4');
            if (resultsTitle) {
                if (errorCount === 0 && successCount > 0) {
                    bulkImportResults.classList.add('is-success');
                    resultsTitle.innerHTML = '<span>✅</span> Import Completed Successfully';
                } else if (successCount === 0 && errorCount > 0) {
                    bulkImportResults.classList.add('is-error');
                    resultsTitle.innerHTML = '<span>❌</span> Import Failed';
                } else {
                    resultsTitle.innerHTML = '<span>📊</span> Import Summary';
                }
            }
            bulkImportResults.style.display = 'block';
            
            if (errors.length > 0) {
                bulkImportErrorList.innerHTML = '';
                errors.forEach(error => {
                    const li = document.createElement('li');
                    li.textContent = error;
                    bulkImportErrorList.appendChild(li);
                });
                bulkImportErrors.style.display = 'block';
            }
            
            // Invalidate cache
            invalidateCache();
            
            // Show final toast
            if (successCount > 0) {
                showToast(`Successfully imported ${successCount} project${successCount !== 1 ? 's' : ''} across ${bulkImportBatches.length} batch${bulkImportBatches.length !== 1 ? 'es' : ''}!`, '✅');
            }
            
            if (errorCount > 0) {
                showToast(`${errorCount} project${errorCount !== 1 ? 's' : ''} failed to import`, '❌');
            }
            
            // Clear draft after successful import
            clearBulkImportDraft();
            
            // Enable cancel (now "Close") button
            bulkImportCancelBtn.disabled = false;
            bulkImportCancelBtn.textContent = 'Close';
            
            // Reload projects table
            if (document.getElementById('section-projects').classList.contains('active')) {
                await loadProjectsData();
            }
        });
    }
    
    // Save bulk import draft to localStorage
    function saveBulkImportDraft() {
        if (bulkImportBatches.length > 0) {
            localStorage.setItem('admin_bulk_import_draft', JSON.stringify(bulkImportBatches));
            console.log('💾 Bulk import draft saved');
        }
    }

    // Load bulk import draft from localStorage
    function loadBulkImportDraft() {
        const draft = localStorage.getItem('admin_bulk_import_draft');
        if (draft) {
            try {
                const restored = JSON.parse(draft);
                if (Array.isArray(restored) && restored.length > 0) {
                    bulkImportBatches = restored;
                    updateBatchesUI();
                    showToast('Draft restored ✨', 'ℹ️');
                    console.log('✓ Bulk import draft loaded:', bulkImportBatches.length, 'batches');
                }
            } catch (error) {
                console.warn('Failed to load bulk import draft:', error);
                localStorage.removeItem('admin_bulk_import_draft');
            }
        }
    }

    // Clear bulk import draft from localStorage
    function clearBulkImportDraft() {
        localStorage.removeItem('admin_bulk_import_draft');
        console.log('🗑️ Bulk import draft cleared');
    }

    // Reset bulk import modal
    function resetBulkImportModal() {
        setBulkImportProcessing(false);
        const overlayBar = document.getElementById('bulk-overlay-progress-bar');
        const overlayText = document.getElementById('bulk-overlay-progress-text');
        if (overlayBar) overlayBar.style.width = '0%';
        if (overlayText) overlayText.textContent = '0%';
        bulkImportFileInput.value = '';
        bulkImportBatches = [];
        updateBatchesUI();
        bulkImportProgress.style.display = 'none';
        bulkImportResults.style.display = 'none';
        bulkImportSubmitBtn.style.display = 'inline-flex';
        bulkImportSubmitBtn.disabled = true;
        bulkImportCancelBtn.disabled = false;
        bulkImportCancelBtn.textContent = 'Cancel';
        bulkImportErrors.style.display = 'none';
        bulkImportProgressBar.style.width = '0%';
        bulkImportProgressBar.textContent = '';
    }
    
    // ===== END BULK IMPORT FEATURE =====
});
