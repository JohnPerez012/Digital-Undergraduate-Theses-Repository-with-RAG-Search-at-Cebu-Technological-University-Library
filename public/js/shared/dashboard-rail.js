/**
 * Dashboard Rail Navigation System
 * Handles sidebar rail interactions for all role dashboards
 */

(function() {
    'use strict';

    // Wait for DOM to be fully loaded
    document.addEventListener('DOMContentLoaded', function() {
        initializeDashboardRail();
    });

    function initializeDashboardRail() {
        // Get DOM elements
        const sidebarRail = document.getElementById('sidebar-rail');
        const railOverlay = document.getElementById('rail-overlay');
        const mobileToggle = document.getElementById('mobile-rail-toggle');
        const navItems = document.querySelectorAll('.rail-nav-item[data-section]');
        const contentSections = document.querySelectorAll('.content-section');
        const pageTitle = document.getElementById('page-title');

        // Mobile toggle functionality
        if (mobileToggle && sidebarRail && railOverlay) {
            mobileToggle.addEventListener('click', function() {
                toggleMobileMenu();
            });

            railOverlay.addEventListener('click', function() {
                closeMobileMenu();
            });
        }

        // Navigation item click handling
        navItems.forEach(item => {
            item.addEventListener('click', function(e) {
                e.preventDefault();
                
                const sectionId = this.getAttribute('data-section');
                
                // Update active nav item
                navItems.forEach(nav => nav.classList.remove('active'));
                this.classList.add('active');

                // Sync sidebar footer profile card active state when viewing settings/profile
                document.querySelectorAll('.rail-profile').forEach(profileEl => {
                    profileEl.classList.toggle('is-active', sectionId === 'settings');
                });

                // Sync mobile bottom dock items
                const dockItems = document.querySelectorAll('.dock-nav-item[data-section]');
                dockItems.forEach(d => {
                    if (d.getAttribute('data-section') === sectionId) {
                        d.classList.add('active');
                    } else {
                        d.classList.remove('active');
                    }
                });
                
                // Show corresponding content section
                contentSections.forEach(section => {
                    section.classList.remove('active');
                });
                
                const targetSection = document.getElementById('section-' + sectionId);
                if (targetSection) {
                    targetSection.classList.add('active');
                }

                // Dispatch custom event for reactive dashboard section changes
                window.dispatchEvent(new CustomEvent('rail:section-change', { detail: { sectionId } }));
                
                // Update page title
                if (pageTitle) {
                    const navText = this.querySelector('.rail-nav-text');
                    if (navText) {
                        pageTitle.textContent = navText.textContent;
                    }
                }
                
                // Close mobile menu if open
                if (window.innerWidth <= 1024) {
                    closeMobileMenu();
                }
                
                // Scroll to top of content
                const dashboardContent = document.querySelector('.dashboard-content');
                if (dashboardContent) {
                    dashboardContent.scrollTop = 0;
                }
            });
        });

        // Mobile bottom dock click handling
        const dockItems = document.querySelectorAll('.dock-nav-item[data-section]');
        dockItems.forEach(dockBtn => {
            dockBtn.addEventListener('click', function(e) {
                e.preventDefault();
                const secId = this.getAttribute('data-section');
                const targetRail = document.querySelector(`.rail-nav-item[data-section="${secId}"]`);
                if (targetRail) {
                    targetRail.click();
                }
            });
        });

        // Reactive sync for live saved count badge on mobile dock
        const savedCountElem = document.getElementById('saved-count');
        const dockSavedBadge = document.getElementById('dock-saved-badge');
        if (savedCountElem && dockSavedBadge) {
            const updateDockBadge = () => {
                const count = parseInt(savedCountElem.textContent, 10) || 0;
                dockSavedBadge.textContent = count;
                if (count > 0) {
                    dockSavedBadge.classList.add('visible');
                } else {
                    dockSavedBadge.classList.remove('visible');
                }
            };
            updateDockBadge();
            const badgeObserver = new MutationObserver(updateDockBadge);
            badgeObserver.observe(savedCountElem, { childList: true, characterData: true, subtree: true });
        }

        // Sync full name tooltip on truncated .rail-profile-name across all stakeholder dashboards
        document.querySelectorAll('.rail-profile-name').forEach(nameEl => {
            const syncTitle = () => {
                const fullText = (nameEl.textContent || '').trim();
                if (fullText) nameEl.setAttribute('title', fullText);
            };
            syncTitle();
            new MutationObserver(syncTitle).observe(nameEl, { childList: true, characterData: true, subtree: true });
        });

        // Clicking .rail-profile navigates directly to User Settings & Profile across all dashboards
        document.querySelectorAll('.rail-profile').forEach(profileCard => {
            profileCard.setAttribute('role', 'button');
            profileCard.setAttribute('tabindex', '0');
            if (!profileCard.getAttribute('aria-label')) {
                profileCard.setAttribute('aria-label', 'Open User Settings and Profile');
            }
            if (!profileCard.getAttribute('title')) {
                profileCard.setAttribute('title', 'View Profile & Settings');
            }

            const openUserProfileSettings = (e) => {
                if (e) e.preventDefault();
                const settingsNav = document.querySelector('.rail-nav-item[data-section="settings"]');
                if (settingsNav) {
                    settingsNav.click();
                } else {
                    const settingsSection = document.getElementById('section-settings');
                    if (settingsSection) {
                        contentSections.forEach(section => section.classList.remove('active'));
                        settingsSection.classList.add('active');
                        window.dispatchEvent(new CustomEvent('rail:section-change', { detail: { sectionId: 'settings' } }));
                    }
                }

                // Focus and subtly emphasize the stakeholder profile card inside Settings
                requestAnimationFrame(() => {
                    const targetProfileCard = document.querySelector('#section-settings #sset-profile-card, #section-settings #lset-profile-card, #section-settings #aset-profile-card');
                    if (targetProfileCard) {
                        targetProfileCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        targetProfileCard.classList.remove('rail-profile-target-focus');
                        void targetProfileCard.offsetWidth;
                        targetProfileCard.classList.add('rail-profile-target-focus');
                        setTimeout(() => targetProfileCard.classList.remove('rail-profile-target-focus'), 1200);
                    }
                });
            };

            profileCard.addEventListener('click', openUserProfileSettings);
            profileCard.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    openUserProfileSettings(e);
                }
            });
        });

        // Theme toggle functionality
        const themeToggle = document.querySelector('[id^="theme-toggle"]');
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleTheme);
        }

        // Logout button functionality
        const logoutButtons = document.querySelectorAll('[id$="-logout-btn"], .sset-logout-btn, .sset-profile-logout-btn');
        logoutButtons.forEach(btn => {
            btn.addEventListener('click', handleLogout);
        });

        // Handle keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            // ESC to close mobile menu
            if (e.key === 'Escape' && sidebarRail && sidebarRail.classList.contains('mobile-open')) {
                closeMobileMenu();
            }
        });

        // Handle window resize
        let resizeTimer;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function() {
                if (window.innerWidth > 1024 && sidebarRail) {
                    closeMobileMenu();
                }
            }, 250);
        });

        // Initialize greeting for student dashboard
        initializeGreeting();

        // Load dashboard data
        loadDashboardData();

        // Check hash on page load or fall back to this role's saved Default Landing Page preference
        const initialHash = (window.location.hash || '').replace('#', '').trim();
        const resolvedRole = (
            document.documentElement.getAttribute('data-required-role') ||
            (document.querySelector('.dashboard-layout.role-admin') ? 'admin' :
             document.querySelector('.dashboard-layout.role-librarian') ? 'librarian' :
             document.querySelector('.dashboard-layout.role-teacher') ? 'teacher' :
             document.querySelector('.dashboard-layout.role-student') ? 'student' : '') ||
            sessionStorage.getItem('userType') ||
            'user'
        ).toLowerCase();
        const savedLanding = (
            localStorage.getItem(resolvedRole + '_default_landing') ||
            (resolvedRole === 'librarian' ? localStorage.getItem('lib_default_landing') : '') ||
            ''
        ).trim();
        const targetSection = initialHash || (savedLanding && savedLanding !== 'dashboard' ? savedLanding : null);

        if (targetSection) {
            const hashItem = document.querySelector(`.rail-nav-item[data-section="${targetSection}"]`);
            if (hashItem) {
                setTimeout(() => hashItem.click(), 60);
            }
        }

        window.addEventListener('hashchange', function() {
            const hash = window.location.hash.replace('#', '');
            if (hash) {
                const hashItem = document.querySelector(`.rail-nav-item[data-section="${hash}"]`);
                if (hashItem) hashItem.click();
            }
        });
    }

    function toggleMobileMenu() {
        const sidebarRail = document.getElementById('sidebar-rail');
        const railOverlay = document.getElementById('rail-overlay');
        
        if (sidebarRail && railOverlay) {
            sidebarRail.classList.toggle('mobile-open');
            railOverlay.classList.toggle('active');
            document.body.style.overflow = sidebarRail.classList.contains('mobile-open') ? 'hidden' : '';
        }
    }

    function closeMobileMenu() {
        const sidebarRail = document.getElementById('sidebar-rail');
        const railOverlay = document.getElementById('rail-overlay');
        
        if (sidebarRail && railOverlay) {
            sidebarRail.classList.remove('mobile-open');
            railOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    let isThemeToggling = false;
    function toggleTheme() {
        if (isThemeToggling) return;
        isThemeToggling = true;
        setTimeout(() => { isThemeToggling = false; }, 200);

        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        // Optional: Show toast notification
        if (window.showToast) {
            // showToast suppressed per institutional UX directive
        }
    }

    function handleLogout(e) {
        e.preventDefault();
        
        // Use the new logout modal
        const modal = getLogoutModal();
        modal.show({
            onAbort: () => {
                // Optional: log abort action
                console.log('Logout cancelled by user');
            },
            onConfirm: async () => {
                // Clear local storage
                localStorage.removeItem('cachedAuthState');
                
                // Log activity before signing out
                if (window.ActivityService && typeof window.ActivityService.logAuth === 'function') {
                    await window.ActivityService.logAuth('logout', 'User signed out from dashboard rail');
                }

                // If Firebase auth is available
                if (window.firebase && firebase.auth) {
                    await firebase.auth().signOut();
                }
                
                // Show success toast
                if (window.showToast) {
                    showToast('Logged out successfully', '✅');
                }
                
                // Redirect after short delay
                setTimeout(() => {
                    if (window.AuthService && typeof window.AuthService.navigateToHome === 'function') {
                        window.AuthService.navigateToHome();
                    } else {
                        const isInPagesFolder = window.location.pathname.includes('/pages/');
                        window.location.href = isInPagesFolder ? '../index.html' : 'index.html';
                    }
                }, 800);
            }
        });
    }

    function initializeGreeting() {
        const greetingElement = document.getElementById('greeting');
        if (!greetingElement) return;

        const hour = new Date().getHours();
        let greeting = 'Good day';
        
        if (hour < 12) {
            greeting = 'Good morning';
        } else if (hour < 18) {
            greeting = 'Good afternoon';
        } else {
            greeting = 'Good evening';
        }

        const userName = document.querySelector('.rail-profile-name');
        const name = userName ? userName.textContent : 'User';
        
        greetingElement.textContent = `${greeting}, ${name}.`;
    }

    function loadDashboardData() {
        // This function will be extended by individual dashboard scripts
        // Load user profile data
        loadUserProfile();
        
        // Load statistics
        loadStatistics();
    }

    function loadUserProfile() {
        // Check if Firebase auth is available
        if (window.firebase && firebase.auth) {
            firebase.auth().onAuthStateChanged(user => {
                if (user) {
                    updateUserProfile(user);
                }
            });
        }
    }

    function updateUserProfile(user) {
        // Update profile name
        const profileNames = document.querySelectorAll('.rail-profile-name, [id$="-name"]');
        profileNames.forEach(elem => {
            if (user.displayName) {
                elem.textContent = user.displayName;
            }
        });

        // Update profile image if available
        if (user.photoURL) {
            const profileImages = document.querySelectorAll('.rail-profile-avatar, [id$="-profile-img"]');
            profileImages.forEach(img => {
                img.src = user.photoURL;
            });
        }
    }

    function loadStatistics() {
        // This will be overridden by individual dashboard scripts
        // Placeholder for loading dashboard statistics
        console.log('Loading dashboard statistics...');
    }

    // Export functions for use in other scripts
    window.dashboardRail = {
        toggleMobileMenu,
        closeMobileMenu,
        toggleTheme,
        updateUserProfile,
        switchToSection: function(sectionId) {
            const targetNav = document.querySelector(`.rail-nav-item[data-section="${sectionId}"]`);
            if (targetNav) {
                targetNav.click();
            }
        }
    };

})();
