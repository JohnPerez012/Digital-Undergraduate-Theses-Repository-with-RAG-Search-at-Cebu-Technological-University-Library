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

    // ===== Pending Approvals State =====
    let allPendingApprovals = [];
    let unsubscribePendingProjects = null;

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
            case 'approvals':
                await loadPendingApprovalsData();
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

            const projStat = document.getElementById('total-projects-stat');
            if (projStat) projStat.textContent = totalProjects;

            const userStat = document.getElementById('total-users-stat');
            if (userStat) userStat.textContent = totalUsers;

            const studentsCountEl = document.getElementById('stat-students-count');
            const librariansCountEl = document.getElementById('stat-librarians-count');
            if (studentsCountEl && librariansCountEl) {
                studentsCountEl.textContent = studentUsers;
                librariansCountEl.textContent = librarianUsers;
            } else {
                const statElem = document.getElementById('student-users-stat');
                if (statElem) statElem.textContent = `${studentUsers} Students / ${librarianUsers} Librarians`;
            }

            const actStat = document.getElementById('recent-activity-stat');
            if (actStat) {
                if (window.ActivityService && typeof window.ActivityService.getAllActivities === 'function') {
                    window.ActivityService.getAllActivities().then(activities => {
                        actStat.textContent = Array.isArray(activities) ? activities.length : 0;
                    }).catch(() => {
                        const user = window.ActivityService?.getCurrentUserContext?.();
                        const list = user?.uid ? window.ActivityService.getLocalCache(user.uid) : [];
                        actStat.textContent = list.length;
                    });
                } else {
                    const user = window.ActivityService?.getCurrentUserContext?.();
                    const list = user?.uid ? window.ActivityService.getLocalCache(user.uid) : [];
                    actStat.textContent = list.length;
                }
            }

            db.collection('pendingProjects').get().then(snap => {
                if (typeof updatePendingCounters === 'function') {
                    updatePendingCounters(snap.size);
                }
            }).catch(() => {});

            // Load recent projects
            const recentProjectsList = document.getElementById('recent-projects-list');
            if (recentProjectsList) {
                recentProjectsList.innerHTML = '';
                const sortedProjects = [...projectsList].sort((a, b) => {
                    const dateA = getTimestamp(a.createdAt);
                    const dateB = getTimestamp(b.createdAt);
                    return dateB - dateA;
                }).slice(0, 5);

                const recentProjectsCountEl = document.getElementById('recent-projects-count');
                if (recentProjectsCountEl) {
                    recentProjectsCountEl.textContent = `${sortedProjects.length} Latest`;
                }

                if (sortedProjects.length === 0) {
                    recentProjectsList.innerHTML = `
                        <div class="dash-empty-state">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                            <span>No projects cataloged yet</span>
                        </div>
                    `;
                } else {
                    sortedProjects.forEach(data => {
                        const item = document.createElement('div');
                        item.className = 'recent-item recent-item-project';
                        item.setAttribute('role', 'button');
                        item.setAttribute('tabindex', '0');
                        item.setAttribute('title', 'Click to inspect thesis details');

                        const rawDate = formatDate(data.createdAt);
                        const yearStr = data.year ? String(data.year) : '';
                        const dateStr = (rawDate && rawDate !== 'N/A') ? rawDate : (yearStr ? `AY ${yearStr}` : 'Cataloged');
                        const program = escapeHtml(data.program || 'General');

                        item.innerHTML = `
                            <div class="recent-item-main">
                                <div class="recent-item-title">${escapeHtml(data.title || 'Untitled Project')}</div>
                                <div class="recent-item-meta">
                                    <span class="dash-prog-tag dash-prog-${program.toLowerCase().replace(/[^a-z0-9]/g, '')}">${program}</span>
                                    ${yearStr ? `<span class="dash-year-tag">${yearStr}</span>` : ''}
                                    <span class="dash-meta-sep">•</span>
                                    <span class="dash-meta-date">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                        ${dateStr}
                                    </span>
                                </div>
                            </div>
                            <div class="recent-item-arrow" aria-hidden="true">
                                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </div>
                        `;
                        item.addEventListener('click', () => {
                            if (typeof window.viewProject === 'function' && data.id) {
                                window.viewProject(data.id);
                            }
                        });
                        item.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                item.click();
                            }
                        });
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

                const recentUsersCountEl = document.getElementById('recent-users-count');
                if (recentUsersCountEl) {
                    recentUsersCountEl.textContent = `${sortedUsers.length} Latest`;
                }

                if (sortedUsers.length === 0) {
                    recentUsersList.innerHTML = `
                        <div class="dash-empty-state">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
                            <span>No users registered yet</span>
                        </div>
                    `;
                } else {
                    sortedUsers.forEach(data => {
                        const item = document.createElement('div');
                        const userType = (data.userType || 'student').toLowerCase();
                        item.className = `recent-item recent-item-user role-${userType}`;
                        item.setAttribute('role', 'button');
                        item.setAttribute('tabindex', '0');

                        const roleName = userType === 'librarian' ? 'Librarian' : (userType === 'admin' ? 'Admin' : 'Student');
                        item.setAttribute('title', `Click to search ${roleName} in Users directory`);

                        const rawDate = formatDate(data.createdAt || data.joinedDate);
                        const dateStr = (rawDate && rawDate !== 'N/A') ? `Joined ${rawDate}` : 'Active Account';
                        const displayName = escapeHtml(data.fullName || data.email || 'Unknown User');
                        const displayEmail = (data.fullName && data.email && data.fullName !== data.email) ? escapeHtml(data.email) : '';
                        const initial = (data.fullName || data.email || 'U').charAt(0).toUpperCase();

                        item.innerHTML = `
                            <div class="dash-user-avatar role-avatar-${userType}">
                                <span>${initial}</span>
                            </div>
                            <div class="recent-item-main">
                                <div class="recent-item-title">${displayName}</div>
                                <div class="recent-item-meta">
                                    <span class="dash-role-badge role-${userType}">${roleName}</span>
                                    ${displayEmail ? `<span class="dash-user-email">${displayEmail}</span>` : ''}
                                    <span class="dash-meta-sep">•</span>
                                    <span class="dash-meta-date">${dateStr}</span>
                                </div>
                            </div>
                            <div class="recent-item-arrow" aria-hidden="true">
                                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </div>
                        `;
                        item.addEventListener('click', () => {
                            const usersNav = document.querySelector('.rail-nav-item[data-section="users"]');
                            if (usersNav) {
                                usersNav.click();
                                const searchInput = document.getElementById('users-search');
                                if (searchInput) {
                                    searchInput.value = data.email || data.fullName || '';
                                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                                }
                            }
                        });
                        item.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                item.click();
                            }
                        });
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
            const pStat = document.getElementById('total-projects-stat');
            if (pStat) pStat.textContent = '...';
            const uStat = document.getElementById('total-users-stat');
            if (uStat) uStat.textContent = '...';
            const studentsCountEl = document.getElementById('stat-students-count');
            const librariansCountEl = document.getElementById('stat-librarians-count');
            if (studentsCountEl && librariansCountEl) {
                studentsCountEl.textContent = '...';
                librariansCountEl.textContent = '...';
            } else {
                const statElem = document.getElementById('student-users-stat');
                if (statElem) statElem.textContent = '...';
            }
            const aStat = document.getElementById('recent-activity-stat');
            if (aStat) aStat.textContent = '...';
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
                console.log('Projects cache is valid for dashboard');
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
                console.log('Users cache is valid/fresh for dashboard');
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
                const pStat = document.getElementById('total-projects-stat');
                if (pStat) pStat.textContent = '-';
                const uStat = document.getElementById('total-users-stat');
                if (uStat) uStat.textContent = '-';
                const studentsCountEl = document.getElementById('stat-students-count');
                const librariansCountEl = document.getElementById('stat-librarians-count');
                if (studentsCountEl && librariansCountEl) {
                    studentsCountEl.textContent = '-';
                    librariansCountEl.textContent = '-';
                } else {
                    const statElem = document.getElementById('student-users-stat');
                    if (statElem) statElem.textContent = 'Error';
                }
                const aStat = document.getElementById('recent-activity-stat');
                if (aStat) aStat.textContent = '-';
                
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
            
            console.log('Cache is up-to-date!');
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
            console.log(`Loaded ${projects.length} projects from cache`);
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
            console.log(`Loaded ${users.length} users from cache`);
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
            
            console.log(`Cached ${projects.length} projects with metadata:`, metadata);
            
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
            
            console.log(`Cached ${users.length} users with metadata:`, metadata);
            
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
                    console.log('Projects cache is valid. Reconciling Pinecone status in background...');
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
                    console.log(`Reconciled projects with Pinecone: updated sync indicators`);
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
                    <div class="table-actions projects-action-grid">
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
                        ${data.isLockedByAdmin
                            ? `<span class="badge badge-locked-admin" style="background:rgba(239,68,68,0.15);color:#f87171;font-size:0.68rem;padding:2px 7px;border-radius:4px;border:1px solid rgba(239,68,68,0.35);margin-left:6px;display:inline-flex;align-items:center;gap:3px;" title="Locked by Admin — Cataloging and editing are disabled"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Locked</span>`
                            : ''
                        }
                    </div>
                </td>
                <td>${highlightSearchTerms((data.authors || []).join(', ') || 'N/A', searchQuery)}</td>
                <td><span class="badge badge-info">${highlightSearchTerms(data.program || 'N/A', searchQuery)}</span></td>
                <td>${highlightSearchTerms(data.year || 'N/A', searchQuery)}</td>
                <td>${highlightSearchTerms(data.adviser || 'N/A', searchQuery)}</td>
                <td>
                    ${(() => {
                        const isLocked = Boolean(data.isLockedByAdmin);
                        const isBeingCataloged = Boolean(data.isBeingCataloged);
                        const isBeingEdited = Boolean(data.isBeingEdited);

                        const lockBtn = isLocked
                            ? `<button type="button" class="action-btn action-unlock" onclick="window.__adminToggleLockProject('${data.id}', false)" title="Unlock project">
                                   <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                                   <span class="action-btn-text">Unlock</span>
                               </button>`
                            : `<button type="button" class="action-btn action-lock" onclick="window.__adminToggleLockProject('${data.id}', true)" title="Lock project (Freeze cataloging and modifications)">
                                   <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                   <span class="action-btn-text">Lock</span>
                               </button>`;

                        // Stale Lock Guard (15 minutes TTL): Auto-expire abandoned cataloging/editing locks
                        let isCatalogLockStale = false;
                        if (isBeingCataloged && data.catalogingStartedAt) {
                            try {
                                const started = data.catalogingStartedAt.toDate ? data.catalogingStartedAt.toDate() : new Date(data.catalogingStartedAt);
                                if (Date.now() - started.getTime() > 15 * 60 * 1000) {
                                    isCatalogLockStale = true;
                                    db.collection('projects').doc(data.id).update({
                                        isBeingCataloged: false,
                                        catalogingBy: null,
                                        catalogingByName: null,
                                        catalogingStartedAt: null
                                    }).catch(() => {});
                                }
                            } catch (e) {}
                        }

                        let isEditLockStale = false;
                        if (isBeingEdited && data.editingStartedAt) {
                            try {
                                const started = data.editingStartedAt.toDate ? data.editingStartedAt.toDate() : new Date(data.editingStartedAt);
                                if (Date.now() - started.getTime() > 15 * 60 * 1000) {
                                    isEditLockStale = true;
                                    db.collection('projects').doc(data.id).update({
                                        isBeingEdited: false,
                                        editingBy: null,
                                        editingByName: null,
                                        editingStartedAt: null
                                    }).catch(() => {});
                                }
                            } catch (e) {}
                        }

                        if (isBeingCataloged && !isCatalogLockStale) {
                            const cataloger = escapeHtml(data.catalogingByName || 'Librarian');
                            return `
                                <div class="approvals-live-editing-pill" title="Currently being cataloged by ${cataloger}. Click × to release lock.">
                                    <span class="live-editing-dot"></span>
                                    <span class="live-editing-text">In catalog by: <strong>${cataloger}</strong></span>
                                    <button type="button" class="force-release-lock-btn" onclick="window.__adminForceReleaseCatalogLock('${data.id}')" title="Force release lock">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    </button>
                                </div>
                            `;
                        }

                        if (isBeingEdited && !isEditLockStale) {
                            const editor = escapeHtml(data.editingByName || 'Librarian');
                            return `
                                <div class="approvals-live-editing-pill" title="Currently being edited by ${editor}. Click × to release lock.">
                                    <span class="live-editing-dot"></span>
                                    <span class="live-editing-text">In edit by: <strong>${editor}</strong></span>
                                    <button type="button" class="force-release-lock-btn" onclick="window.__adminForceReleaseCatalogLock('${data.id}')" title="Force release lock">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    </button>
                                </div>
                            `;
                        }

                        if (isLocked) {
                            return `
                                <div class="table-actions projects-action-grid">
                                    <button class="action-btn action-view" onclick="viewProject('${data.id}')" title="View details (Locked)" aria-label="View details">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                        <span class="action-btn-text">View</span>
                                    </button>
                                    ${lockBtn}
                                </div>
                            `;
                        }

                        return `
                            <div class="table-actions projects-action-grid">
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
                                ${lockBtn}
                            </div>
                        `;
                    })()}
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
            const nameCell = row.cells[0]?.querySelector('.user-name-text') || row.cells[0]?.querySelector('strong') || row.cells[0];
            const emailCell = row.cells[1];
            const typeCell = row.cells[2]?.querySelector('.badge');

            // Keep raw original text to re-highlight cleanly
            const rawName = row.getAttribute('data-original-name') || (nameCell ? nameCell.textContent.trim() : '');
            const rawEmail = row.getAttribute('data-original-email') || (emailCell ? emailCell.textContent.trim() : '');
            const rawType = row.getAttribute('data-original-type') || '';
            if (!row.getAttribute('data-original-name') && rawName) row.setAttribute('data-original-name', rawName);
            if (!row.getAttribute('data-original-email') && rawEmail) row.setAttribute('data-original-email', rawEmail);
            if (!row.getAttribute('data-original-type') && rawType) row.setAttribute('data-original-type', rawType);

            const rowTypeLower = rawType.toLowerCase();
            const rowStatus = (row.getAttribute('data-status') || 'active').toLowerCase();

            // 1. Filter pill check
            let matchesPill = true;
            if (activeFilter === 'quarantined') {
                matchesPill = (rowStatus === 'quarantined');
            } else if (activeFilter === 'suspended') {
                matchesPill = (rowStatus === 'suspended');
            } else {
                // In standard views ('all', 'student', 'teacher', 'admin'), quarantined users stay safely in the Trash bin
                if (rowStatus === 'quarantined') {
                    matchesPill = false;
                } else if (activeFilter !== 'all') {
                    if (activeFilter === 'teacher' || activeFilter === 'faculty') {
                        matchesPill = rowTypeLower.includes('teacher') || rowTypeLower.includes('faculty');
                    } else if (activeFilter === 'admin') {
                        matchesPill = rowTypeLower.includes('admin');
                    } else {
                        matchesPill = rowTypeLower.includes(activeFilter);
                    }
                }
            }

            // 2. Search check (Name, Email, Role / Type, Status with synonyms)
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

                const fullSearchable = `${rawName} ${rawEmail} ${rawType} ${rowStatus} ${searchableRole}`.toLowerCase();
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
                tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No users found</td></tr>';
                return;
            }

            // Calculate status counts for filter pill badges
            let suspendedCount = 0;
            let quarantineCount = 0;
            usersList.forEach(u => {
                const s = (u.status || 'active').toLowerCase();
                if (s === 'suspended') suspendedCount++;
                if (s === 'quarantined') quarantineCount++;
            });

            const suspBadge = document.getElementById('suspended-count-badge');
            if (suspBadge) {
                suspBadge.textContent = suspendedCount;
                suspBadge.style.display = suspendedCount > 0 ? 'inline-flex' : 'none';
            }
            const quarBadge = document.getElementById('quarantine-count-badge');
            if (quarBadge) {
                quarBadge.textContent = quarantineCount;
                quarBadge.style.display = quarantineCount > 0 ? 'inline-flex' : 'none';
            }
            
            const userSearchQuery = (document.getElementById('users-search')?.value || '').trim();

            usersList.forEach(data => {
                const userType = data.userType || 'N/A';
                const rawUserType = (data.userType || '').toLowerCase();
                const status = (data.status || 'active').toLowerCase();

                // 1. Role Icon Badge (compact SVG icon with tooltip and screen-reader label)
                let roleIconHtml = '';
                if (rawUserType === 'admin') {
                    roleIconHtml = `
                        <div class="user-type-icon-badge role-admin" title="Admin" aria-label="Admin" data-tooltip="Admin">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
                            </svg>
                            <span class="sr-only">Admin</span>
                        </div>
                    `;
                } else if (rawUserType === 'librarian') {
                    roleIconHtml = `
                        <div class="user-type-icon-badge role-librarian" title="Librarian" aria-label="Librarian" data-tooltip="Librarian">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                            </svg>
                            <span class="sr-only">Librarian</span>
                        </div>
                    `;
                } else if (rawUserType === 'student') {
                    roleIconHtml = `
                        <div class="user-type-icon-badge role-student" title="Student" aria-label="Student" data-tooltip="Student">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                                <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
                            </svg>
                            <span class="sr-only">Student</span>
                        </div>
                    `;
                } else if (rawUserType.includes('teacher') || rawUserType.includes('faculty')) {
                    roleIconHtml = `
                        <div class="user-type-icon-badge role-teacher" title="Teacher / Faculty" aria-label="Teacher" data-tooltip="Teacher">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="2" y="3" width="20" height="14" rx="2"></rect>
                                <line x1="8" y1="21" x2="16" y2="21"></line>
                                <line x1="12" y1="17" x2="12" y2="21"></line>
                            </svg>
                            <span class="sr-only">Teacher</span>
                        </div>
                    `;
                } else {
                    roleIconHtml = `
                        <div class="user-type-icon-badge role-other" title="${escapeHtml(userType)}" aria-label="${escapeHtml(userType)}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                            <span class="sr-only">${escapeHtml(userType)}</span>
                        </div>
                    `;
                }

                // 2. Account Status Indication (green dot for active, suspension with duration, quarantine with duration)
                let statusBadgeHtml = '';
                if (status === 'suspended') {
                    let durText = '';
                    if (data.suspendedDuration) {
                        const d = String(data.suspendedDuration).trim();
                        durText = ` (${escapeHtml(d)})`;
                    }
                    statusBadgeHtml = `
                        <span class="user-status-indicator status-ind-suspended" title="Reason: ${escapeHtml(data.suspensionReason || 'Academic Policy Violation')}">
                            <span class="status-indicator-dot dot-amber"></span>
                            <span class="status-indicator-label">Suspended${durText}</span>
                        </span>
                    `;
                } else if (status === 'quarantined') {
                    let daysLeft = 14;
                    if (data.scheduledPurgeAt) {
                        const purgeMs = getTimestamp(data.scheduledPurgeAt);
                        if (purgeMs) {
                            daysLeft = Math.max(0, Math.ceil((purgeMs - Date.now()) / (1000 * 60 * 60 * 24)));
                        }
                    }
                    statusBadgeHtml = `
                        <span class="user-status-indicator status-ind-quarantined" title="Scheduled purge in ${daysLeft} days. Can be restored anytime before purge.">
                            <span class="status-indicator-dot dot-rose"></span>
                            <span class="status-indicator-label">Quarantined (${daysLeft}d left)</span>
                        </span>
                    `;
                } else {
                    statusBadgeHtml = `
                        <span class="user-status-indicator status-ind-active" title="Active Account">
                            <span class="status-indicator-dot dot-green"></span>
                            <span class="status-indicator-label">Active</span>
                        </span>
                    `;
                }

                // 3. User Avatar Profile Display (circular photo or fallback initials with dynamic palette)
                const rawFullName = (data.fullName || data.name || '').trim();
                const displayName = rawFullName || data.email || 'User';
                const nameParts = displayName.split(/\s+/).filter(Boolean);
                let initials = 'U';
                if (nameParts.length >= 2) {
                    initials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
                } else if (nameParts.length === 1 && nameParts[0].length > 0) {
                    initials = nameParts[0].slice(0, 2).toUpperCase();
                }

                const avatarColors = [
                    'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                    'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
                    'linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)',
                    'linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)'
                ];
                let charSum = 0;
                for (let i = 0; i < displayName.length; i++) charSum += displayName.charCodeAt(i);
                const avatarBg = avatarColors[charSum % avatarColors.length];

                const photoUrl = data.photoURL || data.avatar || data.profileImage || '';
                const avatarHtml = photoUrl ? `
                    <div class="user-avatar-wrap">
                        <img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(displayName)}" class="user-avatar-img" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'user-avatar-initials\\' style=\\'background: ${avatarBg};\\'>${initials}</span>';">
                    </div>
                ` : `
                    <div class="user-avatar-wrap">
                        <span class="user-avatar-initials" style="background: ${avatarBg};">${initials}</span>
                    </div>
                `;

                // 4. Actions: Single "Sanction" action button (shield icon, hover reveals "Sanction"), or NOT VISIBLE for admin users
                let actionsHtml = '';
                if (data.userType === 'admin') {
                    // Actions must be NOT visible for admin users
                    actionsHtml = '';
                } else {
                    const escapedName = escapeHtml(data.fullName || data.email || 'User').replace(/'/g, "\\'");
                    const escapedEmail = escapeHtml(data.email || '').replace(/'/g, "\\'");

                    if (status === 'quarantined') {
                        actionsHtml = `
                            <div class="table-actions">
                                <button class="action-btn action-restore" onclick="restoreQuarantinedUser('${data.id}', '${escapedName}')" title="Restore account from quarantine" aria-label="Restore Account">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                                    <span class="action-btn-text">Restore</span>
                                </button>
                                <button class="action-btn action-purge" onclick="purgeQuarantinedUser('${data.id}', '${escapedName}', '${escapedEmail}')" title="Permanently Purge Account" aria-label="Permanent Purge">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    <span class="action-btn-text">Purge</span>
                                </button>
                            </div>
                        `;
                    } else if (status === 'suspended') {
                        actionsHtml = `
                            <div class="table-actions">
                                <button class="action-btn action-unsuspend" onclick="unsuspendUser('${data.id}', '${escapedName}')" title="Reactivate suspended user" aria-label="Reactivate User">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
                                    <span class="action-btn-text">Reactivate</span>
                                </button>
                                <button class="action-btn action-govern" onclick="openUserGovernanceModal('${data.id}', '${escapedName}', '${escapedEmail}', '${userType}', 'suspended')" title="Sanction User" aria-label="Sanction User">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                    <span class="action-btn-text">Sanction</span>
                                </button>
                            </div>
                        `;
                    } else {
                        // Active user: Single action button "Sanction" with shield-like icon that reveals text "Sanction" on hover
                        actionsHtml = `
                            <div class="table-actions">
                                <button class="action-btn action-govern" onclick="openUserGovernanceModal('${data.id}', '${escapedName}', '${escapedEmail}', '${userType}', 'active')" title="Sanction User" aria-label="Sanction User">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                    </svg>
                                    <span class="action-btn-text">Sanction</span>
                                </button>
                            </div>
                        `;
                    }
                }

                const row = document.createElement('tr');
                row.setAttribute('data-original-name', data.fullName || 'N/A');
                row.setAttribute('data-original-email', data.email || 'N/A');
                row.setAttribute('data-original-type', userType.toUpperCase());
                row.setAttribute('data-status', status);
                row.innerHTML = `
                    <td>
                        <div class="user-profile-cell">
                            ${avatarHtml}
                            <strong class="user-name-text">${highlightSearchTerms(rawFullName || 'N/A', userSearchQuery)}</strong>
                        </div>
                    </td>
                    <td>${highlightSearchTerms(data.email || 'N/A', userSearchQuery)}</td>
                    <td>
                        ${roleIconHtml}
                    </td>
                    <td>${statusBadgeHtml}</td>
                    <td>${formatDate(data.createdAt)}</td>
                    <td>${formatDate(data.lastLogin) || 'Never'}</td>
                    <td class="user-actions-cell">
                        ${actionsHtml}
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
            tbody.innerHTML = '<tr><td colspan="7" class="table-loading"><div class="spinner"></div> Loading users...</td></tr>';
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
                    console.log('Users cache is fresh. No Firestore fetch needed.');
                    return;
                }
            }

            console.log('📡 Fetching fresh users data from Firestore...');
            if (!renderedFromCache) {
                tbody.innerHTML = '<tr><td colspan="7" class="table-loading"><div class="spinner"></div> Loading users...</td></tr>';
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
                        tbody.innerHTML = `<tr><td colspan="7" class="table-loading"><div class="spinner"></div> Retrying (${retryCount}/${maxRetries})...</td></tr>`;
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
                        <tr><td colspan="7" class="table-error">
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
                        <tr><td colspan="7" class="table-error">
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

            // 4. Activities (stored strictly on local device to protect Firebase free-tier quota)
            if (!activities) {
                const localFetchPromise = (window.ActivityService && typeof window.ActivityService.getAllActivities === 'function')
                    ? window.ActivityService.getAllActivities().then(list => {
                        try { sessionStorage.setItem('recap_analytics_activities', JSON.stringify(list)); } catch (e) {}
                        return { type: 'activities', data: list };
                    })
                    : Promise.resolve().then(() => {
                        let list = [];
                        try { list = JSON.parse(sessionStorage.getItem('recap_analytics_activities') || '[]'); } catch (e) {}
                        return { type: 'activities', data: list };
                    });
                promises.push(localFetchPromise);
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

                if (window.ActivityService && typeof window.ActivityService.logAdmin === 'function') {
                    window.ActivityService.logAdmin(
                        'report_printed',
                        'Accreditation Report',
                        `Generated and printed official repository research report (${currentAnalyticsFilter.program}, ${currentAnalyticsFilter.range}).`
                    );
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
                    if (window.ActivityService && typeof window.ActivityService.logAdmin === 'function') {
                        window.ActivityService.logAdmin(
                            'report_exported',
                            'Analytics CSV Dataset',
                            `Exported comprehensive analytics CSV report with ${filtered.length} capstone manuscript records.`
                        );
                    }

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
            if (timestamp.toDate && typeof timestamp.toDate === 'function') {
                return timestamp.toDate().getTime();
            } else if (timestamp instanceof Date) {
                return timestamp.getTime();
            } else if (typeof timestamp === 'number') {
                return timestamp;
            } else if (typeof timestamp === 'string') {
                const parsed = new Date(timestamp).getTime();
                return isNaN(parsed) ? 0 : parsed;
            } else if (timestamp.seconds !== undefined) {
                return timestamp.seconds * 1000;
            } else if (timestamp._seconds !== undefined) {
                return timestamp._seconds * 1000;
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
            if (timestamp.toDate && typeof timestamp.toDate === 'function') {
                date = timestamp.toDate();
            } else if (timestamp instanceof Date) {
                date = timestamp;
            } else if (typeof timestamp === 'number') {
                date = new Date(timestamp);
            } else if (typeof timestamp === 'string') {
                date = new Date(timestamp);
            } else if (timestamp.seconds !== undefined) {
                date = new Date(timestamp.seconds * 1000);
            } else if (timestamp._seconds !== undefined) {
                date = new Date(timestamp._seconds * 1000);
            } else {
                return 'N/A';
            }

            // Check if date is valid
            if (!date || isNaN(date.getTime())) {
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
            // Fresh live Firestore check to prevent fast-hand bypass or modifying locked/in-use projects
            const doc = await db.collection('projects').doc(projectId).get();
            if (!doc.exists) {
                showToast('Project not found', '❌');
                return;
            }
            const data = doc.data() || {};

            // Mutual exclusion: If project is locked by Admin, require unlock first
            if (data.isLockedByAdmin) {
                showToast('This project is locked by the Administrator. Please unlock it before editing.', '🔒');
                return;
            }

            // Mutual exclusion: If project is being cataloged by a librarian, block access
            if (data.isBeingCataloged) {
                const cataloger = data.catalogingByName || 'a librarian';
                showToast(`This project is currently being cataloged by ${cataloger}. Simultaneous editing is locked out.`, '⚠️');
                return;
            }

            // Mutual exclusion: If project is being edited in real-time, block access
            if (data.isBeingEdited) {
                const editor = data.editingByName || 'another user';
                showToast(`This project is currently being edited by ${editor}. Simultaneous editing is locked out.`, '⚠️');
                return;
            }
            
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
        try {
            const doc = await db.collection('projects').doc(projectId).get();
            if (doc.exists) {
                const data = doc.data() || {};
                if (data.isLockedByAdmin) {
                    showToast('Cannot delete: This project is locked by the Administrator. Please unlock it first.', '🔒');
                    return;
                }
                if (data.isBeingCataloged) {
                    const cataloger = data.catalogingByName || 'a librarian';
                    showToast(`Cannot delete: This project is currently being cataloged by ${cataloger}.`, '⚠️');
                    return;
                }
                if (data.isBeingEdited) {
                    const editor = data.editingByName || 'another user';
                    showToast(`Cannot delete: This project is currently being edited by ${editor}.`, '⚠️');
                    return;
                }
            }
        } catch (e) {
            console.warn('deleteProject pre-check warning:', e);
        }
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

            // Fetch project data to verify lock status and get image URLs before deletion
            let projectImages = [];
            let deletedProjectData = null;
            try {
                const projectDoc = await db.collection('projects').doc(secureDeleteProjectId).get();
                if (projectDoc.exists) {
                    const projectData = projectDoc.data() || {};
                    deletedProjectData = projectData;
                    if (projectData.isLockedByAdmin) {
                        showToast('Delete blocked: This project is locked by the Administrator.', '🔒');
                        setDeleteProcessing(false);
                        closeSecureDeleteModal();
                        return;
                    }
                    if (projectData.isBeingCataloged) {
                        const cataloger = projectData.catalogingByName || 'a librarian';
                        showToast(`Delete blocked: This project is currently being cataloged by ${cataloger}.`, '⚠️');
                        setDeleteProcessing(false);
                        closeSecureDeleteModal();
                        return;
                    }
                    if (projectData.isBeingEdited) {
                        const editor = projectData.editingByName || 'another user';
                        showToast(`Delete blocked: This project is currently being edited by ${editor}.`, '⚠️');
                        setDeleteProcessing(false);
                        closeSecureDeleteModal();
                        return;
                    }
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
                    console.log(`Deleted ${deleteResults.deletedCount} images, ${deleteResults.failedCount} failed`);
                    
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
                    console.log('RTDB counters updated after deletion');
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

                console.log('Project deleted from Pinecone successfully');
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

                if (deletedProjectData && deletedProjectData.submittedBy && typeof window.ActivityService.logForUser === 'function') {
                    window.ActivityService.logForUser(deletedProjectData.submittedBy, {
                        category: window.ActivityService.CATEGORIES.PROJECT,
                        action: 'project_deleted',
                        title: `Manuscript Deleted: "${secureDeleteProjectTitle}"`,
                        details: 'Thesis manuscript was permanently deleted from the repository by Administrator.',
                        userEmail: deletedProjectData.submittedByEmail || '',
                        userName: deletedProjectData.submittedByName || 'Student',
                        metadata: { projectId: secureDeleteProjectId, title: secureDeleteProjectTitle }
                    });
                }
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
                    console.log('Backend user delete success:', resJson);
                } else {
                    console.warn(`⚠️ Backend delete returned status ${response.status}`);
                }
            } catch (backendError) {
                console.warn('⚠️ Backend user delete failed or unreachable:', backendError.message);
            }

            // 4. Also guarantee Firestore document deletion directly from client SDK
            try {
                await db.collection('users').doc(userId).delete();
                console.log(`Firestore document deleted for ${userId}`);
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

    // ===== 3-Tier Account Governance & Sanctions System =====
    // Protection against impulsive or retaliatory account deletions
    // Tier 1: Graduated Sanctions (Suspension vs 14-Day Deletion Quarantine)
    // Tier 2: Mandatory Policy Infraction Reason & Justification (Logged to Immutable Audit)
    // Tier 3: Admin Affirmation & Due Process Safeguard

    let currentUgTargetUserId = null;
    let currentUgTargetUserName = '';
    let currentUgTargetUserEmail = '';
    let currentUgTargetUserRole = '';
    let currentUgTargetUserStatus = 'active';
    let isUgModalInitialized = false;

    function initUserGovernanceModalEvents() {
        if (isUgModalInitialized) return;
        isUgModalInitialized = true;

        const modal = document.getElementById('user-governance-modal');
        const overlay = document.getElementById('ug-modal-overlay');
        const closeBtn = document.getElementById('ug-close-btn');
        const cancelBtn = document.getElementById('ug-cancel-btn');
        const submitBtn = document.getElementById('ug-submit-btn');

        const cardSuspend = document.getElementById('ug-card-suspend');
        const cardQuarantine = document.getElementById('ug-card-quarantine');
        const categorySelect = document.getElementById('ug-violation-category');
        const notesTextarea = document.getElementById('ug-justification-notes');
        const charCountEl = document.getElementById('ug-char-count');
        const affirmationCheckbox = document.getElementById('ug-affirmation-checkbox');

        const closeModal = () => {
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('active');
            }
        };

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        if (overlay) overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        // Toggle Tier 1 Action Cards
        const setActionType = (type) => {
            const radioSuspend = cardSuspend?.querySelector('input[type="radio"]');
            const radioQuarantine = cardQuarantine?.querySelector('input[type="radio"]');
            const submitBtnText = document.getElementById('ug-submit-btn-text');

            if (type === 'suspend') {
                if (radioSuspend) radioSuspend.checked = true;
                if (radioQuarantine) radioQuarantine.checked = false;
                cardSuspend?.classList.add('is-selected');
                cardQuarantine?.classList.remove('is-selected');
                if (submitBtnText) submitBtnText.textContent = 'Apply Suspension';
                if (submitBtn) {
                    submitBtn.classList.remove('btn-quarantine-submit');
                    submitBtn.classList.add('btn-suspend-submit');
                }
            } else {
                if (radioQuarantine) radioQuarantine.checked = true;
                if (radioSuspend) radioSuspend.checked = false;
                cardQuarantine?.classList.add('is-selected');
                cardSuspend?.classList.remove('is-selected');
                if (submitBtnText) submitBtnText.textContent = 'Move to 14-Day Quarantine';
                if (submitBtn) {
                    submitBtn.classList.remove('btn-suspend-submit');
                    submitBtn.classList.add('btn-quarantine-submit');
                }
            }
            validateGovernanceForm();
        };

        if (cardSuspend) {
            cardSuspend.addEventListener('click', (e) => {
                // Don't trigger if clicking inside the duration select dropdown
                if (e.target.closest('#ug-suspend-duration')) return;
                setActionType('suspend');
            });
        }
        if (cardQuarantine) {
            cardQuarantine.addEventListener('click', () => {
                setActionType('quarantine');
            });
        }

        // Tier 2 & Tier 3 Validation Check
        function validateGovernanceForm() {
            const category = categorySelect?.value || '';
            const notes = (notesTextarea?.value || '').trim();
            const affirmed = affirmationCheckbox ? affirmationCheckbox.checked : false;

            if (charCountEl) {
                charCountEl.textContent = notes.length;
                if (notes.length < 15) {
                    charCountEl.style.color = '#ef4444';
                } else {
                    charCountEl.style.color = '#10b981';
                }
            }

            const isValid = category !== '' && notes.length >= 15 && affirmed;
            if (submitBtn) {
                submitBtn.disabled = !isValid;
            }
        }

        if (categorySelect) categorySelect.addEventListener('change', validateGovernanceForm);
        if (notesTextarea) notesTextarea.addEventListener('input', validateGovernanceForm);
        if (affirmationCheckbox) affirmationCheckbox.addEventListener('change', validateGovernanceForm);

        // Submit Disciplinary Action
        if (submitBtn) {
            submitBtn.addEventListener('click', async () => {
                if (!currentUgTargetUserId) return;

                const category = categorySelect?.value || '';
                const notes = (notesTextarea?.value || '').trim();
                const affirmed = affirmationCheckbox?.checked;

                if (!category || notes.length < 15 || !affirmed) {
                    showToast('Please complete all mandatory fields and affirmation.', '⚠️');
                    return;
                }

                const actionType = cardQuarantine?.classList.contains('is-selected') ? 'quarantine' : 'suspend';
                const durationSelect = document.getElementById('ug-suspend-duration');
                const duration = durationSelect ? durationSelect.value : '7d';

                const adminUser = auth.currentUser;
                const adminName = adminUser?.displayName || adminUser?.email || 'Administrator';
                const adminId = adminUser?.uid || 'admin';

                submitBtn.disabled = true;
                const submitBtnText = document.getElementById('ug-submit-btn-text');
                const origText = submitBtnText ? submitBtnText.textContent : 'Processing...';
                if (submitBtnText) submitBtnText.textContent = 'Applying...';

                try {
                    if (actionType === 'suspend') {
                        // Apply Suspension in Firestore
                        await db.collection('users').doc(currentUgTargetUserId).update({
                            status: 'suspended',
                            suspendedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            suspendedBy: adminName,
                            suspendedById: adminId,
                            suspendedDuration: duration,
                            suspensionCategory: category,
                            suspensionReason: notes,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });

                        // Audit Trail Log
                        if (window.ActivityService && typeof window.ActivityService.logAdmin === 'function') {
                            window.ActivityService.logAdmin(
                                'user_suspended',
                                currentUgTargetUserName,
                                `Suspended account (${duration}). Category: ${category}. Justification: ${notes}`
                            );
                        }

                        // DUAL-LOG directly into target user's personal activity feed
                        if (window.ActivityService && typeof window.ActivityService.logForUser === 'function') {
                            window.ActivityService.logForUser(currentUgTargetUserId, {
                                category: 'admin',
                                action: 'account_suspended',
                                title: 'Disciplinary Suspension Placed on Account',
                                details: `Account suspended (${duration}) by Administrator. Category: ${category}. Reason: ${notes}`,
                                userRole: currentUgTargetUserRole || 'student',
                                userName: currentUgTargetUserName,
                                userEmail: currentUgTargetUserEmail,
                                metadata: {
                                    duration,
                                    category,
                                    notes,
                                    suspendedBy: adminName
                                }
                            });
                        }

                        invalidateUsersCache();
                        closeModal();
                        showToast(`Account for "${currentUgTargetUserName}" has been suspended (${duration}).`, '🛡️');
                        await loadUsersData(true);

                    } else if (actionType === 'quarantine') {
                        // Move to 14-Day Deletion Quarantine (Soft-Delete)
                        const scheduledPurge = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

                        await db.collection('users').doc(currentUgTargetUserId).update({
                            status: 'quarantined',
                            quarantinedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            quarantinedBy: adminName,
                            quarantinedById: adminId,
                            scheduledPurgeAt: scheduledPurge,
                            deletionCategory: category,
                            deletionReason: notes,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });

                        // Audit Trail Log
                        if (window.ActivityService && typeof window.ActivityService.logAdmin === 'function') {
                            window.ActivityService.logAdmin(
                                'user_quarantined',
                                currentUgTargetUserName,
                                `Moved to 14-day Deletion Quarantine (Trash holding bin). Category: ${category}. Justification: ${notes}`
                            );
                        }

                        // DUAL-LOG directly into target user's personal activity feed
                        if (window.ActivityService && typeof window.ActivityService.logForUser === 'function') {
                            window.ActivityService.logForUser(currentUgTargetUserId, {
                                category: 'admin',
                                action: 'account_quarantined',
                                title: 'Account Placed in 14-Day Deletion Quarantine',
                                details: `Account moved to 14-day deletion quarantine by Administrator. Category: ${category}. Justification: ${notes}`,
                                userRole: currentUgTargetUserRole || 'student',
                                userName: currentUgTargetUserName,
                                userEmail: currentUgTargetUserEmail,
                                metadata: {
                                    category,
                                    notes,
                                    scheduledPurge: scheduledPurge.toISOString(),
                                    quarantinedBy: adminName
                                }
                            });
                        }

                        invalidateUsersCache();
                        closeModal();
                        showToast(`Account for "${currentUgTargetUserName}" moved to 14-Day Quarantine holding bin.`, '⏳');
                        await loadUsersData(true);
                    }
                } catch (err) {
                    console.error('Governance action failed:', err);
                    showToast('Failed to apply governance action: ' + err.message, '❌');
                } finally {
                    submitBtn.disabled = false;
                    if (submitBtnText) submitBtnText.textContent = origText;
                }
            });
        }
    }

    /**
     * Open User Governance Modal for progressive discipline / sanctions
     */
    window.openUserGovernanceModal = async (userId, name, email, role, currentStatus = 'active') => {
        initUserGovernanceModalEvents();

        currentUgTargetUserId = userId;
        currentUgTargetUserName = name || 'User';
        currentUgTargetUserEmail = email || '';
        currentUgTargetUserRole = role || 'student';
        currentUgTargetUserStatus = currentStatus || 'active';

        // Fetch user document if details are missing
        if (!email || !role) {
            try {
                const doc = await db.collection('users').doc(userId).get();
                if (doc.exists) {
                    const uData = doc.data();
                    currentUgTargetUserName = name || uData.fullName || uData.email || 'User';
                    currentUgTargetUserEmail = uData.email || '';
                    currentUgTargetUserRole = uData.userType || 'student';
                    currentUgTargetUserStatus = uData.status || currentStatus || 'active';
                }
            } catch (e) {
                console.warn('Could not fetch user details for modal:', e);
            }
        }

        const modal = document.getElementById('user-governance-modal');
        if (!modal) return;

        // Populate Target User Card
        const avatarEl = document.getElementById('ug-user-avatar');
        const nameEl = document.getElementById('ug-user-name');
        const roleEl = document.getElementById('ug-user-role-badge');
        const statusEl = document.getElementById('ug-user-status-badge');
        const emailEl = document.getElementById('ug-user-email');

        if (avatarEl) avatarEl.textContent = (currentUgTargetUserName.charAt(0) || 'U').toUpperCase();
        if (nameEl) nameEl.textContent = currentUgTargetUserName;
        if (emailEl) emailEl.textContent = currentUgTargetUserEmail || 'No email registered';
        if (roleEl) {
            roleEl.textContent = currentUgTargetUserRole.toUpperCase();
            roleEl.style.background = currentUgTargetUserRole === 'admin' ? 'linear-gradient(to right, #08D488, #FCCC56)' : 
                                     currentUgTargetUserRole === 'librarian' ? '#08D488' :
                                     currentUgTargetUserRole === 'student' ? '#fad882ff' : '#94a3b8';
        }
        if (statusEl) {
            statusEl.textContent = currentUgTargetUserStatus.toUpperCase();
            statusEl.className = 'ug-mini-status ' + (currentUgTargetUserStatus === 'suspended' ? 'ug-status-suspended' : currentUgTargetUserStatus === 'quarantined' ? 'ug-status-quarantined' : 'ug-status-active');
        }

        // Reset Tier 1 Selection
        const cardSuspend = document.getElementById('ug-card-suspend');
        const cardQuarantine = document.getElementById('ug-card-quarantine');
        const radioSuspend = cardSuspend?.querySelector('input[type="radio"]');
        const radioQuarantine = cardQuarantine?.querySelector('input[type="radio"]');
        const submitBtnText = document.getElementById('ug-submit-btn-text');

        if (currentUgTargetUserStatus === 'suspended') {
            // If already suspended, default to quarantine (escalation)
            if (radioQuarantine) radioQuarantine.checked = true;
            if (radioSuspend) radioSuspend.checked = false;
            cardQuarantine?.classList.add('is-selected');
            cardSuspend?.classList.remove('is-selected');
            if (submitBtnText) submitBtnText.textContent = 'Move to 14-Day Quarantine';
        } else {
            // Default to temporary suspension (cooling-off)
            if (radioSuspend) radioSuspend.checked = true;
            if (radioQuarantine) radioQuarantine.checked = false;
            cardSuspend?.classList.add('is-selected');
            cardQuarantine?.classList.remove('is-selected');
            if (submitBtnText) submitBtnText.textContent = 'Apply Suspension';
        }

        // Reset Tier 2 Fields
        const categorySelect = document.getElementById('ug-violation-category');
        const notesTextarea = document.getElementById('ug-justification-notes');
        const charCountEl = document.getElementById('ug-char-count');
        const affirmationCheckbox = document.getElementById('ug-affirmation-checkbox');
        const submitBtn = document.getElementById('ug-submit-btn');

        if (categorySelect) categorySelect.value = '';
        if (notesTextarea) notesTextarea.value = '';
        if (charCountEl) {
            charCountEl.textContent = '0';
            charCountEl.style.color = '#ef4444';
        }
        if (affirmationCheckbox) affirmationCheckbox.checked = false;
        if (submitBtn) submitBtn.disabled = true;

        modal.style.display = 'flex';
        modal.classList.add('active');
    };

    /**
     * Unsuspend / Reactivate User
     */
    window.unsuspendUser = async (userId, name) => {
        const confirmed = await ModalDialog.confirm({
            title: 'Reactivate Account',
            message: `Are you sure you want to unsuspend "${name}"?\n\nThe user will immediately regain access to log in and interact with the repository.`,
            confirmText: 'Reactivate Account',
            cancelText: 'Keep Suspended',
            isDanger: false,
            icon: 'check'
        });

        if (!confirmed) return;

        try {
            const adminUser = auth.currentUser;
            const adminName = adminUser?.displayName || adminUser?.email || 'Administrator';

            await db.collection('users').doc(userId).update({
                status: 'active',
                unsuspendedAt: firebase.firestore.FieldValue.serverTimestamp(),
                unsuspendedBy: adminName,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            if (window.ActivityService && typeof window.ActivityService.logAdmin === 'function') {
                window.ActivityService.logAdmin(
                    'user_unsuspended',
                    name,
                    `Reactivated and lifted suspension for user "${name}"`
                );
            }

            // DUAL-LOG directly into target user's personal activity feed
            if (window.ActivityService && typeof window.ActivityService.logForUser === 'function') {
                window.ActivityService.logForUser(userId, {
                    category: 'admin',
                    action: 'account_reactivated',
                    title: 'Account Suspension Lifted',
                    details: 'Administrator reactivated your account and restored normal repository privileges.',
                    userName: name,
                    metadata: { unsuspendedBy: adminName }
                });
            }

            invalidateUsersCache();
            showToast(`Account for "${name}" has been reactivated successfully.`, '✅');
            await loadUsersData(true);
        } catch (err) {
            console.error('Error reactivating user:', err);
            showToast('Failed to reactivate user: ' + err.message, '❌');
        }
    };

    /**
     * Restore Quarantined User
     */
    window.restoreQuarantinedUser = async (userId, name) => {
        const confirmed = await ModalDialog.confirm({
            title: 'Restore Account from Quarantine',
            message: `Are you sure you want to restore "${name}" from the 14-day deletion quarantine?\n\nThe scheduled deletion will be cancelled and normal account status restored immediately.`,
            confirmText: 'Restore Account',
            cancelText: 'Keep in Quarantine',
            isDanger: false,
            icon: 'check'
        });

        if (!confirmed) return;

        try {
            const adminUser = auth.currentUser;
            const adminName = adminUser?.displayName || adminUser?.email || 'Administrator';

            await db.collection('users').doc(userId).update({
                status: 'active',
                restoredAt: firebase.firestore.FieldValue.serverTimestamp(),
                restoredBy: adminName,
                scheduledPurgeAt: firebase.firestore.FieldValue.delete(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            if (window.ActivityService && typeof window.ActivityService.logAdmin === 'function') {
                window.ActivityService.logAdmin(
                    'user_restored',
                    name,
                    `Restored user "${name}" from 14-day deletion quarantine`
                );
            }

            // DUAL-LOG directly into target user's personal activity feed
            if (window.ActivityService && typeof window.ActivityService.logForUser === 'function') {
                window.ActivityService.logForUser(userId, {
                    category: 'admin',
                    action: 'account_restored',
                    title: 'Account Restored from Quarantine',
                    details: 'Administrator restored your account from deletion quarantine. Scheduled deletion has been cancelled.',
                    userName: name,
                    metadata: { restoredBy: adminName }
                });
            }

            invalidateUsersCache();
            showToast(`Account for "${name}" restored from quarantine successfully.`, '✅');
            await loadUsersData(true);
        } catch (err) {
            console.error('Error restoring quarantined user:', err);
            showToast('Failed to restore user: ' + err.message, '❌');
        }
    };

    /**
     * Permanent Purge for Quarantined User
     * High-friction confirmation requiring explicit admin approval
     */
    window.purgeQuarantinedUser = async (userId, name, email) => {
        const confirmed = await ModalDialog.confirm({
            title: 'Permanently Purge Account',
            message: `⚠️ PERMANENT PURGE WARNING\n\nThis account is currently in Quarantine.\nPurging will permanently delete authentication and profile data for "${name || email}".\n\n🛡️ ACADEMIC INTEGRITY SAFEGUARD:\nAll capstone manuscripts and institutional research authored or advised by this user will remain preserved in the institutional repository.\n\nAre you sure you want to proceed with permanent purge?`,
            confirmText: 'Permanently Purge',
            cancelText: 'Keep in Quarantine',
            isDanger: true,
            icon: 'trash'
        });

        if (!confirmed) return;

        await performUserDeletion(userId, { email }, name);
    };

    /**
     * Backward compatibility wrapper: Routes any legacy delete calls to User Governance Modal
     */
    window.deleteUser = async (userId, name) => {
        window.openUserGovernanceModal(userId, name, '', '', 'active');
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

            if (window.ActivityService && typeof window.ActivityService.logAdmin === 'function') {
                window.ActivityService.logAdmin(
                    'pinecone_sync',
                    'Pinecone AI Search Index',
                    `Completed full vector synchronization for ${successCount} thesis manuscript(s).`
                );
            }

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

            if (window.ActivityService && typeof window.ActivityService.logAdmin === 'function') {
                window.ActivityService.logAdmin(
                    'pinecone_sync',
                    'Pinecone AI Search Index',
                    `Pinecone vector sync completed with partial status: ${successCount} synced, ${failedCount} failed.`
                );
            }

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
            const oldData = currentDoc.data() || {};
            
            if (oldData.isLockedByAdmin) {
                showToast('Operation blocked: This project is locked by the Administrator.', '🔒');
                setSaveProcessing(false);
                return;
            }
            if (oldData.isBeingCataloged) {
                const cataloger = oldData.catalogingByName || 'a librarian';
                showToast(`Operation blocked: This project is currently being cataloged by ${cataloger}.`, '⚠️');
                setSaveProcessing(false);
                return;
            }
            if (oldData.isBeingEdited) {
                const editor = oldData.editingByName || 'another user';
                showToast(`Operation blocked: This project is currently being edited by ${editor}.`, '⚠️');
                setSaveProcessing(false);
                return;
            }
            
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
                console.log('Project synced to Pinecone successfully');
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

                const existingProj = (allProjectsData || []).find(x => x.id === projectId);
                if (existingProj && existingProj.submittedBy && typeof window.ActivityService.logForUser === 'function') {
                    window.ActivityService.logForUser(existingProj.submittedBy, {
                        category: window.ActivityService.CATEGORIES.PROJECT,
                        action: 'project_updated',
                        title: `Manuscript Updated by Admin: "${title}"`,
                        details: `Administrator updated thesis details (${changedFieldNames || 'metadata'}).`,
                        userEmail: existingProj.submittedByEmail || '',
                        userName: existingProj.submittedByName || 'Student',
                        metadata: { projectId, title, changedFields }
                    });
                }
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
                console.log('New project synced to Pinecone successfully');
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
            
            await loadDashboardData(true);
            
            setTimeout(() => {
                refreshDashboardBtn.disabled = false;
                refreshDashboardBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                    Refresh
                `;
                const lastUpdatedEl = document.getElementById('dash-last-updated');
                if (lastUpdatedEl) {
                    const now = new Date();
                    lastUpdatedEl.textContent = `Updated ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                }
                showToast('Dashboard refreshed successfully', '✅');
            }, 500);
        });
    }

    // ===== Dashboard Quick-Navigation Shortcuts =====
    const jumpToSection = (sectionName) => {
        const navItem = document.querySelector(`.rail-nav-item[data-section="${sectionName}"]`);
        if (navItem) navItem.click();
    };

    document.getElementById('dash-stat-projects')?.addEventListener('click', () => jumpToSection('projects'));
    document.getElementById('dash-view-all-projects')?.addEventListener('click', () => jumpToSection('projects'));

    document.getElementById('dash-stat-users')?.addEventListener('click', () => jumpToSection('users'));
    document.getElementById('dash-stat-roles')?.addEventListener('click', () => jumpToSection('users'));
    document.getElementById('dash-view-all-users')?.addEventListener('click', () => jumpToSection('users'));

    document.getElementById('dash-stat-activity')?.addEventListener('click', () => jumpToSection('activity'));

    // Real-time listener for Local Device Activity changes
    const syncRecentActivityBadge = () => {
        const el = document.getElementById('recent-activity-stat');
        if (!el) return;
        if (window.ActivityService && typeof window.ActivityService.getAllActivities === 'function') {
            window.ActivityService.getAllActivities().then(acts => {
                el.textContent = Array.isArray(acts) ? acts.length : 0;
            }).catch(() => {});
        }
    };
    window.addEventListener('userActivityLogged', syncRecentActivityBadge);
    window.addEventListener('userActivityDeleted', syncRecentActivityBadge);
    window.addEventListener('userActivityCleared', syncRecentActivityBadge);

    ['dash-stat-projects', 'pending-approvals-card', 'dash-stat-users', 'dash-stat-roles', 'dash-stat-activity'].forEach(id => {
        const card = document.getElementById(id);
        if (card) {
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    card.click();
                }
            });
        }
    });

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

        // Real-time pending projects listener
        if (unsubscribePendingProjects) unsubscribePendingProjects();
        unsubscribePendingProjects = db.collection('pendingProjects').onSnapshot(
            (snapshot) => {
                console.log('Pending projects updated in real-time');
                if (snapshot && snapshot.docs) {
                    const freshPending = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    freshPending.sort((a, b) => {
                        const dateA = getTimestamp(a.createdAt);
                        const dateB = getTimestamp(b.createdAt);
                        return dateB - dateA;
                    });
                    allPendingApprovals = freshPending;
                    savePendingApprovalsToCache(freshPending);
                    updatePendingCounters(freshPending.length);

                    const activeSection = document.querySelector('.content-section.active');
                    if (activeSection && activeSection.id === 'section-approvals') {
                        filterAndRenderApprovals();
                    }
                }
            },
            (error) => {
                console.warn('Real-time pending projects listener error:', error);
            }
        );

        console.log('Real-time listeners activated');
    }

    // Quick stats update function (lighter than full reload)
    async function updateDashboardStats() {
        try {
            const projectsSnapshot = await db.collection('projects').get();
            const usersSnapshot = await db.collection('users').get();
            const pendingSnapshot = await db.collection('pendingProjects').get().catch(() => ({ size: 0, docs: [] }));

            const totalProjects = projectsSnapshot.size;
            const totalUsers = usersSnapshot.size;
            const studentUsers = usersSnapshot.docs.filter(doc => doc.data().userType === 'student').length;
            const librarianUsers = usersSnapshot.docs.filter(doc => doc.data().userType === 'librarian').length;
            const pendingCount = pendingSnapshot.size || 0;

            const pStat = document.getElementById('total-projects-stat');
            if (pStat) pStat.textContent = totalProjects;

            const uStat = document.getElementById('total-users-stat');
            if (uStat) uStat.textContent = totalUsers;

            const studentsCountEl = document.getElementById('stat-students-count');
            const librariansCountEl = document.getElementById('stat-librarians-count');
            if (studentsCountEl && librariansCountEl) {
                studentsCountEl.textContent = studentUsers;
                librariansCountEl.textContent = librarianUsers;
            } else {
                const statElem = document.getElementById('student-users-stat');
                if (statElem) statElem.textContent = `${studentUsers} Students / ${librarianUsers} Librarians`;
            }

            const actStat = document.getElementById('recent-activity-stat');
            if (actStat) {
                if (window.ActivityService && typeof window.ActivityService.getAllActivities === 'function') {
                    window.ActivityService.getAllActivities().then(activities => {
                        actStat.textContent = Array.isArray(activities) ? activities.length : 0;
                    }).catch(() => {
                        const user = window.ActivityService?.getCurrentUserContext?.();
                        const list = user?.uid ? window.ActivityService.getLocalCache(user.uid) : [];
                        actStat.textContent = list.length;
                    });
                } else {
                    const user = window.ActivityService?.getCurrentUserContext?.();
                    const list = user?.uid ? window.ActivityService.getLocalCache(user.uid) : [];
                    actStat.textContent = list.length;
                }
            }

            updatePendingCounters(pendingCount);
        } catch (error) {
            console.warn('Stats update failed:', error);
        }
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (unsubscribeProjects) unsubscribeProjects();
        if (unsubscribeUsers) unsubscribeUsers();
        if (unsubscribePendingProjects) unsubscribePendingProjects();
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
            let aText = a.cells[columnIndex]?.textContent.trim() || '';
            let bText = b.cells[columnIndex]?.textContent.trim() || '';
            
            if (tableId === 'users-table') {
                if (columnIndex === 0) {
                    aText = a.getAttribute('data-original-name') || aText;
                    bText = b.getAttribute('data-original-name') || bText;
                } else if (columnIndex === 2) {
                    aText = a.getAttribute('data-original-type') || aText;
                    bText = b.getAttribute('data-original-type') || bText;
                }
            }
            
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

    // ====================================================
    // LIBRARIAN PROJECT APPROVALS FEATURE
    // ====================================================

    function updatePendingCounters(count) {
        const badgeEl = document.getElementById('pending-approvals-badge');
        if (badgeEl) {
            badgeEl.textContent = count;
            badgeEl.style.display = count > 0 ? 'inline-flex' : 'none';
        }
        const statEl = document.getElementById('pending-approvals-stat');
        if (statEl) statEl.textContent = count;
        const liveCounter = document.getElementById('approvals-live-counter');
        if (liveCounter) {
            liveCounter.textContent = `${count} Pending`;
            liveCounter.style.background = count > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(8, 212, 136, 0.12)';
            liveCounter.style.color = count > 0 ? '#f59e0b' : '#08D488';
            liveCounter.style.borderColor = count > 0 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(8, 212, 136, 0.3)';
        }
        const pendingStatusPill = document.getElementById('pending-status-pill');
        if (pendingStatusPill) {
            if (count > 0) {
                pendingStatusPill.textContent = 'Action Required';
                pendingStatusPill.className = 'stat-badge stat-badge-amber';
            } else {
                pendingStatusPill.textContent = 'Clear';
                pendingStatusPill.className = 'stat-badge stat-badge-emerald';
            }
        }
        const batchBtn = document.getElementById('batch-approve-all-btn');
        const batchCountPill = document.getElementById('batch-approve-count-pill');
        if (batchCountPill) batchCountPill.textContent = count;
        if (batchBtn) {
            if (count > 0) {
                batchBtn.disabled = false;
                batchBtn.classList.remove('is-empty');
                batchBtn.classList.add('has-pending');
                batchBtn.title = `Approve all ${count} pending submissions at once`;
            } else {
                batchBtn.disabled = true;
                batchBtn.classList.remove('has-pending');
                batchBtn.classList.add('is-empty');
                batchBtn.title = 'No pending submissions to approve';
            }
        }
    }

    // ===== Pending Approvals Cache Helpers (Instant Render Strategy) =====
    function loadPendingApprovalsFromCache() {
        try {
            const cached = localStorage.getItem('pendingApprovalsData');
            return cached ? JSON.parse(cached) : null;
        } catch (e) {
            console.warn('Error reading pendingApprovals cache:', e);
            return null;
        }
    }

    function savePendingApprovalsToCache(data) {
        try {
            localStorage.setItem('pendingApprovalsData', JSON.stringify(data));
            localStorage.setItem('pendingApprovalsMetadata', JSON.stringify({
                count: data.length,
                lastCached: new Date().toISOString()
            }));
            console.log(`Cached ${data.length} pending submissions`);
        } catch (e) {
            console.warn('Error saving pendingApprovals cache:', e);
        }
    }

    function invalidatePendingApprovalsCache() {
        try {
            localStorage.removeItem('pendingApprovalsData');
            localStorage.removeItem('pendingApprovalsMetadata');
            console.log('🗑️ Pending approvals cache invalidated');
        } catch (e) {}
    }

    async function loadPendingApprovalsData(forceRefresh = false, showFeedback = false) {
        const tbody = document.getElementById('approvals-table-body');
        let renderedFromCache = false;

        // 1. Instant Cache Render Trick (Zero wait time)
        if (!forceRefresh) {
            let cached = (allPendingApprovals && allPendingApprovals.length > 0)
                ? allPendingApprovals
                : loadPendingApprovalsFromCache();
            if (cached && Array.isArray(cached)) {
                allPendingApprovals = cached;
                updatePendingCounters(allPendingApprovals.length);
                filterAndRenderApprovals();
                renderedFromCache = true;
                console.log('🚀 Using cached pending approvals for instant render - revalidating in background...');
            }
        }

        // Only show loading spinner if no cache exists
        if (!renderedFromCache && tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-loading"><div class="spinner"></div> Loading submissions...</td></tr>';
        }

        // 2. Asynchronous Background Revalidation (Stale-While-Revalidate)
        try {
            const snap = await db.collection('pendingProjects').orderBy('createdAt', 'desc').get()
                .catch(async () => db.collection('pendingProjects').get());
            const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Update in-memory and persistent cache
            allPendingApprovals = fresh;
            savePendingApprovalsToCache(fresh);
            updatePendingCounters(allPendingApprovals.length);
            filterAndRenderApprovals();

            if (showFeedback) showToast('Pending submissions refreshed');
        } catch (err) {
            console.error('loadPendingApprovalsData error:', err);
            if (!renderedFromCache && tbody) {
                tbody.innerHTML = '<tr><td colspan="6" class="table-error" style="color:#ef4444;text-align:center;padding:2rem;">⚠️ Error loading submissions. Please check connection.</td></tr>';
            } else if (renderedFromCache) {
                console.warn('Background sync failed for approvals, using cached data.');
            }
        }
    }

    function filterAndRenderApprovals() {
        const tbody = document.getElementById('approvals-table-body');
        const emptyState = document.getElementById('approvals-empty-state');
        const tableContainer = document.getElementById('approvals-table-container');
        if (!tbody) return;

        const searchTerm = (document.getElementById('approvals-search')?.value || '').trim().toLowerCase();
        const programFilter = (document.getElementById('approvals-program-filter')?.value || '').trim().toLowerCase();

        const filtered = allPendingApprovals.filter(item => {
            const matchSearch = !searchTerm ||
                (item.title || '').toLowerCase().includes(searchTerm) ||
                (Array.isArray(item.authors) ? item.authors.join(' ') : String(item.authors || '')).toLowerCase().includes(searchTerm) ||
                (item.adviser || '').toLowerCase().includes(searchTerm) ||
                (item.program || '').toLowerCase().includes(searchTerm) ||
                (item.submittedByName || '').toLowerCase().includes(searchTerm) ||
                (item.submittedByEmail || '').toLowerCase().includes(searchTerm) ||
                (Array.isArray(item.keywords) ? item.keywords.join(' ') : String(item.keywords || '')).toLowerCase().includes(searchTerm);

            const matchProgram = !programFilter || (item.program || '').toLowerCase() === programFilter;

            return matchSearch && matchProgram;
        });

        if (allPendingApprovals.length === 0) {
            if (emptyState) emptyState.style.display = 'flex';
            if (tableContainer) tableContainer.style.display = 'none';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        if (tableContainer) tableContainer.style.display = 'block';

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-empty" style="text-align:center;padding:2.5rem;color:var(--text-secondary);">No matching submissions found for the selected criteria.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(item => {
            const authorsStr = Array.isArray(item.authors) ? item.authors.join(', ') : (item.authors || 'N/A');
            const keywordsList = Array.isArray(item.keywords) ? item.keywords : String(item.keywords || '').split(',').map(k => k.trim()).filter(Boolean);
            const dateStr = formatDate(item.createdAt);
            const submitterName = escapeHtml(item.submittedByName || 'Librarian');
            const submitterEmail = escapeHtml(item.submittedByEmail || '');

            const keywordsHtml = keywordsList.slice(0, 3).map(k => `<span class="approvals-keyword-tag">${escapeHtml(k)}</span>`).join('');

            return `<tr>
                <td style="max-width:320px;">
                    <div class="approvals-title-cell">
                        <span class="approvals-title-text">${escapeHtml(item.title || 'Untitled')}</span>
                        ${item.adviser ? `<span style="font-size:0.75rem;color:var(--text-secondary);">Adv: ${escapeHtml(item.adviser)}</span>` : ''}
                        ${item.isLockedByAdmin
                            ? `<span class="badge badge-locked-admin" style="background:rgba(239,68,68,0.15);color:#f87171;font-size:0.68rem;padding:2px 7px;border-radius:4px;border:1px solid rgba(239,68,68,0.35);margin-top:3px;display:inline-flex;align-items:center;gap:3px;width:fit-content;" title="Locked by Admin — Librarian has View Only access"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Locked by Admin</span>`
                            : ''
                        }
                        ${keywordsHtml ? `<div class="approvals-keywords-tags">${keywordsHtml}</div>` : ''}
                    </div>
                </td>
                <td>
                    <div class="approvals-submitter-wrap">
                        <span class="approvals-submitter-name">${submitterName}</span>
                        <span class="approvals-submitter-meta">${submitterEmail}</span>
                        <span class="approvals-submitter-meta" style="font-size:0.7rem;opacity:0.8;">📅 ${dateStr}</span>
                    </div>
                </td>
                <td><span class="badge badge-info" style="font-weight:700;">${escapeHtml(item.program || 'N/A')}</span></td>
                <td><span style="font-weight:600;">${escapeHtml(String(item.year || 'N/A'))}</span></td>
                <td style="max-width:220px;font-size:0.85rem;">${escapeHtml(authorsStr)}</td>
                <td style="text-align:center;">
                    ${(() => {
                        const isBeingEdited = Boolean(item.isBeingEdited);
                        const editorName = escapeHtml(item.editingByName || 'Librarian');
                        const isLocked = Boolean(item.isLockedByAdmin);

                        if (isBeingEdited) {
                            // While librarian is editing: Admin CANNOT see evaluate, approve, or reject!
                            // Only seen is the real-time indication: "Being edited by: [librarian name]"
                            return `
                                <div class="approvals-live-editing-pill" title="Project metadata is currently being edited in real-time by ${editorName}. Evaluation actions are paused until freed.">
                                    <span class="live-editing-dot"></span>
                                    <span class="live-editing-text">Being edited by: <strong>${editorName}</strong></span>
                                </div>
                            `;
                        }

                        if (isLocked) {
                            // When locked by Admin: NO ONE can touch it, not even Admin!
                            // Only View (read-only) and Unlock action are available!
                            return `
                                <div class="table-actions approvals-action-grid">
                                    <button type="button" class="action-btn action-view" onclick="window.__adminEvaluateSubmission('${escapeHtml(item.id)}')" title="View submission details (Locked)" aria-label="View submission">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                        <span class="action-btn-text">View</span>
                                    </button>
                                    <button type="button" class="action-btn action-unlock" onclick="window.__adminToggleLockPendingProject('${escapeHtml(item.id)}', false)" title="Unlock project (Allow evaluation and librarian editing)" aria-label="Unlock submission">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                                        <span class="action-btn-text">Unlock</span>
                                    </button>
                                </div>
                            `;
                        }

                        // When freed & unlocked: Admin sees Evaluate, Approve, Reject, and Lock Project!
                        return `
                            <div class="table-actions approvals-action-grid">
                                <button type="button" class="action-btn action-evaluate" onclick="window.__adminEvaluateSubmission('${escapeHtml(item.id)}')" title="Evaluate and edit details" aria-label="Evaluate submission">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    <span class="action-btn-text">Evaluate</span>
                                </button>
                                <button type="button" class="action-btn action-approve" onclick="window.__adminQuickApproveSubmission('${escapeHtml(item.id)}')" title="Approve and publish to repository" aria-label="Approve submission">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                    <span class="action-btn-text">Approve</span>
                                </button>
                                <button type="button" class="action-btn action-reject" onclick="window.__adminQuickRejectSubmission('${escapeHtml(item.id)}')" title="Reject and discard" aria-label="Reject submission">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    <span class="action-btn-text">Reject</span>
                                </button>
                                <button type="button" class="action-btn action-lock" onclick="window.__adminToggleLockPendingProject('${escapeHtml(item.id)}', true)" title="Lock project (Freeze all actions)" aria-label="Lock submission">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                    <span class="action-btn-text">Lock</span>
                                </button>
                            </div>
                        `;
                    })()}
                </td>
            </tr>`;
        }).join('');
    }

    function openApprovalReviewModal(id, customData = null) {
        const item = allPendingApprovals.find(x => x.id === id);
        if (!item && !customData) {
            showToast('Submission not found.', '❌');
            return;
        }

        const data = customData || item;
        document.getElementById('approval-pending-id').value = id;
        document.getElementById('approval-title').value = data.title || '';
        document.getElementById('approval-authors').value = Array.isArray(data.authors) ? data.authors.join(', ') : (data.authors || '');
        document.getElementById('approval-program').value = data.program || 'BSIT';
        document.getElementById('approval-year').value = data.year || new Date().getFullYear();
        document.getElementById('approval-adviser').value = data.adviser || '';
        document.getElementById('approval-keywords').value = Array.isArray(data.keywords) ? data.keywords.join(', ') : (data.keywords || '');
        document.getElementById('approval-abstract').value = data.abstract || '';

        const nameEl = document.getElementById('approval-submitter-name');
        if (nameEl) nameEl.textContent = item?.submittedByName || 'Librarian';
        const emailEl = document.getElementById('approval-submitter-email');
        if (emailEl) emailEl.textContent = item?.submittedByEmail || 'N/A';
        const dateEl = document.getElementById('approval-submitted-date');
        if (dateEl) dateEl.textContent = formatDate(item.createdAt);

        // Render submitted book/preview images if available
        const imagesSection = document.getElementById('approval-images-section');
        const imagesGrid = document.getElementById('approval-images-grid');
        if (imagesSection && imagesGrid) {
            const imgs = item.images || [];
            if (imgs.length > 0) {
                imagesSection.style.display = 'block';
                imagesGrid.innerHTML = imgs.map((img, i) => {
                    const rawUrl = typeof img === 'string' ? img : (img.secure_url || img.url);
                    const isCover = i === 0;
                    return `
                        <div class="image-preview-card ${isCover ? 'is-cover' : ''}">
                            <img src="${escapeHtml(rawUrl)}" alt="Submission Image ${i + 1}">
                            ${isCover ? '<span class="cover-badge">Cover</span>' : ''}
                        </div>
                    `;
                }).join('');
            } else {
                imagesSection.style.display = 'none';
                imagesGrid.innerHTML = '';
            }
        }

        // Lock enforcement inside review modal
        const isLocked = Boolean(item.isLockedByAdmin);
        const confirmBtn = document.getElementById('approval-confirm-btn');
        const rejectBtn = document.getElementById('approval-reject-btn');
        const formFields = document.getElementById('approval-evaluate-form')?.querySelectorAll('input, textarea, select');
        if (formFields) {
            formFields.forEach(el => {
                if (el.id === 'approval-pending-id') return;
                el.disabled = isLocked;
            });
        }
        if (confirmBtn) {
            confirmBtn.disabled = isLocked;
            confirmBtn.title = isLocked ? 'Project is locked by Admin. Unlock to approve.' : '';
            confirmBtn.style.opacity = isLocked ? '0.45' : '1';
        }
        if (rejectBtn) {
            rejectBtn.disabled = isLocked;
            rejectBtn.title = isLocked ? 'Project is locked by Admin. Unlock to reject.' : '';
            rejectBtn.style.opacity = isLocked ? '0.45' : '1';
        }

        const modal = document.getElementById('approval-review-modal');
        if (modal) {
            modal.style.display = 'flex';
            void modal.offsetHeight;
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            const modalBody = modal.querySelector('.pmodal-body');
            if (modalBody) modalBody.scrollTop = 0;
        }
    }

    function closeApprovalReviewModal() {
        const modal = document.getElementById('approval-review-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    function closeApprovalDuplicateConfirmModal() {
        const modal = document.getElementById('approval-duplicate-confirm-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    async function ensureProjectsDataLoaded() {
        if (!allProjectsData || allProjectsData.length === 0) {
            const cached = loadProjectsFromCache();
            if (cached && cached.length > 0) {
                allProjectsData = cached;
            } else if (typeof db !== 'undefined') {
                try {
                    const snap = await db.collection('projects').get();
                    allProjectsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                } catch (e) {
                    console.warn('Could not fetch projects for duplicate check:', e);
                }
            }
        }
    }

    function normalizeDuplicateString(str) {
        if (!str) return '';
        return String(str).toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    }

    function findPotentialDuplicates(candidate, candidateId = null) {
        if (!candidate || !candidate.title) return [];
        const normCandTitle = normalizeDuplicateString(candidate.title);
        if (!normCandTitle) return [];

        const candAuthors = (Array.isArray(candidate.authors) ? candidate.authors : String(candidate.authors || '').split(','))
            .map(a => a.trim().toLowerCase())
            .filter(Boolean);
        const candProgram = (candidate.program || '').trim().toLowerCase();
        const candYear = String(candidate.year || '').trim();
        const candAdviser = normalizeDuplicateString(candidate.adviser);

        const duplicates = [];

        // 1. Check existing published/completed projects in catalog
        const completedProjects = Array.isArray(allProjectsData) ? allProjectsData : [];
        completedProjects.forEach(proj => {
            const normProjTitle = normalizeDuplicateString(proj.title);
            if (!normProjTitle) return;

            const isExactTitle = normCandTitle === normProjTitle;
            const isTitleSimilar = !isExactTitle && normCandTitle.length >= 3 && normProjTitle.length >= 3 &&
                (normCandTitle.includes(normProjTitle) || normProjTitle.includes(normCandTitle));

            const projAuthors = (Array.isArray(proj.authors) ? proj.authors : String(proj.authors || '').split(','))
                .map(a => a.trim().toLowerCase())
                .filter(Boolean);
            const commonAuthors = candAuthors.filter(ca => projAuthors.some(pa => pa.includes(ca) || ca.includes(pa)));
            const isProgramMatch = candProgram && proj.program && candProgram === String(proj.program).trim().toLowerCase();
            const isYearMatch = candYear && proj.year && candYear === String(proj.year).trim();
            const isAdviserMatch = candAdviser && proj.adviser && candAdviser === normalizeDuplicateString(proj.adviser);

            let isDuplicate = false;
            if (isExactTitle) isDuplicate = true;
            else if (isTitleSimilar && (isProgramMatch || isYearMatch || commonAuthors.length > 0)) isDuplicate = true;
            else if (isProgramMatch && isYearMatch && commonAuthors.length > 0 && commonAuthors.length === candAuthors.length) isDuplicate = true;

            if (isDuplicate) {
                let matchCount = 0;
                if (isExactTitle || isTitleSimilar) matchCount++;
                if (isProgramMatch) matchCount++;
                if (isYearMatch) matchCount++;
                if (commonAuthors.length > 0) matchCount++;
                if (isAdviserMatch) matchCount++;

                duplicates.push({
                    targetId: proj.id,
                    targetTitle: proj.title || 'Untitled',
                    targetAuthors: Array.isArray(proj.authors) ? proj.authors.join(', ') : (proj.authors || 'N/A'),
                    targetProgram: proj.program || 'N/A',
                    targetYear: proj.year || 'N/A',
                    targetAdviser: proj.adviser || '',
                    source: 'Completed Projects Catalog',
                    statusBadge: 'Completed',
                    statusBadgeClass: 'adc-badge-emerald',
                    isExactTitle,
                    isTitleSimilar,
                    commonFieldCount: matchCount,
                    commonFields: {
                        title: isExactTitle ? 'Exact Title Match' : (isTitleSimilar ? 'Similar Title' : null),
                        program: isProgramMatch ? proj.program : null,
                        year: isYearMatch ? proj.year : null,
                        authors: commonAuthors.length > 0 ? commonAuthors.join(', ') : null,
                        adviser: isAdviserMatch ? proj.adviser : null
                    }
                });
            }
        });

        // 2. Check other pending submissions in queue
        const pendingSubmissions = Array.isArray(allPendingApprovals) ? allPendingApprovals : [];
        pendingSubmissions.forEach(pend => {
            if (candidateId && pend.id === candidateId) return; // skip self
            const normPendTitle = normalizeDuplicateString(pend.title);
            if (!normPendTitle) return;

            const isExactTitle = normCandTitle === normPendTitle;
            const isTitleSimilar = !isExactTitle && normCandTitle.length >= 3 && normPendTitle.length >= 3 &&
                (normCandTitle.includes(normPendTitle) || normPendTitle.includes(normCandTitle));

            const pendAuthors = (Array.isArray(pend.authors) ? pend.authors : String(pend.authors || '').split(','))
                .map(a => a.trim().toLowerCase())
                .filter(Boolean);
            const commonAuthors = candAuthors.filter(ca => pendAuthors.some(pa => pa.includes(ca) || ca.includes(pa)));
            const isProgramMatch = candProgram && pend.program && candProgram === String(pend.program).trim().toLowerCase();
            const isYearMatch = candYear && pend.year && candYear === String(pend.year).trim();
            const isAdviserMatch = candAdviser && pend.adviser && candAdviser === normalizeDuplicateString(pend.adviser);

            let isDuplicate = false;
            if (isExactTitle) isDuplicate = true;
            else if (isTitleSimilar && (isProgramMatch || isYearMatch || commonAuthors.length > 0)) isDuplicate = true;
            else if (isProgramMatch && isYearMatch && commonAuthors.length > 0) isDuplicate = true;

            if (isDuplicate) {
                let matchCount = 0;
                if (isExactTitle || isTitleSimilar) matchCount++;
                if (isProgramMatch) matchCount++;
                if (isYearMatch) matchCount++;
                if (commonAuthors.length > 0) matchCount++;
                if (isAdviserMatch) matchCount++;

                duplicates.push({
                    targetId: pend.id,
                    targetTitle: pend.title || 'Untitled',
                    targetAuthors: Array.isArray(pend.authors) ? pend.authors.join(', ') : (pend.authors || 'N/A'),
                    targetProgram: pend.program || 'N/A',
                    targetYear: pend.year || 'N/A',
                    targetAdviser: pend.adviser || '',
                    source: 'Pending Submissions Queue',
                    statusBadge: 'Pending',
                    statusBadgeClass: 'adc-badge-amber',
                    isExactTitle,
                    isTitleSimilar,
                    commonFieldCount: matchCount,
                    commonFields: {
                        title: isExactTitle ? 'Exact Title Match' : (isTitleSimilar ? 'Similar Title' : null),
                        program: isProgramMatch ? pend.program : null,
                        year: isYearMatch ? pend.year : null,
                        authors: commonAuthors.length > 0 ? commonAuthors.join(', ') : null,
                        adviser: isAdviserMatch ? pend.adviser : null
                    }
                });
            }
        });

        // Sort: exact title matches first, then by match count descending
        duplicates.sort((a, b) => {
            if (a.isExactTitle && !b.isExactTitle) return -1;
            if (!a.isExactTitle && b.isExactTitle) return 1;
            return b.commonFieldCount - a.commonFieldCount;
        });

        return duplicates;
    }

    async function openApprovalConfirmationDialog(id, customData = null) {
        closeApprovalReviewModal();
        await ensureProjectsDataLoaded();
        const item = allPendingApprovals.find(x => x.id === id);
        if (!item && !customData) {
            showToast('Submission not found.', '❌');
            return;
        }

        const cand = {
            id,
            title: (customData?.title || item?.title || 'Untitled').trim(),
            abstract: (customData?.abstract || item?.abstract || '').trim(),
            authors: customData?.authors || (Array.isArray(item?.authors) ? item.authors : String(item?.authors || '').split(',').map(a => a.trim()).filter(Boolean)),
            program: (customData?.program || item?.program || 'BSIT').trim(),
            year: parseInt(customData?.year || item?.year, 10) || new Date().getFullYear(),
            adviser: (customData?.adviser || item?.adviser || '').trim(),
            submittedByName: item?.submittedByName || 'Librarian'
        };

        const duplicates = findPotentialDuplicates(cand, id);
        const modal = document.getElementById('approval-duplicate-confirm-modal');
        if (!modal) return;

        const headerIconBadge = document.getElementById('adc-header-icon-badge');
        const modalTitle = document.getElementById('adc-modal-title');
        const statusPill = document.getElementById('adc-status-pill');
        const modalSubtitle = document.getElementById('adc-modal-subtitle');
        const modalBody = document.getElementById('adc-modal-body');
        const evaluateBtn = document.getElementById('adc-evaluate-btn');
        const approveBtn = document.getElementById('adc-approve-btn');
        const approveBtnText = document.getElementById('adc-approve-btn-text');
        const cancelBtn = document.getElementById('adc-cancel-btn');
        const closeBtn = document.getElementById('adc-close-btn');

        const candAuthorsStr = Array.isArray(cand.authors) ? cand.authors.join(', ') : cand.authors;

        if (duplicates.length > 0) {
            // DUPLICATE DETECTED!
            headerIconBadge.className = 'adc-icon-badge badge-amber';
            headerIconBadge.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
            `;
            modalTitle.textContent = 'Are you sure you want to approve?';
            statusPill.className = 'adc-status-pill pill-amber';
            statusPill.textContent = '⚠️ Duplicate Detected';
            modalSubtitle.textContent = `A potential duplicate or existing project was detected. You have the freedom to evaluate and modify details per field before approving, or approve anyway.`;

            let activeDupIdx = 0;

            function renderSingleComparison(dupIdx) {
                activeDupIdx = dupIdx;
                const currentDup = duplicates[dupIdx];

                let tabsHtml = '';
                if (duplicates.length > 1) {
                    tabsHtml = `
                        <div class="adc-match-tabs" role="tablist">
                            <span style="font-size:0.75rem;font-weight:700;color:var(--text-secondary);margin-right:0.25rem;">Compare With:</span>
                            ${duplicates.map((d, i) => `
                                <button type="button" class="adc-match-tab-btn ${i === activeDupIdx ? 'is-active' : ''}" data-dup-idx="${i}" role="tab" aria-selected="${i === activeDupIdx}">
                                    ${d.source.includes('Completed') ? '🏛️ Catalog' : '⏳ Pending Queue'}: "${escapeHtml(d.targetTitle.slice(0, 18))}${d.targetTitle.length > 18 ? '...' : ''}" (${d.commonFieldCount} match${d.commonFieldCount > 1 ? 'es' : ''})
                                </button>
                            `).join('')}
                        </div>
                    `;
                }

                modalBody.innerHTML = `
                    <div class="adc-alert-banner">
                        <div class="adc-alert-icon">⚠️</div>
                        <div class="adc-alert-text">
                            <strong>Duplicate / Common Value Alert (${duplicates.length} match${duplicates.length > 1 ? 'es' : ''} found)</strong>
                            <span>This submission shares identical or similar values with an existing project in the <strong>${escapeHtml(currentDup.source)}</strong>. You have the free will to evaluate and adjust any field or proceed with approval.</span>
                        </div>
                    </div>

                    ${tabsHtml}

                    <div class="adc-comparison-grid">
                        <!-- Incoming Submission Card -->
                        <div class="adc-project-card adc-card-incoming">
                            <div class="adc-card-header">
                                <span class="adc-card-tag adc-tag-incoming">Incoming Submission</span>
                                <span class="adc-badge adc-badge-amber">Pending Approval</span>
                            </div>
                            <div class="adc-card-body">
                                <div class="adc-field-row ${currentDup.commonFields.title ? 'is-match' : ''}">
                                    <span class="adc-field-label">Title</span>
                                    <span class="adc-field-value adc-val-title">${escapeHtml(cand.title)}</span>
                                    ${currentDup.commonFields.title ? `<span class="adc-match-tag">Common Title (${escapeHtml(currentDup.commonFields.title)})</span>` : ''}
                                </div>
                                <div class="adc-field-row ${currentDup.commonFields.authors ? 'is-match' : ''}">
                                    <span class="adc-field-label">Authors</span>
                                    <span class="adc-field-value">${escapeHtml(candAuthorsStr)}</span>
                                    ${currentDup.commonFields.authors ? `<span class="adc-match-tag">Common Author: ${escapeHtml(currentDup.commonFields.authors)}</span>` : ''}
                                </div>
                                <div class="adc-field-subgrid">
                                    <div class="adc-field-row ${currentDup.commonFields.program ? 'is-match' : ''}">
                                        <span class="adc-field-label">Program</span>
                                        <span class="adc-field-value">${escapeHtml(cand.program || 'N/A')}</span>
                                        ${currentDup.commonFields.program ? `<span class="adc-match-tag">Same Program</span>` : ''}
                                    </div>
                                    <div class="adc-field-row ${currentDup.commonFields.year ? 'is-match' : ''}">
                                        <span class="adc-field-label">Year</span>
                                        <span class="adc-field-value">${escapeHtml(String(cand.year || 'N/A'))}</span>
                                        ${currentDup.commonFields.year ? `<span class="adc-match-tag">Same Year</span>` : ''}
                                    </div>
                                </div>
                                ${cand.adviser ? `
                                    <div class="adc-field-row ${currentDup.commonFields.adviser ? 'is-match' : ''}">
                                        <span class="adc-field-label">Adviser</span>
                                        <span class="adc-field-value">${escapeHtml(cand.adviser)}</span>
                                        ${currentDup.commonFields.adviser ? `<span class="adc-match-tag">Same Adviser</span>` : ''}
                                    </div>
                                ` : ''}
                            </div>
                        </div>

                        <!-- Visual VS Divider -->
                        <div class="adc-comparison-divider">
                            <span class="adc-vs-badge">VS</span>
                            <span class="adc-common-count">${currentDup.commonFieldCount} Match${currentDup.commonFieldCount > 1 ? 'es' : ''}</span>
                        </div>

                        <!-- Existing Project Match Card -->
                        <div class="adc-project-card adc-card-existing">
                            <div class="adc-card-header">
                                <span class="adc-card-tag adc-tag-existing">Existing in Database</span>
                                <span class="adc-badge ${currentDup.statusBadgeClass}">${escapeHtml(currentDup.source)}</span>
                            </div>
                            <div class="adc-card-body">
                                <div class="adc-field-row ${currentDup.commonFields.title ? 'is-match' : ''}">
                                    <span class="adc-field-label">Title</span>
                                    <span class="adc-field-value adc-val-title">${escapeHtml(currentDup.targetTitle)}</span>
                                    ${currentDup.commonFields.title ? `<span class="adc-match-tag">Common Title (${escapeHtml(currentDup.commonFields.title)})</span>` : ''}
                                </div>
                                <div class="adc-field-row ${currentDup.commonFields.authors ? 'is-match' : ''}">
                                    <span class="adc-field-label">Authors</span>
                                    <span class="adc-field-value">${escapeHtml(currentDup.targetAuthors)}</span>
                                    ${currentDup.commonFields.authors ? `<span class="adc-match-tag">Common Author: ${escapeHtml(currentDup.commonFields.authors)}</span>` : ''}
                                </div>
                                <div class="adc-field-subgrid">
                                    <div class="adc-field-row ${currentDup.commonFields.program ? 'is-match' : ''}">
                                        <span class="adc-field-label">Program</span>
                                        <span class="adc-field-value">${escapeHtml(currentDup.targetProgram || 'N/A')}</span>
                                        ${currentDup.commonFields.program ? `<span class="adc-match-tag">Same Program</span>` : ''}
                                    </div>
                                    <div class="adc-field-row ${currentDup.commonFields.year ? 'is-match' : ''}">
                                        <span class="adc-field-label">Year</span>
                                        <span class="adc-field-value">${escapeHtml(String(currentDup.targetYear || 'N/A'))}</span>
                                        ${currentDup.commonFields.year ? `<span class="adc-match-tag">Same Year</span>` : ''}
                                    </div>
                                </div>
                                ${currentDup.targetAdviser ? `
                                    <div class="adc-field-row ${currentDup.commonFields.adviser ? 'is-match' : ''}">
                                        <span class="adc-field-label">Adviser</span>
                                        <span class="adc-field-value">${escapeHtml(currentDup.targetAdviser)}</span>
                                        ${currentDup.commonFields.adviser ? `<span class="adc-match-tag">Same Adviser</span>` : ''}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;

                // Wire up tab buttons
                modalBody.querySelectorAll('.adc-match-tab-btn').forEach(btn => {
                    btn.onclick = () => {
                        const nextIdx = parseInt(btn.dataset.dupIdx, 10);
                        if (!isNaN(nextIdx)) renderSingleComparison(nextIdx);
                    };
                });
            }

            renderSingleComparison(0);

            // Show Evaluate & Edit button
            evaluateBtn.style.display = 'inline-flex';
            evaluateBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                <span>Evaluate &amp; Edit Details</span>
            `;
            evaluateBtn.onclick = () => {
                closeApprovalDuplicateConfirmModal();
                openApprovalReviewModal(id, cand);
            };

            // Approve anyway button
            approveBtnText.textContent = 'Approve Anyway';
        } else {
            // NO DUPLICATES FOUND — CLEAN CONFIRMATION
            headerIconBadge.className = 'adc-icon-badge badge-emerald';
            headerIconBadge.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
            `;
            modalTitle.textContent = 'Are you sure you want to approve?';
            statusPill.className = 'adc-status-pill pill-emerald';
            statusPill.textContent = 'Verified Clean';
            modalSubtitle.textContent = 'No duplicate projects were found. This project will be published to the public CTU repository.';

            modalBody.innerHTML = `
                <div class="adc-alert-banner banner-info">
                    <div class="adc-alert-icon"></div>
                    <div class="adc-alert-text">
                        <strong>Ready for Publication</strong>
                        <span>This submission has no duplicate conflicts in the published catalog or pending submissions queue.</span>
                    </div>
                </div>

                <div class="adc-single-summary-card">
                    <div class="adc-field-row">
                        <span class="adc-field-label">Project Title</span>
                        <span class="adc-field-value adc-val-title">${escapeHtml(cand.title)}</span>
                    </div>
                    <div class="adc-field-row">
                        <span class="adc-field-label">Authors</span>
                        <span class="adc-field-value">${escapeHtml(candAuthorsStr)}</span>
                    </div>
                    <div class="adc-field-subgrid">
                        <div class="adc-field-row">
                            <span class="adc-field-label">Program</span>
                            <span class="adc-field-value">${escapeHtml(cand.program || 'N/A')}</span>
                        </div>
                        <div class="adc-field-row">
                            <span class="adc-field-label">Year</span>
                            <span class="adc-field-value">${escapeHtml(String(cand.year || 'N/A'))}</span>
                        </div>
                    </div>
                    ${cand.adviser ? `
                        <div class="adc-field-row">
                            <span class="adc-field-label">Adviser</span>
                            <span class="adc-field-value">${escapeHtml(cand.adviser)}</span>
                        </div>
                    ` : ''}
                </div>
            `;

            evaluateBtn.style.display = 'none';
            approveBtnText.textContent = 'Approve & Publish';
        }

        approveBtn.onclick = async () => {
            closeApprovalDuplicateConfirmModal();
            await approvePendingSubmission(id, customData, true);
        };

        cancelBtn.onclick = closeApprovalDuplicateConfirmModal;
        closeBtn.onclick = closeApprovalDuplicateConfirmModal;
        document.getElementById('adc-modal-overlay').onclick = closeApprovalDuplicateConfirmModal;

        modal.style.display = 'flex';
        void modal.offsetHeight;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function openBatchApprovalConfirmationDialog(batchConflicts, cleanItems) {
        closeApprovalReviewModal();
        const modal = document.getElementById('approval-duplicate-confirm-modal');
        if (!modal) return;

        const headerIconBadge = document.getElementById('adc-header-icon-badge');
        const modalTitle = document.getElementById('adc-modal-title');
        const statusPill = document.getElementById('adc-status-pill');
        const modalSubtitle = document.getElementById('adc-modal-subtitle');
        const modalBody = document.getElementById('adc-modal-body');
        const evaluateBtn = document.getElementById('adc-evaluate-btn');
        const approveBtn = document.getElementById('adc-approve-btn');
        const approveBtnText = document.getElementById('adc-approve-btn-text');
        const cancelBtn = document.getElementById('adc-cancel-btn');
        const closeBtn = document.getElementById('adc-close-btn');

        const totalSubmissions = batchConflicts.length + cleanItems.length;

        if (batchConflicts.length > 0) {
            headerIconBadge.className = 'adc-icon-badge badge-amber';
            headerIconBadge.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
            `;
            modalTitle.textContent = `Are you sure you want to approve all (${totalSubmissions}) submissions?`;
            statusPill.className = 'adc-status-pill pill-amber';
            statusPill.textContent = `⚠️ ${batchConflicts.length} Conflict${batchConflicts.length > 1 ? 's' : ''} Detected`;
            modalSubtitle.textContent = `Potential duplicates were found in ${batchConflicts.length} of ${totalSubmissions} pending submissions. You have the freedom to evaluate individual conflicting items, approve only clean submissions, or approve all anyway.`;

            modalBody.innerHTML = `
                <div class="adc-alert-banner">
                    <div class="adc-alert-icon">⚠️</div>
                    <div class="adc-alert-text">
                        <strong>Batch Approval Conflict Warning</strong>
                        <span>${batchConflicts.length} of ${totalSubmissions} submissions share common or identical values with existing projects in the catalog or pending queue. You have the freedom to evaluate any project below before proceeding.</span>
                    </div>
                </div>

                <div class="adc-batch-conflicts-wrap">
                    ${batchConflicts.map(c => {
                        const cand = c.candidate;
                        const primaryDup = c.duplicates[0];
                        const candAuthors = Array.isArray(cand.authors) ? cand.authors.join(', ') : (cand.authors || 'N/A');
                        return `
                            <div class="adc-conflict-item">
                                <div class="adc-conflict-info">
                                    <div class="adc-conflict-title">${escapeHtml(cand.title || 'Untitled')}</div>
                                    <div class="adc-conflict-meta">
                                        <span class="adc-badge adc-badge-amber">Program: ${escapeHtml(cand.program || 'N/A')}</span>
                                        <span class="adc-badge adc-badge-neutral">Year: ${escapeHtml(String(cand.year || 'N/A'))}</span>
                                        <span>Authors: ${escapeHtml(candAuthors)}</span>
                                    </div>
                                    <div style="font-size:0.75rem;color:#f59e0b;margin-top:0.25rem;">
                                        Matches <strong>${escapeHtml(primaryDup.targetTitle)}</strong> (${primaryDup.source} • ${primaryDup.commonFieldCount} common field${primaryDup.commonFieldCount > 1 ? 's' : ''})
                                    </div>
                                </div>
                                <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
                                    <button type="button" class="adc-btn adc-btn-evaluate" style="height:32px;padding:0 0.85rem;font-size:0.8rem;" data-eval-id="${escapeHtml(cand.id)}">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                        <span>Evaluate</span>
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                ${cleanItems.length > 0 ? `
                    <div style="margin-top:0.75rem;padding:0.65rem 0.9rem;background:rgba(16,185,129,0.08);border:1px dashed rgba(16,185,129,0.3);border-radius:8px;font-size:0.82rem;color:var(--text-secondary);display:flex;align-items:center;gap:0.5rem;">
                        <span><strong>${cleanItems.length} submission${cleanItems.length > 1 ? 's' : ''}</strong> verified clean with no duplicate conflicts detected.</span>
                    </div>
                ` : ''}
            `;

            modalBody.querySelectorAll('[data-eval-id]').forEach(btn => {
                btn.onclick = () => {
                    const evalId = btn.getAttribute('data-eval-id');
                    closeApprovalDuplicateConfirmModal();
                    openApprovalReviewModal(evalId);
                };
            });

            if (cleanItems.length > 0) {
                evaluateBtn.style.display = 'inline-flex';
                evaluateBtn.innerHTML = `<span>Approve Clean Only (${cleanItems.length})</span>`;
                evaluateBtn.onclick = () => executeBatchApproval(cleanItems);
            } else {
                evaluateBtn.style.display = 'none';
            }

            approveBtnText.textContent = `Approve All Anyway (${totalSubmissions})`;
            approveBtn.onclick = () => executeBatchApproval([...allPendingApprovals]);
        } else {
            // CLEAN BATCH
            headerIconBadge.className = 'adc-icon-badge badge-emerald';
            headerIconBadge.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
            `;
            modalTitle.textContent = `Are you sure you want to approve all (${totalSubmissions}) submissions?`;
            statusPill.className = 'adc-status-pill pill-emerald';
            statusPill.textContent = `All ${totalSubmissions} Verified Clean`;
            modalSubtitle.textContent = `No duplicate projects were detected across all ${totalSubmissions} pending submissions. All are ready for publication.`;

            modalBody.innerHTML = `
                <div class="adc-alert-banner banner-info">
                    <div class="adc-alert-icon"></div>
                    <div class="adc-alert-text">
                        <strong>All Submissions Ready for Publication</strong>
                        <span>All ${totalSubmissions} projects have been verified against the completed projects catalog and pending submissions queue with zero duplicate conflicts found.</span>
                    </div>
                </div>

                <div class="adc-single-summary-card">
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-weight:700;color:var(--text-primary);">Total Submissions to Publish</span>
                        <span style="font-size:1.15rem;font-weight:800;color:#10b981;">${totalSubmissions} Projects</span>
                    </div>
                    <p style="margin:0;font-size:0.85rem;color:var(--text-secondary);line-height:1.5;">
                        Confirming will publish all items to the public CTU undergraduate theses repository and archive them from the librarian submission queue.
                    </p>
                </div>
            `;

            evaluateBtn.style.display = 'none';
            approveBtnText.textContent = `Approve & Publish All (${totalSubmissions})`;
            approveBtn.onclick = () => executeBatchApproval(cleanItems);
        }

        cancelBtn.onclick = closeApprovalDuplicateConfirmModal;
        closeBtn.onclick = closeApprovalDuplicateConfirmModal;
        document.getElementById('adc-modal-overlay').onclick = closeApprovalDuplicateConfirmModal;

        modal.style.display = 'flex';
        void modal.offsetHeight;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    async function executeBatchApproval(itemsToApprove) {
        closeApprovalDuplicateConfirmModal();
        if (!itemsToApprove || !itemsToApprove.length) {
            showToast('No items selected for approval.', 'ℹ️');
            return;
        }

        const batchBtn = document.getElementById('batch-approve-all-btn');
        if (batchBtn) {
            batchBtn.disabled = true;
            batchBtn.textContent = 'Approving All...';
        }

        let successCount = 0;
        const total = itemsToApprove.length;

        for (const item of itemsToApprove) {
            try {
                await approvePendingSubmission(item.id, null, true); // bypassConfirm = true
                successCount++;
            } catch (e) {
                console.error(`Batch approval error on ${item.id}:`, e);
            }
        }

        if (window.ActivityService && typeof window.ActivityService.logAdmin === 'function') {
            window.ActivityService.logAdmin(
                'batch_approved',
                `${successCount} Projects`,
                `Batch approved and published ${successCount} of ${total} pending submissions publicly.`
            );
        }

        showToast(`Successfully approved and published ${successCount} of ${total} projects!`, '✅');
        if (batchBtn) {
            batchBtn.disabled = false;
            batchBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                <span>Approve All</span>
                <span class="batch-count-pill" id="batch-approve-count-pill">${allPendingApprovals.length}</span>`;
        }
        updatePendingCounters(allPendingApprovals.length);
    }

    async function approvePendingSubmission(id, customData = null, bypassConfirm = false) {
        if (!bypassConfirm) {
            await openApprovalConfirmationDialog(id, customData);
            return;
        }
        const item = allPendingApprovals.find(x => x.id === id);
        if (!item && !customData) {
            showToast('Submission not found.', '❌');
            return;
        }

        const title = (customData?.title || item?.title || 'Untitled').trim();
        const abstract = (customData?.abstract || item?.abstract || '').trim();
        const authors = customData?.authors || (Array.isArray(item?.authors) ? item.authors : String(item?.authors || '').split(',').map(a => a.trim()).filter(Boolean));
        const adviser = (customData?.adviser || item?.adviser || '').trim();
        const program = (customData?.program || item?.program || 'BSIT').trim();
        const year = parseInt(customData?.year || item?.year, 10) || new Date().getFullYear();
        const keywords = customData?.keywords || (Array.isArray(item?.keywords) ? item.keywords : String(item?.keywords || '').split(',').map(k => k.trim()).filter(Boolean));
        const topics = customData?.topics || item?.topics || [];
        const images = item?.images || [];
        const coverImage = item?.coverImage || (images.length > 0 ? (images[0].secure_url || images[0].url || images[0]) : '');

        const submitBtn = document.getElementById('approval-confirm-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Approving & Publishing...';
        }

        try {
            // Fast-hand race condition guard: fresh read from Firestore
            const freshDoc = await db.collection('pendingProjects').doc(id).get();
            if (!freshDoc.exists) {
                showToast('Submission is no longer in pending approvals queue.', '❌');
                closeApprovalReviewModal();
                return;
            }
            const freshData = freshDoc.data() || {};
            if (freshData.isLockedByAdmin) {
                showToast('Action Blocked: This project is locked. Please unlock it before approving.', '🔒');
                closeApprovalReviewModal();
                return;
            }
            if (freshData.isBeingEdited) {
                showToast(`Action Blocked: This project is currently being edited by ${freshData.editingByName || 'Librarian'}.`, '⚠️');
                closeApprovalReviewModal();
                return;
            }

            const approvedProject = {
                title,
                abstract,
                authors,
                adviser,
                program,
                year,
                keywords,
                topics,
                images,
                coverImage,
                status: 'Completed',
                isPublic: true,
                createdAt: item?.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
                approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                approvedBy: auth.currentUser?.uid || 'admin',
                approvedByName: auth.currentUser?.displayName || 'Administrator',
                approvedByEmail: auth.currentUser?.email || '',
                submittedBy: item?.submittedBy || '',
                submittedByName: item?.submittedByName || 'Librarian',
                submittedByEmail: item?.submittedByEmail || '',
                pineconeSynced: false
            };

            // 1. Add to main projects collection
            const docRef = await db.collection('projects').add(approvedProject);

            // 2. Remove from pendingProjects collection
            await db.collection('pendingProjects').doc(id).delete();

            // 3. Trigger Pinecone background vector sync
            try {
                const backendUrl = getBackendUrl();
                fetch(`${backendUrl}/api/projects/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        projectId: docRef.id,
                        projectData: approvedProject
                    })
                }).then(res => {
                    if (res.ok) {
                        db.collection('projects').doc(docRef.id).update({ pineconeSynced: true }).catch(() => {});
                    }
                }).catch(e => console.warn('Background Pinecone sync error on approval:', e));
            } catch (syncErr) {
                console.warn('Pinecone sync trigger failed:', syncErr);
            }

            // 4. Log admin audit activity and dual-log into submitting student's personal activity feed
            if (typeof ActivityService !== 'undefined') {
                ActivityService.logAdmin(
                    'project_approved',
                    title,
                    `Approved and published "${title}" submitted by ${approvedProject.submittedByName || 'Student'}.`,
                    { projectId: docRef.id, submittedBy: approvedProject.submittedBy, program: approvedProject.program, year: approvedProject.year }
                );

                if (approvedProject.submittedBy && typeof ActivityService.logForUser === 'function') {
                    ActivityService.logForUser(approvedProject.submittedBy, {
                        category: ActivityService.CATEGORIES.PROJECT,
                        action: 'submission_approved',
                        title: `Capstone Submission Approved: "${title}"`,
                        details: `Your undergraduate thesis submission was reviewed, approved, and published publicly by Administrator.`,
                        userEmail: approvedProject.submittedByEmail || '',
                        userName: approvedProject.submittedByName || 'Student',
                        metadata: {
                            projectId: docRef.id,
                            title,
                            program: approvedProject.program,
                            year: approvedProject.year,
                            approvedByRole: 'admin'
                        }
                    });
                }
            }

            closeApprovalReviewModal();
            showToast(`Project "${title}" approved and published publicly!`);

            // 5. Update local state & persistent cache optimistically
            allPendingApprovals = allPendingApprovals.filter(x => x.id !== id);
            savePendingApprovalsToCache(allPendingApprovals);
            updatePendingCounters(allPendingApprovals.length);
            filterAndRenderApprovals();

            // Refresh projects cache and dashboard
            if (typeof loadProjectsData === 'function') loadProjectsData(true);
            if (typeof updateDashboardStats === 'function') updateDashboardStats();

        } catch (err) {
            console.error('approvePendingSubmission error:', err);
            showToast('Error approving project. Please try again.', '❌');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    Approve &amp; Publish Publicly`;
            }
        }
    }

    async function rejectPendingSubmission(id) {
        const item = allPendingApprovals.find(x => x.id === id);
        const title = item ? item.title : 'this submission';

        let confirmed = false;
        if (typeof ModalDialog !== 'undefined' && ModalDialog.confirm) {
            confirmed = await ModalDialog.confirm({
                title: 'Reject Project Submission',
                message: `Are you sure you want to reject and discard "${escapeHtml(title)}"? This will delete the submission from the pending queue.`,
                confirmText: 'Reject & Discard',
                confirmClass: 'btn-danger',
                icon: 'warning'
            });
        } else {
            confirmed = confirm(`Are you sure you want to reject and discard "${title}"?`);
        }

        if (!confirmed) return;

        try {
            // Fast-hand race condition guard: fresh read from Firestore
            const freshDoc = await db.collection('pendingProjects').doc(id).get();
            if (freshDoc.exists) {
                const freshData = freshDoc.data() || {};
                if (freshData.isLockedByAdmin) {
                    showToast('Action Blocked: This project is locked. Please unlock it before rejecting.', '🔒');
                    closeApprovalReviewModal();
                    return;
                }
                if (freshData.isBeingEdited) {
                    showToast(`Action Blocked: This project is currently being edited by ${freshData.editingByName || 'Librarian'}.`, '⚠️');
                    closeApprovalReviewModal();
                    return;
                }
            }

            await db.collection('pendingProjects').doc(id).delete();

            if (typeof ActivityService !== 'undefined') {
                ActivityService.logAdmin(
                    'project_rejected',
                    title,
                    `Rejected and discarded manuscript submission: "${title}".`,
                    { submissionId: id, submittedBy: item?.submittedBy }
                );

                if (item && item.submittedBy && typeof ActivityService.logForUser === 'function') {
                    ActivityService.logForUser(item.submittedBy, {
                        category: ActivityService.CATEGORIES.PROJECT,
                        action: 'submission_rejected',
                        title: `Capstone Submission Rejected: "${title}"`,
                        details: `Your manuscript submission was rejected and removed from review queue by Administrator.`,
                        userEmail: item.submittedByEmail || '',
                        userName: item.submittedByName || 'Student',
                        metadata: {
                            submissionId: id,
                            title,
                            rejectedByRole: 'admin'
                        }
                    });
                }
            }

            closeApprovalReviewModal();
            showToast('Project submission rejected and discarded.', 'ℹ️');

            // Optimistically update local state & persistent cache
            allPendingApprovals = allPendingApprovals.filter(x => x.id !== id);
            savePendingApprovalsToCache(allPendingApprovals);
            updatePendingCounters(allPendingApprovals.length);
            filterAndRenderApprovals();
            if (typeof updateDashboardStats === 'function') updateDashboardStats();
        } catch (err) {
            console.error('rejectPendingSubmission error:', err);
            showToast('Error rejecting submission.', '❌');
        }
    }

    async function batchApproveAllPending() {
        if (!allPendingApprovals || !allPendingApprovals.length) {
            showToast('No pending submissions to approve.', 'ℹ️');
            return;
        }

        await ensureProjectsDataLoaded();

        const batchConflicts = [];
        const cleanItems = [];

        allPendingApprovals.forEach(cand => {
            const dups = findPotentialDuplicates(cand, cand.id);
            if (dups && dups.length > 0) {
                batchConflicts.push({ candidate: cand, duplicates: dups });
            } else {
                cleanItems.push(cand);
            }
        });

        openBatchApprovalConfirmationDialog(batchConflicts, cleanItems);
    }

    function initPendingApprovals() {
        // Wire Pending Approvals card in dashboard overview
        document.getElementById('pending-approvals-card')?.addEventListener('click', () => {
            const approvalsNav = document.getElementById('rail-nav-approvals');
            if (approvalsNav) approvalsNav.click();
        });

        // Search and Program filter listeners
        document.getElementById('approvals-search')?.addEventListener('input', filterAndRenderApprovals);
        document.getElementById('approvals-program-filter')?.addEventListener('change', filterAndRenderApprovals);

        // Refresh & Batch Approve
        document.getElementById('refresh-approvals-btn')?.addEventListener('click', () => loadPendingApprovalsData(true));
        document.getElementById('batch-approve-all-btn')?.addEventListener('click', batchApproveAllPending);

        // Modal buttons
        document.getElementById('approval-modal-close-btn')?.addEventListener('click', closeApprovalReviewModal);
        document.getElementById('approval-cancel-btn')?.addEventListener('click', closeApprovalReviewModal);
        document.getElementById('approval-modal-overlay')?.addEventListener('click', closeApprovalReviewModal);

        document.getElementById('approval-reject-btn')?.addEventListener('click', () => {
            const id = document.getElementById('approval-pending-id')?.value;
            if (id) rejectPendingSubmission(id);
        });

        // Form submission inside evaluation modal
        document.getElementById('approval-evaluate-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('approval-pending-id')?.value;
            if (!id) return;

            const title = document.getElementById('approval-title')?.value.trim();
            const abstract = document.getElementById('approval-abstract')?.value.trim();
            const authorsRaw = document.getElementById('approval-authors')?.value.trim();
            const program = document.getElementById('approval-program')?.value;
            const year = document.getElementById('approval-year')?.value;

            if (!title || !abstract || !authorsRaw || !program || !year) {
                showToast('Please fill all required fields.', '❌');
                return;
            }

            const customData = {
                title,
                abstract,
                authors: authorsRaw.split(',').map(a => a.trim()).filter(Boolean),
                program,
                year: parseInt(year, 10) || year,
                adviser: document.getElementById('approval-adviser')?.value.trim(),
                keywords: (document.getElementById('approval-keywords')?.value || '').split(',').map(k => k.trim()).filter(Boolean)
            };

            await approvePendingSubmission(id, customData);
        });

        // Register window globals for inline table action clicks
        window.__adminEvaluateSubmission = (id) => openApprovalReviewModal(id);
        window.__adminQuickApproveSubmission = (id) => approvePendingSubmission(id);
        window.__adminQuickRejectSubmission = (id) => rejectPendingSubmission(id);

        // Global Escape key handler for duplicate confirmation modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const dupModal = document.getElementById('approval-duplicate-confirm-modal');
                if (dupModal && dupModal.classList.contains('active')) {
                    closeApprovalDuplicateConfirmModal();
                }
            }
        });
        window.__adminToggleLockPendingProject = async (id, lockState) => {
            try {
                const isLock = Boolean(lockState);
                await db.collection('pendingProjects').doc(id).update({
                    isLockedByAdmin: isLock,
                    lockedBy: isLock ? (auth.currentUser?.uid || 'admin') : null,
                    lockedByName: isLock ? (auth.currentUser?.displayName || 'Administrator') : null,
                    lockedAt: isLock ? firebase.firestore.FieldValue.serverTimestamp() : null
                });

                const item = allPendingApprovals.find(x => x.id === id);
                if (item) {
                    item.isLockedByAdmin = isLock;
                    item.lockedByName = isLock ? (auth.currentUser?.displayName || 'Administrator') : null;
                }
                savePendingApprovalsToCache(allPendingApprovals);
                filterAndRenderApprovals();

                if (isLock) {
                    showToast('Project locked! Librarian can only view this submission.', '🔒');
                } else {
                    showToast('Project unlocked! Librarian can now edit their submission.', '🔓');
                }

                if (typeof ActivityService !== 'undefined') {
                    ActivityService.logAdmin('project_lock_toggle', item?.title || id, `${isLock ? 'Locked' : 'Unlocked'} pending project: ${item?.title || id}`);

                    if (item && item.submittedBy && typeof ActivityService.logForUser === 'function') {
                        ActivityService.logForUser(item.submittedBy, {
                            category: ActivityService.CATEGORIES.PROJECT,
                            action: isLock ? 'project_locked' : 'project_unlocked',
                            title: isLock ? `Pending Submission Locked: "${item.title || id}"` : `Pending Submission Unlocked: "${item.title || id}"`,
                            details: isLock ? 'Administrator placed an editing lock on your pending submission.' : 'Administrator released editing lock on your pending submission.',
                            userEmail: item.submittedByEmail || '',
                            userName: item.submittedByName || 'Student',
                            metadata: { projectId: id, isLock }
                        });
                    }
                }
            } catch (err) {
                console.error('toggleLockPendingProject error:', err);
                showToast('Failed to update project lock status.', '❌');
            }
        };

        window.__adminToggleLockProject = async (id, lockState) => {
            try {
                const isLock = Boolean(lockState);
                await db.collection('projects').doc(id).update({
                    isLockedByAdmin: isLock,
                    lockedBy: isLock ? (auth.currentUser?.uid || 'admin') : null,
                    lockedByName: isLock ? (auth.currentUser?.displayName || 'Administrator') : null,
                    lockedAt: isLock ? firebase.firestore.FieldValue.serverTimestamp() : null
                });

                const item = allProjectsData.find(x => x.id === id);
                if (item) {
                    item.isLockedByAdmin = isLock;
                    item.lockedByName = isLock ? (auth.currentUser?.displayName || 'Administrator') : null;
                }
                saveProjectsToCache(allProjectsData);
                const tbody = document.getElementById('projects-table-body');
                if (tbody) renderProjectsTablePaginated(tbody);

                if (isLock) {
                    showToast('Project locked! Cataloging and edits are disabled.', '🔒');
                } else {
                    showToast('Project unlocked! Cataloging and edits are enabled.', '🔓');
                }

                if (typeof ActivityService !== 'undefined') {
                    ActivityService.logAdmin('project_lock_toggle', item?.title || id, `${isLock ? 'Locked' : 'Unlocked'} published project: ${item?.title || id}`);

                    if (item && item.submittedBy && typeof ActivityService.logForUser === 'function') {
                        ActivityService.logForUser(item.submittedBy, {
                            category: ActivityService.CATEGORIES.PROJECT,
                            action: isLock ? 'project_locked' : 'project_unlocked',
                            title: isLock ? `Published Project Locked: "${item.title || id}"` : `Published Project Unlocked: "${item.title || id}"`,
                            details: isLock ? 'Administrator locked cataloging and modifications on this thesis.' : 'Administrator enabled cataloging and modifications on this thesis.',
                            userEmail: item.submittedByEmail || '',
                            userName: item.submittedByName || 'Student',
                            metadata: { projectId: id, isLock }
                        });
                    }
                }
            } catch (err) {
                console.error('toggleLockProject error:', err);
                showToast('Failed to update project lock status.', '❌');
            }
        };

        window.__adminForceReleaseCatalogLock = async (id) => {
            try {
                await db.collection('projects').doc(id).update({
                    isBeingCataloged: false,
                    catalogingBy: null,
                    catalogingByName: null,
                    catalogingStartedAt: null,
                    isBeingEdited: false,
                    editingBy: null,
                    editingByName: null,
                    editingStartedAt: null
                });

                const item = allProjectsData.find(x => x.id === id);
                if (item) {
                    item.isBeingCataloged = false;
                    item.catalogingBy = null;
                    item.catalogingByName = null;
                    item.isBeingEdited = false;
                    item.editingBy = null;
                    item.editingByName = null;
                }
                saveProjectsToCache(allProjectsData);
                const tbody = document.getElementById('projects-table-body');
                if (tbody) renderProjectsTablePaginated(tbody);

                if (typeof ActivityService !== 'undefined') {
                    ActivityService.logAdmin('lock_released', item?.title || id, `Admin manually broke cataloging/editing lock on "${item?.title || id}".`);
                }

                showToast('Session lock released successfully.', '🔓');
            } catch (err) {
                console.error('forceReleaseCatalogLock error:', err);
                showToast('Failed to release lock.', '❌');
            }
        };
    }

    // ===== Initial Load =====
    await loadDashboardData();
    
    // Setup real-time listeners
    setupRealtimeListeners();
    initPendingApprovals();

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
    const librarianPositionInput = document.getElementById('librarian-position');
    const successLibrarianPosition = document.getElementById('success-librarian-position');
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
            if (successLibrarianPosition) successLibrarianPosition.textContent = librarianData.position || '-';
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
            const textToCopy = `RE-CAPS Librarian Credentials:\nName: ${currentCreatedLibrarian.fullName}\nEmail: ${currentCreatedLibrarian.email}\nPosition: ${currentCreatedLibrarian.position || 'Librarian'}\nPassword: ${currentCreatedLibrarian.password}\nRole: Librarian (Catalog Manager)\nPortal: ${window.location.origin}/pages/login.html`;
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
            librarianPwdMatchHint.textContent = 'Passwords match';
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
            const position = (librarianPositionInput?.value || '').trim() || 'Librarian';
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
                        position: position,
                        adminUid: currentAdminUid
                    })
                });

                const result = await response.json().catch(() => ({ success: false, message: 'Backend endpoint returned ' + response.status }));
                if (response.ok && result.success) {
                    console.log('Librarian created successfully via backend API');
                    creationSuccess = true;
                    createdUserRecord = result.user || { uid: 'lib_' + Date.now(), email, fullName: name, position: position, userType: 'librarian' };
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
                            position: position,
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
                            position: position,
                            userType: 'librarian'
                        };
                        console.log('Librarian created successfully via secondary client instance');
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
                    if (window.ActivityService && typeof window.ActivityService.logAdmin === 'function') {
                        window.ActivityService.logAdmin('librarian_created', name, `Admin created librarian profile for ${name} (${email})`, {
                            targetEmail: email,
                            role: 'librarian'
                        });
                    }

                    const targetUid = createdUserRecord?.uid || email;
                    if (targetUid && window.ActivityService && typeof window.ActivityService.logForUser === 'function') {
                        window.ActivityService.logForUser(targetUid, {
                            category: 'auth',
                            action: 'account_created',
                            title: 'Librarian Account Provisioned',
                            details: 'Administrator initialized your RE-CAPS librarian account.',
                            userName: name,
                            userEmail: email,
                            userRole: 'librarian'
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
                    position: position,
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

            // Log admin activity
            if (window.ActivityService && typeof window.ActivityService.logAdmin === 'function') {
                window.ActivityService.logAdmin(
                    'bulk_import',
                    `${successCount} Projects`,
                    `Bulk imported ${successCount} capstone manuscript(s) across ${bulkImportBatches.length} batch(es). Errors encountered: ${errorCount}.`,
                    { successCount, errorCount, batchCount: bulkImportBatches.length }
                );
            }
            
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
                    console.log('Bulk import draft loaded:', bulkImportBatches.length, 'batches');
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

    // ===== LIBRARIAN AI COPILOT INTERACTION & FLOATING CHAT WIDGET HANDLERS =====
    const floatingCopilotContainer = document.getElementById('admin-floating-copilot-container');
    const floatingCopilotBtn = document.getElementById('admin-floating-copilot-btn');
    const copilotWidget = document.getElementById('admin-copilot-widget');
    const copilotWidgetCloseBtn = document.getElementById('copilot-widget-close-btn');
    const copilotWidgetFullscreenBtn = document.getElementById('copilot-widget-fullscreen-btn');
    const copilotWidgetInput = document.getElementById('copilot-widget-input');
    const copilotWidgetForm = document.getElementById('copilot-widget-form');
    const copilotWidgetChips = document.querySelectorAll('.copilot-widget-chip');

    // Section workspace copilot elements
    const sectionCopilotInput = document.getElementById('copilot-input-text');
    const sectionCopilotSendBtn = document.getElementById('copilot-send-btn');
    const sectionPromptPills = document.querySelectorAll('.copilot-prompt-pill');

    /**
     * Open floating chat widget with animation and persistence
     */
    function openCopilotWidget() {
        if (!copilotWidget) return;
        copilotWidget.style.display = 'flex';
        requestAnimationFrame(() => {
            copilotWidget.classList.add('active');
        });
        sessionStorage.setItem('admin_copilot_widget_open', 'true');
        if (copilotWidgetInput) {
            setTimeout(() => copilotWidgetInput.focus(), 120);
        }
        const body = document.getElementById('copilot-widget-body');
        if (body) body.scrollTop = body.scrollHeight;
    }

    /**
     * Close floating chat widget on explicit user close
     */
    function closeCopilotWidget() {
        if (!copilotWidget) return;
        copilotWidget.classList.remove('active');
        sessionStorage.setItem('admin_copilot_widget_open', 'false');
        setTimeout(() => {
            if (!copilotWidget.classList.contains('active')) {
                copilotWidget.style.display = 'none';
            }
        }, 280);
    }

    /**
     * Toggle floating chat widget state
     */
    function toggleCopilotWidget() {
        if (!copilotWidget) return;
        if (copilotWidget.classList.contains('active')) {
            closeCopilotWidget();
        } else {
            openCopilotWidget();
        }
    }

    /**
     * Dynamic visibility controller based on sidebar rail navigation:
     * - When viewing the dedicated sidebar chatbot (data-section="copilot"), hide the floating button & widget.
     * - When away in any other section, show the floating button again.
     * - Keep the chat widget active unless the user explicitly clicked close.
     */
    function syncCopilotVisibility(sectionId) {
        const isCopilotSection = (sectionId === 'copilot');

        if (isCopilotSection) {
            // In the dedicated chatbot section: hide floating button & floating widget
            if (floatingCopilotContainer) {
                floatingCopilotContainer.style.display = 'none';
            }
            if (copilotWidget) {
                copilotWidget.style.display = 'none';
                copilotWidget.classList.remove('active');
            }
        } else {
            // In any other section: display floating button
            if (floatingCopilotContainer) {
                floatingCopilotContainer.style.display = 'flex';
            }
            // If the widget was previously opened, keep it active
            const wasWidgetOpen = sessionStorage.getItem('admin_copilot_widget_open') === 'true';
            if (wasWidgetOpen) {
                openCopilotWidget();
            } else {
                if (copilotWidget) {
                    copilotWidget.style.display = 'none';
                    copilotWidget.classList.remove('active');
                }
            }
        }
    }

    // Floating Copilot Button click -> automatically open chat widget
    if (floatingCopilotBtn) {
        floatingCopilotBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            openCopilotWidget();
        });
    }

    // Close button -> explicitly close widget
    if (copilotWidgetCloseBtn) {
        copilotWidgetCloseBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            closeCopilotWidget();
        });
    }

    // Fullscreen / Expand button -> switch to dedicated section-copilot
    if (copilotWidgetFullscreenBtn) {
        copilotWidgetFullscreenBtn.addEventListener('click', function() {
            closeCopilotWidget();
            const railCopilot = document.getElementById('rail-nav-copilot');
            if (railCopilot) {
                railCopilot.click();
            } else if (window.dashboardRail && window.dashboardRail.switchToSection) {
                window.dashboardRail.switchToSection('copilot');
            }
        });
    }

    // Outside admin dashboard handling (Rule 4: ALWAYS close chat widget outside admin dashboard)
    if (backToHomeBtn) {
        backToHomeBtn.addEventListener('click', function() {
            sessionStorage.removeItem('admin_copilot_widget_open');
            sessionStorage.setItem('admin_copilot_widget_open', 'false');
            if (copilotWidget) {
                copilotWidget.style.display = 'none';
                copilotWidget.classList.remove('active');
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            sessionStorage.removeItem('admin_copilot_widget_open');
            sessionStorage.setItem('admin_copilot_widget_open', 'false');
            if (copilotWidget) {
                copilotWidget.style.display = 'none';
                copilotWidget.classList.remove('active');
            }
        });
    }

    // Listen to section change event from dashboard rail
    window.addEventListener('rail:section-change', function(e) {
        if (e.detail && e.detail.sectionId) {
            syncCopilotVisibility(e.detail.sectionId);
        }
    });

    // Also attach click listeners to all rail navigation items for instant synchronization
    document.querySelectorAll('.rail-nav-item[data-section]').forEach(item => {
        item.addEventListener('click', function() {
            const sec = this.getAttribute('data-section');
            if (sec) {
                syncCopilotVisibility(sec);
            }
        });
    });

    // Check initial section state on load
    const activeRailItem = document.querySelector('.rail-nav-item.active');
    const initialSection = activeRailItem ? activeRailItem.getAttribute('data-section') : 'dashboard';
    syncCopilotVisibility(initialSection);

    // Global Copilot Interaction Helpers
    window.navigateAdminDashboard = function(section, actionId) {
        if (section) {
            const item = document.querySelector(`.rail-nav-item[data-section="${section}"]`);
            if (item) {
                item.click();
                window.location.hash = section;
            }
        }
        if (actionId) {
            setTimeout(() => {
                const el = document.getElementById(actionId);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.click();
                }
            }, 320);
        }
    };

    window.copyCopilotGuidance = function(btn) {
        const card = btn.closest('.copilot-dynamic-response') || btn.closest('.copilot-msg-bubble');
        if (!card) return;
        const textToCopy = card.innerText
            .replace(/Trigger Sync|Open Form|Bulk Import|Go to [^\n]+/g, '')
            .replace(/Copy Guidance|Copied!/g, '')
            .trim();
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalHTML = btn.innerHTML;
                btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    btn.classList.remove('copied');
                }, 2000);
            }).catch(() => {});
        }
    };

    // Universal Dynamic NLP Normalizer & Renderer
    function dynamicCopilotNormalizer(rawText, provider = 'Mistral AI') {
        if (!rawText || typeof rawText !== 'string') return '';

        let text = rawText
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .trim();

        // 1. Remove meta-conversational preambles before landmark or steps (line-bound)
        text = text.replace(/^(?:Here['’‘]?[^\n]*|Sure[^\n]*|Certainly[^\n]*|Below is[^\n]*)\r?\n+/i, '');

        // Strip decorative horizontal rules (---, ----, ***, ___, etc.)
        text = text.replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, '');

        // 2. Extract Spatial Landmark
        let landmarkArea = '';
        let landmarkElement = '';

        const landmarkRegex = /(?:\*\*)?\[Area:\s*([^\]]+?)\s*\](?:\*\*)?(?:\s*(?:>|->|\|)?\s*(?:\r?\n\s*)?(?:\*\*)?\[Element:\s*([^\]]+?)\s*\](?:\*\*)?)?/i;
        const landmarkMatch = text.match(landmarkRegex);

        if (landmarkMatch) {
            landmarkArea = landmarkMatch[1].trim();
            if (landmarkMatch[2]) {
                landmarkElement = landmarkMatch[2].trim();
            }
            text = text.replace(landmarkMatch[0], '');
        }

        // Check if there is still a standalone [Element: ...] left on adjacent or separate line
        if (!landmarkElement) {
            const standaloneElemMatch = text.match(/(?:\*\*)?\[Element:\s*([^\]]+?)\s*\](?:\*\*)?/i);
            if (standaloneElemMatch) {
                landmarkElement = standaloneElemMatch[1].trim();
                text = text.replace(standaloneElemMatch[0], '');
            }
        }

        // Strip leftover anchor markers like "** > **" or ">" or standalone "**"
        text = text.replace(/^[ \t]*(?:\*\*)?\s*(?:>|->|\|)?\s*(?:\*\*)?[ \t]*$/gm, '');

        // Also remove parenthetical locator notes like *(Locate the left sidebar rail...)*
        text = text.replace(/\*?\([^*)]*(?:sidebar|dashboard|screen|button|rail|card|table)[^*)]*\)\*?/gi, '');

        // 3. Extract Precaution / Policy Alert
        let precautionText = '';
        const precautionRegex = /(?:###\s*)?(?:\*\*)?(?:[1-3]\.\s*)?(?:⚠️|⚠)?\s*(?:\*\*)?(?:PRECAUTION|Precaution|POLICY ALERT|Policy Alert|CRITICAL NOTE)[^\n\r:]*:?\s*(?:\*\*)?([\s\S]*?)(?=(?:\r?\n\s*###|\r?\n\s*\d+\.\s+[A-Z]|$))/i;
        const precautionMatch = text.match(precautionRegex);
        if (precautionMatch) {
            precautionText = precautionMatch[1].trim();
            text = text.replace(precautionMatch[0], '');
        }

        // 4. Clean up section headers from remaining text
        text = text.replace(/(?:###\s*)?(?:\*\*)?(?:\d+\.)?\s*(?:SPATIAL LANDMARK|STEP-BY-STEP ACTION|ACTION STEPS|PROCEDURAL GUIDANCE)[^\n\r]*(\*\*)?/gi, '');
        text = text.replace(/^(?:\*\*)?(?:\d+\.)?\s*(?:SPATIAL LANDMARK|STEP-BY-STEP ACTION|ACTION STEPS):?(?:\*\*)?$/gmi, '');
        text = text.replace(/###\s*(?:\*\*)?\s*$/gm, '');
        text = text.replace(/^[ \t]*[-*_]{2,}[ \t]*$/gm, '');

        // Trim remaining text
        text = text.trim();

        // 5. Build the Structured HTML Output
        let html = '<div class="copilot-dynamic-response">';

        // A. Render Landmark Breadcrumbs Card
        if (landmarkArea || landmarkElement) {
            let breadcrumbs = [];
            if (landmarkArea) {
                const parts = landmarkArea.split(/\s*>\s*/);
                parts.forEach(p => {
                    const clean = p.replace(/\*\*/g, '').replace(/[*_]/g, '').trim();
                    if (clean) breadcrumbs.push(`<span class="crumb-area">${clean}</span>`);
                });
            }
            if (landmarkElement) {
                const cleanElem = landmarkElement.replace(/\*\*/g, '').replace(/[*_]/g, '').trim();
                breadcrumbs.push(`<span class="crumb-element">${cleanElem}</span>`);
            }

            // Detect dynamic quick jump target using deterministic hierarchical resolver
            const jumpButton = buildAdminCopilotJumpButton(landmarkArea, landmarkElement, text);

            html += `
            <div class="copilot-landmark-card">
                <div class="landmark-meta">
                    <div class="landmark-icon">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    </div>
                    <div class="landmark-crumbs">
                        ${breadcrumbs.join('<span class="crumb-sep">›</span>')}
                    </div>
                </div>
                ${jumpButton ? `<div class="landmark-action-wrap">${jumpButton}</div>` : ''}
            </div>`;
        }

        // B. Parse Action Steps
        const stepPattern = /(?:^|\n)(?:\*\*)?(?:Step\s*)?(\d+)[\.\):](?:\*\*)?\s*([\s\S]*?)(?=(?:\n(?:\*\*)?(?:Step\s*)?\d+[\.\):]|$))/gi;
        const stepMatches = [...text.matchAll(stepPattern)];

        if (stepMatches.length > 0) {
            html += `<div class="copilot-stepper-container">`;
            stepMatches.forEach(m => {
                const stepNum = m[1];
                let stepContent = m[2].trim();

                stepContent = stepContent
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/(^|[^*])\*(?!\*)(.*?)\*/g, '$1<em>$2</em>')
                    .replace(/`([^`]+)`/g, '<code>$1</code>')
                    .replace(/\r?\n[ \t]*[-*•]\s*(.*?)(?=\r?\n|$)/g, '<div class="step-sub-bullet">• $1</div>')
                    .replace(/\r?\n\r?\n/g, '<br>')
                    .replace(/\r?\n/g, '<br>');

                html += `
                <div class="copilot-step-card">
                    <div class="step-badge">${stepNum}</div>
                    <div class="step-content">${stepContent}</div>
                </div>`;
            });
            html += `</div>`;
        } else {
            let bodyHTML = text
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/(^|[^*])\*(?!\*)(.*?)\*/g, '$1<em>$2</em>')
                .replace(/`([^`]+)`/g, '<code>$1</code>')
                .replace(/^-\s+(.*?)$/gm, '<li class="copilot-bullet-item">$1</li>')
                .replace(/\n\n/g, '<br><br>')
                .replace(/\n/g, '<br>');

            if (bodyHTML.includes('<li class="copilot-bullet-item">')) {
                bodyHTML = `<ul class="copilot-bullet-list">${bodyHTML}</ul>`;
            }

            if (bodyHTML.trim()) {
                html += `<div class="copilot-text-body">${bodyHTML}</div>`;
            }
        }

        // C. Render Institutional Precaution / Policy Alert
        if (precautionText) {
            let cleanPrecaution = precautionText
                .replace(/^(?:⚠️|⚠)?\s*(?:\*\*)?(?:Precaution:?|POLICY ALERT:?)\s*(?:\*\*)?/i, '')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/(^|[^*])\*(?!\*)(.*?)\*/g, '$1<em>$2</em>')
                .replace(/`([^`]+)`/g, '<code>$1</code>')
                .replace(/\r?\n[ \t]*[-*•]\s*(.*?)(?=\r?\n|$)/g, '<div class="step-sub-bullet">• $1</div>')
                .replace(/\r?\n\r?\n/g, '<br>')
                .replace(/\r?\n/g, '<br>')
                .trim();

            html += `
            <div class="copilot-precaution-card">
                <div class="precaution-badge">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    <span>Institutional Precaution &amp; Policy</span>
                </div>
                <div class="precaution-body">${cleanPrecaution}</div>
            </div>`;
        }

        // D. Footer with Grounding and Copy Guidance Action
        html += `
        <div class="copilot-footer-meta">
            <span class="rag-indicator">
                <span class="pulse-dot"></span>
                <span>Grounded Pinecone RAG • Powered by ${provider}</span>
            </span>
            <button type="button" class="copilot-copy-btn" onclick="window.copyCopilotGuidance(this)" title="Copy guidance text">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <span>Copy Guidance</span>
            </button>
        </div>
        </div>`;

        return html;
    }

    // Deterministic Admin Quick-Jump Button Generator
    function buildAdminCopilotJumpButton(landmarkArea, landmarkElement, rawText) {
        const area = (landmarkArea || '').toLowerCase();
        const elem = (landmarkElement || '').toLowerCase();
        const text = (rawText || '').toLowerCase();

        // Step 1: Resolve the target section deterministically
        let targetSection = '';

        // Priority 1: Check landmarkArea for primary domain keywords
        // Approvals takes precedence if specifically referencing evaluating librarian submissions
        if (area.includes('approv') || area.includes('evaluat') || area.includes('pending submission')) {
            targetSection = 'approvals';
        } else if (area.includes('user') || area.includes('student') || area.includes('faculty') || area.includes('account') || area.includes('librarian')) {
            targetSection = 'users';
        } else if (area.includes('analytic') || area.includes('accredit') || area.includes('report') || area.includes('chart') || area.includes('statistic')) {
            targetSection = 'analytics';
        } else if (area.includes('activity') || area.includes('audit') || area.includes('log') || area.includes('history')) {
            targetSection = 'activity';
        } else if (area.includes('setting') || area.includes('maintenance')) {
            targetSection = 'settings';
        } else if (area.includes('dashboard') || area.includes('overview') || area.includes('kpi') || area.includes('metric')) {
            targetSection = 'dashboard';
        } else if (area.includes('project') || area.includes('thesis') || area.includes('theses') || area.includes('capstone') || area.includes('shelf') || area.includes('dewey') || area.includes('call number') || area.includes('accession')) {
            targetSection = 'projects';
        }

        // Priority 2: Check landmarkElement if area was generic (e.g., "Sidebar Rail", "Header", "Actions Column")
        if (!targetSection) {
            if (elem.includes('approv') || elem.includes('evaluat') || elem.includes('submission')) {
                targetSection = 'approvals';
            } else if (elem.includes('user') || elem.includes('student') || elem.includes('faculty') || elem.includes('account') || elem.includes('librarian')) {
                targetSection = 'users';
            } else if (elem.includes('analytic') || elem.includes('accredit') || elem.includes('report') || elem.includes('print')) {
                targetSection = 'analytics';
            } else if (elem.includes('activity') || elem.includes('audit') || elem.includes('log')) {
                targetSection = 'activity';
            } else if (elem.includes('setting') || elem.includes('maintenance')) {
                targetSection = 'settings';
            } else if (elem.includes('dashboard') || elem.includes('kpi')) {
                targetSection = 'dashboard';
            } else if (elem.includes('project') || elem.includes('thesis') || elem.includes('capstone') || elem.includes('shelf') || elem.includes('pinecone') || elem.includes('sync') || elem.includes('bulk import')) {
                targetSection = 'projects';
            }
        }

        // Priority 3: Fall back to raw text keywords (e.g. "Click 'Users'", "Click 'Approvals'")
        if (!targetSection) {
            if (text.includes('click "users"') || text.includes("click 'users'") || text.includes('user account') || text.includes('delete a user') || text.includes('#section-users')) {
                targetSection = 'users';
            } else if (text.includes('click "approvals"') || text.includes("click 'approvals'") || text.includes('evaluate') || text.includes('#section-approvals')) {
                targetSection = 'approvals';
            } else if (text.includes('click "analytics"') || text.includes("click 'analytics'") || text.includes('accreditation') || text.includes('#section-analytics')) {
                targetSection = 'analytics';
            } else if (text.includes('click "activity"') || text.includes("click 'activity'") || text.includes('audit trail') || text.includes('#section-activity')) {
                targetSection = 'activity';
            } else if (text.includes('click "settings"') || text.includes("click 'settings'") || text.includes('maintenance mode') || text.includes('#section-settings')) {
                targetSection = 'settings';
            } else if (text.includes('click "dashboard"') || text.includes("click 'dashboard'") || text.includes('#section-dashboard')) {
                targetSection = 'dashboard';
            } else if (text.includes('click "projects"') || text.includes("click 'projects'") || text.includes('#section-projects') || text.includes('pinecone')) {
                targetSection = 'projects';
            }
        }

        // Default fallback if still unresolved
        if (!targetSection) {
            targetSection = 'projects';
        }

        // Step 2: Determine specific action and button appearance based on resolved section
        const combined = `${area} ${elem} ${text}`.toLowerCase();

        switch (targetSection) {
            case 'users':
                if (elem.includes('create librarian') || combined.includes('create librarian') || combined.includes('register librarian')) {
                    return `<button type="button" class="copilot-jump-action" onclick="window.navigateAdminDashboard('users', 'create-librarian-btn');"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg> + Create Librarian</button>`;
                }
                return `<button type="button" class="copilot-jump-action" onclick="window.navigateAdminDashboard('users');"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg> Go to Users</button>`;

            case 'approvals':
                if (elem.includes('batch approve') || combined.includes('batch approve')) {
                    return `<button type="button" class="copilot-jump-action" onclick="window.navigateAdminDashboard('approvals', 'batch-approve-all-btn');"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg> Batch Approve</button>`;
                }
                return `<button type="button" class="copilot-jump-action" onclick="window.navigateAdminDashboard('approvals');"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Go to Approvals</button>`;

            case 'analytics':
                if (elem.includes('print') || combined.includes('print report') || combined.includes('print official')) {
                    return `<button type="button" class="copilot-jump-action" onclick="window.navigateAdminDashboard('analytics', 'analytics-print-btn');"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg> Print Report</button>`;
                }
                if (elem.includes('export') || combined.includes('export csv')) {
                    return `<button type="button" class="copilot-jump-action" onclick="window.navigateAdminDashboard('analytics', 'analytics-export-btn');"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Export CSV</button>`;
                }
                return `<button type="button" class="copilot-jump-action" onclick="window.navigateAdminDashboard('analytics');"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line></svg> Go to Analytics</button>`;

            case 'activity':
                return `<button type="button" class="copilot-jump-action" onclick="window.navigateAdminDashboard('activity');"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Go to Activity Logs</button>`;

            case 'settings':
                return `<button type="button" class="copilot-jump-action" onclick="window.navigateAdminDashboard('settings');"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg> Go to Settings</button>`;

            case 'dashboard':
                return `<button type="button" class="copilot-jump-action" onclick="window.navigateAdminDashboard('dashboard');"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg> Go to Dashboard</button>`;

            case 'projects':
            default:
                if (elem.includes('sync pinecone') || combined.includes('sync pinecone') || combined.includes('sync all')) {
                    return `<button type="button" class="copilot-jump-action" onclick="window.navigateAdminDashboard('projects', 'sync-pinecone-btn');"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> Trigger Sync</button>`;
                }
                if (elem.includes('+ add project') || combined.includes('+ add project') || combined.includes('add project') || combined.includes('open form') || combined.includes('upload new project')) {
                    return `<button type="button" class="copilot-jump-action" onclick="window.navigateAdminDashboard('projects', 'add-project-btn');"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Open Form</button>`;
                }
                if (elem.includes('bulk import') || combined.includes('bulk import') || combined.includes('import excel')) {
                    return `<button type="button" class="copilot-jump-action" onclick="window.navigateAdminDashboard('projects', 'bulk-import-btn');"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg> Bulk Import</button>`;
                }
                return `<button type="button" class="copilot-jump-action" onclick="window.navigateAdminDashboard('projects');"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg> Go to Projects</button>`;
        }
    }

    // Comprehensive Fallback Guidance Engine (Subject-Disambiguated & Anti-Hallucination)
    function getAdminCopilotResponse(query) {
        const q = (query || '').toLowerCase().trim();

        // 1. USER MANAGEMENT DOMAIN (Evaluated first to prevent general keywords like 'delete', 'edit', 'browse', 'search' from colliding with Projects)
        const isUserScope = q.includes('user') || q.includes('student') || q.includes('faculty') || q.includes('account') || (q.includes('librarian') && !q.includes('submission') && !q.includes('evaluate') && !q.includes('pending'));

        if (isUserScope) {
            // 1A. Create / Register Librarian Staff
            if (q.includes('create') || q.includes('register') || q.includes('new staff') || q.includes('add librarian') || q.includes('new librarian')) {
                return {
                    landmark: 'Users Section > Header Toolbar > "+ Create Librarian" (Emerald Button #create-librarian-btn)',
                    steps: [
                        'Click <strong>"Users"</strong> in the left sidebar rail.',
                        'Click the emerald green <strong>"+ Create Librarian"</strong> button at the top right of the Users section.',
                        'Enter the staff member’s Full Name, CTU Institutional Email (<code>@ctu.edu.ph</code>), and initial temporary password.',
                        'Click <strong>"Register Librarian"</strong>.',
                        'Copy the generated credentials card displayed on the success screen to securely share with the staff member.'
                    ],
                    precaution: 'Librarians can draft and propose capstone theses with shelf locations, but all their entries require Head Librarian / Admin evaluation before publishing.'
                };
            }

            // 1B. Delete / Remove User Account (Permanent Purge)
            if (q.includes('delete') || q.includes('remove') || q.includes('purge') || q.includes('trash') || q.includes('can i delete') || q.includes('can administrator delete')) {
                return {
                    landmark: 'Users Section > Users Catalog Table > Actions Column (Red Trash Can Icon)',
                    steps: [
                        'Click <strong>"Users"</strong> in the left sidebar rail.',
                        'Use the <strong>Role Filter Pills</strong> (e.g., <code>All Users</code>, <code>Students</code>, <code>Faculty</code>, <code>Librarians</code>) or the <code>#users-search</code> box to locate the target account.',
                        'Hover over the user row and locate the <strong>Actions</strong> column on the right.',
                        'Click the red <strong>Trash Can icon</strong> to trigger the account removal modal.',
                        'Review the verification prompt (<em>"Are you sure you want to permanently remove this user account?"</em>).',
                        'Click <strong>"Delete"</strong> to confirm the permanent purge.'
                    ],
                    precaution: 'Deleted user accounts are permanently purged from Firebase Authentication and Firestore records. Ensure the user has no pending thesis submissions or active evaluations before deletion. Administrator accounts cannot be deleted to prevent institutional lockout.'
                };
            }

            // 1C. Reset Password
            if (q.includes('password') || q.includes('reset') || q.includes('forgot') || q.includes('credential')) {
                return {
                    landmark: 'Users Section > Users Catalog Table > Actions Column (Key Icon)',
                    steps: [
                        'Click <strong>"Users"</strong> in the left sidebar rail.',
                        'Locate the user by name or CTU email using the search box (<code>#users-search</code>).',
                        'Click the <strong>Key icon</strong> in the user row’s Actions column.',
                        'In the Reset Credentials modal, generate verified temporary login credentials.',
                        'Copy the credentials card to deliver to the user.'
                    ],
                    precaution: 'Inform the user to update their temporary password immediately upon their next login.'
                };
            }

            // 1D. Unlock Locked Account
            if (q.includes('unlock') || q.includes('lock') || q.includes('failed login') || q.includes('attempts') || q.includes('suspended')) {
                return {
                    landmark: 'Users Section > Users Catalog Table > Actions Column (Gold Shield/Unlock Icon)',
                    steps: [
                        'Click <strong>"Users"</strong> in the left sidebar rail.',
                        'Find the locked account in the table (locked accounts feature a red/amber status tag).',
                        'Click the gold <strong>Unlock/Shield button</strong> in the row’s Actions column.',
                        'Confirm the security verification modal to reset the failed login counter to zero.'
                    ],
                    precaution: 'Always verify user identity before manually releasing account lockout.'
                };
            }

            // 1E. Edit User Role / Privileges
            if (q.includes('role') || q.includes('privilege') || q.includes('promote') || q.includes('demote') || q.includes('edit')) {
                return {
                    landmark: 'Users Section > Users Catalog Table > Actions Column (Pencil Icon)',
                    steps: [
                        'Click <strong>"Users"</strong> in the left sidebar rail.',
                        'Locate the target user using the search box or Role Filter Pills.',
                        'Click the <strong>Edit icon</strong> (Pencil) in the Actions column.',
                        'In the user management modal, update the assigned role (Student, Faculty, or Librarian).',
                        'Click <strong>"Save Changes"</strong> to immediately update account RBAC privileges.'
                    ],
                    precaution: 'Administrator privileges cannot be altered from this table to prevent institutional lockout.'
                };
            }

            // 1F. General User Management / Search / Filter
            return {
                landmark: 'Users Section > Users Catalog Table > Role Filter Pills & Search (#users-search)',
                steps: [
                    'Click <strong>"Users"</strong> in the left sidebar rail.',
                    'Filter accounts by role using the Filter Pills: <code>All Users</code>, <code>Students</code>, <code>Faculty</code>, <code>Librarians</code>, or <code>Administrators</code>.',
                    'Use the live search bar (<code>#users-search</code>) to search by name or CTU institutional email.',
                    'Use row action icons to Reset Password (Key), Edit Role (Pencil), Unlock (Shield), or Delete (Trash bin).'
                ],
                precaution: 'Institutional accounts are linked to CTU Google authentication. Preserve user records for historical thesis authorship verification.'
            };
        }

        // 2. APPROVALS / EVALUATIONS DOMAIN
        if (q.includes('approv') || q.includes('evaluate') || q.includes('pending') || (q.includes('librarian') && (q.includes('submission') || q.includes('thesis') || q.includes('draft') || q.includes('review')))) {
            return {
                landmark: 'Sidebar Rail > Approvals (Checkmark Badge) OR Dashboard Overview > "Pending Approvals" Card',
                steps: [
                    'Click <strong>"Approvals"</strong> in the sidebar rail (or the amber <strong>"Pending Approvals"</strong> card on the dashboard).',
                    'Locate the submission in the Librarian Submissions table and click the <strong>"Evaluate"</strong> button (Eye icon).',
                    'In the modal, review <strong>Section 01 (Core Information)</strong>: check project title and authors.',
                    'Review <strong>Section 02 (Academic Classification)</strong>: verify academic program, academic year, and faculty adviser.',
                    'Review <strong>Section 03 (Abstract &amp; Summary)</strong> and <strong>Section 04 (Submitted Images)</strong>: inspect abstract and verify uploaded physical book photos (cover and documentation).',
                    'Click the emerald <strong>"Approve &amp; Publish Publicly"</strong> button to publish and index in Pinecone AI search, or click <strong>"Reject &amp; Discard"</strong> with feedback.'
                ],
                precaution: 'Approved capstones immediately become searchable to students in the public catalog and AI RAG interface. If locked by Admin, unlock the record before evaluating.'
            };
        }

        // 3. ACCREDITATION & ANALYTICS DOMAIN
        if (q.includes('accredit') || q.includes('report') || q.includes('print') || q.includes('dean') || q.includes('ched') || q.includes('pdf') || q.includes('chart') || q.includes('statistic') || q.includes('intake') || q.includes('export csv') || q.includes('analytic')) {
            return {
                landmark: 'Analytics Section > Top Command Toolbar > "Print Official Accreditation Report"',
                steps: [
                    'Click <strong>"Analytics"</strong> in the left sidebar rail.',
                    'Use the dropdown filters at the top to select the target Academic Year and Academic Program.',
                    'Review the generated charts: Program Distribution, Intake Timeline, and Faculty Advisers.',
                    'Click <strong>"Print Official Accreditation Report"</strong> in the top toolbar.',
                    'A formatted, printable institutional document with CTU header and thesis counts will generate.'
                ],
                precaution: 'Only approved, cataloged theses are tallied in official accreditation reports.'
            };
        }

        // 4. AUDIT LOGS & ACTIVITY DOMAIN
        if (q.includes('log') || q.includes('audit') || q.includes('activity') || q.includes('history') || q.includes('who deleted') || q.includes('who added') || q.includes('trail')) {
            return {
                landmark: 'Sidebar Rail > "Activity" (Clock Icon) > System Audit Trail',
                steps: [
                    'Click <strong>"Activity"</strong> in the left sidebar rail to view the comprehensive audit trail.',
                    'Inspect chronological logs of all institutional actions: project uploads, evaluations, deletions, user logins, and Pinecone vector syncs.',
                    'Filter logs by action type or date range to audit librarian cataloging contributions or security events.',
                    'Click any entry to inspect actor email, timestamp, IP address, and changed fields.'
                ],
                precaution: 'System audit trails are immutable and permanent for CHED accreditation compliance.'
            };
        }

        // 5. SETTINGS & MAINTENANCE DOMAIN
        if (q.includes('maintenance') || q.includes('setting') || q.includes('offline') || q.includes('advisory') || q.includes('downtime') || q.includes('allow registration')) {
            return {
                landmark: 'Settings Section > General Settings Card > "Maintenance Mode" Switch',
                steps: [
                    'Click <strong>"Settings"</strong> at the bottom of the left sidebar rail.',
                    'Under the <strong>General Settings</strong> card, locate <strong>Maintenance Mode</strong>.',
                    'Toggle the switch to <strong>ON</strong>.',
                    'A confirmation toast will notify that the public portal is locked.'
                ],
                precaution: 'When active, students and guests will see the maintenance advisory screen. Only logged-in Administrators retain system access.'
            };
        }

        // 6. DASHBOARD DOMAIN
        if (q.includes('dashboard') || q.includes('kpi') || q.includes('overview') || q.includes('counter') || q.includes('metric') || q.includes('executive summary')) {
            return {
                landmark: 'Sidebar Rail > "Dashboard" (Grid Icon) > Institutional KPI Metrics',
                steps: [
                    'Click <strong>"Dashboard"</strong> at the top of the left sidebar rail.',
                    'Inspect the top KPI cards: Total Projects, Pending Approvals, Total Users, and Recent Activity.',
                    'Click the amber <strong>"Pending Approvals"</strong> card for direct navigation to pending submissions.',
                    'Inspect Recent Projects and Recent Users widget feeds for latest repository events.'
                ],
                precaution: 'KPI metrics reflect live Firestore repository counters refreshed in real-time.'
            };
        }

        // 7. PROJECTS & REPOSITORY OPERATIONS DOMAIN

        // 7A. Add / Upload Project
        if (q.includes('shelf') || q.includes('location') || q.includes('call number') || q.includes('accession') || q.includes('add project') || q.includes('upload') || q.includes('new project') || q.includes('catalog thesis') || (q.includes('add') && q.includes('project'))) {
            return {
                landmark: 'Projects Section > Table Header Action Bar > "+ Add Project" (Emerald Green Button #add-project-btn)',
                steps: [
                    'Click <strong>"Projects"</strong> in the left sidebar rail.',
                    'Click the emerald green <strong>"+ Add Project"</strong> button in the table header action bar.',
                    'Fill in <strong>Section 01 (Core Identity)</strong>: Project Title and Authors.',
                    'Fill in <strong>Section 02 (Academic Details)</strong>: Academic Program (BSFi, BSIT, BSHM, BSIE, BSEd, BEEd, BIT, BTLEd), Academic Year, and Faculty Adviser.',
                    'Fill in <strong>Section 03 (Research Content)</strong>: Abstract and search Keywords.',
                    'Fill in <strong>Section 04 (Physical Book &amp; Shelf Details)</strong>: Enter <em>Physical Location Note</em> (e.g., <code>Rack 1, Row 2, Stand 3, Color Blue</code>), <em>Call Number</em> (e.g., <code>025.5 / Dea / 2024</code>), <em>Accession Number</em> (e.g., <code>CTU-2024-001</code>), and upload 4 to 6 physical book representation photos.',
                    'Click <strong>"Save Capstone Project"</strong>. As an Administrator, your submission is immediately published to the institutional catalog without requiring an approval review.'
                ],
                precaution: 'Accession numbers must be unique across all campus holdings. For bulk uploading multiple theses from a spreadsheet, click the blue "Bulk Import" button instead.'
            };
        }

        // 7B. Bulk Import Excel
        if (q.includes('bulk') || q.includes('excel') || q.includes('import') || q.includes('spreadsheet') || q.includes('xlsx')) {
            return {
                landmark: 'Projects Section > Table Header Action Bar > "Bulk Import" (Blue Button #bulk-import-btn)',
                steps: [
                    'Go to <strong>Projects</strong> in the sidebar rail.',
                    'Click the blue <strong>"Bulk Import"</strong> button located right beside the search bar.',
                    'If you need the template format, click <strong>"Download Excel Template"</strong> inside the modal.',
                    'Upload your completed <code>.xlsx</code> or <code>.xls</code> file into the dropzone.',
                    'Review the batch validation checklist (Title, Authors, Year, Adviser).',
                    'Click <strong>"Execute Import"</strong> to batch-insert the theses into Firestore.'
                ],
                precaution: 'Ensure author names are separated by commas and years are valid 4-digit numbers to avoid parsing rejections.'
            };
        }

        // 7C. Pinecone AI Sync
        if (q.includes('pinecone') || q.includes('sync') || q.includes('vector') || q.includes('rag') || q.includes('embedding') || q.includes('ai search')) {
            return {
                landmark: 'Projects Section > Table Header Action Bar > "Sync Pinecone" (Amber Button #sync-pinecone-btn)',
                steps: [
                    'Navigate to <strong>Projects</strong> in the sidebar rail.',
                    'Look at the action bar immediately above the search input and table.',
                    'Click the amber <strong>"Sync Pinecone"</strong> button with the lightning bolt icon.',
                    'Confirm the modal dialog when prompted. Watch the sync progress counter update.',
                    'Once completed, a green dot <code>🟢 Synced</code> will appear beside verified thesis titles.'
                ],
                precaution: 'Ensure network connection is stable during embedding generation. Do not close or refresh the tab while sync is active.'
            };
        }

        // 7D. Delete / Unlock Project
        if (q.includes('delete') || q.includes('disabled') || q.includes('lock') || q.includes('unlock') || q.includes('purge')) {
            return {
                landmark: 'Projects Table > Actions Column > "Unlock" (Gold Lock Icon)',
                steps: [
                    'Find the target capstone row in the <strong>All Projects</strong> table.',
                    'Notice that the red Delete button is initially hidden or disabled to prevent accidental catalog loss.',
                    'Click the gold <strong>"Unlock"</strong> (lock-shaped) button in the row’s action buttons.',
                    'Confirm the catalog security verification modal.',
                    'The red <strong>"Delete"</strong> button will now become active and clickable for that row.'
                ],
                precaution: 'Permanent deletion wipes the record from both Firestore and Pinecone vector search. This action cannot be undone.'
            };
        }

        // 7E. Edit Existing Project
        if (q.includes('edit') || q.includes('modify') || q.includes('update') || q.includes('change title') || q.includes('replace photo')) {
            return {
                landmark: 'Projects Section > All Projects Table > "Edit Record" (Pencil Icon in Actions Column)',
                steps: [
                    'Navigate to <strong>Projects</strong> in the left sidebar rail.',
                    'Locate the thesis in the catalog using the search box or program filter pills.',
                    'Click the gold <strong>Pencil icon</strong> (Edit) in the row\'s Actions column.',
                    'In the Edit Capstone Project modal, update title, authors, academic program, abstract, keywords, or physical shelf location note (Rack, Row, Stand, Color).',
                    'To update representation images, drag and drop new photos into Section 04.',
                    'Click <strong>"Update Capstone Project"</strong>. Changes will immediately update Firestore and queue Pinecone AI embeddings for automatic re-indexing.'
                ],
                precaution: 'Modifying the title or abstract alters the vector embedding representation; verify data accuracy before updating.'
            };
        }

        // 7F. Troubleshooting Missing Theses
        if (q.includes('troubleshoot') || q.includes('search not working') || q.includes('not showing') || q.includes('can\'t find') || q.includes('unsynced')) {
            return {
                landmark: 'Projects Section > Filter Pills > "🔴 Unsynced" Pill (#filter-unsynced)',
                steps: [
                    'Navigate to <strong>Projects</strong> in the left sidebar rail.',
                    'Check for Unsynced Status: Click the <strong>"🔴 Unsynced"</strong> filter pill above the table. If the project appears here, its vector embedding has not been indexed in Pinecone.',
                    'Check Approval Status: Go to <strong>"Approvals"</strong> in the sidebar rail. If drafted by a librarian, it must be evaluated and approved before entering the public index.',
                    'Trigger Pinecone Sync: In Projects, click the amber <strong>"Sync Pinecone"</strong> button (#sync-pinecone-btn) in the header action bar.',
                    'Verify Green Dot: Once sync finishes, verify that the green dot ( 🟢 ) appears beside the thesis title.'
                ],
                precaution: 'The student AI chatbot and semantic RAG search only retrieve theses with active Pinecone embeddings and "Published" status.'
            };
        }

        // 7G. Browse / Search Projects
        if (q.includes('exist') || q.includes('browse') || q.includes('see project') || q.includes('view project') || q.includes('filter project') || q.includes('find project') || q.includes('project') || q.includes('thesis') || q.includes('catalog')) {
            return {
                landmark: 'Sidebar Rail > "Projects" (2nd Tab from Top, Document Icon) > All Projects Section',
                steps: [
                    'Click <strong>"Projects"</strong> in the left sidebar rail (2nd item from the top with the document icon).',
                    'The <strong>All Projects</strong> section (#section-projects) will open with the complete institutional catalog.',
                    '<strong>Filter by Program:</strong> Click any one-click Filter Pill above the table (e.g., <code>All Projects</code>, <code>BSIT</code>, <code>BSFi</code>, <code>BSHM</code>, <code>BSIE</code>, <code>Recent (30 days)</code>, or <code>🔴 Unsynced</code>).',
                    '<strong>Live Keyword Search:</strong> Use the search box (<code>#projects-search</code>) above the table to filter by title, author names, or keywords.',
                    '<strong>Row Actions:</strong> Each project row features action icons: <strong>View</strong> (Eye icon to preview abstract and shelf coordinates), <strong>Edit</strong> (Pencil icon), <strong>Lock/Unlock</strong> (Gold lock icon), and <strong>Delete</strong> (Trash bin icon).'
                ],
                precaution: 'Cataloged projects are live in the institutional repository. Unlock project rows before performing edits or deletions.'
            };
        }

        // 8. General Workspace Guidance
        return {
            landmark: 'Sidebar Rail & Executive Dashboard Workspace',
            steps: [
                'You can manage all repository operations using the left <strong>Sidebar Rail</strong>:',
                '<strong>Projects:</strong> Catalog theses, assign shelf locations, or sync Pinecone AI.',
                '<strong>Approvals:</strong> Evaluate submissions drafted by librarians.',
                '<strong>Users:</strong> Manage student, faculty, and librarian accounts.',
                '<strong>Analytics:</strong> Print accreditation reports and monitor research intake.',
                '<strong>Activity:</strong> Review compliance audit logs and historical changes.',
                '<strong>Settings:</strong> Toggle maintenance mode and registration.'
            ],
            precaution: 'Feel free to ask for specific step-by-step instructions (e.g., "How to sync Pinecone", "Can administrator delete a user account?", or "How to approve a project").'
        };
    }

    function formatCopilotGuidanceHTML(guidance) {
        // Construct markdown representation and normalize through dynamicCopilotNormalizer
        let md = '';
        if (guidance.landmark) {
            md += `[Area: ${guidance.landmark}]\n\n`;
        }
        if (guidance.steps && guidance.steps.length > 0) {
            guidance.steps.forEach((step, idx) => {
                md += `${idx + 1}. ${step}\n`;
            });
            md += '\n';
        }
        if (guidance.precaution) {
            md += `⚠️ Precaution: ${guidance.precaution}\n`;
        }
        return dynamicCopilotNormalizer(md, 'Local Institutional KB');
    }

    function appendCopilotMessage(sender, contentHTML, targetContainer = 'widget') {
        const messagesList = targetContainer === 'widget' 
            ? document.getElementById('copilot-widget-messages') 
            : document.getElementById('copilot-messages-list');
        if (!messagesList) return;

        const row = document.createElement('div');
        row.className = `copilot-msg-row ${sender}`;

        if (sender === 'bot') {
            const avatar = document.createElement('div');
            avatar.className = 'copilot-msg-avatar';
            avatar.innerHTML = `<img src="../assets/svgs/BotLang.svg" alt="BotLang">`;
            row.appendChild(avatar);
        }

        const bubble = document.createElement('div');
        bubble.className = 'copilot-msg-bubble';
        bubble.innerHTML = contentHTML;
        row.appendChild(bubble);

        messagesList.appendChild(row);

        const body = targetContainer === 'widget'
            ? document.getElementById('copilot-widget-body')
            : document.getElementById('copilot-chat-body');
        if (body) {
            body.scrollTop = body.scrollHeight;
            setTimeout(() => {
                body.scrollTop = body.scrollHeight;
            }, 60);
        }
    }

    function handleSendQuery(queryText, source = 'widget') {
        const text = (queryText || '').trim();
        if (!text) return;

        // Hide welcome greeting once user asks something
        const widgetWelcome = document.getElementById('copilot-widget-welcome');
        if (widgetWelcome) widgetWelcome.style.display = 'none';
        const sectionWelcome = document.getElementById('copilot-welcome-box');
        if (sectionWelcome) sectionWelcome.style.display = 'none';

        // Display user message in widget
        appendCopilotMessage('user', text, 'widget');

        // Also sync to section if open
        const sectionMessages = document.getElementById('copilot-messages-list');
        if (sectionMessages) {
            sectionMessages.style.display = 'flex';
            sectionMessages.style.flexDirection = 'column';
            appendCopilotMessage('user', text, 'section');
        }

        // Show typing indicator in widget and section
        const widgetTyping = document.getElementById('copilot-widget-typing');
        if (widgetTyping) widgetTyping.style.display = 'flex';
        const sectionTyping = document.getElementById('copilot-section-typing');
        if (sectionTyping) sectionTyping.style.display = 'flex';
        const widgetBody = document.getElementById('copilot-widget-body');
        if (widgetBody) widgetBody.scrollTop = widgetBody.scrollHeight;
        const sectionBody = document.getElementById('copilot-chat-body');
        if (sectionBody) {
            setTimeout(() => { sectionBody.scrollTop = sectionBody.scrollHeight; }, 30);
        }

        const copilotConversationHistory = window._copilotHistory = window._copilotHistory || [];

        (async () => {
            let replyHTML = '';
            let backendSucceeded = false;

            try {
                const apiBase = typeof getBackendUrl === 'function' 
                    ? getBackendUrl() 
                    : ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
                        ? 'http://localhost:3001'
                        : 'https://recap-backend-jy5b.onrender.com');

                const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                const timeoutId = setTimeout(() => {
                    if (controller) controller.abort();
                }, 25000);

                const response = await fetch(`${apiBase}/api/staff-copilot/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: text,
                        userRole: 'admin',
                        history: copilotConversationHistory.slice(-4)
                    }),
                    signal: controller ? controller.signal : undefined
                });

                if (timeoutId) clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json();
                    if (data && data.success && data.reply) {
                        backendSucceeded = true;
                        // Universal Dynamic NLP Normalizer & Ast Renderer
                        replyHTML = dynamicCopilotNormalizer(data.reply, data.provider || 'Mistral AI');
                    }
                }
            } catch (err) {
                console.warn('Backend RAG endpoint unavailable, utilizing verified local knowledge base fallback:', err.message);
            }

            // Fallback to local verified knowledge base if backend is not reachable
            if (!backendSucceeded) {
                const guidance = getAdminCopilotResponse(text);
                replyHTML = formatCopilotGuidanceHTML(guidance);
            }

            if (widgetTyping) widgetTyping.style.display = 'none';
            if (sectionTyping) sectionTyping.style.display = 'none';
            appendCopilotMessage('bot', replyHTML, 'widget');
            if (sectionMessages) {
                appendCopilotMessage('bot', replyHTML, 'section');
            }

            copilotConversationHistory.push({ role: 'user', content: text });
            copilotConversationHistory.push({ role: 'assistant', content: replyHTML.replace(/<[^>]+>/g, '') });
        })();
    }

    // Widget quick chips
    if (copilotWidgetChips && copilotWidgetChips.length > 0) {
        copilotWidgetChips.forEach(chip => {
            chip.addEventListener('click', function() {
                const prompt = this.getAttribute('data-copilot-prompt');
                if (prompt) {
                    handleSendQuery(prompt, 'widget');
                }
            });
        });
    }

    // Widget form submit
    if (copilotWidgetForm) {
        copilotWidgetForm.addEventListener('submit', function(e) {
            e.preventDefault();
            if (copilotWidgetInput) {
                const text = copilotWidgetInput.value;
                copilotWidgetInput.value = '';
                handleSendQuery(text, 'widget');
            }
        });
    }

    // Section workspace prompt pills
    if (sectionPromptPills && sectionPromptPills.length > 0) {
        sectionPromptPills.forEach(pill => {
            pill.addEventListener('click', function() {
                const prompt = this.getAttribute('data-copilot-prompt');
                if (prompt) {
                    handleSendQuery(prompt, 'section');
                }
            });
        });
    }

    // Section workspace input and send button
    if (sectionCopilotSendBtn && sectionCopilotInput) {
        sectionCopilotSendBtn.addEventListener('click', function() {
            const text = sectionCopilotInput.value;
            sectionCopilotInput.value = '';
            handleSendQuery(text, 'section');
        });
        sectionCopilotInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const text = sectionCopilotInput.value;
                sectionCopilotInput.value = '';
                handleSendQuery(text, 'section');
            }
        });
    }
});
