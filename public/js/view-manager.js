document.addEventListener('DOMContentLoaded', () => {
    // View controller for managing different views
    const ViewManager = {
        init() {
            this.setupNavigation();
            this.setupProjectSelection();
            this.initializeChatbot();
            this.setupCustomEventListener();
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
                    if (currentView && currentView.id === page + '-view') {
                        return;
                    }
                    
                    this.switchView(page);
                }, { capture: true });
            });
            
            // Back to search button
            const backBtn = document.getElementById('back-to-search');
            if (backBtn) {
                backBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.switchView('index');
                });
            }
        },
        
        setupProjectSelection() {
            // Check if we should show project details on page load (coming from another page)
            const projectDataJson = sessionStorage.getItem('selectedProjectForViewDetails');
            const currentPath = window.location.pathname;
            
            // Only auto-switch if we have project data AND we're on index.html
            if (projectDataJson && (currentPath.endsWith('index.html') || currentPath.endsWith('/'))) {
                // Check if there's a flag indicating we just navigated here to view details
                const shouldShowDetails = sessionStorage.getItem('showProjectDetails');
                
                if (shouldShowDetails === 'true') {
                    // Clear the flag to prevent infinite loops
                    sessionStorage.removeItem('showProjectDetails');
                    
                    // Small delay to ensure DOM is ready
                    setTimeout(() => {
                        this.switchView('project-detail');
                    }, 100);
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
                    // Trigger check login to show guest modal if user is not authenticated
                    if (typeof Chatbot !== 'undefined' && typeof Chatbot.checkLoginAndShowGuest === 'function') {
                        Chatbot.checkLoginAndShowGuest();
                    }
                } else {
                    // Deactivate chatbot when switching away
                    const chatbotFullpage = document.querySelector('.chatbot-fullpage');
                    if (chatbotFullpage) {
                        chatbotFullpage.classList.remove('active');
                    }
                    // Hide guest dialog modal if we switch away from chatbot
                    if (typeof Chatbot !== 'undefined' && Chatbot.guestDialog) {
                        Chatbot.guestDialog.classList.remove('active');
                    }
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
            // Don't hide it when navigating away
            const projectDetailNav = document.querySelector('.nav-item[data-page="project-detail"]');
            const projectData = sessionStorage.getItem('selectedProjectForViewDetails');
            if (projectDetailNav) {
                if (projectData) {
                    // Keep it visible if we have project data
                    projectDetailNav.style.display = '';
                } else {
                    // Only hide if no project data exists
                    projectDetailNav.style.display = 'none';
                }
            }
        },
        
        initializeChatbot() {
            // Initialize chatbot when DOM is ready
            if (typeof Chatbot !== 'undefined' && Chatbot.init) {
                Chatbot.init();
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
    
    // Check if we should show a specific view based on sessionStorage
    const shouldShowDetails = sessionStorage.getItem('showProjectDetails');
    const projectData = sessionStorage.getItem('selectedProjectForViewDetails');
    
    if (shouldShowDetails === 'true' && projectData) {
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

        const authors = Array.isArray(project.authors)
            ? project.authors.map(author => escapeHtml(author)).join(' · ')
            : escapeHtml(project.authors || 'Unknown Authors');

        const program = escapeHtml(project.program || 'Unknown Program');
        const year = escapeHtml(project.year || 'N/A');
        const status = escapeHtml(project.status || 'undefined');
        const adviser = escapeHtml(project.adviser || 'Not listed');
        const updatedAtStr = formatDate(project.updatedAt || project.createdAt);

        detailsLeft.innerHTML = `
            <div class="project-badge">${program} - ${year} - ${status}</div>
            <h1 class="project-title-large">${escapeHtml(project.title || 'Untitled Project')}</h1>
            <p class="project-authors-line">
                ${authors} &mdash; Adviser: ${adviser}
            </p>
            
            <div class="project-section">
                <h3 class="section-title">ABSTRACT</h3>
                <p class="section-text">${escapeHtml(project.abstract || 'No abstract available for this project.')}</p>
            </div>
            
            <div class="project-section">
                <h3 class="section-title">KEY FINDINGS</h3>
                <p class="section-text">${escapeHtml(project.keyFindings || 'No findings information available.')}</p>
            </div>
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
                <button class="cite-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M10.854 7.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 9.793l2.646-2.647a.5.5 0 0 1 .708 0z"/><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>
                    Cite This Project
                </button>
            </div>

            <div class="sidebar-card">
                <h3 class="sidebar-card-title">Related Studies</h3>
                <div class="related-list">
                    <div class="related-item">
                        <p>Face Recognition Attendance System Using Deep Learning &mdash; Santos et al.</p>
                        <span>2023 &middot; BSIT</span>
                    </div>
                    <div class="related-item">
                        <p>Automated Student Monitoring Using RFID and Biometrics</p>
                        <span>2022 &middot; BSIT</span>
                    </div>
                    <div class="related-item">
                        <p>CNN-Based Object Detection for Campus Security Systems</p>
                        <span>2023 &middot; BSCS</span>
                    </div>
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
                    <span>Full file</span>
                    <em>Restricted (Library only)</em>
                </div>
            </div>
        `;
        
        // Attach event listener to the cite button
        const citeBtn = detailsSidebar.querySelector('.cite-btn');
        console.log('Cite button found:', citeBtn);
        console.log('Citation module available:', typeof Citation !== 'undefined');
        
        if (citeBtn) {
            citeBtn.addEventListener('click', () => {
                console.log('Cite button clicked!');
                // Store current project in sessionStorage for citation modal
                sessionStorage.setItem('currentProject', JSON.stringify(project));
                
                if (typeof Citation !== 'undefined') {
                    console.log('Showing citation modal...');
                    Citation.showCitationModal();
                } else {
                    console.error('Citation module not loaded!');
                    alert('Citation module not available. Please refresh the page.');
                }
            });
        } else {
            console.error('Cite button not found in sidebar!');
        }
    };
});
