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
                    <span id="cite-icon"></span>
                Cite This Project
                </button>
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
                    <span>Full file</span>
                    <em>Restricted (Library only)</em>
                </div>
            </div>
        `;
        
        // Attach event listener to the cite button
        const citeBtn = detailsSidebar.querySelector('.cite-btn');
        if (citeBtn) {
            citeBtn.addEventListener('click', () => {
                sessionStorage.setItem('currentProject', JSON.stringify(project));
                if (typeof Citation !== 'undefined') {
                    Citation.showCitationModal();
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
});
