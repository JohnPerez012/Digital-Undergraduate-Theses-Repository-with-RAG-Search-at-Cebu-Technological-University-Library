/**
 * User Dashboard Logic
 * Handles rendering of saved projects on the student dashboard (student_page.html).
 */

document.addEventListener('DOMContentLoaded', () => {
    const savedProjectsList = document.getElementById('saved-projects-list');
    const clearSavedBtn = document.getElementById('clear-saved-btn');

    // Only run if the saved projects section is present (i.e., on student_page.html)
    if (!savedProjectsList) return;

    // Initial render
    renderSavedProjects();

    // Clear All button
    if (clearSavedBtn) {
        clearSavedBtn.addEventListener('click', () => {
            localStorage.setItem('savedProjects', JSON.stringify([]));
            renderSavedProjects();
        });
    }

    // Listen to changes from other parts of the app (e.g., unsaving from a project detail page)
    window.addEventListener('projectSavedStateChanged', () => {
        renderSavedProjects();
    });

    // Render Saved Projects as cards on the dashboard
    function renderSavedProjects() {
        let savedProjects = [];
        try {
            savedProjects = JSON.parse(localStorage.getItem('savedProjects')) || [];
        } catch (e) {
            console.error('Error reading saved projects:', e);
        }

        savedProjectsList.innerHTML = '';

        if (savedProjects.length === 0) {
            savedProjectsList.innerHTML = `
                <li class="saved-empty-state">
                    <span class="saved-empty-icon">🔖</span>
                    <p>No saved projects yet.</p>
                    <a href="index.html" class="saved-empty-link">Explore Projects →</a>
                </li>
            `;
            return;
        }

        savedProjects.forEach(project => {
            const li = document.createElement('li');
            li.className = 'saved-project-card';

            const authors = Array.isArray(project.rawData?.authors)
                ? project.rawData.authors.join(', ')
                : (project.rawData?.authors || 'Unknown Authors');

            const year = project.rawData?.year || '';
            const program = project.rawData?.program || '';

            li.innerHTML = `
                <div class="saved-card-body">
                    <p class="saved-card-meta">${[program, year].filter(Boolean).join(' · ')}</p>
                    <h3 class="saved-card-title">${escapeHtml(project.title)}</h3>
                    <p class="saved-card-authors">${escapeHtml(authors)}</p>
                </div>
                <div class="saved-card-actions">
                    <button class="saved-card-view-btn" data-id="${project.id}">View Details →</button>
                    <button class="saved-card-remove-btn" title="Remove" data-id="${project.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            `;

            // View button
            li.querySelector('.saved-card-view-btn').addEventListener('click', () => {
                sessionStorage.setItem('selectedProjectForViewDetails', JSON.stringify(project.rawData));
                window.location.href = 'view_project_details.html';
            });

            // Remove button
            li.querySelector('.saved-card-remove-btn').addEventListener('click', () => {
                removeSavedProject(project.id);
            });

            savedProjectsList.appendChild(li);
        });
    }

    function removeSavedProject(id) {
        let savedProjects = [];
        try {
            savedProjects = JSON.parse(localStorage.getItem('savedProjects')) || [];
        } catch (e) {}

        savedProjects = savedProjects.filter(p => p.id !== id);
        localStorage.setItem('savedProjects', JSON.stringify(savedProjects));
        renderSavedProjects();
    }

    function escapeHtml(text) {
        return String(text || '').replace(/[&<>"']/g, match => {
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
            return map[match] || match;
        });
    }
});
