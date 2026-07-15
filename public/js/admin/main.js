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

    // ===== DOM Elements =====
    const sidebar = document.getElementById('admin-sidebar');
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const navItems = document.querySelectorAll('.nav-item');
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

    // ===== Sidebar Toggle (Mobile Only) =====
    if (menuToggleBtn) {
        menuToggleBtn.addEventListener('click', () => {
            if (window.innerWidth <= 1024) {
                sidebar.classList.toggle('mobile-open');
            }
        });
    }

    // ===== Navigation =====
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.getAttribute('data-section');
            
            // Update active states
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Show corresponding section
            contentSections.forEach(content => {
                if (content.id === `section-${section}`) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });

            // Update page title
            const titles = {
                'dashboard': 'Dashboard',
                'projects': 'Projects Management',
                'users': 'User Management',
                'analytics': 'Analytics & Reports',
                'settings': 'System Settings'
            };
            pageTitle.textContent = titles[section] || 'Dashboard';

            // Close sidebar on mobile
            if (window.innerWidth <= 1024) {
                sidebar.classList.remove('mobile-open');
            }

            // Load section data
            loadSectionData(section);
        });
    });

    // ===== Logout =====
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await auth.signOut();
                sessionStorage.clear();
                localStorage.removeItem('cachedAuthState');
                showToast('Logged out successfully', '✅');
                setTimeout(() => window.location.href = 'index.html', 1000);
            } catch (error) {
                console.error('Logout error:', error);
                showToast('Error logging out', '❌');
            }
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
        // Show loading state
        document.getElementById('total-projects-stat').textContent = '...';
        document.getElementById('total-users-stat').textContent = '...';
        document.getElementById('student-users-stat').textContent = '...';
        document.getElementById('recent-activity-stat').textContent = '...';

        try {
            // Load statistics with retry mechanism
            let projectsSnapshot, usersSnapshot;
            let retryCount = 0;
            const maxRetries = 2;

            while (retryCount <= maxRetries) {
                try {
                    projectsSnapshot = await db.collection('projects').get();
                    usersSnapshot = await db.collection('users').get();
                    break; // Success, exit retry loop
                } catch (fetchError) {
                    retryCount++;
                    if (retryCount > maxRetries) {
                        throw fetchError; // Give up after retries
                    }
                    console.warn(`Retry ${retryCount}/${maxRetries} for dashboard data...`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
                }
            }

            const totalProjects = projectsSnapshot.size;
            const totalUsers = usersSnapshot.size;
            const studentUsers = usersSnapshot.docs.filter(doc => doc.data().userType === 'student').length;
            const librarianUsers = usersSnapshot.docs.filter(doc => doc.data().userType === 'librarian').length;

            document.getElementById('total-projects-stat').textContent = totalProjects;
            document.getElementById('total-users-stat').textContent = totalUsers;
            document.getElementById('student-users-stat').textContent = `${studentUsers} Students / ${librarianUsers} Librarians`;
            document.getElementById('recent-activity-stat').textContent = totalProjects + totalUsers;

            // Load recent projects - fallback if orderBy fails
            const recentProjectsList = document.getElementById('recent-projects-list');
            recentProjectsList.innerHTML = '';

            try {
                const recentProjectsSnapshot = await db.collection('projects')
                    .orderBy('createdAt', 'desc')
                    .limit(5)
                    .get();

                if (recentProjectsSnapshot.empty) {
                    recentProjectsList.innerHTML = '<p class="empty-state">No projects yet</p>';
                } else {
                    recentProjectsSnapshot.forEach(doc => {
                        const data = doc.data();
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
            } catch (orderError) {
                console.warn('OrderBy failed, using fallback method:', orderError);
                // Fallback: get all projects and sort in memory
                const allProjects = projectsSnapshot.docs
                    .map(doc => ({id: doc.id, ...doc.data()}))
                    .sort((a, b) => {
                        const dateA = getTimestamp(a.createdAt);
                        const dateB = getTimestamp(b.createdAt);
                        return dateB - dateA;
                    })
                    .slice(0, 5);

                if (allProjects.length === 0) {
                    recentProjectsList.innerHTML = '<p class="empty-state">No projects yet</p>';
                } else {
                    allProjects.forEach(data => {
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

            // Load recent users - fallback if orderBy fails
            const recentUsersList = document.getElementById('recent-users-list');
            recentUsersList.innerHTML = '';

            try {
                const recentUsersSnapshot = await db.collection('users')
                    .orderBy('createdAt', 'desc')
                    .limit(5)
                    .get();

                if (recentUsersSnapshot.empty) {
                    recentUsersList.innerHTML = '<p class="empty-state">No users yet</p>';
                } else {
                    recentUsersSnapshot.forEach(doc => {
                        const data = doc.data();
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
            } catch (orderError) {
                console.warn('OrderBy failed for users, using fallback method:', orderError);
                // Fallback: get all users and sort in memory
                const allUsers = usersSnapshot.docs
                    .map(doc => ({id: doc.id, ...doc.data()}))
                    .sort((a, b) => {
                        const dateA = getTimestamp(a.createdAt);
                        const dateB = getTimestamp(b.createdAt);
                        return dateB - dateA;
                    })
                    .slice(0, 5);

                if (allUsers.length === 0) {
                    recentUsersList.innerHTML = '<p class="empty-state">No users yet</p>';
                } else {
                    allUsers.forEach(data => {
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

        } catch (error) {
            console.error('Error loading dashboard data:', error);
            
            // Set error states for stats
            document.getElementById('total-projects-stat').textContent = 'Error';
            document.getElementById('total-users-stat').textContent = 'Error';
            document.getElementById('student-users-stat').textContent = 'Error';
            document.getElementById('recent-activity-stat').textContent = 'Error';
            
            // Detailed error messages based on error type
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
                        <p><strong>Quick fix:</strong> Check the Firestore rules documentation or contact your system administrator.</p>
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
        }
    }

    // ===== Projects Data =====
    async function loadProjectsData() {
        const tbody = document.getElementById('projects-table-body');
        tbody.innerHTML = '<tr><td colspan="6" class="table-loading"><div class="spinner"></div> Loading projects...</td></tr>';
        
        try {
            let projects = [];
            let retryCount = 0;
            const maxRetries = 2;
            
            while (retryCount <= maxRetries) {
                try {
                    // Try with orderBy first
                    try {
                        const projectsSnapshot = await db.collection('projects')
                            .orderBy('createdAt', 'desc')
                            .get();
                        projects = projectsSnapshot.docs;
                        break; // Success
                    } catch (orderError) {
                        console.warn('OrderBy failed for projects, using fallback:', orderError);
                        // Fallback: get all projects and sort in memory
                        const projectsSnapshot = await db.collection('projects').get();
                        projects = projectsSnapshot.docs.sort((a, b) => {
                            const dateA = getTimestamp(a.data().createdAt);
                            const dateB = getTimestamp(b.data().createdAt);
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
                    tbody.innerHTML = `<tr><td colspan="6" class="table-loading"><div class="spinner"></div> Retrying (${retryCount}/${maxRetries})...</td></tr>`;
                    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                }
            }

            tbody.innerHTML = '';

            if (projects.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No projects found</td></tr>';
                return;
            }

            projects.forEach(doc => {
                const data = doc.data();
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>${escapeHtml(data.title || 'Untitled')}</strong></td>
                    <td>${escapeHtml((data.authors || []).join(', ') || 'N/A')}</td>
                    <td><span class="badge badge-info">${escapeHtml(data.program || 'N/A')}</span></td>
                    <td>${escapeHtml(data.year || 'N/A')}</td>
                    <td>${formatDate(data.createdAt)}</td>
                    <td>
                        <div class="table-actions">
                            <button class="action-btn action-view" onclick="viewProject('${doc.id}')" title="View details">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                View
                            </button>
                            <button class="action-btn action-edit" onclick="editProject('${doc.id}')" title="Edit project">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                Edit
                            </button>
                            <button class="action-btn action-delete" onclick="deleteProject('${doc.id}', '${escapeHtml(data.title || 'this project').replace(/'/g, "\\'")}')" title="Delete project">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                Delete
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });

        } catch (error) {
            console.error('Error loading projects:', error);
            
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
        }
    }

    // ===== Users Data =====
    async function loadUsersData() {
        const tbody = document.getElementById('users-table-body');
        tbody.innerHTML = '<tr><td colspan="6" class="table-loading"><div class="spinner"></div> Loading users...</td></tr>';
        
        try {
            let users = [];
            let retryCount = 0;
            const maxRetries = 2;
            
            while (retryCount <= maxRetries) {
                try {
                    // Try with orderBy first
                    try {
                        const usersSnapshot = await db.collection('users')
                            .orderBy('createdAt', 'desc')
                            .get();
                        users = usersSnapshot.docs;
                        break; // Success
                    } catch (orderError) {
                        console.warn('OrderBy failed for users, using fallback:', orderError);
                        // Fallback: get all users and sort in memory
                        const usersSnapshot = await db.collection('users').get();
                        users = usersSnapshot.docs.sort((a, b) => {
                            const dateA = getTimestamp(a.data().createdAt);
                            const dateB = getTimestamp(b.data().createdAt);
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
                    tbody.innerHTML = `<tr><td colspan="6" class="table-loading"><div class="spinner"></div> Retrying (${retryCount}/${maxRetries})...</td></tr>`;
                    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                }
            }

            tbody.innerHTML = '';

            if (users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No users found</td></tr>';
                return;
            }

            users.forEach(doc => {
                const data = doc.data();
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
                            <button class="action-btn action-view" onclick="viewUser('${doc.id}')" title="View user details">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                View
                            </button>
                            ${data.userType !== 'admin' ? `
                                <button class="action-btn action-delete" onclick="deleteUser('${doc.id}', '${escapeHtml(data.fullName || data.email).replace(/'/g, "\\'")}')" title="Delete user">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    Delete
                                </button>
                            ` : '<span class="badge" style="background: #cbd5e1; color: #475569;">Protected</span>'}
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });

        } catch (error) {
            console.error('Error loading users:', error);
            
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
        }
    }

    // ===== Analytics Data =====
    async function loadAnalyticsData() {
        try {
            const projectsSnapshot = await db.collection('projects').get();
            const usersSnapshot = await db.collection('users').get();
            
            // Projects by Year Chart
            const projectsByYear = {};
            projectsSnapshot.docs.forEach(doc => {
                const year = doc.data().year || 'Unknown';
                projectsByYear[year] = (projectsByYear[year] || 0) + 1;
            });
            renderProjectsByYearChart(projectsByYear);
            
            // Projects by Program Chart
            const projectsByProgram = {};
            projectsSnapshot.docs.forEach(doc => {
                const program = doc.data().program || 'Unknown';
                projectsByProgram[program] = (projectsByProgram[program] || 0) + 1;
            });
            renderProjectsByProgramChart(projectsByProgram);
            
            // User Registration Trend
            const usersByMonth = {};
            usersSnapshot.docs.forEach(doc => {
                const createdAt = doc.data().createdAt;
                if (createdAt && createdAt.toDate) {
                    const date = createdAt.toDate();
                    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    usersByMonth[monthKey] = (usersByMonth[monthKey] || 0) + 1;
                }
            });
            renderUserRegistrationChart(usersByMonth);
            
            // Popular Projects (by most recent)
            const popularProjectsList = document.getElementById('popular-projects-list');
            popularProjectsList.innerHTML = '';

            if (projectsSnapshot.empty) {
                popularProjectsList.innerHTML = '<p class="empty-state">No data available</p>';
                return;
            }

            // Get most recent 10 projects
            const projects = projectsSnapshot.docs
                .map(doc => ({id: doc.id, ...doc.data()}))
                .sort((a, b) => {
                    const dateA = getTimestamp(a.createdAt);
                    const dateB = getTimestamp(b.createdAt);
                    return dateB - dateA;
                })
                .slice(0, 10);

            projects.forEach((data, index) => {
                const item = document.createElement('div');
                item.className = 'analytics-item';
                item.innerHTML = `
                    <div class="analytics-item-rank">#${index + 1}</div>
                    <div class="analytics-item-content">
                        <div class="analytics-item-title">${escapeHtml(data.title || 'Untitled')}</div>
                        <div class="analytics-item-meta">${data.program || 'N/A'} · ${data.year || 'N/A'}</div>
                    </div>
                `;
                popularProjectsList.appendChild(item);
            });

        } catch (error) {
            console.error('Error loading analytics:', error);
            showToast('Error loading analytics data', '❌');
        }
    }

    // Chart rendering functions using CSS-based bar charts
    function renderProjectsByYearChart(data) {
        const container = document.getElementById('projects-by-year-chart');
        container.innerHTML = '';
        
        const entries = Object.entries(data).sort((a, b) => b[0].localeCompare(a[0]));
        const maxValue = Math.max(...entries.map(e => e[1]));
        
        entries.forEach(([year, count]) => {
            const barHeight = (count / maxValue) * 100;
            const bar = document.createElement('div');
            bar.className = 'chart-bar-item';
            bar.innerHTML = `
                <div class="chart-bar-label">${year}</div>
                <div class="chart-bar-container">
                    <div class="chart-bar" style="height: ${barHeight}%; background: linear-gradient(180deg, var(--admin-primary), var(--admin-primary-dark));">
                        <span class="chart-bar-value">${count}</span>
                    </div>
                </div>
            `;
            container.appendChild(bar);
        });
    }

    function renderProjectsByProgramChart(data) {
        const container = document.getElementById('projects-by-program-chart');
        container.innerHTML = '';
        
        const colors = [
            'linear-gradient(135deg, #667eea, #764ba2)',
            'linear-gradient(135deg, #f093fb, #f5576c)',
            'linear-gradient(135deg, #4facfe, #00f2fe)',
            'linear-gradient(135deg, #43e97b, #38f9d7)',
            'linear-gradient(135deg, #fa709a, #fee140)',
        ];
        
        const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
        const total = entries.reduce((sum, e) => sum + e[1], 0);
        
        entries.forEach(([program, count], index) => {
            const percentage = ((count / total) * 100).toFixed(1);
            const bar = document.createElement('div');
            bar.className = 'chart-horizontal-bar';
            bar.innerHTML = `
                <div class="chart-h-label">${escapeHtml(program)}</div>
                <div class="chart-h-bar-container">
                    <div class="chart-h-bar" style="width: ${percentage}%; background: ${colors[index % colors.length]};">
                        <span class="chart-h-value">${count} (${percentage}%)</span>
                    </div>
                </div>
            `;
            container.appendChild(bar);
        });
    }

    function renderUserRegistrationChart(data) {
        const container = document.getElementById('user-registration-chart');
        container.innerHTML = '';
        
        const entries = Object.entries(data).sort((a, b) => a[0].localeCompare(b[0])).slice(-12); // Last 12 months
        const maxValue = Math.max(...entries.map(e => e[1]));
        
        if (entries.length === 0) {
            container.innerHTML = '<p class="chart-placeholder">No registration data available</p>';
            return;
        }
        
        entries.forEach(([month, count]) => {
            const barHeight = (count / maxValue) * 100;
            const [year, monthNum] = month.split('-');
            const monthName = new Date(year, parseInt(monthNum) - 1).toLocaleDateString('en-US', { month: 'short' });
            
            const bar = document.createElement('div');
            bar.className = 'chart-bar-item';
            bar.innerHTML = `
                <div class="chart-bar-label">${monthName}</div>
                <div class="chart-bar-container">
                    <div class="chart-bar" style="height: ${barHeight}%; background: linear-gradient(180deg, var(--admin-success), #059669);">
                        <span class="chart-bar-value">${count}</span>
                    </div>
                </div>
            `;
            container.appendChild(bar);
        });
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
    window.viewProject = (projectId) => {
        console.log('View project:', projectId);
        showToast('Opening project details...', 'ℹ️');
        setTimeout(() => {
            // Set flag to show details view
            sessionStorage.setItem('showProjectDetails', 'true');
            // Navigate to index.html which will handle the view
            window.location.href = 'index.html';
        }, 500);
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
            
            // Populate form fields
            document.getElementById('project-id-input').value = projectId;
            document.getElementById('project-title-input').value = data.title || '';
            document.getElementById('project-program-select').value = data.program || 'BSCS';
            document.getElementById('project-year-input').value = data.year || '';
            document.getElementById('project-adviser-input').value = data.adviser || '';
            document.getElementById('project-status-select').value = data.status || 'Completed';
            document.getElementById('project-abstract-input').value = data.abstract || '';
            document.getElementById('project-findings-input').value = data.keyFindings || '';

            // Populate dynamic fields
            const editAuthors = Array.isArray(data.authors) ? data.authors : (data.authors ? data.authors.split(',').map(a => a.trim()) : []);
            const editTopics = Array.isArray(data.topics) ? data.topics : [];
            const editKeywords = Array.isArray(data.keywords) ? data.keywords : [];
            initDynamicContainers({ authors: editAuthors, topics: editTopics, keywords: editKeywords });

            // Customize modal for editing
            document.getElementById('project-modal-title').textContent = 'Edit Capstone Project';
            document.getElementById('submit-project-btn').textContent = 'Apply Edit';
            
            // Show modal
            document.getElementById('project-modal').classList.add('active');
        } catch (error) {
            console.error('Error loading project for edit:', error);
            showToast('Error loading project details: ' + error.message, '❌');
        }
    };

    window.deleteProject = async (projectId, title) => {
        const confirmed = confirm(
            `⚠️ DELETE PROJECT\n\n` +
            `Are you sure you want to delete:\n"${title}"\n\n` +
            `This action cannot be undone and will permanently remove all project data.`
        );
        
        if (!confirmed) return;

        try {
            showToast('Deleting project...', 'ℹ️');
            await db.collection('projects').doc(projectId).delete();
            
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

            showToast('Project deleted successfully', '✅');
            await loadProjectsData();
            await loadDashboardData(); // Refresh stats
        } catch (error) {
            console.error('Error deleting project:', error);
            showToast('Error deleting project: ' + error.message, '❌');
        }
    };

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
            // Reset form fields
            document.getElementById('project-id-input').value = '';
            document.getElementById('project-title-input').value = '';
            document.getElementById('project-program-select').value = 'BSCS';
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
                    document.getElementById('project-program-select').value = d.program || 'BSCS';
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

    const closeProjectModal = () => {
        if (projectModal) {
            projectModal.classList.remove('active');
            if (projectForm) projectForm.reset();
            clearDynamicContainer('authors-container');
            clearDynamicContainer('topics-container');
            clearDynamicContainer('keywords-container');
            clearTimeout(autoSaveTimer);
        }
    };

    if (cancelProjectBtn) cancelProjectBtn.addEventListener('click', closeProjectModal);
    if (projectModalCloseBtn) projectModalCloseBtn.addEventListener('click', closeProjectModal);
    if (projectModalOverlay) projectModalOverlay.addEventListener('click', closeProjectModal);

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

            showToast(projectId ? 'Updating project...' : 'Creating project...', 'ℹ️');

            try {
                if (projectId) {
                    // Fetch existing data to see which fields are updated
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
                } else {
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
                }

                closeProjectModal();
                await loadProjectsData();
                await loadDashboardData();
            } catch (error) {
                console.error('Error saving project:', error);
                showToast('Error saving project: ' + error.message, '❌');
            }
        });
    }

    // ===== Filter Pills Functionality =====
    const projectFilters = document.querySelectorAll('#project-filters .filter-pill');
    projectFilters.forEach(pill => {
        pill.addEventListener('click', () => {
            // Update active state
            projectFilters.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            
            const filter = pill.dataset.filter;
            const tbody = document.getElementById('projects-table-body');
            const rows = tbody.getElementsByTagName('tr');
            
            Array.from(rows).forEach(row => {
                if (filter === 'all') {
                    row.style.display = '';
                } else if (filter === 'recent') {
                    // Show projects from last 30 days
                    const dateCell = row.cells[4];
                    if (dateCell) {
                        const dateText = dateCell.textContent;
                        const projectDate = new Date(dateText);
                        const thirtyDaysAgo = new Date();
                        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                        row.style.display = projectDate >= thirtyDaysAgo ? '' : 'none';
                    }
                } else {
                    const programCell = row.cells[2];
                    if (programCell) {
                        const programText = programCell.textContent.toLowerCase();
                        row.style.display = programText.includes(filter) ? '' : 'none';
                    }
                }
            });
            
            showToast(`Filtered: ${pill.textContent}`, 'ℹ️');
        });
    });

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
            if (window.innerWidth <= 1024) {
                sidebar.classList.remove('mobile-open');
            }
        }
    });

    // ===== Click outside to close sidebar on mobile =====
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 1024) {
            if (!sidebar.contains(e.target) && !menuToggleBtn.contains(e.target)) {
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
        });
    }

    // Close modal function
    function closeLibrarianModal() {
        createLibrarianModal.classList.remove('active');
        document.body.style.overflow = ''; // Restore scroll
        createLibrarianForm.reset();
    }

    // Close modal events
    if (modalOverlay) {
        modalOverlay.addEventListener('click', closeLibrarianModal);
    }

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeLibrarianModal);
    }

    if (cancelLibrarianBtn) {
        cancelLibrarianBtn.addEventListener('click', closeLibrarianModal);
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
            submitBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                Creating...
            `;

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
