/**
 * Librarian Dashboard Main Logic
 * Handles role-based authentication and all librarian dashboard functionality
 * IMPORTANT: Only admins can create librarian accounts
 */

document.addEventListener('DOMContentLoaded', async () => {
    // ===== Authentication & Role Check =====
    const checkLibrarianAuth = async () => {
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

                    // Check if user is librarian
                    if (userType !== 'librarian') {
                        console.warn('User is not a librarian. Redirecting...');
                        showToast('Access denied: Librarian privileges required', '❌');
                        setTimeout(() => {
                            if (userType === 'admin') {
                                window.location.href = '../pages/admin_page.html';
                            } else if (userType === 'student') {
                                window.location.href = '../pages/student_page.html';
                            } else {
                                window.location.href = '../index.html';
                            }
                        }, 2000);
                        resolve(false);
                        return;
                    }

                    // Librarian authenticated successfully
                    sessionStorage.setItem('userId', user.uid);
                    sessionStorage.setItem('userEmail', user.email);
                    sessionStorage.setItem('userName', user.displayName || 'Librarian');
                    sessionStorage.setItem('userType', 'librarian');

                    // Update librarian profile display
                    updateLibrarianProfile(user, userData);
                    resolve(true);

                } catch (error) {
                    console.error('Error checking librarian role:', error);
                    showToast('Authentication error occurred', '❌');
                    setTimeout(() => window.location.href = '../index.html', 2000);
                    resolve(false);
                }
            });
        });
    };

    // Wait for authentication check
    const isLibrarian = await checkLibrarianAuth();
    if (!isLibrarian) return;

    // ===== DOM Elements =====
    const sidebar = document.getElementById('librarian-sidebar');
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const navItems = document.querySelectorAll('.nav-item');
    const contentSections = document.querySelectorAll('.content-section');
    const pageTitle = document.getElementById('page-title');
    const logoutBtn = document.getElementById('librarian-logout-btn');
    const backToHomeBtn = document.getElementById('back-to-home-btn');
    const themeToggleBtn = document.getElementById('theme-toggle-librarian');

    // ===== Update Librarian Profile =====
    function updateLibrarianProfile(user, userData) {
        const librarianNameEl = document.getElementById('librarian-name');
        const librarianProfileImg = document.getElementById('librarian-profile-img');

        if (librarianNameEl) {
            librarianNameEl.textContent = user.displayName || userData.fullName || 'Librarian';
        }

        if (librarianProfileImg && user.photoURL) {
            librarianProfileImg.src = user.photoURL;
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
                'projects': 'Projects Archive',
                'catalog': 'Catalog Management',
                'analytics': 'Library Analytics'
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
            case 'catalog':
                await loadCatalogData();
                break;
            case 'analytics':
                await loadAnalyticsData();
                break;
        }
    }

    // ===== Dashboard Data =====
    async function loadDashboardData() {
        try {
            // Load statistics
            const projectsSnapshot = await db.collection('projects').get();
            
            const totalProjects = projectsSnapshot.size;
            const catalogedItems = projectsSnapshot.size; // Same as projects for now
            const pendingReview = 0; // TODO: Implement status filtering
            
            // Calculate this month's projects
            const now = new Date();
            const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const thisMonthProjects = projectsSnapshot.docs.filter(doc => {
                const data = doc.data();
                const createdAt = data.createdAt?.toDate();
                return createdAt && createdAt >= firstDayOfMonth;
            }).length;

            document.getElementById('total-projects-stat').textContent = totalProjects;
            document.getElementById('catalog-items-stat').textContent = catalogedItems;
            document.getElementById('pending-review-stat').textContent = pendingReview;
            document.getElementById('this-month-stat').textContent = thisMonthProjects;

            // Load recent projects
            const recentProjectsList = document.getElementById('recent-projects-list');
            recentProjectsList.innerHTML = '';

            try {
                let projects = [];
                
                try {
                    const recentProjectsSnapshot = await db.collection('projects')
                        .orderBy('createdAt', 'desc')
                        .limit(5)
                        .get();
                    projects = recentProjectsSnapshot.docs;
                } catch (orderError) {
                    console.warn('OrderBy failed, using fallback:', orderError);
                    const allProjects = await db.collection('projects').get();
                    projects = allProjects.docs.sort((a, b) => {
                        const dateA = getTimestamp(a.data().createdAt);
                        const dateB = getTimestamp(b.data().createdAt);
                        return dateB - dateA;
                    }).slice(0, 5);
                }

                if (projects.length === 0) {
                    recentProjectsList.innerHTML = '<p class="empty-state">No projects yet</p>';
                } else {
                    projects.forEach(doc => {
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
                        item.style.cursor = 'pointer';
                        item.addEventListener('click', () => {
                            // Store project data for viewing
                            sessionStorage.setItem('selectedProjectForViewDetails', JSON.stringify({
                                id: doc.id,
                                title: data.title,
                                abstract: data.abstract,
                                authors: data.authors,
                                adviser: data.adviser,
                                year: data.year,
                                program: data.program,
                                status: data.status,
                                createdAt: data.createdAt,
                                updatedAt: data.updatedAt
                            }));
                            // Set flag to show details view
                            sessionStorage.setItem('showProjectDetails', 'true');
                            // Navigate to index.html which will handle view switching
                            window.location.href = '../index.html';
                        });
                        recentProjectsList.appendChild(item);
                    });
                }
            } catch (error) {
                console.error('Error loading recent projects:', error);
                recentProjectsList.innerHTML = '<p class="error-state">⚠️ Error loading recent projects</p>';
            }

        } catch (error) {
            console.error('Error loading dashboard data:', error);
            showToast('Error loading dashboard data. Check console for details.', '❌');
        }
    }

    // ===== Projects Data =====
    async function loadProjectsData() {
        const tbody = document.getElementById('projects-table-body');
        
        try {
            let projects = [];
            
            try {
                const projectsSnapshot = await db.collection('projects')
                    .orderBy('createdAt', 'desc')
                    .get();
                projects = projectsSnapshot.docs;
            } catch (orderError) {
                console.warn('OrderBy failed, using fallback:', orderError);
                const projectsSnapshot = await db.collection('projects').get();
                projects = projectsSnapshot.docs.sort((a, b) => {
                    const dateA = getTimestamp(a.data().createdAt);
                    const dateB = getTimestamp(b.data().createdAt);
                    return dateB - dateA;
                });
            }

            tbody.innerHTML = '';

            if (projects.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No projects found</td></tr>';
                return;
            }

            projects.forEach(doc => {
                const data = doc.data();
                const status = data.status || 'approved';
                const statusClass = status === 'approved' ? 'badge-approved' : 
                                   status === 'pending' ? 'badge-pending' : 'badge-draft';
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>${escapeHtml(data.title || 'Untitled')}</strong></td>
                    <td>${escapeHtml((data.authors || []).join(', ') || 'N/A')}</td>
                    <td><span class="badge badge-info">${escapeHtml(data.program || 'N/A')}</span></td>
                    <td>${escapeHtml(data.year || 'N/A')}</td>
                    <td><span class="badge ${statusClass}">${status}</span></td>
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
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });

        } catch (error) {
            console.error('Error loading projects:', error);
            tbody.innerHTML = '<tr><td colspan="6" class="table-error">⚠️ Error loading projects. Please refresh the page.</td></tr>';
            showToast('Error loading projects. Check console for details.', '❌');
        }
    }

    // ===== Catalog Data =====
    async function loadCatalogData() {
        const catalogGrid = document.getElementById('catalog-grid');
        
        try {
            let projects = [];
            
            try {
                const projectsSnapshot = await db.collection('projects')
                    .orderBy('createdAt', 'desc')
                    .get();
                projects = projectsSnapshot.docs;
            } catch (orderError) {
                console.warn('OrderBy failed, using fallback:', orderError);
                const projectsSnapshot = await db.collection('projects').get();
                projects = projectsSnapshot.docs.sort((a, b) => {
                    const dateA = getTimestamp(a.data().createdAt);
                    const dateB = getTimestamp(b.data().createdAt);
                    return dateB - dateA;
                });
            }

            catalogGrid.innerHTML = '';

            if (projects.length === 0) {
                catalogGrid.innerHTML = '<div class="empty-state">No cataloged items yet</div>';
                return;
            }

            projects.forEach(doc => {
                const data = doc.data();
                const item = document.createElement('div');
                item.className = 'catalog-item';
                item.innerHTML = `
                    <div class="catalog-item-title">${escapeHtml(data.title || 'Untitled')}</div>
                    <div class="catalog-item-meta">
                        ${escapeHtml((data.authors || []).join(', ') || 'Unknown Author')}<br>
                        ${escapeHtml(data.program || 'N/A')} · ${escapeHtml(data.year || 'N/A')}
                    </div>
                    <div class="catalog-item-actions">
                        <button class="action-btn action-view" onclick="viewProject('${doc.id}')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            View
                        </button>
                        <button class="action-btn action-edit" onclick="editProject('${doc.id}')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            Edit
                        </button>
                    </div>
                `;
                catalogGrid.appendChild(item);
            });

        } catch (error) {
            console.error('Error loading catalog:', error);
            catalogGrid.innerHTML = '<div class="error-state">⚠️ Error loading catalog. Please refresh the page.</div>';
            showToast('Error loading catalog. Check console for details.', '❌');
        }
    }

    // ===== Analytics Data =====
    async function loadAnalyticsData() {
        try {
            const projectsSnapshot = await db.collection('projects').get();
            
            // Load popular projects
            const popularProjectsList = document.getElementById('popular-projects-list');
            popularProjectsList.innerHTML = '';

            if (projectsSnapshot.empty) {
                popularProjectsList.innerHTML = '<p class="empty-state">No data available</p>';
            } else {
                const projects = projectsSnapshot.docs.slice(0, 5);
                projects.forEach((doc, index) => {
                    const data = doc.data();
                    const item = document.createElement('div');
                    item.className = 'recent-item';
                    item.innerHTML = `
                        <div class="recent-item-title">#${index + 1} ${escapeHtml(data.title || 'Untitled')}</div>
                        <div class="recent-item-meta">${data.program || 'N/A'} · ${data.year || 'N/A'}</div>
                    `;
                    popularProjectsList.appendChild(item);
                });
            }

            // Load recent activity (placeholder)
            const recentActivityList = document.getElementById('recent-activity-list');
            recentActivityList.innerHTML = '<p class="empty-state">No recent activity</p>';

        } catch (error) {
            console.error('Error loading analytics:', error);
            showToast('Error loading analytics data', '❌');
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
            window.location.href = '../index.html';
        }, 500);
    };

    window.editProject = (projectId) => {
        console.log('Edit project:', projectId);
        showToast('Edit functionality coming soon', 'ℹ️');
        // TODO: Implement edit modal or redirect to edit page
    };

    // ===== Quick Actions =====
    const actionCards = document.querySelectorAll('.action-card');
    actionCards.forEach(card => {
        card.addEventListener('click', () => {
            const action = card.getAttribute('data-action');
            switch(action) {
                case 'catalog':
                    showToast('Add to catalog feature coming soon', 'ℹ️');
                    break;
                case 'search':
                    const projectsNav = document.querySelector('.nav-item[data-section="projects"]');
                    if (projectsNav) projectsNav.click();
                    break;
                case 'report':
                    showToast('Generate report feature coming soon', 'ℹ️');
                    break;
                case 'export':
                    showToast('Export data feature coming soon', 'ℹ️');
                    break;
            }
        });
    });

    // ===== Add Catalog Button =====
    const addCatalogBtn = document.getElementById('add-catalog-btn');
    if (addCatalogBtn) {
        addCatalogBtn.addEventListener('click', () => {
            showToast('Add to catalog feature coming soon', 'ℹ️');
        });
    }

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
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const activeSection = document.querySelector('.content-section.active');
            const searchInput = activeSection?.querySelector('input[type="text"]');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }

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

    // ===== Initial Load =====
    await loadDashboardData();
});
