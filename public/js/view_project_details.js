document.addEventListener('DOMContentLoaded', () => {
    const projectDataJson = sessionStorage.getItem('selectedProjectForViewDetails');
    const detailsGrid = document.getElementById('details-grid');
    const detailsLeft = document.getElementById('details-left');
    const detailsSidebar = document.getElementById('details-sidebar');
    const detailsEmpty = document.getElementById('details-empty');

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

    function renderProjectDetails(project) {
        if (!detailsGrid || !detailsLeft || !detailsSidebar || !detailsEmpty) return;

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
        
        
    }

    if (projectDataJson) {
        try {
            const project = JSON.parse(projectDataJson);
            if (project && Object.keys(project).length > 0) {
                renderProjectDetails(project);
            } else {
                window.location.replace('index.html');
            }
        } catch (error) {
            console.error('Invalid project data:', error);
            window.location.replace('index.html');
        }
    } else {
        window.location.replace('index.html');
    }
});
