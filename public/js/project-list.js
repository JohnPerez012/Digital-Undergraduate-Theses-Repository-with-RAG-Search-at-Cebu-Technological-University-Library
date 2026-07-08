// Global ProjectList object for external access (e.g., from search-handler.js)
window.ProjectList = {
    displaySearchResults: function(projects, query, isRAGSearch = false) {
        console.log(`📋 Displaying ${projects.length} search results (RAG: ${isRAGSearch})`);
        
        // Update the internal allProjects array
        if (typeof updateProjectsForSearch === 'function') {
            updateProjectsForSearch(projects, isRAGSearch);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const projectsContainer = document.getElementById('projects-container');
    const paginationContainer = document.getElementById('pagination-container');
    
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
            window.location.href = 'view_project_details.html';
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
                const dateA = a.createdAt ? a.createdAt.toMillis() : 0;
                const dateB = b.createdAt ? b.createdAt.toMillis() : 0;
                return (dateA - dateB) * modifier;
            } 
            else if (sortField === 'updatedAt') {
                const dateA = a.updatedAt ? a.updatedAt.toMillis() : (a.createdAt ? a.createdAt.toMillis() : 0);
                const dateB = b.updatedAt ? b.updatedAt.toMillis() : (b.createdAt ? b.createdAt.toMillis() : 0);
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

    // Fetch Projects Logic
    async function fetchProjects() {
        if (!projectsContainer) return;
        
        try {
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

        // Get saved projects to set initial state
        let savedProjects = [];
        try {
            savedProjects = JSON.parse(localStorage.getItem('savedProjects')) || [];
        } catch(e) {}

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
            
            const isSaved = savedProjects.some(p => p.id === projectId);
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
                    <h3 class="project-title">${title}</h3>
                    <div class="project-header-right">
                        <span class="project-year">${year}</span>
                        ${relevanceBadge}
                    </div>
                </div>
                <div class="project-meta">
                    <svg class="meta-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    <span class="authors">${authorsStr}</span>
                    <svg class="meta-icon program-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
                    <span class="program">${program}</span>
                </div>
                <div class="project-abstract">
                    ${abstract}
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
                saveButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isCurrentlySaved = saveButton.classList.contains('saved');
                    let currentSavedProjects = JSON.parse(localStorage.getItem('savedProjects')) || [];
                    
                    if (isCurrentlySaved) {
                        // Unsave
                        currentSavedProjects = currentSavedProjects.filter(p => p.id !== projectId);
                        saveButton.classList.remove('saved');
                        saveButton.querySelector('.btn-text').textContent = 'Save';
                    } else {
                        // Save
                        if (!currentSavedProjects.some(p => p.id === projectId)) {
                            currentSavedProjects.push({
                                id: projectId,
                                title: title,
                                year: year,
                                program: program,
                                rawData: data // Store original data just in case
                            });
                        }
                        saveButton.classList.add('saved');
                        saveButton.querySelector('.btn-text').textContent = 'Saved';
                    }
                    
                    localStorage.setItem('savedProjects', JSON.stringify(currentSavedProjects));
                    
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

    // Initialize
    fetchProjectsCount();
    fetchProjects();
});
