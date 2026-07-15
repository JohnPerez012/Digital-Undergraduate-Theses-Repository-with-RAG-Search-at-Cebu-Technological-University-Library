/**
 * Teacher Panel Main Logic
 * Handles role-based authentication and all teacher dashboard functionality
 */

document.addEventListener('DOMContentLoaded', async () => {
    // ===== Authentication & Role Check =====
    const checkTeacherAuth = async () => {
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

                    // Check if user is teacher
                    if (userType !== 'teacher') {
                        console.warn('User is not a teacher. Redirecting...');
                        showToast('Access denied: Teacher privileges required', '❌');
                        setTimeout(() => {
                            if (userType === 'admin') {
                                window.location.href = 'admin_page.html';
                            } else if (userType === 'librarian') {
                                window.location.href = 'library_page.html';
                            } else if (userType === 'student') {
                                window.location.href = 'student_page.html';
                            } else {
                                window.location.href = 'index.html';
                            }
                        }, 2000);
                        resolve(false);
                        return;
                    }

                    // Teacher authenticated successfully
                    sessionStorage.setItem('userId', user.uid);
                    sessionStorage.setItem('userEmail', user.email);
                    sessionStorage.setItem('userName', user.displayName || userData.fullName || 'Teacher');
                    sessionStorage.setItem('userType', 'teacher');

                    // Update teacher profile display
                    updateTeacherProfile(user, userData);
                    resolve(true);

                } catch (error) {
                    console.error('Error checking teacher role:', error);
                    showToast('Authentication error occurred', '❌');
                    setTimeout(() => window.location.href = 'index.html', 2000);
                    resolve(false);
                }
            });
        });
    };

    // Wait for authentication check
    const isTeacher = await checkTeacherAuth();
    if (!isTeacher) return;

    // ===== DOM Elements =====
    const sidebar = document.getElementById('teacher-sidebar');
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const navItems = document.querySelectorAll('.nav-item');
    const contentSections = document.querySelectorAll('.content-section');
    const pageTitle = document.getElementById('page-title');
    const logoutBtn = document.getElementById('teacher-logout-btn');
    const backToHomeBtn = document.getElementById('back-to-home-btn');
    const themeToggleBtn = document.getElementById('theme-toggle-teacher');

    // ===== Update Teacher Profile =====
    function updateTeacherProfile(user, userData) {
        const teacherNameEl = document.getElementById('teacher-name');
        const teacherProfileImg = document.getElementById('teacher-profile-img');

        if (teacherNameEl) {
            teacherNameEl.textContent = user.displayName || userData.fullName || 'Teacher';
        }

        if (teacherProfileImg && user.photoURL) {
            teacherProfileImg.src = user.photoURL;
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
                'students': 'My Students',
                'classes': 'My Classes',
                'submissions': 'Project Submissions',
                'analytics': 'Analytics & Reports'
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
            case 'students':
                await loadStudentsData();
                break;
            case 'classes':
                await loadClassesData();
                break;
            case 'submissions':
                await loadSubmissionsData();
                break;
            case 'analytics':
                await loadAnalyticsData();
                break;
        }
    }

    // ===== Dashboard Data =====
    async function loadDashboardData() {
        try {
            const currentUserId = auth.currentUser.uid;
            
            // Load all students
            const studentsSnapshot = await db.collection('users')
                .where('userType', '==', 'student')
                .get();
            
            // Load all projects
            const projectsSnapshot = await db.collection('projects').get();
            
            // Calculate stats
            const totalStudents = studentsSnapshot.size;
            const totalProjects = projectsSnapshot.size;
            
            document.getElementById('total-students-stat').textContent = totalStudents;
            document.getElementById('total-projects-stat').textContent = totalProjects;
            document.getElementById('total-classes-stat').textContent = '0'; // TODO: Implement classes
            document.getElementById('pending-submissions-stat').textContent = '0'; // TODO: Implement submissions

            // Load recent projects
            const recentProjectsList = document.getElementById('recent-projects-list');
            recentProjectsList.innerHTML = '';

            const recentProjects = projectsSnapshot.docs
                .map(doc => ({id: doc.id, ...doc.data()}))
                .sort((a, b) => {
                    const dateA = getTimestamp(a.createdAt);
                    const dateB = getTimestamp(b.createdAt);
                    return dateB - dateA;
                })
                .slice(0, 5);

            if (recentProjects.length === 0) {
                recentProjectsList.innerHTML = '<p class="empty-state">No projects yet</p>';
            } else {
                recentProjects.forEach(data => {
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

            // Load recent students
            const recentStudentsList = document.getElementById('recent-students-list');
            recentStudentsList.innerHTML = '';

            const recentStudents = studentsSnapshot.docs
                .map(doc => ({id: doc.id, ...doc.data()}))
                .sort((a, b) => {
                    const dateA = getTimestamp(a.createdAt);
                    const dateB = getTimestamp(b.createdAt);
                    return dateB - dateA;
                })
                .slice(0, 5);

            if (recentStudents.length === 0) {
                recentStudentsList.innerHTML = '<p class="empty-state">No students yet</p>';
            } else {
                recentStudents.forEach(data => {
                    const item = document.createElement('div');
                    item.className = 'recent-item';
                    item.innerHTML = `
                        <div class="recent-item-title">${escapeHtml(data.fullName || 'Unknown')}</div>
                        <div class="recent-item-meta">
                            ${data.program || 'N/A'} · Joined ${formatDate(data.createdAt)}
                        </div>
                    `;
                    recentStudentsList.appendChild(item);
                });
            }

        } catch (error) {
            console.error('Error loading dashboard data:', error);
            showToast('Error loading dashboard data', '❌');
        }
    }

    // ===== Projects Data =====
    async function loadProjectsData() {
        const tbody = document.getElementById('projects-table-body');
        tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Loading projects...</td></tr>';
        
        try {
            const projectsSnapshot = await db.collection('projects')
                .orderBy('createdAt', 'desc')
                .get();

            tbody.innerHTML = '';

            if (projectsSnapshot.empty) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No projects found</td></tr>';
                return;
            }

            projectsSnapshot.forEach(doc => {
                const data = doc.data();
                const status = data.status || 'draft';
                const statusBadge = {
                    'draft': 'badge-draft',
                    'pending': 'badge-pending',
                    'approved': 'badge-approved',
                    'rejected': 'badge-rejected'
                }[status] || 'badge-draft';
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>${escapeHtml(data.title || 'Untitled')}</strong></td>
                    <td>${escapeHtml((data.authors || []).join(', ') || 'N/A')}</td>
                    <td><span class="badge badge-info">${escapeHtml(data.program || 'N/A')}</span></td>
                    <td>${escapeHtml(data.year || 'N/A')}</td>
                    <td><span class="badge ${statusBadge}">${status.toUpperCase()}</span></td>
                    <td>
                        <div class="table-actions">
                            <button class="action-btn action-view" onclick="viewProject('${doc.id}')" title="View details">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                View
                            </button>
                            <button class="action-btn action-edit" onclick="reviewProject('${doc.id}')" title="Review project">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                Review
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });

        } catch (error) {
            console.error('Error loading projects:', error);
            tbody.innerHTML = '<tr><td colspan="6" class="table-error">⚠️ Error loading projects</td></tr>';
            showToast('Error loading projects', '❌');
        }
    }

    // ===== Students Data =====
    async function loadStudentsData() {
        const tbody = document.getElementById('students-table-body');
        tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Loading students...</td></tr>';
        
        try {
            const studentsSnapshot = await db.collection('users')
                .where('userType', '==', 'student')
                .get();

            tbody.innerHTML = '';

            if (studentsSnapshot.empty) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No students found</td></tr>';
                return;
            }

            studentsSnapshot.forEach(doc => {
                const data = doc.data();
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>${escapeHtml(data.fullName || 'N/A')}</strong></td>
                    <td>${escapeHtml(data.studentId || 'N/A')}</td>
                    <td><span class="badge badge-info">${escapeHtml(data.program || 'N/A')}</span></td>
                    <td>${escapeHtml(data.email || 'N/A')}</td>
                    <td>0</td>
                    <td>
                        <div class="table-actions">
                            <button class="action-btn action-view" onclick="viewStudent('${doc.id}')" title="View student">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                View
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });

        } catch (error) {
            console.error('Error loading students:', error);
            tbody.innerHTML = '<tr><td colspan="6" class="table-error">⚠️ Error loading students</td></tr>';
            showToast('Error loading students', '❌');
        }
    }

    // ===== Classes Data =====
    async function loadClassesData() {
        const grid = document.getElementById('classes-grid');
        grid.innerHTML = '<div class="loading-spinner">Loading classes...</div>';
        
        try {
            // TODO: Implement classes collection
            setTimeout(() => {
                grid.innerHTML = '<div class="empty-state">No classes yet. Click "Add Class" to create one.</div>';
            }, 500);
        } catch (error) {
            console.error('Error loading classes:', error);
            grid.innerHTML = '<div class="empty-state">Error loading classes</div>';
            showToast('Error loading classes', '❌');
        }
    }

    // ===== Submissions Data =====
    async function loadSubmissionsData() {
        const tbody = document.getElementById('submissions-table-body');
        tbody.innerHTML = '<tr><td colspan="5" class="table-loading">Loading submissions...</td></tr>';
        
        try {
            // TODO: Implement submissions collection
            setTimeout(() => {
                tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No submissions yet</td></tr>';
            }, 500);
        } catch (error) {
            console.error('Error loading submissions:', error);
            tbody.innerHTML = '<tr><td colspan="5" class="table-error">⚠️ Error loading submissions</td></tr>';
            showToast('Error loading submissions', '❌');
        }
    }

    // ===== Analytics Data =====
    async function loadAnalyticsData() {
        try {
            showToast('Analytics feature coming soon', 'ℹ️');
        } catch (error) {
            console.error('Error loading analytics:', error);
            showToast('Error loading analytics', '❌');
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
            window.location.href = 'index.html';
        }, 500);
    };

    window.reviewProject = (projectId) => {
        console.log('Review project:', projectId);
        showToast('Review functionality coming soon', 'ℹ️');
    };

    window.viewStudent = (studentId) => {
        console.log('View student:', studentId);
        showToast('Student profile view coming soon', 'ℹ️');
    };

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

    const studentsSearch = document.getElementById('students-search');
    if (studentsSearch) {
        studentsSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const tbody = document.getElementById('students-table-body');
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

    const submissionsSearch = document.getElementById('submissions-search');
    if (submissionsSearch) {
        submissionsSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const tbody = document.getElementById('submissions-table-body');
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

    // ===== Add Class Button =====
    const addClassBtn = document.getElementById('add-class-btn');
    if (addClassBtn) {
        addClassBtn.addEventListener('click', () => {
            showToast('Add class feature coming soon', 'ℹ️');
        });
    }

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
