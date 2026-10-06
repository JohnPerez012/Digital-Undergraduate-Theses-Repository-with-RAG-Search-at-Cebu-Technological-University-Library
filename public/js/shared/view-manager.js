(function() {
    function initViewManagerSystem() {
    /**
     * Unified Project Bookmark / Save Service for RE-CAPS
     * Supports guest mode (local storage) and authenticated users (Firestore).
     * Enforces administrator restrictions.
     */
    const ProjectBookmarkService = {
        isAdmin() {
            return sessionStorage.getItem('userType') === 'admin';
        },

        isSaved(projectId) {
            if (!projectId || this.isAdmin()) return false;

            const currentUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
            if (!currentUser) {
                return Boolean(window.GuestSavedProjects && window.GuestSavedProjects.isSaved(projectId));
            }

            if (Array.isArray(window.savedProjectIds) && window.savedProjectIds.includes(projectId)) {
                return true;
            }

            try {
                const savedList = JSON.parse(localStorage.getItem('savedProjects')) || [];
                if (savedList.some(p => (p.id || p.UIDproject) === projectId)) {
                    return true;
                }
            } catch (e) {}

            if (window.GuestSavedProjects && window.GuestSavedProjects.isSaved(projectId)) {
                return true;
            }

            return false;
        },

        async toggleSave(project) {
            if (!project) return false;
            if (this.isAdmin()) {
                if (typeof showToast === 'function') {
                    showToast('Administrators are restricted from saving projects.', 'warning');
                }
                return false;
            }

            const projectId = project.id || project.UIDproject;
            if (!projectId) return false;

            const isCurrentlySaved = this.isSaved(projectId);
            const currentUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;

            // 1. Guest mode (device-only storage + community counter update)
            if (!currentUser) {
                if (isCurrentlySaved) {
                    if (window.GuestSavedProjects) {
                        window.GuestSavedProjects.remove(projectId);
                    }
                    if (Array.isArray(window.savedProjectIds)) {
                        window.savedProjectIds = window.savedProjectIds.filter(id => id !== projectId);
                    }
                    const updatedCount = Math.max(0, (Number(project.saveCount) || 1) - 1);
                    project.saveCount = updatedCount;

                    // Sync counter to Firestore (allowed by rule for saveCount)
                    if (typeof db !== 'undefined' && db.collection) {
                        try {
                            db.collection('projects').doc(projectId).set({
                                saveCount: firebase.firestore.FieldValue.increment(-1)
                            }, { merge: true }).catch(err => console.warn('[RE-CAPS] Guest saveCount decrement warning:', err));
                        } catch (e) {}
                    }

                    if (typeof showToast === 'function') {
                        showToast('Project removed from this device', 'info');
                    }
                    window.dispatchEvent(new CustomEvent('projectSavedStateChanged', {
                        detail: { projectId, isSaved: false, saveCount: updatedCount }
                    }));
                    return false;
                } else {
                    if (window.GuestSavedProjects) {
                        window.GuestSavedProjects.save(project);
                    }
                    if (Array.isArray(window.savedProjectIds)) {
                        if (!window.savedProjectIds.includes(projectId)) {
                            window.savedProjectIds.push(projectId);
                        }
                    }
                    const updatedCount = (Number(project.saveCount) || 0) + 1;
                    project.saveCount = updatedCount;

                    // Sync counter to Firestore (allowed by rule for saveCount)
                    if (typeof db !== 'undefined' && db.collection) {
                        try {
                            db.collection('projects').doc(projectId).set({
                                saveCount: firebase.firestore.FieldValue.increment(1)
                            }, { merge: true }).catch(err => console.warn('[RE-CAPS] Guest saveCount increment warning:', err));
                        } catch (e) {}
                    }

                    if (typeof showToast === 'function') {
                        showToast('Project saved locally on this device. Sign in to sync to your account.', 'success');
                    }
                    window.dispatchEvent(new CustomEvent('projectSavedStateChanged', {
                        detail: { projectId, isSaved: true, saveCount: updatedCount }
                    }));
                    return true;
                }
            }

            // 2. Authenticated user mode (Firebase Firestore)
            try {
                if (typeof db === 'undefined') {
                    throw new Error('Database is not initialized');
                }

                const docRef = db.collection('usersSavedProjects').doc(currentUser.uid);
                const projectRef = db.collection('projects').doc(projectId);

                if (isCurrentlySaved) {
                    // Remove from Firestore
                    await docRef.set({
                        UIDproject: firebase.firestore.FieldValue.arrayRemove(projectId)
                    }, { merge: true });

                    // Decrement community saveCount on project
                    try {
                        await projectRef.set({
                            saveCount: firebase.firestore.FieldValue.increment(-1)
                        }, { merge: true });
                    } catch (e) {
                        console.warn('[RE-CAPS] Project saveCount decrement non-critical warning:', e);
                    }

                    // Update memory state
                    if (Array.isArray(window.savedProjectIds)) {
                        window.savedProjectIds = window.savedProjectIds.filter(id => id !== projectId);
                    }

                    // Update localStorage 'savedProjects'
                    try {
                        let savedList = JSON.parse(localStorage.getItem('savedProjects')) || [];
                        savedList = savedList.filter(p => (p.id || p.UIDproject) !== projectId);
                        localStorage.setItem('savedProjects', JSON.stringify(savedList));
                    } catch (e) {}

                    // Log activity
                    if (window.ActivityService && typeof window.ActivityService.logBookmark === 'function') {
                        window.ActivityService.logBookmark(projectId, project.title || 'Capstone Project', 'removed');
                    }

                    if (typeof showToast === 'function') {
                        showToast('Project removed from saved projects', 'info');
                    }

                    const updatedCount = Math.max(0, (Number(project.saveCount) || 1) - 1);
                    project.saveCount = updatedCount;

                    window.dispatchEvent(new CustomEvent('projectSavedStateChanged', {
                        detail: { projectId, isSaved: false, saveCount: updatedCount }
                    }));
                    return false;
                } else {
                    // Add to Firestore
                    await docRef.set({
                        UIDproject: firebase.firestore.FieldValue.arrayUnion(projectId)
                    }, { merge: true });

                    // Increment community saveCount on project
                    try {
                        await projectRef.set({
                            saveCount: firebase.firestore.FieldValue.increment(1)
                        }, { merge: true });
                    } catch (e) {
                        console.warn('[RE-CAPS] Project saveCount increment non-critical warning:', e);
                    }

                    // Update memory state
                    if (Array.isArray(window.savedProjectIds)) {
                        if (!window.savedProjectIds.includes(projectId)) {
                            window.savedProjectIds.push(projectId);
                        }
                    }

                    // Update localStorage 'savedProjects'
                    try {
                        let savedList = JSON.parse(localStorage.getItem('savedProjects')) || [];
                        if (!savedList.some(p => (p.id || p.UIDproject) === projectId)) {
                            savedList.push({
                                id: projectId,
                                title: project.title,
                                year: project.year,
                                program: project.program,
                                rawData: project
                            });
                            localStorage.setItem('savedProjects', JSON.stringify(savedList));
                        }
                    } catch (e) {}

                    // Log activity
                    if (window.ActivityService && typeof window.ActivityService.logBookmark === 'function') {
                        window.ActivityService.logBookmark(projectId, project.title || 'Capstone Project', 'saved');
                    }

                    if (typeof showToast === 'function') {
                        showToast('Project saved to your account', 'success');
                    }

                    const updatedCount = (Number(project.saveCount) || 0) + 1;
                    project.saveCount = updatedCount;

                    window.dispatchEvent(new CustomEvent('projectSavedStateChanged', {
                        detail: { projectId, isSaved: true, saveCount: updatedCount }
                    }));
                    return true;
                }
            } catch (error) {
                console.error('Error toggling project bookmark in Firestore:', error);
                if (typeof showToast === 'function') {
                    showToast('Unable to update saved project. Please try again.', 'error');
                }
                return isCurrentlySaved;
            }
        }
    };
    window.ProjectBookmarkService = ProjectBookmarkService;

    // View controller for managing different views
    const ViewManager = {
        init() {
            this.setupNavigation();
            this.setupProjectSelection();
            this.initializeChatbot();
            this.setupCustomEventListener();
            this.setupSavedProjectsListeners();
            this.syncSavedNavVisibility();
            this.updateSecondaryNavSavedCount();
        },

        setupNavigation() {
            // Update secondary header navigation
            const navItems = document.querySelectorAll('.secondary-header .nav-item');
            navItems.forEach(item => {
                // Remove any existing listeners by cloning
                const newItem = item.cloneNode(true);
                item.parentNode.replaceChild(newItem, item);

                newItem.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    const page = newItem.dataset.page;

                    // Don't switch if already on this view
                    const currentView = document.querySelector('.view-mode-container.active');
                    const isAlreadyActive = currentView && (
                        (page === 'index' && currentView.id === 'home-view') ||
                        (page === 'project-detail' && currentView.id === 'details-view') ||
                        (page === 'ai-chatbot' && currentView.id === 'chatbot-view')
                    );
                    if (isAlreadyActive) {
                        return;
                    }

                    this.switchView(page);
                }, { capture: true });
            });

            // Back to search button in details view
            const backBtn = document.getElementById('back-to-search');
            if (backBtn) {
                backBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.previousView === 'ai-chatbot') {
                        this.switchView('ai-chatbot');
                    } else {
                        this.switchView('index');
                    }
                });
            }

            // Logo click navigation to home
            document.addEventListener('click', (e) => {
                const logoBtn = e.target.closest('.logo-container');
                if (logoBtn) {
                    const currentView = document.querySelector('.view-mode-container.active');
                    if (currentView && currentView.id !== 'home-view') {
                        e.preventDefault();
                        this.switchView('index');
                    } else if (window.scrollY > 0) {
                        e.preventDefault();
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                }
            });

            // Profile Dropdown Saved Projects item (for logged-in user: opens their dashboard's Saved Projects tab)
            const pdSavedRow = document.getElementById('pd-saved-row');
            if (pdSavedRow && !pdSavedRow.dataset.vmBound) {
                pdSavedRow.dataset.vmBound = 'true';
                pdSavedRow.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const dropPanel = document.getElementById('profile-dropdown-panel');
                    const trigger = document.getElementById('profile-img-trigger');
                    if (dropPanel) dropPanel.classList.remove('open');
                    if (trigger) trigger.setAttribute('aria-expanded', 'false');

                    let userType = sessionStorage.getItem('userType');
                    if (!userType && window.AuthService) {
                        userType = await AuthService.getUserType();
                    }
                    const isSubpage = window.location.pathname.includes('/pages/');
                    let targetUrl = '';
                    if (userType === 'student') {
                        targetUrl = isSubpage ? 'student_page.html#saved' : 'pages/student_page.html#saved';
                    } else if (userType === 'teacher') {
                        targetUrl = isSubpage ? 'teacher_page.html#saved' : 'pages/teacher_page.html#saved';
                    } else if (userType === 'librarian') {
                        targetUrl = isSubpage ? 'librarian_page.html#saved' : 'pages/librarian_page.html#saved';
                    } else {
                        targetUrl = isSubpage ? 'student_page.html#saved' : 'pages/student_page.html#saved';
                    }
                    window.location.href = targetUrl;
                });
            }
        },

        syncSavedNavVisibility(user) {
            const currentUser = user || ((typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null);
            const isAuth = Boolean(currentUser || localStorage.getItem('cachedAuthState') === 'true');
            const isAdmin = ProjectBookmarkService.isAdmin();
            const navSaved = document.getElementById('nav-saved-projects');
            const pdSaved = document.getElementById('pd-saved-row');
            const pdDivider = document.getElementById('pd-saved-divider');

            if (isAuth) {
                // LOGGED-IN: Minimize secondary header by hiding Saved Projects action from secondary nav
                if (navSaved) navSaved.style.display = 'none';
                // Show Saved Projects in profile dropdown if not admin
                if (pdSaved) pdSaved.style.display = isAdmin ? 'none' : 'flex';
                if (pdDivider) pdDivider.style.display = isAdmin ? 'none' : 'block';
            } else {
                // ANONYMOUS / GUEST: Show Saved Projects in secondary header
                if (navSaved) navSaved.style.display = 'inline-flex';
                if (pdSaved) pdSaved.style.display = 'none';
                if (pdDivider) pdDivider.style.display = 'none';
            }
        },

        setupProjectSelection() {
            // Check if we should show chatbot, saved projects, or project details on page load
            const currentPath = window.location.pathname;
            const isHomePage = currentPath.endsWith('index.html') || currentPath.endsWith('/') || currentPath === '';

            if (isHomePage) {
                const shouldShowChatbot = sessionStorage.getItem('showChatbotView') === 'true' || 
                                          new URLSearchParams(window.location.search).get('view') === 'chatbot' ||
                                          window.location.hash === '#chatbot';
                if (shouldShowChatbot) {
                    sessionStorage.removeItem('showChatbotView');
                    setTimeout(() => {
                        this.switchView('ai-chatbot');
                    }, 100);
                    return;
                }

                const shouldShowSaved = sessionStorage.getItem('showSavedProjectsView') === 'true' ||
                                        new URLSearchParams(window.location.search).get('view') === 'saved' ||
                                        window.location.hash === '#saved';
                if (shouldShowSaved) {
                    sessionStorage.removeItem('showSavedProjectsView');
                    setTimeout(() => {
                        this.switchView('saved-projects');
                    }, 100);
                    return;
                }

                const projectDataJson = sessionStorage.getItem('selectedProjectForViewDetails');
                if (projectDataJson) {
                    const shouldShowDetails = sessionStorage.getItem('showProjectDetails');
                    if (shouldShowDetails === 'true') {
                        sessionStorage.removeItem('showProjectDetails');
                        setTimeout(() => {
                            this.switchView('project-detail');
                        }, 100);
                    }
                }
            }
        },

        setupCustomEventListener() {
            // Listen for custom switchView events from other scripts
            window.addEventListener('switchView', (e) => {
                if (e.detail && e.detail.view) {
                    this.switchView(e.detail.view);
                }
            });
        },

        switchView(viewName) {
            console.log('Switching to view:', viewName);

            const views = {
                'index': document.getElementById('home-view'),
                'project-detail': document.getElementById('details-view'),
                'ai-chatbot': document.getElementById('chatbot-view')
            };

            // Get current active view before switching
            const currentActiveView = document.querySelector('.view-mode-container.active');
            let fromViewId = null;

            if (currentActiveView) {
                const currentId = currentActiveView.id;
                if (currentId === 'home-view') fromViewId = 'index';
                else if (currentId === 'details-view') fromViewId = 'project-detail';
                else if (currentId === 'chatbot-view') fromViewId = 'ai-chatbot';
            }

            // Check if already on this view
            if (currentActiveView && currentActiveView === views[viewName]) {
                console.log('Already on this view, skipping');
                return;
            }

            // Store previous view
            if (fromViewId) {
                this.previousView = fromViewId;
            }

            // Notify ScrollStateManager about view switch
            if (typeof ScrollStateManager !== 'undefined') {
                ScrollStateManager.handleViewSwitch(fromViewId, viewName);
            }

            // Hide all views
            Object.values(views).forEach(view => {
                if (view) view.classList.remove('active');
            });

            // Show selected view
            if (views[viewName]) {
                views[viewName].classList.add('active');

                // Activate chatbot fullpage class when switching to chatbot
                if (viewName === 'ai-chatbot') {
                    const chatbotFullpage = document.querySelector('.chatbot-fullpage');
                    if (chatbotFullpage) {
                        chatbotFullpage.classList.add('active');
                    }
                    if (typeof Chatbot !== 'undefined' && typeof Chatbot.checkLoginAndShowGuest === 'function') {
                        Chatbot.checkLoginAndShowGuest();
                    }
                } else {
                    const chatbotFullpage = document.querySelector('.chatbot-fullpage');
                    if (chatbotFullpage) {
                        chatbotFullpage.classList.remove('active');
                    }
                    if (typeof Chatbot !== 'undefined' && Chatbot.guestDialog) {
                        Chatbot.guestDialog.classList.remove('active');
                    }
                }

                // Trigger saved projects rendering if switching to saved-projects
                if (viewName === 'saved-projects') {
                    this.renderSavedProjectsView();
                }

                // Trigger project details rendering if switching to details
                if (viewName === 'project-detail') {
                    const projectDataJson = sessionStorage.getItem('selectedProjectForViewDetails');
                    if (projectDataJson && typeof renderProjectDetails === 'function') {
                        try {
                            const project = JSON.parse(projectDataJson);
                            renderProjectDetails(project);
                        } catch (error) {
                            console.error('Invalid project data:', error);
                            this.switchView('index');
                        }
                    }
                }
            }

            // Update navigation active state - disable current, enable others
            const navItems = document.querySelectorAll('.secondary-header .nav-item');
            navItems.forEach(item => {
                const isActive = item.dataset.page === viewName;

                if (isActive) {
                    item.classList.add('active', 'nav-item-disabled');
                } else {
                    item.classList.remove('active', 'nav-item-disabled');
                }
            });

            // ALWAYS show project detail nav item if there's project data in sessionStorage
            const projectDetailNav = document.querySelector('.nav-item[data-page="project-detail"]');
            const projectData = sessionStorage.getItem('selectedProjectForViewDetails');
            if (projectDetailNav) {
                if (projectData) {
                    projectDetailNav.style.display = '';
                } else {
                    projectDetailNav.style.display = 'none';
                }
            }
        },

        initializeChatbot() {
            // Initialize chatbot when DOM is ready
            if (typeof Chatbot !== 'undefined' && Chatbot.init) {
                Chatbot.init();
            }
        },

        getSavedProjectsList() {
            if (ProjectBookmarkService.isAdmin()) return [];

            const currentUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;

            // 1. If guest, read from GuestSavedProjects
            if (!currentUser && window.GuestSavedProjects) {
                const guestList = window.GuestSavedProjects.getAll();
                const master = (window.ProjectList && typeof window.ProjectList.getMasterProjects === 'function')
                    ? window.ProjectList.getMasterProjects()
                    : [];

                return guestList.map(item => {
                    const id = typeof item === 'string' ? item : item.id;
                    const found = master.find(p => p.id === id);
                    if (found) {
                        return {
                            id: found.id,
                            title: found.title,
                            authors: found.authors,
                            program: found.program,
                            year: found.year,
                            abstract: found.abstract,
                            saveCount: found.saveCount,
                            rawData: found
                        };
                    }
                    return typeof item === 'object' ? item : { id: item, title: 'Capstone Project' };
                });
            }

            // 2. If authenticated user, read from localStorage['savedProjects'] and window.savedProjectIds
            let savedList = [];
            try {
                savedList = JSON.parse(localStorage.getItem('savedProjects')) || [];
            } catch (e) {}

            const ids = Array.isArray(window.savedProjectIds) ? window.savedProjectIds : [];
            const master = (window.ProjectList && typeof window.ProjectList.getMasterProjects === 'function')
                ? window.ProjectList.getMasterProjects()
                : [];

            // If we have savedProjectIds not in savedList, merge from master
            ids.forEach(id => {
                if (!savedList.some(p => (p.id || p.UIDproject) === id)) {
                    const found = master.find(p => p.id === id);
                    if (found) {
                        savedList.push({
                            id: found.id,
                            title: found.title,
                            authors: found.authors,
                            program: found.program,
                            year: found.year,
                            abstract: found.abstract,
                            saveCount: found.saveCount,
                            rawData: found
                        });
                    } else {
                        savedList.push({ id, title: 'Capstone Project' });
                    }
                }
            });

            return savedList;
        },

        getSavedProjectsCount() {
            if (ProjectBookmarkService.isAdmin()) return 0;
            const currentUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
            if (!currentUser && window.GuestSavedProjects) {
                return window.GuestSavedProjects.getIds().length;
            }
            if (Array.isArray(window.savedProjectIds)) {
                return window.savedProjectIds.length;
            }
            return this.getSavedProjectsList().length;
        },

        updateSecondaryNavSavedCount() {
            const count = this.getSavedProjectsCount();
            
            // Secondary header badge (shown when guest / logged out)
            const secBadge = document.getElementById('secondary-saved-count');
            if (secBadge) {
                if (count > 0) {
                    secBadge.textContent = count;
                    secBadge.style.display = 'inline-flex';
                    secBadge.classList.remove('badge-bounce');
                    void secBadge.offsetWidth; // trigger reflow
                    secBadge.classList.add('badge-bounce');
                } else {
                    secBadge.style.display = 'none';
                    secBadge.textContent = '0';
                }
            }

            // Profile dropdown badge (shown when logged in)
            const pdBadge = document.getElementById('pd-saved-count');
            if (pdBadge) {
                if (count > 0) {
                    pdBadge.textContent = count;
                    pdBadge.style.display = 'inline-flex';
                    pdBadge.classList.remove('badge-bounce');
                    void pdBadge.offsetWidth; // trigger reflow
                    pdBadge.classList.add('badge-bounce');
                } else {
                    pdBadge.style.display = 'none';
                    pdBadge.textContent = '0';
                }
            }

            // Scope filter badge on home page
            const scopeBadge = document.getElementById('scope-saved-count');
            if (scopeBadge) {
                if (count > 0) {
                    scopeBadge.textContent = count;
                    scopeBadge.style.display = 'inline-flex';
                } else {
                    scopeBadge.style.display = 'none';
                    scopeBadge.textContent = '0';
                }
            }

            // Dedicated saved view counter pill
            const viewPill = document.getElementById('saved-total-counter-pill');
            if (viewPill) {
                viewPill.textContent = `${count} ${count === 1 ? 'saved' : 'saved'}`;
            }

            // Clear all button visibility
            const clearBtn = document.getElementById('saved-clear-all-btn');
            if (clearBtn) {
                clearBtn.style.display = count > 0 ? 'inline-flex' : 'none';
            }
        },

        setupSavedProjectsListeners() {
            window.addEventListener('projectSavedStateChanged', () => {
                this.updateSecondaryNavSavedCount();
            });

            window.addEventListener('guestSavedProjectsChanged', () => {
                this.updateSecondaryNavSavedCount();
            });

            if (typeof firebase !== 'undefined' && firebase.auth) {
                firebase.auth().onAuthStateChanged((user) => {
                    this.syncSavedNavVisibility(user);
                    this.updateSecondaryNavSavedCount();
                });
            }
        }
    };

    // Initialize view manager
    ViewManager.init();

    // Expose ViewManager globally for other scripts
    window.ViewManager = ViewManager;

    // INITIALIZE DEFAULT STATE ON PAGE LOAD
    const homeView = document.getElementById('home-view');
    const detailsView = document.getElementById('details-view');
    const chatbotView = document.getElementById('chatbot-view');
    const savedProjectsView = document.getElementById('saved-projects-view');

    // Check if we should show a specific view based on sessionStorage
    const shouldShowDetails = sessionStorage.getItem('showProjectDetails');
    const projectData = sessionStorage.getItem('selectedProjectForViewDetails');
    const shouldShowChatbot = sessionStorage.getItem('showChatbotView') === 'true' || 
                              new URLSearchParams(window.location.search).get('view') === 'chatbot' ||
                              window.location.hash === '#chatbot';
    const shouldShowSaved = sessionStorage.getItem('showSavedProjectsView') === 'true' ||
                            new URLSearchParams(window.location.search).get('view') === 'saved' ||
                            window.location.hash === '#saved';

    if (shouldShowChatbot) {
        sessionStorage.removeItem('showChatbotView');
        ViewManager.switchView('ai-chatbot');
    } else if (shouldShowSaved) {
        sessionStorage.removeItem('showSavedProjectsView');
        if (window.ProjectList && typeof window.ProjectList.applyScopeFilter === 'function') {
            window.ProjectList.applyScopeFilter('saved');
        }
    } else if (shouldShowDetails === 'true' && projectData) {
        // Coming from another page to view project details
        sessionStorage.removeItem('showProjectDetails');
        ViewManager.switchView('project-detail');
    } else {
        // Default: show home view and set home nav item as active
        if (homeView) homeView.classList.add('active');
        if (detailsView) detailsView.classList.remove('active');
        if (chatbotView) chatbotView.classList.remove('active');

        // Set home nav item as active
        const homeNavItem = document.querySelector('.nav-item[data-page="index"]');
        if (homeNavItem) {
            homeNavItem.classList.add('active', 'nav-item-disabled');
        }

        // ALWAYS show Project Detail button if there's project data in session
        const projectDetailNav = document.querySelector('.nav-item[data-page="project-detail"]');
        if (projectDetailNav && projectData) {
            projectDetailNav.style.display = '';
        } else if (projectDetailNav) {
            projectDetailNav.style.display = 'none';
        }
    }




    // Make renderProjectDetails globally available
    window.renderProjectDetails = (project) => {
        const detailsGrid = document.getElementById('details-grid');
        const detailsLeft = document.getElementById('details-left');
        const detailsSidebar = document.getElementById('details-sidebar');
        const detailsEmpty = document.getElementById('details-empty');

        if (!detailsGrid || !detailsLeft || !detailsSidebar || !detailsEmpty) return;

        function escapeHtml(text) {
            return String(text || '').replace(/[&<>"']/g, (match) => {
                const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
                return escapeMap[match] || match;
            });
        }

        function formatDate(value) {
            if (!value) return 'Unknown';
            if (typeof value === 'number') {
                return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            }
            if (value && typeof value === 'object') {
                if (typeof value.toDate === 'function') {
                    return value.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                }
                if ('seconds' in value && 'nanoseconds' in value) {
                    const millis = value.seconds * 1000 + Math.floor(value.nanoseconds / 1e6);
                    return new Date(millis).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                }
                if ('_seconds' in value && '_nanoseconds' in value) {
                    const millis = value._seconds * 1000 + Math.floor(value._nanoseconds / 1e6);
                    return new Date(millis).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                }
            }
            if (value instanceof Date) {
                return value.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            }
            return String(value);
        }

        detailsEmpty.style.display = 'none';
        detailsGrid.hidden = false;

        const projectId = project.id || project.UIDproject;
        const isAdmin = ProjectBookmarkService.isAdmin();
        let isSaved = (!isAdmin && projectId) ? ProjectBookmarkService.isSaved(projectId) : false;

        function formatSaveCount(count) {
            const num = Number(count) || 0;
            if (num < 0) return '0';
            if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
            return String(num);
        }

        let effectiveSaveCount = (typeof project.saveCount === 'number' && !isNaN(project.saveCount))
            ? Math.max(0, project.saveCount)
            : (isSaved ? 1 : 0);

        const getBookmarkSvg = (saved) => `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="bookmark-icon-svg" aria-hidden="true">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
        `;

        const authors = Array.isArray(project.authors)
            ? project.authors.map(author => escapeHtml(author)).join(' · ')
            : escapeHtml(project.authors || 'Unknown Authors');

        const program = escapeHtml(project.program || 'Unknown Program');
        const year = escapeHtml(project.year || 'N/A');
        const status = escapeHtml(project.status || 'undefined');
        const adviser = escapeHtml(project.adviser || 'Not listed');
        const updatedAtStr = formatDate(project.updatedAt || project.createdAt);

        const headerSaveButtonHtml = isAdmin ? `
            <div class="project-header-save-pill ${effectiveSaveCount > 0 ? 'has-saves' : ''}" title="${effectiveSaveCount} ${effectiveSaveCount === 1 ? 'user' : 'users'} saved this project">
                <span class="save-icon-svg">${getBookmarkSvg(effectiveSaveCount > 0)}</span>
                <span class="save-pill-count">${formatSaveCount(effectiveSaveCount)}</span>
                <span class="save-pill-label">${effectiveSaveCount === 1 ? 'save' : 'saves'}</span>
            </div>
        ` : `
            <button class="project-header-save-btn ${isSaved ? 'saved' : ''}" id="header-save-btn" type="button" title="${isSaved ? 'Saved to Bookmarks (click to remove)' : 'Save this project'}" aria-label="${isSaved ? 'Remove from saved' : 'Save project'}">
                <span class="save-icon-svg">${getBookmarkSvg(isSaved)}</span>
                <span class="save-btn-label">${isSaved ? 'Saved' : 'Save'}</span>
                <span class="save-btn-count-divider" aria-hidden="true"></span>
                <span class="save-btn-count" id="header-save-count">${formatSaveCount(effectiveSaveCount)}</span>
            </button>
        `;

        detailsLeft.innerHTML = `
            <div class="project-details-header-bar">
                <div class="project-badge">${program} - ${year} - ${status}</div>
                ${headerSaveButtonHtml}
            </div>
            <h1 class="project-title-large">${escapeHtml(project.title || 'Untitled Project')}</h1>
            <p class="project-authors-line">
                ${authors} &mdash; Adviser: ${adviser}
            </p>
            
            <div class="project-section">
                <h3 class="section-title">ABSTRACT</h3>
                <p class="section-text">${escapeHtml(project.abstract || 'No abstract available for this project.')}</p>
            </div>
        `;

        const sidebarSaveButtonHtml = isAdmin ? '' : `
            <button class="detail-save-btn ${isSaved ? 'saved' : ''}" id="detail-save-btn" type="button" aria-label="${isSaved ? 'Remove from saved' : 'Save project'}">
                <span class="detail-save-icon">${getBookmarkSvg(isSaved)}</span>
                <span class="detail-save-text">${isSaved ? 'Saved to Bookmarks' : 'Save Project'}</span>
                <span class="detail-save-count-badge" id="sidebar-save-count" title="${effectiveSaveCount} researchers saved this project">${formatSaveCount(effectiveSaveCount)}</span>
            </button>
        `;

        detailsSidebar.innerHTML = `
            <div class="sidebar-card">
                <h3 class="sidebar-card-title">FAIR Principles</h3>
                <ul class="fair-list">
                    <li>
                        <span class="fair-dot" style="background: #3b82f6"></span>
                        <div>
                            <strong>Findable</strong>
                            <span>Indexed with full metadata</span>
                        </div>
                    </li>
                    <li>
                        <span class="fair-dot" style="background: #22c55e"></span>
                        <div>
                            <strong>Accessible</strong>
                            <span>Metadata open to public</span>
                        </div>
                    </li>
                    <li>
                        <span class="fair-dot" style="background: #f97316"></span>
                        <div>
                            <strong>Interoperable</strong>
                            <span>Standard metadata schema</span>
                        </div>
                    </li>
                    <li>
                        <span class="fair-dot" style="background: #a855f7"></span>
                        <div>
                            <strong>Reusable</strong>
                            <span>Clear attribution info</span>
                        </div>
                    </li>
                </ul>
                <div class="project-detail-actions">
                    ${sidebarSaveButtonHtml}
                    <button class="cite-btn" type="button">
                        <span id="cite-icon"></span>
                        Cite This Project
                    </button>
                </div>
            </div>

            <div class="sidebar-card">
                <h3 class="sidebar-card-title">Image Provided</h3>
                <div class="img-provided" id="project-details-images">
                    ${renderProjectImagesGallery(project.images)}
                </div>
            </div>

            <div class="sidebar-card">
                <h3 class="sidebar-card-title">Project Info</h3>
                <div class="info-row">
                    <span>Year</span>
                    <strong>${year}</strong>
                </div>
                <div class="info-row">
                    <span>Program</span>
                    <strong>${program}</strong>
                </div>
                <div class="info-row">
                    <span>Updated</span>
                    <strong>${updatedAtStr}</strong>
                </div>
                <div class="info-row">
                    <span>Saved by</span>
                    <strong id="sidebar-saved-count-text">
                        <span class="save-stat-badge" title="Community saves">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                            ${effectiveSaveCount} ${effectiveSaveCount === 1 ? 'user' : 'users'}
                        </span>
                    </strong>
                </div>
                <div class="info-row">
                    <span>Full file</span>
                    <em>Restricted (Library only)</em>
                </div>
            </div>
        `;

        // Attach event listeners for Save buttons
        const sidebarSaveBtn = detailsSidebar.querySelector('#detail-save-btn');
        const headerSaveBtn = detailsLeft.querySelector('#header-save-btn');
        const adminHeaderPill = detailsLeft.querySelector('.project-header-save-pill');

        const updateButtonsVisuals = (savedState, count, triggerPop = false) => {
            isSaved = savedState;
            if (typeof count === 'number') {
                effectiveSaveCount = Math.max(0, count);
                project.saveCount = effectiveSaveCount;
            }
            const saveLabelText = savedState ? 'Saved to Bookmarks' : 'Save Project';
            const headerLabelText = savedState ? 'Saved' : 'Save';
            const formattedCount = formatSaveCount(effectiveSaveCount);

            if (sidebarSaveBtn) {
                sidebarSaveBtn.classList.toggle('saved', savedState);
                const textSpan = sidebarSaveBtn.querySelector('.detail-save-text');
                if (textSpan) textSpan.textContent = saveLabelText;
                const iconContainer = sidebarSaveBtn.querySelector('.detail-save-icon');
                if (iconContainer) iconContainer.innerHTML = getBookmarkSvg(savedState);
                sidebarSaveBtn.setAttribute('aria-label', savedState ? 'Remove from saved' : 'Save project');
                const badge = sidebarSaveBtn.querySelector('#sidebar-save-count');
                if (badge) {
                    badge.textContent = formattedCount;
                    badge.title = `${effectiveSaveCount} researchers saved this project`;
                }
                if (triggerPop) {
                    sidebarSaveBtn.classList.remove('optimistic-pop');
                    void sidebarSaveBtn.offsetWidth;
                    sidebarSaveBtn.classList.add('optimistic-pop');
                    setTimeout(() => sidebarSaveBtn.classList.remove('optimistic-pop'), 400);
                }
            }

            if (headerSaveBtn) {
                headerSaveBtn.classList.toggle('saved', savedState);
                const labelSpan = headerSaveBtn.querySelector('.save-btn-label');
                if (labelSpan) labelSpan.textContent = headerLabelText;
                const iconContainer = headerSaveBtn.querySelector('.save-icon-svg');
                if (iconContainer) iconContainer.innerHTML = getBookmarkSvg(savedState);
                headerSaveBtn.title = savedState ? 'Saved to Bookmarks (click to remove)' : 'Save this project';
                headerSaveBtn.setAttribute('aria-label', savedState ? 'Remove from saved' : 'Save project');
                const countSpan = headerSaveBtn.querySelector('#header-save-count');
                if (countSpan) countSpan.textContent = formattedCount;
                if (triggerPop) {
                    headerSaveBtn.classList.remove('optimistic-pop');
                    void headerSaveBtn.offsetWidth;
                    headerSaveBtn.classList.add('optimistic-pop');
                    setTimeout(() => headerSaveBtn.classList.remove('optimistic-pop'), 400);
                }
            }

            if (adminHeaderPill) {
                adminHeaderPill.classList.toggle('has-saves', effectiveSaveCount > 0);
                const countSpan = adminHeaderPill.querySelector('.save-pill-count');
                if (countSpan) countSpan.textContent = formattedCount;
                const labelSpan = adminHeaderPill.querySelector('.save-pill-label');
                if (labelSpan) labelSpan.textContent = effectiveSaveCount === 1 ? 'save' : 'saves';
                adminHeaderPill.title = `${effectiveSaveCount} ${effectiveSaveCount === 1 ? 'user' : 'users'} saved this project`;
            }

            const infoCountText = detailsSidebar.querySelector('#sidebar-saved-count-text');
            if (infoCountText) {
                infoCountText.innerHTML = `
                    <span class="save-stat-badge" title="Community saves">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                        ${effectiveSaveCount} ${effectiveSaveCount === 1 ? 'user' : 'users'}
                    </span>
                `;
            }
        };

        const handleSaveClick = async (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }

            if (sidebarSaveBtn?.classList.contains('saving') || headerSaveBtn?.classList.contains('saving')) {
                return;
            }

            const wasSaved = isSaved;
            const nextSaved = !wasSaved;
            const prevCount = effectiveSaveCount;
            const nextCount = Math.max(0, prevCount + (nextSaved ? 1 : -1));

            // 1. OPTIMISTIC UI: Instantly update visual state and counters without waiting for network
            updateButtonsVisuals(nextSaved, nextCount, true /* trigger pop micro-animation */);

            // Persist updated count in memory and session
            project.saveCount = nextCount;
            try {
                sessionStorage.setItem('selectedProjectForViewDetails', JSON.stringify(project));
            } catch (err) {}

            // Broadcast optimistic state to all other views (cards, dashboard)
            window.dispatchEvent(new CustomEvent('projectSavedStateChanged', {
                detail: { projectId, isSaved: nextSaved, saveCount: nextCount }
            }));

            // 2. Perform background persistence
            sidebarSaveBtn?.classList.add('saving');
            headerSaveBtn?.classList.add('saving');

            try {
                const confirmedSavedState = await ProjectBookmarkService.toggleSave(project);
                if (confirmedSavedState !== nextSaved) {
                    // Reconcile if server returned unexpected state
                    updateButtonsVisuals(confirmedSavedState, prevCount, false);
                    project.saveCount = prevCount;
                    window.dispatchEvent(new CustomEvent('projectSavedStateChanged', {
                        detail: { projectId, isSaved: confirmedSavedState, saveCount: prevCount }
                    }));
                }
            } catch (err) {
                console.error('Error toggling bookmark from details view:', err);
                // Rollback on failure
                updateButtonsVisuals(wasSaved, prevCount, false);
                project.saveCount = prevCount;
                try {
                    sessionStorage.setItem('selectedProjectForViewDetails', JSON.stringify(project));
                } catch (e) {}
                window.dispatchEvent(new CustomEvent('projectSavedStateChanged', {
                    detail: { projectId, isSaved: wasSaved, saveCount: prevCount }
                }));
                if (typeof showToast === 'function') {
                    showToast('Failed to update bookmark. Reverting changes...', 'error');
                }
            } finally {
                sidebarSaveBtn?.classList.remove('saving');
                headerSaveBtn?.classList.remove('saving');
            }
        };

        if (sidebarSaveBtn) {
            sidebarSaveBtn.addEventListener('click', handleSaveClick);
        }
        if (headerSaveBtn) {
            headerSaveBtn.addEventListener('click', handleSaveClick);
        }

        // Keep detail view in sync with bookmark changes from anywhere (e.g. dashboard, home card)
        if (window._detailSavedStateCleanup) {
            window._detailSavedStateCleanup();
            window._detailSavedStateCleanup = null;
        }

        const onExternalSavedStateChanged = (e) => {
            const matchesProject = e && e.detail && (
                e.detail.projectId === projectId ||
                (project && e.detail.projectId === (project.id || project.UIDproject))
            );

            if (matchesProject) {
                const nextSaved = Boolean(e.detail.isSaved);
                const nextCount = typeof e.detail.saveCount === 'number' ? e.detail.saveCount : effectiveSaveCount;
                updateButtonsVisuals(nextSaved, nextCount, false);
            } else if (!e || !e.detail) {
                const currentSaved = ProjectBookmarkService.isSaved(projectId);
                updateButtonsVisuals(currentSaved, effectiveSaveCount, false);
            }
        };

        window.addEventListener('projectSavedStateChanged', onExternalSavedStateChanged);
        window._detailSavedStateCleanup = () => {
            window.removeEventListener('projectSavedStateChanged', onExternalSavedStateChanged);
        };

        // Attach event listener to the cite button
        const citeBtn = detailsSidebar.querySelector('.cite-btn');
        if (citeBtn) {
            citeBtn.addEventListener('click', () => {
                sessionStorage.setItem('currentProject', JSON.stringify(project));
                if (typeof Citation !== 'undefined') {
                    Citation.showCitationModal();
                } else if (window.ModalDialog) {
                    ModalDialog.alert({
                        title: 'Citation Unavailable',
                        message: 'Citation module is not loaded yet. Please refresh the page and try again.',
                        type: 'warning'
                    });
                } else if (typeof showToast === 'function') {
                    showToast('Citation module not available. Please refresh the page.', 'warning');
                } else {
                    alert('Citation module not available. Please refresh the page.');
                }
            });
        }

        // Attach click handlers to gallery thumbnails for Lightbox viewer
        setupGalleryLightbox(project.images);
    };

    /**
     * Render the image gallery HTML in project details
     */
    function renderProjectImagesGallery(images) {
        if (!images || !Array.isArray(images) || images.length === 0) {
            return `
                <div class="no-images-placeholder">
                    ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('image-placeholder') : ''}
                    <span>No physical book images provided</span>
                </div>
            `;
        }

        const maxVisible = 6;
        const visibleImages = images.slice(0, maxVisible);
        const extraCount = images.length - maxVisible;

        return `
            <div class="book-gallery-grid">
                ${visibleImages.map((img, idx) => {
            const rawUrl = typeof img === 'string' ? img : (img.secure_url || img.url);
            const thumbUrl = (typeof CloudinaryService !== 'undefined' && CloudinaryService.getThumbnailUrl)
                ? CloudinaryService.getThumbnailUrl(rawUrl, 300, 400)
                : rawUrl;
            const isCover = idx === 0;
            const isLastVisible = idx === maxVisible - 1 && extraCount > 0;

            return `
                        <div class="book-gallery-thumb ${isCover ? 'is-main-cover' : ''}" data-index="${idx}" title="${isCover ? 'Book Cover' : `Book Photo ${idx + 1}`}">
                            <img src="${thumbUrl}" alt="Project Photo ${idx + 1}" loading="lazy">
                            ${isCover ? '<span class="thumb-cover-tag">Cover</span>' : ''}
                            ${isLastVisible ? `<div class="thumb-more-overlay">+${extraCount}</div>` : ''}
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    }

    /**
     * Setup full-screen Lightbox Modal for gallery images
     */
    function setupGalleryLightbox(images) {
        if (!images || !Array.isArray(images) || images.length === 0) return;

        const imageUrls = images.map(img => typeof img === 'string' ? img : (img.secure_url || img.url));
        const thumbs = document.querySelectorAll('.book-gallery-thumb');

        let currentIndex = 0;
        let lightbox = document.getElementById('recaps-gallery-lightbox');

        if (!lightbox) {
            lightbox = document.createElement('div');
            lightbox.id = 'recaps-gallery-lightbox';
            lightbox.className = 'recaps-lightbox';
            lightbox.innerHTML = `
                <button class="lightbox-close-btn" id="lightbox-close-btn" aria-label="Close image viewer">✕</button>
                <button class="lightbox-nav-btn lightbox-prev-btn" id="lightbox-prev-btn" aria-label="Previous image">‹</button>
                <div class="lightbox-content">
                    <img id="lightbox-main-img" class="lightbox-main-img" src="" alt="Book Preview">
                    <div id="lightbox-counter" class="lightbox-counter">1 / 1</div>
                </div>
                <button class="lightbox-nav-btn lightbox-next-btn" id="lightbox-next-btn" aria-label="Next image">›</button>
            `;
            document.body.appendChild(lightbox);

            // Lightbox Event Listeners
            const closeBtn = lightbox.querySelector('#lightbox-close-btn');
            const prevBtn = lightbox.querySelector('#lightbox-prev-btn');
            const nextBtn = lightbox.querySelector('#lightbox-next-btn');

            const closeLightbox = () => {
                lightbox.classList.remove('active');
            };

            closeBtn.addEventListener('click', closeLightbox);
            lightbox.addEventListener('click', (e) => {
                if (e.target === lightbox) closeLightbox();
            });

            prevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (imageUrls.length <= 1) return;
                currentIndex = (currentIndex - 1 + imageUrls.length) % imageUrls.length;
                updateLightboxImage();
            });

            nextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (imageUrls.length <= 1) return;
                currentIndex = (currentIndex + 1) % imageUrls.length;
                updateLightboxImage();
            });

            document.addEventListener('keydown', (e) => {
                if (!lightbox.classList.contains('active')) return;
                if (e.key === 'Escape') closeLightbox();
                if (e.key === 'ArrowLeft' && imageUrls.length > 1) {
                    currentIndex = (currentIndex - 1 + imageUrls.length) % imageUrls.length;
                    updateLightboxImage();
                }
                if (e.key === 'ArrowRight' && imageUrls.length > 1) {
                    currentIndex = (currentIndex + 1) % imageUrls.length;
                    updateLightboxImage();
                }
            });
        }

        function updateLightboxImage() {
            const imgEl = lightbox.querySelector('#lightbox-main-img');
            const counterEl = lightbox.querySelector('#lightbox-counter');
            if (imgEl && imageUrls[currentIndex]) {
                imgEl.src = imageUrls[currentIndex];
            }
            if (counterEl) {
                counterEl.textContent = `${currentIndex + 1} / ${imageUrls.length}`;
            }
        }

        thumbs.forEach(thumb => {
            thumb.addEventListener('click', () => {
                currentIndex = parseInt(thumb.getAttribute('data-index') || '0', 10);
                updateLightboxImage();
                lightbox.classList.add('active');
            });
        });
    }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initViewManagerSystem);
    } else {
        initViewManagerSystem();
    }
})();
