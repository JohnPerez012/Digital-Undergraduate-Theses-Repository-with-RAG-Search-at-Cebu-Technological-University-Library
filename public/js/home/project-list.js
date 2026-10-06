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

    searchRealtime: function(query) {
        if (typeof performRealtimeSearchWrapper === 'function') {
            return performRealtimeSearchWrapper(query);
        }
        return 0;
    },

    resetRealtimeSearch: function() {
        if (typeof resetRealtimeSearchWrapper === 'function') {
            resetRealtimeSearchWrapper();
        }
    },

    getMasterProjects: function() {
        if (typeof getMasterProjectsWrapper === 'function') {
            return getMasterProjectsWrapper();
        }
        return [];
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
    
    // User role state & Admin limitation check
    let currentUserRole = sessionStorage.getItem('userType') || null;

    function isAdminUser() {
        return currentUserRole === 'admin' || sessionStorage.getItem('userType') === 'admin';
    }

    // Saved projects state (Admins cannot save or bookmark projects)
    let savedProjectIds = (!isAdminUser() && typeof window.GuestSavedProjects !== 'undefined' && window.GuestSavedProjects.getIds)
        ? window.GuestSavedProjects.getIds()
        : [];
    window.savedProjectIds = savedProjectIds;
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
    let masterProjects = []; // Master list preserved for instant real-time word-by-word filtering
    let currentPage = 1;
    const PROJECTS_PER_PAGE = 9;
    let isRAGResults = false; // Track if current results are from RAG
    let currentScope = 'all'; // 'all' | 'saved'

    window.getMasterProjectsWrapper = () => masterProjects;

    // Scope Filter Elements & Logic
    const filterAllBtn = document.getElementById('filter-all-projects');
    const filterSavedBtn = document.getElementById('filter-saved-projects');

    function updateScopeBadges() {
        const count = Array.isArray(savedProjectIds) ? savedProjectIds.length : 0;
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
        const secBadge = document.getElementById('secondary-saved-count');
        if (secBadge) {
            if (count > 0) {
                secBadge.textContent = count;
                secBadge.style.display = 'inline-flex';
            } else {
                secBadge.style.display = 'none';
            }
        }
    }

    function applyScopeFilter(scope) {
        currentScope = scope;
        if (filterAllBtn && filterSavedBtn) {
            filterAllBtn.classList.toggle('active', scope === 'all');
            filterSavedBtn.classList.toggle('active', scope === 'saved');
        }

        if (scope === 'saved') {
            const savedList = masterProjects.filter(p => savedProjectIds.includes(p.id));
            allProjects = [...savedList];
        } else {
            allProjects = [...masterProjects];
        }

        const totalCountEl = document.getElementById('total-projects-count');
        if (totalCountEl) {
            totalCountEl.textContent = allProjects.length;
        }

        applySorting();
    }

    if (filterAllBtn) {
        filterAllBtn.addEventListener('click', () => {
            if (currentScope !== 'all') {
                applyScopeFilter('all');
            }
        });
    }

    if (filterSavedBtn) {
        filterSavedBtn.addEventListener('click', () => {
            if (currentScope !== 'saved') {
                applyScopeFilter('saved');
            }
        });
    }
    
    /**
     * Escape HTML in string to prevent XSS
     */
    function escapeHtml(str) {
        if (!str && str !== 0) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    /**
     * Format save count for minimalist modern UI (e.g. 0, 14, 1.2k)
     */
    function formatSaveCount(count) {
        const num = Number(count) || 0;
        if (num < 0) return '0';
        if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
        return String(num);
    }

    /**
     * Get effective save count, ensuring user's own save is reflected optimistically
     */
    function getEffectiveSaveCount(projData, isSaved) {
        let count = (typeof projData.saveCount === 'number' && !isNaN(projData.saveCount))
            ? Math.max(0, projData.saveCount)
            : 0;
        if (isSaved && count === 0) {
            count = 1;
        }
        return count;
    }

    /**
     * Highlight search terms in text (only for traditional search, not AI semantic)
     * Tokenizes words to support word-by-word matching with brand yellow highlight
     * @param {string} text - The text to highlight
     * @param {string} query - The search query
     * @returns {string} - HTML string with highlighted terms
     */
    function highlightSearchTerms(text, query) {
        if (!text && text !== 0) return '';
        const escapedText = escapeHtml(text);

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
    
    // Function to load saved projects from Firestore
    async function loadSavedProjectsFromFirestore(userId) {
        if (isAdminUser()) {
            savedProjectIds = [];
            savedProjectsFull = [];
            return;
        }
        try {
            const docRef = db.collection('usersSavedProjects').doc(userId);
            const doc = await docRef.get();
            
            if (doc.exists) {
                savedProjectIds = doc.data().UIDproject || [];
            } else {
                savedProjectIds = [];
            }
            window.savedProjectIds = savedProjectIds;
            
            // Sync savedProjectIds with localStorage (full project data)
            syncSavedProjectsWithLocalStorage();
            updateScopeBadges();
            
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
        if (isAdminUser()) {
            console.warn('[RE-CAPS] Administrators are restricted from saving or bookmarking projects.');
            return;
        }
        try {
            const userDocRef = db.collection('usersSavedProjects').doc(userId);
            const projectDocRef = db.collection('projects').doc(projectId);

            await Promise.all([
                userDocRef.set({
                    UIDproject: firebase.firestore.FieldValue.arrayUnion(projectId)
                }, { merge: true }),
                projectDocRef.set({
                    saveCount: firebase.firestore.FieldValue.increment(1)
                }, { merge: true }).catch(err => console.warn('[RE-CAPS] Project saveCount increment warning:', err))
            ]);
            
            // Update local state
            if (!savedProjectIds.includes(projectId)) {
                savedProjectIds.push(projectId);
            }
            window.savedProjectIds = savedProjectIds;
            
            syncSavedProjectsWithLocalStorage();

            // Log activity
            if (window.ActivityService && typeof window.ActivityService.logBookmark === 'function') {
                const project = allProjects.find(p => p.id === projectId);
                window.ActivityService.logBookmark(projectId, project ? project.title : 'Capstone Project', 'saved');
            }
        } catch (error) {
            console.error('Error saving project to Firestore:', error);
            throw error;
        }
    }
    
    // Function to remove project from Firestore
    async function removeProjectFromFirestore(userId, projectId) {
        if (isAdminUser()) {
            return;
        }
        try {
            const userDocRef = db.collection('usersSavedProjects').doc(userId);
            const projectDocRef = db.collection('projects').doc(projectId);

            await Promise.all([
                userDocRef.set({
                    UIDproject: firebase.firestore.FieldValue.arrayRemove(projectId)
                }, { merge: true }),
                projectDocRef.set({
                    saveCount: firebase.firestore.FieldValue.increment(-1)
                }, { merge: true }).catch(err => console.warn('[RE-CAPS] Project saveCount decrement warning:', err))
            ]);
            
            // Update local state
            savedProjectIds = savedProjectIds.filter(id => id !== projectId);
            window.savedProjectIds = savedProjectIds;
            
            syncSavedProjectsWithLocalStorage();

            // Log activity
            if (window.ActivityService && typeof window.ActivityService.logBookmark === 'function') {
                const project = allProjects.find(p => p.id === projectId);
                window.ActivityService.logBookmark(projectId, project ? project.title : 'Capstone Project', 'removed');
            }
        } catch (error) {
            console.error('Error removing project from Firestore:', error);
            throw error;
        }
    }

    // Function to update projects from search
    window.updateProjectsForSearch = function(projects, isRAG = false) {
        allProjects = projects;
        isRAGResults = isRAG;
        currentPage = 1;
        
        // Ensure RAG semantic search results are sorted by relevanceScore descending
        if (isRAG) {
            allProjects.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
        }

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

            // Log project view
            if (window.ActivityService && typeof window.ActivityService.logViewProject === 'function') {
                const authorsStr = Array.isArray(project.authors) ? project.authors.join(', ') : (project.authors || '');
                window.ActivityService.logViewProject(project.id, project.title, authorsStr, project.program);
            }

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
    window.openProjectDetails = openProjectDetails;

    // Sorting Logic with Radio Buttons
    const sortRadios = document.querySelectorAll('input[name="sortField"], input[name="sortOrder"]');
    
    function applySorting() {
        const fieldRadio = document.querySelector('input[name="sortField"]:checked');
        const orderRadio = document.querySelector('input[name="sortOrder"]:checked');
        
        if (!fieldRadio || !orderRadio) return;
        
        const sortField = fieldRadio.value;
        const sortOrder = orderRadio.value; // 'asc' or 'desc'
        const modifier = sortOrder === 'asc' ? 1 : -1;

        const compareProjects = (a, b) => {
            if (sortField === 'createdAt') {
                // Handle both Firestore Timestamps and cached dates
                let dateA = 0;
                let dateB = 0;
                
                if (a.createdAt) {
                    if (typeof a.createdAt.toMillis === 'function') {
                        dateA = a.createdAt.toMillis();
                    } else if (typeof a.createdAt === 'object' && a.createdAt.seconds) {
                        dateA = a.createdAt.seconds * 1000;
                    } else {
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
                const getAdviserSortKey = (val) => {
                    if (typeof AcademicNameParser !== 'undefined' && AcademicNameParser.getSortKey) {
                        return AcademicNameParser.getSortKey(val);
                    }
                    return (val || '').toLowerCase();
                };
                const advA = getAdviserSortKey(a.adviser);
                const advB = getAdviserSortKey(b.adviser);
                return advA.localeCompare(advB) * modifier;
            }
            else if (sortField === 'authorsCount') {
                const countA = Array.isArray(a.authors) ? a.authors.length : 1;
                const countB = Array.isArray(b.authors) ? b.authors.length : 1;
                return (countA - countB) * modifier;
            }
            else if (sortField === 'saveCount') {
                const countA = (typeof a.saveCount === 'number') ? a.saveCount : (savedProjectIds.includes(a.id) ? 1 : 0);
                const countB = (typeof b.saveCount === 'number') ? b.saveCount : (savedProjectIds.includes(b.id) ? 1 : 0);
                return (countA - countB) * modifier;
            }
            return 0;
        };

        if (isRAGResults) {
            // Keep the 80%+ and <80% tiers grouped, while sorting by the selected field within each tier
            const highTier = allProjects.filter(p => (p.relevanceScore || 0) >= 0.8);
            const moderateTier = allProjects.filter(p => (p.relevanceScore || 0) < 0.8);
            highTier.sort(compareProjects);
            moderateTier.sort(compareProjects);
            allProjects = [...highTier, ...moderateTier];
        } else {
            allProjects.sort(compareProjects);
        }

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
            const lastCached = metadata.lastCached ? new Date(metadata.lastCached).getTime() : 0;
            const isRecent = (Date.now() - lastCached) < (15 * 60 * 1000); // 15 mins
            
            console.log(`📦 Cached: ${cachedCount} projects, update counter: ${cachedUpdateCounter}`);
            
            // Try fetching RTDB counters with timeout
            let rtdbData = null;
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2500);
                const rtdbResponse = await fetch('https://re-caps-default-rtdb.asia-southeast1.firebasedatabase.app/.json', {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (rtdbResponse.ok) {
                    rtdbData = await rtdbResponse.json();
                }
            } catch (err) {
                // RTDB unreachable or connection reset
            }
            
            if (!rtdbData) {
                // If RTDB is temporarily unreachable, trust fresh local cache
                if (isRecent && cachedCount > 0) {
                    console.log('✓ RTDB offline, using fresh local cache');
                    return true;
                }
                return false;
            }
            
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
            console.warn('Cache validation check bypassed, fetching fresh:', error);
            return false;
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
            let rtdbData = {};
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2500);
                const rtdbResponse = await fetch('https://re-caps-default-rtdb.asia-southeast1.firebasedatabase.app/.json', {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (rtdbResponse.ok) {
                    rtdbData = await rtdbResponse.json() || {};
                }
            } catch (err) {
                // RTDB optional - use fallback metadata
            }
            
            const metadata = {
                projectCount: rtdbData.projects_document_count || projects.length,
                updateCounter: rtdbData.update_counter || Date.now(),
                lastCached: new Date().toISOString()
            };
            
            // Save projects data
            localStorage.setItem('projectsData', JSON.stringify(projects));
            
            // Save metadata
            localStorage.setItem('projectsMetadata', JSON.stringify(metadata));
            
            console.log(`✓ Cached ${projects.length} projects with metadata:`, metadata);
            
            // Ensure UI counter updates immediately
            const countElement = document.getElementById('total-projects-count');
            if (countElement) {
                countElement.textContent = projects.length;
            }
            
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
                    masterProjects = [...cachedProjects];
                    allProjects = [...masterProjects];
                    console.log('🚀 Using cached data - instant load!');
                    
                    // Apply default sort
                    updateScopeBadges();
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

            // Gentle indicator if Firestore takes longer than 5 seconds
            const slowTimer = setTimeout(() => {
                const currentText = projectsContainer.querySelector('.loading-text');
                if (currentText && !projectsContainer.querySelector('.firestore-offline-card')) {
                    currentText.innerHTML = '<span class="loading-pulse-dot"></span> Connecting to Cloud Firestore (taking longer than usual)...';
                }
            }, 5000);

            let querySnapshot;
            try {
                querySnapshot = await db.collection('projects').get();
            } finally {
                clearTimeout(slowTimer);
            }
            
            allProjects = [];
            querySnapshot.forEach(doc => {
                const data = doc.data();
                data.id = doc.id;
                allProjects.push(data);
            });

            masterProjects = [...allProjects];

            if (allProjects.length === 0) {
                const totalProjectsCountElement = document.getElementById('total-projects-count');
                const knownCount = totalProjectsCountElement ? parseInt(totalProjectsCountElement.textContent, 10) : 0;
                const isFromCache = querySnapshot.metadata && querySnapshot.metadata.fromCache;
                const isOfflineIssue = isFromCache || window.firestoreConnectionTrouble || (knownCount > 0);

                if (isOfflineIssue) {
                    renderFirestoreOfflineState(projectsContainer, knownCount);
                } else {
                    projectsContainer.innerHTML = '<p class="loading-text">No capstone projects found.</p>';
                }
                if (paginationContainer) paginationContainer.innerHTML = '';
                return;
            }
            
            // Save to cache
            await saveToCache(allProjects);

            // Apply default sort (Date Created, Descending)
            updateScopeBadges();
            applySorting();

        } catch (error) {
            console.error("Error fetching projects: ", error);
            const totalProjectsCountElement = document.getElementById('total-projects-count');
            const knownCount = totalProjectsCountElement ? parseInt(totalProjectsCountElement.textContent, 10) : 0;
            renderFirestoreOfflineState(projectsContainer, knownCount, error);
        }
    }

    /**
     * Render a friendly, actionable offline/connection error card
     */
    function renderFirestoreOfflineState(container, knownCount = 0, error = null) {
        if (!container) return;
        
        container.innerHTML = `
            <div class="firestore-offline-card">
                <div class="offline-icon-box">
                    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
                        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
                        <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
                        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
                        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
                        <line x1="12" y1="20" x2="12.01" y2="20"></line>
                    </svg>
                </div>
                <h3 class="offline-card-title">Cloud Firestore Connection Notice</h3>
                <p class="offline-card-desc">
                    The database backend did not respond within 10 seconds. The client is operating in offline mode. Please check your internet connection or try reconnecting below.
                </p>
                ${knownCount > 0 ? `
                    <div class="offline-count-badge">
                        <span class="pulse-dot"></span>
                        <span><strong>${knownCount}</strong> published capstone projects awaiting sync</span>
                    </div>
                ` : ''}
                <div class="offline-card-actions">
                    <button id="btn-retry-firestore-fetch" class="btn-retry-firestore" type="button">
                        <svg class="retry-spin-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <polyline points="1 20 1 14 7 14"></polyline>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                        </svg>
                        <span>Retry Connection</span>
                    </button>
                </div>
            </div>
        `;

        const retryBtn = container.querySelector('#btn-retry-firestore-fetch');
        if (retryBtn) {
            retryBtn.addEventListener('click', async () => {
                retryBtn.disabled = true;
                retryBtn.classList.add('loading');
                const btnSpan = retryBtn.querySelector('span');
                if (btnSpan) btnSpan.textContent = 'Reconnecting...';

                if (window.NetworkMonitor && typeof window.NetworkMonitor.retryFirestore === 'function') {
                    await window.NetworkMonitor.retryFirestore();
                } else if (typeof db !== 'undefined' && db && db.enableNetwork) {
                    try {
                        await db.enableNetwork();
                    } catch (e) {
                        console.warn('Network enable error:', e);
                    }
                }

                setTimeout(() => {
                    fetchProjects();
                }, 600);
            });
        }
    }

    /**
     * Create a visual section divider for Semantic Relevance tiers (RAG Search)
     * @param {'high' | 'moderate'} type - 'high' (>=80%) or 'moderate' (<80%)
     * @param {number} count - Total projects in this tier
     * @returns {HTMLElement} - The divider DOM element
     */
    function createRelevanceDivider(type, count) {
        const divider = document.createElement('div');
        divider.className = `rag-relevance-divider ${type}`;
        
        const isHigh = type === 'high';
        const titleText = isHigh ? '80% and Above Match' : 'Below 80% Match';
        const sublabel = isHigh ? 'Highly Relevant' : 'Moderate Relevance';
        const countText = count > 0 ? `${count} ${count === 1 ? 'project' : 'projects'}` : '';

        const iconSvg = isHigh
            ? ((typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('bookmark-saved') : '&#9733;')
            : ((typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('req-circle') : '&#9432;');

        divider.innerHTML = `
            <div class="divider-line left"></div>
            <div class="divider-badge ${type}">
                <span class="divider-icon">${iconSvg}</span>
                <span class="divider-title">${titleText}</span>
                <span class="divider-sublabel">${sublabel}</span>
                ${countText ? `<span class="divider-count">${countText}</span>` : ''}
            </div>
            <div class="divider-line right"></div>
        `;
        
        return divider;
    }

    function renderPage(page) {
        currentPage = page;
        projectsContainer.innerHTML = ''; 

        if (allProjects.length === 0) {
            if (currentScope === 'saved') {
                projectsContainer.innerHTML = `
                    <div class="saved-empty-state" style="margin: 2rem auto; width: 100%;">
                        <div class="saved-empty-icon-wrap">
                            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                            </svg>
                        </div>
                        <h2 class="saved-empty-title">No saved projects yet</h2>
                        <p class="saved-empty-desc">
                            You haven't saved any capstone projects yet. Click the <strong>Save</strong> button on any project card to bookmark it.
                        </p>
                        <button type="button" class="saved-browse-btn" id="empty-scope-back-btn">
                            View All Projects
                        </button>
                    </div>
                `;
                const backBtn = projectsContainer.querySelector('#empty-scope-back-btn');
                if (backBtn) {
                    backBtn.addEventListener('click', () => {
                        applyScopeFilter('all');
                    });
                }
                renderPagination(0);
                return;
            }
        }
        
        const startIndex = (page - 1) * PROJECTS_PER_PAGE;
        const endIndex = startIndex + PROJECTS_PER_PAGE;
        const projectsToShow = allProjects.slice(startIndex, endIndex);

        // Section divider tracking for RAG semantic search relevance grouping
        let hasShownHighDivider = false;
        let hasShownModerateDivider = false;

        const highCount = isRAGResults 
            ? allProjects.filter(p => typeof p.relevanceScore === 'number' && p.relevanceScore >= 0.8).length 
            : 0;
        const moderateCount = isRAGResults 
            ? allProjects.filter(p => typeof p.relevanceScore === 'number' && p.relevanceScore < 0.8).length 
            : 0;

        projectsToShow.forEach(data => {
            // Check if we should insert category divider for RAG semantic search results
            if (isRAGResults && typeof data.relevanceScore === 'number') {
                if (data.relevanceScore >= 0.8) {
                    if (!hasShownHighDivider) {
                        projectsContainer.appendChild(createRelevanceDivider('high', highCount));
                        hasShownHighDivider = true;
                    }
                } else {
                    if (!hasShownModerateDivider) {
                        projectsContainer.appendChild(createRelevanceDivider('moderate', moderateCount));
                        hasShownModerateDivider = true;
                    }
                }
            }

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
            const effectiveSaveCount = getEffectiveSaveCount(data, isSaved);
            const formattedSaveCount = formatSaveCount(effectiveSaveCount);

            // Generate relevance badge & tier styling if this is a RAG result
            let relevanceBadge = '';
            let cardTierClass = '';
            if (isRAGResults && typeof data.relevanceScore === 'number') {
                const relevancePercent = (data.relevanceScore * 100).toFixed(0);
                const isHighTier = data.relevanceScore >= 0.8;
                const badgeClass = isHighTier ? 'high' : (data.relevanceScore >= 0.6 ? 'medium' : 'low');
                cardTierClass = isHighTier ? 'relevance-tier-high' : 'relevance-tier-moderate';

                relevanceBadge = `
                    <div class="relevance-badge ${badgeClass}" title="Semantic relevance score: ${relevancePercent}%">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M12 6v6l4 2"></path>
                        </svg>
                        ${relevancePercent}% Match
                    </div>
                `;
            }

            const card = document.createElement('div');
            card.className = `project-card ${cardTierClass}`.trim();
            
            // Admin limitation: Admins cannot save projects, but can see community save metrics
            const isAdmin = isAdminUser();
            const saveButtonHtml = isAdmin ? `
                <div class="project-save-counter-pill ${effectiveSaveCount > 0 ? 'has-saves' : ''}" data-id="${projectId}" title="${effectiveSaveCount} ${effectiveSaveCount === 1 ? 'user' : 'users'} saved this project">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="${effectiveSaveCount > 0 ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span class="save-pill-count">${formattedSaveCount}</span>
                    <span class="save-pill-label">${effectiveSaveCount === 1 ? 'save' : 'saves'}</span>
                </div>
            ` : `
                <button class="${saveBtnClass}" type="button" data-id="${projectId}" aria-label="${isSaved ? 'Remove from saved' : 'Save project'}" title="${isSaved ? 'Saved to bookmarks (click to remove)' : 'Save this project'}">
                    <span class="btn-save-icon" id="save-icon-${projectId}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="bookmark-icon-svg" aria-hidden="true">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </span>
                    <span class="btn-text">${saveBtnText}</span>
                    <span class="btn-save-divider" aria-hidden="true"></span>
                    <span class="btn-save-count" data-count="${effectiveSaveCount}">${formattedSaveCount}</span>
                </button>
            `;

            card.innerHTML = `
                <div class="project-header">
                    <h3 class="project-title">${displayTitle}</h3>
                    <div class="project-header-right">
                        <span class="project-year">${year}</span>
                        ${relevanceBadge}
                    </div>
                </div>
                <div class="project-meta">
                    <span class="meta-icon" id="user-icon-${projectId}"></span>
                    <span class="authors">${displayAuthors}</span>
                    <span class="meta-icon program-icon" id="program-icon-${projectId}"></span>
                    <span class="program">${displayProgram}</span>
                </div>
                <div class="project-abstract">
                    ${displayAbstract}
                </div>
                <div class="project-actions">
                    ${saveButtonHtml}
                    <button class="btn-view-details" type="button">View Details &rarr;</button>
                </div>
            `;
            
            projectsContainer.appendChild(card);

            // Load SVG icons dynamically for this card
            if (typeof loadIcon === 'function') {
                loadIcon('user', `user-icon-${projectId}`, 'meta-icon', { width: 16, height: 16 });
                loadIcon('program', `program-icon-${projectId}`, 'meta-icon', { width: 16, height: 16 });
            }

            const detailsButton = card.querySelector('.btn-view-details');
            if (detailsButton) {
                detailsButton.addEventListener('click', () => openProjectDetails(data));
            }

            const saveButton = card.querySelector('.btn-save');
            if (saveButton && !isAdmin) {
                saveButton.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const wasSaved = saveButton.classList.contains('saved');
                    const nextSaved = !wasSaved;
                    const countEl = saveButton.querySelector('.btn-save-count');
                    const labelEl = saveButton.querySelector('.btn-text');
                    const iconSvg = saveButton.querySelector('.btn-save-icon svg');

                    const prevCount = getEffectiveSaveCount(data, wasSaved);
                    const nextCount = Math.max(0, prevCount + (nextSaved ? 1 : -1));

                    // 1. OPTIMISTIC UI: Instant visual feedback (0ms perceived latency)
                    data.saveCount = nextCount;
                    saveButton.classList.toggle('saved', nextSaved);
                    if (labelEl) labelEl.textContent = nextSaved ? 'Saved' : 'Save';
                    if (countEl) {
                        countEl.textContent = formatSaveCount(nextCount);
                        countEl.setAttribute('data-count', nextCount);
                    }
                    if (iconSvg) {
                        iconSvg.setAttribute('fill', nextSaved ? 'currentColor' : 'none');
                    }
                    saveButton.setAttribute('title', nextSaved ? 'Saved to bookmarks (click to remove)' : 'Save this project');
                    saveButton.setAttribute('aria-label', nextSaved ? 'Remove from saved' : 'Save project');

                    // Micro-animation pop trigger
                    saveButton.classList.remove('optimistic-pop');
                    void saveButton.offsetWidth; // Force reflow
                    saveButton.classList.add('optimistic-pop');
                    setTimeout(() => saveButton.classList.remove('optimistic-pop'), 400);

                    // Update memory state
                    if (nextSaved) {
                        if (!savedProjectIds.includes(projectId)) savedProjectIds.push(projectId);
                    } else {
                        savedProjectIds = savedProjectIds.filter(id => id !== projectId);
                    }
                    window.savedProjectIds = savedProjectIds;

                    // Sync to all other open views immediately
                    window.dispatchEvent(new CustomEvent('projectSavedStateChanged', {
                        detail: { projectId, isSaved: nextSaved, saveCount: nextCount }
                    }));

                    // Update master list references
                    const targetInAll = allProjects.find(p => p.id === projectId);
                    if (targetInAll) targetInAll.saveCount = nextCount;
                    const targetInMaster = masterProjects.find(p => p.id === projectId);
                    if (targetInMaster) targetInMaster.saveCount = nextCount;

                    // 2. Perform background persistence
                    const user = firebase.auth().currentUser;
                    if (!user) {
                        // Guest mode: save locally on device
                        if (nextSaved) {
                            if (window.GuestSavedProjects) window.GuestSavedProjects.save(data);
                            if (typeof db !== 'undefined' && db.collection) {
                                db.collection('projects').doc(projectId).set({
                                    saveCount: firebase.firestore.FieldValue.increment(1)
                                }, { merge: true }).catch(err => console.warn('[RE-CAPS] Guest increment warning:', err));
                            }
                            if (typeof showToast === 'function') {
                                showToast('Project saved locally on this device. Sign in to sync across devices.', 'success');
                            }
                        } else {
                            if (window.GuestSavedProjects) window.GuestSavedProjects.remove(projectId);
                            if (typeof db !== 'undefined' && db.collection) {
                                db.collection('projects').doc(projectId).set({
                                    saveCount: firebase.firestore.FieldValue.increment(-1)
                                }, { merge: true }).catch(err => console.warn('[RE-CAPS] Guest decrement warning:', err));
                            }
                            if (typeof showToast === 'function') {
                                showToast('Project removed from this device', 'info');
                            }
                        }
                        syncSavedProjectsWithLocalStorage();
                        updateScopeBadges();
                        if (currentScope === 'saved') {
                            applyScopeFilter('saved');
                        }
                        return;
                    }

                    // Authenticated user mode: background Firestore update
                    try {
                        if (nextSaved) {
                            await saveProjectToFirestore(user.uid, projectId);
                            if (typeof showToast === 'function') {
                                showToast('Project saved to your account', 'success');
                            }
                        } else {
                            await removeProjectFromFirestore(user.uid, projectId);
                            if (typeof showToast === 'function') {
                                showToast('Project removed from saved projects', 'info');
                            }
                        }
                        updateScopeBadges();
                        if (currentScope === 'saved') {
                            applyScopeFilter('saved');
                        }
                    } catch (error) {
                        console.error('Failed to sync bookmark to Firestore:', error);
                        // Rollback on network/permission error
                        data.saveCount = prevCount;
                        if (targetInAll) targetInAll.saveCount = prevCount;
                        if (targetInMaster) targetInMaster.saveCount = prevCount;

                        if (wasSaved) {
                            if (!savedProjectIds.includes(projectId)) savedProjectIds.push(projectId);
                        } else {
                            savedProjectIds = savedProjectIds.filter(id => id !== projectId);
                        }
                        window.savedProjectIds = savedProjectIds;

                        saveButton.classList.toggle('saved', wasSaved);
                        if (labelEl) labelEl.textContent = wasSaved ? 'Saved' : 'Save';
                        if (countEl) {
                            countEl.textContent = formatSaveCount(prevCount);
                            countEl.setAttribute('data-count', prevCount);
                        }
                        if (iconSvg) {
                            iconSvg.setAttribute('fill', wasSaved ? 'currentColor' : 'none');
                        }

                        window.dispatchEvent(new CustomEvent('projectSavedStateChanged', {
                            detail: { projectId, isSaved: wasSaved, saveCount: prevCount }
                        }));

                        if (typeof showToast === 'function') {
                            showToast('Unable to update saved project. Changes reverted.', 'error');
                        }
                    }
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
    
    // Fetch Projects Count from RTDB with smart fallback
    async function fetchProjectsCount() {
        const countElement = document.getElementById('total-projects-count');
        
        // Immediate fallback if allProjects is already loaded
        if (allProjects && allProjects.length > 0 && countElement) {
            countElement.textContent = allProjects.length;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2500);
            const response = await fetch('https://re-caps-default-rtdb.asia-southeast1.firebasedatabase.app/projects_document_count.json', {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const count = await response.json();
                if (countElement && count !== null && count !== undefined) {
                    countElement.textContent = count;
                    return;
                }
            }
        } catch (error) {
            // RTDB count endpoint unavailable or connection reset - fallback gracefully
        }

        // Final fallback: use allProjects length or cached count
        if (countElement) {
            if (allProjects && allProjects.length > 0) {
                countElement.textContent = allProjects.length;
            } else {
                const cached = localStorage.getItem('projectsData');
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        countElement.textContent = parsed.length;
                    } catch (e) {
                        countElement.textContent = '0';
                    }
                }
            }
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
    
    /**
     * Real-time Word-by-Word Search implementation
     * Rapid in-memory filtering that tokenizes search input word-by-word
     */
    function performRealtimeSearch(query) {
        if (!query || !query.trim()) {
            resetRealtimeSearch();
            return masterProjects.length;
        }

        // Ensure masterProjects is populated
        if (masterProjects.length === 0) {
            const cached = loadFromCache();
            if (cached && cached.length > 0) {
                masterProjects = [...cached];
            } else if (allProjects.length > 0 && !isRAGResults) {
                masterProjects = [...allProjects];
            }
        }

        const cleanQuery = query.trim();
        window.currentSearchQuery = cleanQuery;
        isRAGResults = false;

        const rawTokens = cleanQuery.toLowerCase().split(/\s+/).filter(t => t.length > 0);
        if (rawTokens.length === 0) {
            resetRealtimeSearch();
            return masterProjects.length;
        }

        const programAliases = {
            'bsie': ['bsie', 'industrial engineering', 'industrial'],
            'industrial engineering': ['bsie', 'industrial engineering', 'industrial'],
            'bit-electronics': ['bit-electronics', 'electronics', 'electronics technology', 'bit electronics'],
            'electronics': ['bit-electronics', 'electronics', 'electronics technology', 'bit electronics'],
            'bshm': ['bshm', 'hospitality management', 'hospitality', 'bs hospitality management'],
            'hospitality management': ['bshm', 'hospitality management', 'hospitality'],
            'bit-automotive': ['bit-automotive', 'automotive', 'automotive technology', 'bit automotive'],
            'automotive': ['bit-automotive', 'automotive', 'automotive technology']
        };

        const filtered = masterProjects.filter(project => {
            const title = (project.title || '').toLowerCase();
            const abstract = (project.abstract || '').toLowerCase();
            const program = (project.program || '').toLowerCase();
            const department = (project.department || '').toLowerCase();
            const authors = Array.isArray(project.authors)
                ? project.authors.join(' ').toLowerCase()
                : String(project.authors || '').toLowerCase();
            const keywords = Array.isArray(project.keywords)
                ? project.keywords.join(' ').toLowerCase()
                : String(project.keywords || '').toLowerCase();
            const year = String(project.year || '').toLowerCase();
            const adviser = (project.adviser || '').toLowerCase();

            let adviserPool = adviser;
            if (typeof AcademicNameParser !== 'undefined' && AcademicNameParser.parse && project.adviser) {
                const pAdv = AcademicNameParser.parse(project.adviser);
                if (pAdv) {
                    adviserPool = `${adviser} ${pAdv.surname} ${pAdv.firstName} ${pAdv.fullDisplay}`.toLowerCase();
                }
            }

            let programPool = program;
            for (const [key, aliases] of Object.entries(programAliases)) {
                if (program.includes(key)) {
                    programPool += ' ' + aliases.join(' ');
                }
            }

            const fullSearchPool = `${title} ${abstract} ${programPool} ${department} ${authors} ${keywords} ${year} ${adviserPool}`;

            // Real-time word-by-word match: every typed word must match
            return rawTokens.every(token => fullSearchPool.includes(token));
        });

        allProjects = filtered;
        currentPage = 1;

        const countElement = document.getElementById('total-projects-count');
        if (countElement) {
            countElement.textContent = filtered.length;
        }

        if (filtered.length === 0) {
            projectsContainer.innerHTML = `
                <div class="no-projects-found" style="text-align: center; padding: 3rem 1.5rem; width: 100%; grid-column: 1 / -1;">
                     <div style="font-size: 3rem; margin-bottom: 0.75rem;">🔍</div>
                    <h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary, #1e293b);">No capstone projects found</h3>
                    <p style="color: var(--text-secondary, #64748b); max-width: 480px; margin: 0 auto 1.5rem;">
                        No results found matching "<strong>${escapeHtml(cleanQuery)}</strong>". Try checking for typos or searching a different term.
                    </p>
                    <button type="button" class="btn-secondary" id="btn-reset-realtime-search" style="padding: 0.5rem 1.25rem; border-radius: 8px; cursor: pointer;">
                        Clear Search
                    </button>
                </div>
            `;
            const resetBtn = document.getElementById('btn-reset-realtime-search');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    const searchInput = document.querySelector('.search-input');
                    const searchClearBtn = document.querySelector('.search-clear-btn');
                    if (searchInput) searchInput.value = '';
                    if (searchClearBtn) searchClearBtn.style.display = 'none';
                    resetRealtimeSearch();
                });
            }
            if (paginationContainer) paginationContainer.innerHTML = '';
        } else {
            applySorting();
        }

        return filtered.length;
    }

    /**
     * Reset Real-time Search and restore full master projects list
     */
    function resetRealtimeSearch() {
        window.currentSearchQuery = null;
        isRAGResults = false;

        if (masterProjects.length === 0) {
            const cached = loadFromCache();
            if (cached && cached.length > 0) {
                masterProjects = [...cached];
            }
        }

        allProjects = [...masterProjects];
        currentPage = 1;

        const countElement = document.getElementById('total-projects-count');
        if (countElement) {
            countElement.textContent = allProjects.length;
        }

        applySorting();
    }

    // Wrapper function to clear search state
    window.clearSearchStateWrapper = function() {
        window.currentSearchQuery = null;
        isRAGResults = false;
        if (masterProjects.length > 0) {
            allProjects = [...masterProjects];
        }
    };
    
    // Wrapper functions for external access
    window.performRealtimeSearchWrapper = performRealtimeSearch;
    window.resetRealtimeSearchWrapper = resetRealtimeSearch;
    window.getMasterProjectsWrapper = () => masterProjects;

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
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                // Resolve user role
                let role = sessionStorage.getItem('userType');
                if (!role && window.AuthService) {
                    role = await window.AuthService.getUserType(user.uid);
                } else if (!role && typeof db !== 'undefined') {
                    try {
                        const userDoc = await db.collection('users').doc(user.uid).get();
                        if (userDoc.exists) {
                            role = userDoc.data().userType;
                            if (role) sessionStorage.setItem('userType', role);
                        }
                    } catch (e) {
                        console.warn('Could not fetch user role in project-list:', e);
                    }
                }
                currentUserRole = role;

                if (isAdminUser()) {
                    // Admin limitation: Admins cannot save projects. Clear bookmarks and re-render without save buttons
                    savedProjectIds = [];
                    savedProjectsFull = [];
                    localStorage.removeItem('savedProjects');
                    renderPage(currentPage);
                } else {
                    // Load saved projects from Firestore for students / regular users
                    await loadSavedProjectsFromFirestore(user.uid);
                }
            } else {
                currentUserRole = null;
                // User logged out: restore guest saved projects from local device
                if (window.GuestSavedProjects) {
                    savedProjectIds = window.GuestSavedProjects.getIds();
                } else {
                    savedProjectIds = [];
                }
                savedProjectsFull = [];
                localStorage.removeItem('savedProjects');
                renderPage(currentPage);
            }
        });

        // Listen for immediate role changes (e.g. login from auth-modal)
        window.addEventListener('authRoleUpdated', (e) => {
            if (e.detail && e.detail.role) {
                currentUserRole = e.detail.role;
                if (isAdminUser()) {
                    savedProjectIds = [];
                    savedProjectsFull = [];
                    localStorage.removeItem('savedProjects');
                }
                renderPage(currentPage);
            }
        });

        // Listen for guest storage updates (e.g. after sync or delete)
        window.addEventListener('guestSavedProjectsChanged', () => {
            const currentUser = firebase.auth().currentUser;
            if (!currentUser && window.GuestSavedProjects && !isAdminUser()) {
                savedProjectIds = window.GuestSavedProjects.getIds();
                window.savedProjectIds = savedProjectIds;
                updateScopeBadges();
                if (currentScope === 'saved') {
                    applyScopeFilter('saved');
                } else {
                    renderPage(currentPage);
                }
            }
        });

        // Listen for project bookmark state changes (e.g. from details view or dashboard)
        window.addEventListener('projectSavedStateChanged', (e) => {
            if (e && e.detail && e.detail.projectId) {
                const targetId = e.detail.projectId;
                const isNowSaved = Boolean(e.detail.isSaved);
                const newCount = typeof e.detail.saveCount === 'number' ? e.detail.saveCount : null;

                if (!isAdminUser()) {
                    if (isNowSaved) {
                        if (!savedProjectIds.includes(targetId)) {
                            savedProjectIds.push(targetId);
                        }
                    } else {
                        savedProjectIds = savedProjectIds.filter(id => id !== targetId);
                    }
                    window.savedProjectIds = savedProjectIds;
                    syncSavedProjectsWithLocalStorage();
                    updateScopeBadges();
                    if (currentScope === 'saved') {
                        applyScopeFilter('saved');
                    }
                }

                // Update data in in-memory arrays
                const projInAll = allProjects.find(p => p.id === targetId);
                if (projInAll && newCount !== null) projInAll.saveCount = newCount;
                const projInMaster = masterProjects.find(p => p.id === targetId);
                if (projInMaster && newCount !== null) projInMaster.saveCount = newCount;

                // Dynamically update corresponding card button in current DOM
                const cardBtn = document.querySelector(`.btn-save[data-id="${targetId}"]`);
                if (cardBtn) {
                    cardBtn.classList.toggle('saved', isNowSaved);
                    const btnText = cardBtn.querySelector('.btn-text');
                    if (btnText) btnText.textContent = isNowSaved ? 'Saved' : 'Save';
                    const iconSvg = cardBtn.querySelector('.btn-save-icon svg');
                    if (iconSvg) iconSvg.setAttribute('fill', isNowSaved ? 'currentColor' : 'none');
                    if (newCount !== null) {
                        const countEl = cardBtn.querySelector('.btn-save-count');
                        if (countEl) {
                            countEl.textContent = formatSaveCount(newCount);
                            countEl.setAttribute('data-count', newCount);
                        }
                    }
                }

                // Also update admin counter pill if present
                const adminPill = document.querySelector(`.project-save-counter-pill[data-id="${targetId}"]`);
                if (adminPill && newCount !== null) {
                    adminPill.classList.toggle('has-saves', newCount > 0);
                    const pillCount = adminPill.querySelector('.save-pill-count');
                    if (pillCount) pillCount.textContent = formatSaveCount(newCount);
                    const pillLabel = adminPill.querySelector('.save-pill-label');
                    if (pillLabel) pillLabel.textContent = newCount === 1 ? 'save' : 'saves';
                    adminPill.title = `${newCount} ${newCount === 1 ? 'user saved' : 'users saved'} this project`;
                }
            } else {
                const currentUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
                if (!currentUser && window.GuestSavedProjects) {
                    savedProjectIds = window.GuestSavedProjects.getIds();
                    window.savedProjectIds = savedProjectIds;
                }
                updateScopeBadges();
                if (currentScope === 'saved') {
                    applyScopeFilter('saved');
                } else {
                    renderPage(currentPage);
                }
            }
        });
    } else {
        console.warn('Firebase Auth is not available, skipping users cache fetch');
    }

    // Listen for Firestore auto-reconnect event
    window.addEventListener('firestore:reconnected', () => {
        if (!allProjects || allProjects.length === 0) {
            console.log('🔄 Reconnected to Firestore, re-fetching projects...');
            fetchProjects();
        }
    });
});
