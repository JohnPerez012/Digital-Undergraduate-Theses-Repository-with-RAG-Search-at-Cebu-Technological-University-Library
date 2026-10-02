/**
 * RE-CAPS Student Dashboard Controller
 * Clean, Truthful, Academic Research Hub - Simple & Consistent Light/Dark
 */

document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 1. TRUTHFUL GREETING & PROFILE IDENTITY (No "Administrator" on Student Page)
    // =========================================================================
    function updateStudentGreeting() {
        const hour = new Date().getHours();
        let greetingText = 'Good evening';
        if (hour < 12) greetingText = 'Good morning';
        else if (hour < 18) greetingText = 'Good afternoon';

        function cleanName(val) {
            if (!val || typeof val !== 'string') return null;
            const trimmed = val.trim();
            const lower = trimmed.toLowerCase();
            if (lower === '' || lower === 'null' || lower === 'undefined' || lower === 'unknown' || lower.includes('admin')) {
                return null;
            }
            return trimmed;
        }

        const userType = sessionStorage.getItem('userType');
        const sessionName = sessionStorage.getItem('userName');
        const authUser = (typeof auth !== 'undefined' && auth && auth.currentUser) ||
                         (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser);

        const validAuthName = cleanName(authUser && authUser.displayName);
        const validSessionName = cleanName(sessionName);
        const rawEmail = sessionStorage.getItem('userEmail');
        const validEmailName = cleanName(rawEmail ? rawEmail.split('@')[0] : null);

        let name = 'Student';
        if (validAuthName) {
            name = validAuthName;
        } else if (validSessionName && userType === 'student') {
            name = validSessionName;
        } else if (validEmailName && userType === 'student') {
            name = validEmailName.charAt(0).toUpperCase() + validEmailName.slice(1);
        } else {
            name = 'Student';
        }

        const firstName = name.split(' ')[0] || 'Student';
        const greetingEl = document.getElementById('greeting');
        if (greetingEl) {
            greetingEl.textContent = `${greetingText}, ${firstName}.`;
        }

        // Update rail profile name if present
        const railNameEl = document.getElementById('student-name');
        if (railNameEl) {
            railNameEl.textContent = name;
        }
    }

    updateStudentGreeting();

    // Re-verify when auth state settles
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged(() => {
            updateStudentGreeting();
            refreshLiveCounters();
            renderRecentTheses();
        });
    }

    // =========================================================================
    // 2. RESEARCH LAUNCHPAD NAVIGATION
    // =========================================================================
    // launchpad-chatbot-btn: Redirect directly to index.html and open AI Chatbot screen
    const launchpadChatbotBtn = document.getElementById('launchpad-chatbot-btn');
    if (launchpadChatbotBtn) {
        launchpadChatbotBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sessionStorage.setItem('showChatbotView', 'true');
            window.location.href = '../index.html?view=chatbot#chatbot';
        });
    }

    // launchpad-citations-btn: Automatically go to sidebar citation screen
    const launchpadCitationsBtn = document.getElementById('launchpad-citations-btn');
    if (launchpadCitationsBtn) {
        launchpadCitationsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const citationNav = document.querySelector('.rail-nav-item[data-section="citations"]');
            if (citationNav) {
                citationNav.click();
            } else {
                navigateToSection('citations');
            }
        });
    }

    // launchpad-saved-btn: Automatically go to sidebar saved projects screen
    const launchpadSavedBtn = document.getElementById('launchpad-saved-btn');
    if (launchpadSavedBtn) {
        launchpadSavedBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const savedNav = document.querySelector('.rail-nav-item[data-section="saved"]');
            if (savedNav) {
                savedNav.click();
            } else {
                navigateToSection('saved');
            }
        });
    }

    // Enable Enter / Space key activation on interactive cards
    [launchpadChatbotBtn, launchpadCitationsBtn, launchpadSavedBtn].forEach(card => {
        if (card) {
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    card.click();
                }
            });
        }
    });

    const viewActivityLink = document.getElementById('view-activity-link');
    if (viewActivityLink) {
        viewActivityLink.addEventListener('click', (e) => {
            e.preventDefault();
            const activityNav = document.querySelector('.rail-nav-item[data-section="activity"]');
            if (activityNav) {
                activityNav.click();
            } else {
                navigateToSection('activity');
            }
        });
    }

    function navigateToSection(sectionId) {
        const targetNav = document.querySelector(`.rail-nav-item[data-section="${sectionId}"]`);
        if (targetNav) {
            targetNav.click();
        } else {
            document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
            const sec = document.getElementById(`section-${sectionId}`);
            if (sec) sec.classList.add('active');
        }
    }

    // =========================================================================
    // 3. FUNCTIONABLE BROWSE BY ACADEMIC PROGRAM
    // =========================================================================
    document.querySelectorAll('.program-browse-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const program = btn.getAttribute('data-program');
            if (program) {
                sessionStorage.setItem('pendingSearchQuery', program);
                window.location.href = `../index.html?search=${encodeURIComponent(program)}`;
            }
        });
    });

    // =========================================================================
    // 4. TRUTHFUL LIVE KPI COUNTERS (100% Real Database & Activity Data)
    // =========================================================================
    function refreshLiveCounters() {
        const userId = sessionStorage.getItem('userId') || 
                      (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser ? firebase.auth().currentUser.uid : null) ||
                      'guest';

        // 1. Available Projects (Real count from database)
        const availableEl = document.getElementById('available-projects-count');
        if (availableEl) {
            let count = 0;
            if (window.__allProjectsData && window.__allProjectsData.length > 0) {
                count = window.__allProjectsData.length;
            } else {
                try {
                    const cached = JSON.parse(localStorage.getItem('projectsData') || '[]');
                    count = cached.length;
                } catch (e) {}
            }
            if (count > 0) {
                availableEl.textContent = count;
            } else {
                fetchAvailableProjectsCount();
            }
        }

        // 2. Saved Projects Count
        const savedEl = document.getElementById('saved-projects-count');
        const launchpadSavedEl = document.getElementById('launchpad-saved-count');
        let savedCount = 0;
        try {
            const savedList = JSON.parse(localStorage.getItem('savedProjects') || '[]');
            savedCount = savedList.length;
        } catch (e) {}
        if (savedEl) savedEl.textContent = savedCount;
        if (launchpadSavedEl) launchpadSavedEl.textContent = savedCount;

        // 3. Recently Viewed Projects Count (Truthful from ActivityService)
        const recentViewsEl = document.getElementById('recent-views-count');
        let viewCount = 0;

        if (window.ActivityService && typeof window.ActivityService.getLocalCache === 'function') {
            const activities = window.ActivityService.getLocalCache(userId);
            const projectViews = activities.filter(a => a.category === 'project' && a.action === 'project_viewed');
            
            const uniqueProjectIds = new Set();
            projectViews.forEach(v => {
                const pid = (v.metadata && v.metadata.projectId) || v.title;
                if (pid) uniqueProjectIds.add(pid);
            });
            viewCount = uniqueProjectIds.size;
        }

        if (recentViewsEl) recentViewsEl.textContent = viewCount;
    }

    async function fetchAvailableProjectsCount() {
        try {
            if (typeof db !== 'undefined' && db.collection) {
                const snapshot = await db.collection('projects').get();
                const count = snapshot.size || snapshot.docs.length;
                const availableEl = document.getElementById('available-projects-count');
                if (availableEl && count > 0) {
                    availableEl.textContent = count;
                }
            }
        } catch (err) {
            console.warn('[StudentDashboard] Error fetching project count:', err);
        }
    }

    // Listen for all projects loaded event from user-dashboard.js
    window.addEventListener('allProjectsLoaded', (e) => {
        const count = e.detail?.count || 0;
        const availableEl = document.getElementById('available-projects-count');
        if (availableEl && count > 0) {
            availableEl.textContent = count;
        }
        renderRecentTheses();
    });

    window.addEventListener('projectSavedStateChanged', () => {
        refreshLiveCounters();
    });

    // =========================================================================
    // 5. RECENTLY EXPLORED THESES SPOTLIGHT
    // =========================================================================
    function renderRecentTheses() {
        const container = document.getElementById('recent-theses-container');
        if (!container) return;

        const userId = sessionStorage.getItem('userId') || 
                      (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser ? firebase.auth().currentUser.uid : null) ||
                      'guest';

        let recentViews = [];
        if (window.ActivityService && typeof window.ActivityService.getLocalCache === 'function') {
            const activities = window.ActivityService.getLocalCache(userId);
            recentViews = activities.filter(a => a.category === 'project' && a.action === 'project_viewed');
        }

        const seenIds = new Set();
        const uniqueRecent = [];
        for (const item of recentViews) {
            const key = (item.metadata && item.metadata.projectId) || item.title;
            if (!seenIds.has(key)) {
                seenIds.add(key);
                uniqueRecent.push(item);
            }
            if (uniqueRecent.length >= 4) break;
        }

        if (uniqueRecent.length === 0) {
            container.innerHTML = `
                <div class="recent-theses-empty">
                    <div class="recent-empty-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    </div>
                    <h4>No recent project views yet</h4>
                    <p>Explore undergraduate capstones from CTU Daanbantayan to keep track of your literature trail.</p>
                    <a href="../index.html" class="recent-explore-cta">Browse Capstone Archive →</a>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        uniqueRecent.forEach(item => {
            const projectId = item.metadata?.projectId || '';
            const title = item.metadata?.projectTitle || item.title?.replace('Viewed Project: ', '') || 'Capstone Research';
            const program = item.metadata?.program || 'Undergraduate Thesis';
            const authors = item.metadata?.authors || '';

            const el = document.createElement('div');
            el.className = 'recent-thesis-item';
            el.innerHTML = `
                <div class="recent-thesis-info">
                    <div class="recent-thesis-meta">
                        <span class="recent-program-badge">${escapeHtml(program)}</span>
                    </div>
                    <h4 class="recent-thesis-title" title="${escapeHtml(title)}">${escapeHtml(title)}</h4>
                    ${authors ? `<p class="recent-thesis-authors">${escapeHtml(authors)}</p>` : ''}
                </div>
                <button type="button" class="recent-thesis-action-btn" data-project-id="${projectId}" data-title="${escapeHtml(title)}">
                    <span>View</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                </button>
            `;

            el.querySelector('.recent-thesis-action-btn').addEventListener('click', () => {
                openProjectDetails(projectId, title, program);
            });

            container.appendChild(el);
        });
    }

    function openProjectDetails(projectId, title, program) {
        let projectData = null;
        try {
            const cached = JSON.parse(localStorage.getItem('projectsData') || '[]');
            projectData = cached.find(p => p.id === projectId || p.title === title);
        } catch (e) {}

        if (!projectData) {
            projectData = { id: projectId, title, program };
        }

        sessionStorage.setItem('selectedProjectForViewDetails', JSON.stringify(projectData));
        sessionStorage.setItem('showProjectDetails', 'true');
        window.location.href = '../index.html';
    }

    function escapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, match => {
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
            return map[match] || match;
        });
    }

    // Initial render
    refreshLiveCounters();
    renderRecentTheses();

    // =========================================================================
    // 6. ROTATING DAILY RESEARCH TIP
    // =========================================================================
    const researchTips = [
        "Formulate specific, measurable objectives. When referencing prior theses, note their limitations in Chapter 2 as justification for your proposed methodology.",
        "Always cite primary sources where possible. Use the Citation Generator to keep your bibliography updated as you write.",
        "For hardware or IoT capstones, document your circuit schematics and component bill of materials early in Chapter 3.",
        "A strong Statement of the Problem specifies: (1) The ideal standard, (2) The observed real-world deficiency, and (3) Your proposed technical intervention.",
        "Align your conceptual framework (IPO - Input, Process, Output) directly with each specific research objective in Chapter 1.",
        "Evaluate your prototype with actual target end-users in local Cebu/Daanbantayan community settings for genuine evaluation data."
    ];

    const tipEl = document.getElementById('daily-research-tip');
    if (tipEl) {
        const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
        const selectedTip = researchTips[dayOfYear % researchTips.length];
        tipEl.textContent = selectedTip;
    }

    // =========================================================================
    // 7. CITATION GENERATOR
    // =========================================================================
    // Handled by CitationStudio (shared/citation-generator.js)
    if (!window.CitationStudio) {
        const genCitationBtn = document.getElementById('generate-citation-btn');
        if (genCitationBtn) {
            genCitationBtn.addEventListener('click', () => {
                const format = (document.getElementById('citation-format')?.value || 'apa').toLowerCase();
                const title = document.getElementById('citation-title')?.value.trim() || 'Untitled Research Project';
                const authors = document.getElementById('citation-authors')?.value.trim() || 'Author Unknown';
                const year = document.getElementById('citation-year')?.value.trim() || new Date().getFullYear().toString();
                const outputBox = document.getElementById('citation-output');

                let result = '';
                if (format === 'apa') {
                    result = `${authors} (${year}). ${title}. Cebu Technological University Library Repository.`;
                } else if (format === 'mla') {
                    result = `${authors}. "${title}." Cebu Technological University, ${year}.`;
                } else if (format === 'chicago') {
                    result = `${authors}. "${title}." Undergraduate thesis, Cebu Technological University, ${year}.`;
                } else if (format === 'ieee') {
                    result = `${authors}, "${title}," CTU Undergraduate Thesis, Cebu, Philippines, ${year}.`;
                }

                if (outputBox) {
                    outputBox.style.display = 'block';
                    outputBox.textContent = result;
                }

                // Log activity
                if (window.ActivityService && typeof window.ActivityService.logCitation === 'function') {
                    window.ActivityService.logCitation(format.toUpperCase(), title);
                    refreshLiveCounters();
                }

                if (typeof showToast === 'function') {
                    showToast(`Generated ${format.toUpperCase()} citation!`, 'success');
                }
            });
        }
    }
});
