// Global ProjectList object for external access (e.g., from search-handler.js)
window.ProjectList = {
    displaySearchResults: function(projects, query, isRAGSearch = false) {
        console.log(`📋 Displaying ${projects.length} search results (RAG: ${isRAGSearch})`);
        
        // Store the search query for highlighting (only for traditional search)
        window.currentSearchQuery = isRAGSearch ? null : query;
        
        // Update the internal allProjects array
        if (typeof updateProjectsForSearch === 'function') {
            updateProjectsForSearch(projects, isRAGSearch);
        }
    },
    
    loadProjects: function() {
        // Clear search query and RAG flag when loading all projects
        window.currentSearchQuery = null;
        
        // Also clear the isRAGResults flag via updateProjectsForSearch
        if (typeof clearSearchStateWrapper === 'function') {
            clearSearchStateWrapper();
        }
        
        // Expose fetchProjects to external modules
        if (typeof fetchProjectsWrapper === 'function') {
            fetchProjectsWrapper();
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const projectsContainer = document.getElementById('projects-container');
    const paginationContainer = document.getElementById('pagination-container');
    
    // Saved projects state
    let savedProjectIds = []; // Store only project IDs from Firestore
    let savedProjectsFull = []; // Store full project data for localStorage
    
    // Sort Dropdown UI Logic
    const sortToggleBtn = document.getElementById('sort-toggle-btn');
    const sortDropdownMenu = document.getElementById('sort-dropdown-menu');
    
    if (sortToggleBtn && sortDropdownMenu) {
        // Toggle dropdown
        sortToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sortDropdownMenu.classList.toggle('show');
            sortToggleBtn.classList.toggle('active');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!sortDropdownMenu.contains(e.target) && e.target !== sortToggleBtn) {
                sortDropdownMenu.classList.remove('show');
                sortToggleBtn.classList.remove('active');
            }
        });

        // Prevent closing when clicking inside the dropdown menu
        sortDropdownMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    
    // View Toggle Logic
    const viewBtns = document.querySelectorAll('.view-btn');
    
    viewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            viewBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            projectsContainer.classList.remove('list-view', 'grid-view', 'compact-view');
            
            const viewMode = btn.getAttribute('data-view');
            projectsContainer.classList.add(viewMode + '-view');
            
            localStorage.setItem('projectsViewMode', viewMode);
        });
    });

    const savedView = localStorage.getItem('projectsViewMode');
    if (savedView) {
        const savedBtn = document.querySelector(`.view-btn[data-view="${savedView}"]`);
        if (savedBtn) {
            savedBtn.click();
        }
    }

    // Pagination & Data State
    let allProjects = [];
    let currentPage = 1;
    const PROJECTS_PER_PAGE = 9;
    let isRAGResults = false; // Track if current results are from RAG
    
    /**
     * Highlight search terms in text (only for traditional search, not AI semantic)
     * @param {string} text - The text to highlight
     * @param {string} query - The search query
     * @returns {string} - HTML string with highlighted terms
     */
    function highlightSearchTerms(text, query) {
        if (!query || !text) return text;
        
        // Escape HTML in original text first
        const escapeHtml = (str) => {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        };
        
        const escapedText = escapeHtml(text);
        
        // Escape special regex characters in query
        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedQuery = escapeRegex(query);
        
        // Create regex for case-insensitive matching
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        
        // Replace matches with highlighted version
        return escapedText.replace(regex, '<mark class="search-highlight">$1</mark>');
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
            
            // Sync savedProjectIds with localStorage (full project data)
            syncSavedProjectsWithLocalStorage();
            
            // Re-render current page to update button states
            renderPage(currentPage);
        } catch (error) {
            console.error('Error loading saved projects from Firestore:', error);
        }
    }
    
    // Function to sync savedProjectIds with localStorage
    function syncSavedProjectsWithLocalStorage() {
        // Load existing saved projects from localStorage
        let localStorageSaved = [];
        try {
            localStorageSaved = JSON.parse(localStorage.getItem('savedProjects')) || [];
        } catch (e) {}
        
        // Filter localStorageSaved to only include projects in savedProjectIds
        savedProjectsFull = localStorageSaved.filter(p => savedProjectIds.includes(p.id));
        
        // Add any missing projects from allProjects to savedProjectsFull
        savedProjectIds.forEach(id => {
            if (!savedProjectsFull.some(p => p.id === id)) {
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
            }
        });
        
        // Save back to localStorage
        localStorage.setItem('savedProjects', JSON.stringify(savedProjectsFull));
    }
    
    // Function to save project to Firestore
    async function saveProjectToFirestore(userId, projectId) {
        try {
            const docRef = db.collection('usersSavedProjects').doc(userId);
            await docRef.set({
                UIDproject: firebase.firestore.FieldValue.arrayUnion(projectId)
            }, { merge: true });
            
            // Update local state
            if (!savedProjectIds.includes(projectId)) {
                savedProjectIds.push(projectId);
            }
            
            syncSavedProjectsWithLocalStorage();
        } catch (error) {
            console.error('Error saving project to Firestore:', error);
        }
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
        } catch (error) {
            console.error('Error removing project from Firestore:', error);
        }
    }

    // Function to update projects from search
    window.updateProjectsForSearch = function(projects, isRAG = false) {
        allProjects = projects;
        isRAGResults = isRAG;
        currentPage = 1;
        
        // Update total count
        const countElement = document.getElementById('total-projects-count');
        if (countElement) {
            countElement.textContent = projects.length;
        }
        
        // Render the first page
        renderPage(1);
    };

    function openProjectDetails(project) {
        try {
            sessionStorage.setItem('selectedProjectForViewDetails', JSON.stringify(project));
            // Check if ViewManager exists (we're on index.html)
            if (window.ViewManager && typeof window.ViewManager.switchView === 'function') {
                // We're already on index.html, just switch view
                window.ViewManager.switchView('project-detail');
            } else {
                // We're on a different page, navigate to index
                sessionStorage.setItem('showProjectDetails', 'true');
                const isInPagesFolder = window.location.pathname.includes('/pages/');
                window.location.href = isInPagesFolder ? '../index.html' : 'index.html';
            }
        } catch (error) {
            console.error('Unable to open project details:', error);
        }
    }

    // Sorting Logic with Radio Buttons
    const sortRadios = document.querySelectorAll('input[name="sortField"], input[name="sortOrder"]');
    
    function applySorting() {
        const fieldRadio = document.querySelector('input[name="sortField"]:checked');
        const orderRadio = document.querySelector('input[name="sortOrder"]:checked');
        
        if (!fieldRadio || !orderRadio) return;
        
        const sortField = fieldRadio.value;
        const sortOrder = orderRadio.value; // 'asc' or 'desc'
        const modifier = sortOrder === 'asc' ? 1 : -1;

        allProjects.sort((a, b) => {
            if (sortField === 'createdAt') {
                // Handle both Firestore Timestamps and cached dates
                let dateA = 0;
                let dateB = 0;
                
                if (a.createdAt) {
                    if (typeof a.createdAt.toMillis === 'function') {
                        // Firestore Timestamp
                        dateA = a.createdAt.toMillis();
                    } else if (typeof a.createdAt === 'object' && a.createdAt.seconds) {
                        // Cached Firestore Timestamp
                        dateA = a.createdAt.seconds * 1000;
                    } else {
                        // String or number
                        dateA = new Date(a.createdAt).getTime();
                    }
                }
                
                if (b.createdAt) {
                    if (typeof b.createdAt.toMillis === 'function') {
                        dateB = b.createdAt.toMillis();
                    } else if (typeof b.createdAt === 'object' && b.createdAt.seconds) {
                        dateB = b.createdAt.seconds * 1000;
                    } else {
                        dateB = new Date(b.createdAt).getTime();
                    }
                }
                
                return (dateA - dateB) * modifier;
            } 
            else if (sortField === 'updatedAt') {
                // Handle both Firestore Timestamps and cached dates
                let dateA = 0;
                let dateB = 0;
                
                if (a.updatedAt) {
                    if (typeof a.updatedAt.toMillis === 'function') {
                        dateA = a.updatedAt.toMillis();
                    } else if (typeof a.updatedAt === 'object' && a.updatedAt.seconds) {
                        dateA = a.updatedAt.seconds * 1000;
                    } else {
                        dateA = new Date(a.updatedAt).getTime();
                    }
                } else if (a.createdAt) {
                    if (typeof a.createdAt.toMillis === 'function') {
                        dateA = a.createdAt.toMillis();
                    } else if (typeof a.createdAt === 'object' && a.createdAt.seconds) {
                        dateA = a.createdAt.seconds * 1000;
                    } else {
                        dateA = new Date(a.createdAt).getTime();
                    }
                }
                
                if (b.updatedAt) {
                    if (typeof b.updatedAt.toMillis === 'function') {
                        dateB = b.updatedAt.toMillis();
                    } else if (typeof b.updatedAt === 'object' && b.updatedAt.seconds) {
                        dateB = b.updatedAt.seconds * 1000;
                    } else {
                        dateB = new Date(b.updatedAt).getTime();
                    }
                } else if (b.createdAt) {
                    if (typeof b.createdAt.toMillis === 'function') {
                        dateB = b.createdAt.toMillis();
                    } else if (typeof b.createdAt === 'object' && b.createdAt.seconds) {
                        dateB = b.createdAt.seconds * 1000;
                    } else {
                        dateB = new Date(b.createdAt).getTime();
                    }
                }
                
                return (dateA - dateB) * modifier;
            }
            else if (sortField === 'title') {
                const titleA = (a.title || '').toLowerCase();
                const titleB = (b.title || '').toLowerCase();
                return titleA.localeCompare(titleB) * modifier;
            } 
            else if (sortField === 'adviser') {
                const advA = (a.adviser || '').toLowerCase();
                const advB = (b.adviser || '').toLowerCase();
                return advA.localeCompare(advB) * modifier;
            }
            else if (sortField === 'authorsCount') {
                const countA = Array.isArray(a.authors) ? a.authors.length : 1;
                const countB = Array.isArray(b.authors) ? b.authors.length : 1;
                return (countA - countB) * modifier;
            }
            return 0;
        });

        renderPage(1);
    }

    sortRadios.forEach(radio => {
        radio.addEventListener('change', applySorting);
    });

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

    // Fetch Projects Logic with Smart Caching
    async function fetchProjects() {
        if (!projectsContainer) return;
        
        try {
            // Check if cache is valid
            const cacheValid = await isCacheValid();
            
            if (cacheValid) {
                // Load from cache
                const cachedProjects = loadFromCache();
                
                if (cachedProjects && cachedProjects.length > 0) {
                    allProjects = cachedProjects;
                    console.log('🚀 Using cached data - instant load!');
                    
                    // Apply default sort
                    applySorting();
                    return;
                }
            }
            
            // Cache invalid or not found - fetch from Firestore
            console.log('📡 Fetching fresh data from Firestore...');
            projectsContainer.innerHTML = '<p class="loading-text">Loading projects...</p>';
            
            if (typeof db === 'undefined') {
                console.error('Firestore db is not initialized.');
                projectsContainer.innerHTML = '<p class="loading-text">Database configuration missing.</p>';
                return;
            }

            const querySnapshot = await db.collection('projects').get();
            
            allProjects = [];
            querySnapshot.forEach(doc => {
                const data = doc.data();
                data.id = doc.id;
                allProjects.push(data);
            });

            if (allProjects.length === 0) {
                projectsContainer.innerHTML = '<p class="loading-text">No capstone projects found.</p>';
                if(paginationContainer) paginationContainer.innerHTML = '';
                return;
            }
            
            // Save to cache
            await saveToCache(allProjects);

            // Apply default sort (Date Created, Descending)
            applySorting();

        } catch (error) {
            console.error("Error fetching projects: ", error);
            projectsContainer.innerHTML = '<p class="loading-text" style="color: #ef4444;">Error loading projects. Please try again later.</p>';
        }
    }

    function renderPage(page) {
        currentPage = page;
        projectsContainer.innerHTML = ''; 
        
        const startIndex = (page - 1) * PROJECTS_PER_PAGE;
        const endIndex = startIndex + PROJECTS_PER_PAGE;
        const projectsToShow = allProjects.slice(startIndex, endIndex);

        projectsToShow.forEach(data => {
            const title = data.title || 'Untitled Project';
            const year = data.year || 'N/A';
            const projectId = data.id || title; // Fallback to title if id is missing
            
            let authorsStr = 'Unknown Authors';
            if (Array.isArray(data.authors)) {
                authorsStr = data.authors.join(' · ');
            } else if (typeof data.authors === 'string') {
                authorsStr = data.authors;
            }

            const program = data.program || 'Unknown Program';
            const abstract = data.abstract || 'The abstract is not available.';
            
            // Apply highlighting only if we have a search query and it's NOT from AI semantic search
            const shouldHighlight = window.currentSearchQuery && !isRAGResults;
            const displayTitle = shouldHighlight ? highlightSearchTerms(title, window.currentSearchQuery) : title;
            const displayAuthors = shouldHighlight ? highlightSearchTerms(authorsStr, window.currentSearchQuery) : authorsStr;
            const displayProgram = shouldHighlight ? highlightSearchTerms(program, window.currentSearchQuery) : program;
            const displayAbstract = shouldHighlight ? highlightSearchTerms(abstract, window.currentSearchQuery) : abstract;
            
            const isSaved = savedProjectIds.includes(projectId);
            const saveBtnClass = isSaved ? 'btn-save saved' : 'btn-save';
            const saveBtnText = isSaved ? 'Saved' : 'Save';

            // Generate relevance badge if this is a RAG result
            let relevanceBadge = '';
            if (isRAGResults && typeof data.relevanceScore === 'number') {
                const relevancePercent = (data.relevanceScore * 100).toFixed(0);
                const badgeClass = data.relevanceScore >= 0.7 ? 'high' : data.relevanceScore >= 0.5 ? 'medium' : 'low';
                relevanceBadge = `
                    <div class="relevance-badge ${badgeClass}" title="Semantic relevance score">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M12 6v6l4 2"></path>
                        </svg>
                        ${relevancePercent}% Match
                    </div>
                `;
            }

            const card = document.createElement('div');
            card.className = 'project-card';
            
            card.innerHTML = `
                <div class="project-header">
                    <h3 class="project-title">${displayTitle}</h3>
                    <div class="project-header-right">
                        <span class="project-year">${year}</span>
                        ${relevanceBadge}
                    </div>
                </div>
                <div class="project-meta">
                    <svg class="meta-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    <span class="authors">${displayAuthors}</span>
                    <svg class="meta-icon program-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
                    <span class="program">${displayProgram}</span>
                </div>
                <div class="project-abstract">
                    ${displayAbstract}
                </div>
                <div class="project-actions">
                    <button class="${saveBtnClass}" type="button" data-id="${projectId}">
                        <svg class="meta-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                        <span class="btn-text">${saveBtnText}</span>
                    </button>
                    <button class="btn-view-details" type="button">View Details &rarr;</button>
                </div>
            `;
            
            projectsContainer.appendChild(card);

            const detailsButton = card.querySelector('.btn-view-details');
            if (detailsButton) {
                detailsButton.addEventListener('click', () => openProjectDetails(data));
            }

            const saveButton = card.querySelector('.btn-save');
            if (saveButton) {
                saveButton.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const isCurrentlySaved = saveButton.classList.contains('saved');
                    
                    // Get current user
                    const user = firebase.auth().currentUser;
                    if (!user) {
                        // If user not logged in, maybe show login prompt?
                        console.warn('User not logged in, cannot save project');
                        return;
                    }
                    
                    if (isCurrentlySaved) {
                        // Unsave
                        await removeProjectFromFirestore(user.uid, projectId);
                        saveButton.classList.remove('saved');
                        saveButton.querySelector('.btn-text').textContent = 'Save';
                    } else {
                        // Save
                        await saveProjectToFirestore(user.uid, projectId);
                        saveButton.classList.add('saved');
                        saveButton.querySelector('.btn-text').textContent = 'Saved';
                    }
                    
                    // Dispatch custom event to notify dashboard dropdown
                    window.dispatchEvent(new CustomEvent('projectSavedStateChanged'));
                });
            }
        });

        renderPaginationControls();
    }

    function renderPaginationControls() {
        if (!paginationContainer) return;
        
        paginationContainer.innerHTML = '';
        const totalPages = Math.ceil(allProjects.length / PROJECTS_PER_PAGE);

        if (totalPages <= 1) return; 

        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.className = 'pagination-btn' + (i === currentPage ? ' active' : '');
            btn.textContent = i;
            
            btn.addEventListener('click', () => {
                const section = document.querySelector('.projects-list-section');
                const container = document.getElementById('projects-container');
                
                // Prevent sudden scroll jump when content is cleared
                if (container) {
                    container.style.minHeight = container.offsetHeight + 'px';
                }
                
                renderPage(i);
                
                if (container) {
                    // Remove fixed height after transition
                    setTimeout(() => {
                        container.style.minHeight = '';
                    }, 500);
                }
                
                if(section) {
                    setTimeout(() => {
                        if (window.smoothScroller) {
                            const rect = section.getBoundingClientRect();
                            const targetY = window.scrollY + rect.top - 80; // 80px offset for header
                            window.smoothScroller.scrollTo(targetY, { ease: 0.035 }); // Slower ease for premium feel
                        } else {
                            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }, 50);
                }
            });
            
            paginationContainer.appendChild(btn);
        }
    }
    
    // Fetch Projects Count from RTDB
    async function fetchProjectsCount() {
        try {
            const response = await fetch('https://re-caps-default-rtdb.asia-southeast1.firebasedatabase.app/projects_document_count.json');
            if (response.ok) {
                const count = await response.json();
                const countElement = document.getElementById('total-projects-count');
                if (countElement) {
                    countElement.textContent = count !== null ? count : 0;
                }
            }
        } catch (error) {
            console.error("Error fetching projects count:", error);
        }
    }
    
    // Fetch and cache users data for admin dashboard
    async function fetchAndCacheUsers() {
        try {
            // Check if users cache exists and is recent (within 5 minutes)
            const cachedUsersMetadata = localStorage.getItem('usersMetadata');
            if (cachedUsersMetadata) {
                const metadata = JSON.parse(cachedUsersMetadata);
                const cacheAge = Date.now() - new Date(metadata.lastCached).getTime();
                
                // If cache is less than 5 minutes old, skip fetching
                if (cacheAge < 5 * 60 * 1000) {
                    console.log('✓ Users cache is fresh, skipping fetch');
                    return;
                }
            }
            
            console.log('📡 Fetching users data for admin dashboard cache...');
            const usersSnapshot = await db.collection('users').get();
            const users = usersSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
            
            // Save to cache
            const metadata = {
                userCount: users.length,
                lastCached: new Date().toISOString()
            };
            
            localStorage.setItem('usersData', JSON.stringify(users));
            localStorage.setItem('usersMetadata', JSON.stringify(metadata));
            
            console.log(`✓ Cached ${users.length} users for admin dashboard`);
            
        } catch (error) {
            console.error('Error fetching users for cache:', error);
            // Don't throw error - this is just for caching, not critical
        }
    }

    // Initialize
    
    // Wrapper function to clear search state
    window.clearSearchStateWrapper = function() {
        window.currentSearchQuery = null;
        isRAGResults = false;
    };
    
    // Wrapper function for external access
    window.fetchProjectsWrapper = async function() {
        // Ensure search query is cleared before fetching
        window.currentSearchQuery = null;
        isRAGResults = false;
        
        await fetchProjects();
        await fetchProjectsCount(); // Update the total count display
    };
    
    fetchProjectsCount();
    fetchProjects();
    // fetchAndCacheUsers(); error insufficient permissions for non-login users, so we only fetch when a user is signed in and has access to the users collection.

    // Fetch and cache users only when a user is signed in AND is an admin (we'll check later, but for now skip it to avoid errors)
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                // Don't fetch users cache here to avoid permission errors - we'll fetch it only on admin pages
                // Load saved projects from Firestore
                loadSavedProjectsFromFirestore(user.uid);
            } else {
                // User logged out, clear saved projects
                savedProjectIds = [];
                savedProjectsFull = [];
                localStorage.removeItem('savedProjects');
                renderPage(currentPage);
            }
        });
    } else {
        console.warn('Firebase Auth is not available, skipping users cache fetch');
    }
});
